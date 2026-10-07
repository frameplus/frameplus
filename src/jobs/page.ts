// ============================================================================
// JOBS — 서버가 내려주는 HTML: 앱 셸(/jobs) 과 공개 청구서 뷰(/jobs/v/:token)
// ============================================================================
import { TAX_MODES, type TaxMode, type InvoiceRow, type QuoteItem, type QuoteCalc, fmt, retaxInvoice, quoteItemAmount } from './calc'
import { LEGAL_TITLES, LEGAL_BODY, type LegalKind } from './legal'

export const JOBS_VERSION = '0.1.0'

/** 서비스 워커 — /jobs/sw.js 로 서빙해야 /jobs/ 범위를 제어할 수 있다. 셸·정적 자원만 캐시, API 는 항상 네트워크. */
export const JOBS_SW = `/* JOBS service worker v${JOBS_VERSION} */
const CACHE = 'jobs-shell-${JOBS_VERSION}'
const SHELL = ['/jobs/', '/static/jobs/style.css', '/static/jobs/app.js', '/static/jobs/manifest.webmanifest', '/static/jobs/icon-192.png']
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => null)); self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim() })
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/jobs/v/')) return
  if (url.pathname === '/jobs/' || url.pathname.startsWith('/static/jobs/')) {
    e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => null); return res }).catch(() => caches.match(e.request, { ignoreSearch: true })))
  }
})
`

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
const kdate = (s: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(0, 4)}. ${+s.slice(5, 7)}. ${+s.slice(8, 10)}` : s || '-')

/** 앱 셸 — 실제 화면은 /static/jobs/app.js 가 그린다 (해시 라우팅) */
export function jobsShellHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<title>JOBS — 하루 기록 · 청구 · 입금</title>
<meta name="theme-color" content="#0A6CD6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="JOBS">
<link rel="manifest" href="/static/jobs/manifest.webmanifest">
<link rel="icon" href="/static/jobs/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/jobs/icon-192.png">
<link rel="stylesheet" href="/static/jobs/style.css?v=__JOBSVER__">
</head>
<body>
<div id="app" aria-live="polite"><div class="boot">불러오는 중…</div></div>
<script>window.JOBS_VERSION='${JOBS_VERSION}'</script>
<script src="/static/jobs/app.js?v=__JOBSVER__" defer></script>
</body>
</html>`
}

/** 공개 청구서 — 로그인 없이 열리는 읽기 전용. 문자·카톡 링크의 목적지. */
export function renderPublicInvoice(data: { inv: any; photos: any[]; logs: any[] }): string {
  const { inv, photos, logs } = data
  const rows = (() => { try { return JSON.parse(inv.rows || '[]') as InvoiceRow[] } catch { return [] } })()
  const dayPays = (() => { try { return JSON.parse(inv.day_pays || '[]') as number[] } catch { return [] } })()
  const breakdown = retaxInvoice(rows, inv.tax_mode as TaxMode, dayPays).breakdown
  const mode = TAX_MODES[inv.tax_mode as TaxMode]
  const statusKo: Record<string, string> = { draft: '미발송', sent: '발송', paid: '입금 완료', partial: '일부 입금', overdue: '예정일 지남' }
  const remaining = Math.max(0, (inv.net || 0) - (inv.paid_amount || 0))
  const rowHtml = rows.map(r => `
    <tr class="${r.excluded ? 'ex' : ''}">
      <td><div class="lb">${esc(r.label)}</div><div class="dt">${esc(r.detail)}</div></td>
      <td class="amt">${r.excluded ? '제외' : fmt(r.amount) + '원'}</td>
    </tr>`).join('')
  const taxHtml = breakdown.parts.map(p => `<div class="line"><span>${esc(p.label)}</span><span class="red">− ${fmt(p.amount)}원</span></div>`).join('')
  const photoHtml = photos.length ? `
    <section class="card">
      <h2>현장 사진 ${photos.length}장 <small>촬영 시각 · 위치 각인</small></h2>
      <div class="photos">${photos.map(p => `<figure><img src="${esc(p.uri)}" alt="현장 사진"><figcaption>${esc((p.taken_at || '').replace('T', ' ').slice(0, 16))}${p.lat ? ` · ${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}` : ''}</figcaption></figure>`).join('')}</div>
    </section>` : ''
  const dates = logs.map(l => `${+l.date.slice(8, 10)}${l.attendance === 'half' ? '(반)' : ''}${l.overtime_hours ? `+${l.overtime_hours}h` : ''}`).join(' · ')
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>청구서 — ${esc(inv.site_name)} ${esc(kdate(inv.period_start))} ~ ${esc(kdate(inv.period_end))}</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#F2F2F7;color:#1C1C1E;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased;font-size:15px}
  .wrap{max-width:560px;margin:0 auto;padding:16px 16px 60px} .card{background:#fff;border-radius:12px;padding:18px 16px;margin-bottom:14px}
  h1{font-size:24px;margin:0 0 4px;letter-spacing:.3em} .sub{color:#6B6B6B;font-size:15px;margin:0 0 2px} .site{font-size:22px;font-weight:800;margin:10px 0 2px}
  .badge{display:inline-block;background:#F2F2F7;color:#3C3C43;border-radius:8px;padding:4px 10px;font-size:13px;font-weight:700}
  .badge.red{background:#FDE7E7;color:#E00000} .badge.blue{background:#EAF2FC;color:#0A6CD6}
  table{width:100%;border-collapse:collapse} td{padding:12px 0;box-shadow:inset 0 -1px 0 #EFEFF4;vertical-align:middle} tr.ex td{color:#8E8E93}
  .lb{font-weight:700} .dt{color:#6B6B6B;font-size:13px;margin-top:2px} .amt{text-align:right;font-variant-numeric:tabular-nums;letter-spacing:-.03em;font-weight:600;white-space:nowrap}
  .total{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0 2px} .total b{font-size:24px;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
  .blue{background:#0A6CD6;color:#fff} .blue .line span:last-child.red{color:#FFD5D5} .line{display:flex;justify-content:space-between;padding:7px 0;font-variant-numeric:tabular-nums}
  .net{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(255,255,255,.35);margin-top:8px;padding-top:12px} .net b{font-size:30px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  h2{font-size:15px;color:#6B6B6B;margin:0 0 10px;font-weight:700} h2 small{font-weight:500;margin-left:6px}
  .kv{display:flex;justify-content:space-between;padding:8px 0;box-shadow:inset 0 -1px 0 #EFEFF4} .kv span:first-child{color:#6B6B6B}
  .photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px} figure{margin:0} figure img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px} figcaption{font-size:11px;color:#6B6B6B;margin-top:3px}
  .foot{color:#6B6B6B;font-size:13px;text-align:center;line-height:1.6} .btn{display:block;width:100%;height:56px;border:0;border-radius:12px;background:#0A6CD6;color:#fff;font-size:17px;font-weight:700;margin-top:6px}
  .red{color:#E00000} .dates{color:#6B6B6B;font-size:13px;line-height:1.7}
  @media print{body{background:#fff}.btn{display:none}.card{border:1px solid #ddd;break-inside:avoid}}
</style>
</head>
<body>
<div class="wrap">
  <section class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>청 구 서</h1><p class="sub">${esc(inv.site_company || '')} 귀하</p></div>
      <span class="badge ${inv.status === 'overdue' ? 'red' : inv.status === 'paid' ? 'blue' : ''}">${esc(statusKo[inv.status] || inv.status)}</span>
    </div>
    <div class="site">${esc(inv.site_name)}</div>
    <p class="sub">${esc(kdate(inv.period_start))} ~ ${esc(kdate(inv.period_end))}</p>
    <table>${rowHtml}</table>
    <div class="total"><span>청구 금액</span><b>${fmt(inv.gross)}원</b></div>
  </section>
  <section class="card blue">
    <h2 style="color:rgba(255,255,255,.85)">세액공제 — ${esc(mode?.label || inv.tax_mode)}</h2>
    <div class="line"><span>청구 금액</span><span>${fmt(inv.gross)}원</span></div>
    ${taxHtml}
    <div class="net"><span>실수령액</span><b>${fmt(inv.net)}원</b></div>
  </section>
  <section class="card">
    <div class="kv"><span>입금 예정일</span><b>${esc(kdate(inv.due_date))}</b></div>
    ${inv.paid_amount ? `<div class="kv"><span>입금 확인</span><b>${fmt(inv.paid_amount)}원</b></div><div class="kv"><span>남은 금액</span><b class="${remaining ? 'red' : ''}">${fmt(remaining)}원</b></div>` : ''}
    <div class="kv"><span>받는 사람</span><b>${esc(inv.user_name || '')} ${esc(inv.user_phone ? inv.user_phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '')}</b></div>
    ${inv.user_biz ? `<div class="kv"><span>사업자번호</span><b>${esc(inv.user_biz)}</b></div>` : ''}
    <div class="kv"><span>출근일</span><span class="dates">${esc(dates) || '-'}</span></div>
  </section>
  ${photoHtml}
  <p class="foot">이 청구서는 JOBS 앱에서 출근 기록(시각 · 위치 · 사진)으로 자동 생성되었습니다.<br>발행 ${esc(kdate((inv.created_at || '').slice(0, 10)))}</p>
  <button class="btn" onclick="window.print()">PDF로 저장 · 인쇄</button>
</div>
</body>
</html>`
}

const DOC_CSS = `
  *{box-sizing:border-box} body{margin:0;background:#F2F2F7;color:#1C1C1E;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;-webkit-font-smoothing:antialiased;font-size:15px}
  .wrap{max-width:560px;margin:0 auto;padding:16px 16px 60px} .card{background:#fff;border-radius:12px;padding:18px 16px;margin-bottom:14px}
  h1{font-size:24px;margin:0 0 4px;letter-spacing:.3em} .sub{color:#6B6B6B;font-size:15px;margin:0 0 2px} .site{font-size:22px;font-weight:800;margin:10px 0 2px}
  .badge{display:inline-block;background:#F2F2F7;color:#3C3C43;border-radius:8px;padding:4px 10px;font-size:13px;font-weight:700} .badge.blue{background:#EAF2FC;color:#0A6CD6}
  table{width:100%;border-collapse:collapse} td{padding:12px 0;box-shadow:inset 0 -1px 0 #EFEFF4;vertical-align:middle}
  .lb{font-weight:700} .dt{color:#6B6B6B;font-size:13px;margin-top:2px} .amt{text-align:right;font-variant-numeric:tabular-nums;letter-spacing:-.03em;font-weight:600;white-space:nowrap}
  .total{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0 2px} .total b{font-size:24px;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
  .blue{background:#0A6CD6;color:#fff} .line{display:flex;justify-content:space-between;padding:7px 0;font-variant-numeric:tabular-nums}
  .net{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(255,255,255,.35);margin-top:8px;padding-top:12px} .net b{font-size:30px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  h2{font-size:15px;color:#6B6B6B;margin:0 0 10px;font-weight:700} .kv{display:flex;justify-content:space-between;padding:8px 0;box-shadow:inset 0 -1px 0 #EFEFF4} .kv span:first-child{color:#6B6B6B}
  .foot{color:#6B6B6B;font-size:13px;text-align:center;line-height:1.6} .btn{display:block;width:100%;height:56px;border:0;border-radius:12px;background:#0A6CD6;color:#fff;font-size:17px;font-weight:700;margin-top:6px}
  .group{color:#6B6B6B;font-size:13px;font-weight:700;padding:12px 0 2px}
  @media print{body{background:#fff}.btn{display:none}.card{border:1px solid #ddd;break-inside:avoid}}
`

/** 공개 견적서 — 문자 · 메일 링크의 목적지 */
export function renderPublicQuote(data: { q: any; items: QuoteItem[]; calc: QuoteCalc }): string {
  const { q, items, calc } = data
  const statusKo: Record<string, string> = { draft: '초안', sent: '발송', converted: '청구서 전환' }
  const group = (kind: 'labor' | 'material') => items.filter(i => i.kind === kind).map(i => `
    <tr><td><div class="lb">${esc(i.name || '-')}</div><div class="dt">${esc(String(i.qty))}${esc(i.unit)} × ${fmt(i.unitPrice)}원</div></td><td class="amt">${fmt(quoteItemAmount(i))}원</td></tr>`).join('')
  const periodTxt = q.period_start ? `${esc(kdate(q.period_start))} ~ ${esc(kdate(q.period_end || q.period_start))}` : '기간 미정'
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>견적서 — ${esc(q.site_name || q.client_name || '')}</title><style>${DOC_CSS}</style></head>
<body><div class="wrap">
  <section class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>견 적 서</h1><p class="sub">${esc(q.client_name || '')} 귀하</p></div><span class="badge ${q.status === 'sent' ? 'blue' : ''}">${esc(statusKo[q.status] || q.status)}</span></div>
    <div class="site">${esc(q.site_name || q.client_name || '')}</div>
    <p class="sub">공사 기간 ${periodTxt}</p>
    ${items.some(i => i.kind === 'labor') ? `<div class="group">인력</div><table>${group('labor')}</table>` : ''}
    ${items.some(i => i.kind === 'material') ? `<div class="group">자재 · 경비</div><table>${group('material')}</table>` : ''}
    <div class="kv" style="margin-top:8px"><span>인력</span><b>${fmt(calc.labor)}원</b></div>
    <div class="kv"><span>자재 · 경비</span><b>${fmt(calc.material)}원</b></div>
    ${calc.vatMode === 'inclusive' ? `<div class="kv"><span>부가세 10%</span><b>${fmt(calc.vat)}원</b></div>` : ''}
    <div class="total"><span>견적 합계 <small style="color:#6B6B6B">(${esc(calc.vatLabel)})</small></span><b>${fmt(calc.total)}원</b></div>
  </section>
  <section class="card">
    <div class="kv"><span>보내는 사람</span><b>${esc(q.user_name || '')} ${esc(q.user_phone ? String(q.user_phone).replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3') : '')}</b></div>
    ${q.user_biz ? `<div class="kv"><span>사업자번호</span><b>${esc(q.user_biz)}</b></div>` : ''}
    ${q.contact_phone ? `<div class="kv"><span>받는 분 연락처</span><b>${esc(q.contact_phone)}</b></div>` : ''}
    <div class="kv"><span>세액공제</span><span style="color:#6B6B6B">견적 단계에서는 적용하지 않음 — 청구서에서 반영</span></div>
  </section>
  <p class="foot">이 견적서는 JOBS 앱에서 생성되었습니다.<br>작성 ${esc(kdate((q.created_at || '').slice(0, 10)))}</p>
  <button class="btn" onclick="window.print()">PDF로 저장 · 인쇄</button>
</div></body></html>`
}

/** 약관 · 개인정보처리방침 · 위치정보 이용약관 (초안) */
export function renderLegalPage(kind: LegalKind): string {
  const title = LEGAL_TITLES[kind]
  const nav = (Object.keys(LEGAL_TITLES) as LegalKind[]).map(k => `<a href="/jobs/legal/${k}" ${k === kind ? 'class="on"' : ''}>${esc(LEGAL_TITLES[k].replace('JOBS ', ''))}</a>`).join('')
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#F2F2F7;color:#1C1C1E;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;font-size:15px;line-height:1.65}
  .wrap{max-width:640px;margin:0 auto;padding:16px 16px 60px} .nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px} .nav a{padding:8px 12px;border-radius:999px;background:#fff;color:#1C1C1E;text-decoration:none;font-weight:700;font-size:14px;box-shadow:inset 0 0 0 1px #E5E5EA} .nav a.on{background:#0A6CD6;color:#fff;box-shadow:none}
  .draft{background:#FDE7E7;color:#E00000;border-radius:12px;padding:12px 14px;font-weight:700;margin-bottom:12px;font-size:14px}
  .card{background:#fff;border-radius:12px;padding:20px 18px} h1{font-size:22px;margin:0 0 14px} h2{font-size:16px;margin:22px 0 6px} ol,ul{padding-left:20px} li{margin:4px 0}
  table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0} th,td{border:1px solid #E5E5EA;padding:8px;text-align:left;vertical-align:top} th{background:#F9F9FB}
  .eff{color:#6B6B6B;margin-top:24px;font-size:14px} .back{display:inline-block;margin-top:16px;color:#1C1C1E;font-weight:700}
</style></head>
<body><div class="wrap">
  <div class="nav">${nav}</div>
  <div class="draft">초안 — 법무 검토 전 문서입니다. «[ ]» 표시는 회사 정보로 채워야 하며, [확인 필요] 항목은 시행 전 확정해야 합니다.</div>
  <div class="card"><h1>${esc(title)}</h1>${LEGAL_BODY[kind]}</div>
  <a class="back" href="/jobs/#/settings">← JOBS 앱으로 돌아가기</a>
</div></body></html>`
}
