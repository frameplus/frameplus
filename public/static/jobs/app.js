/* ============================================================================
   JOBS 앱 — 현장 반장의 «기록 → 청구 → 입금». 바닐라 JS · 해시 라우팅 · PWA.
   화면 번호는 명세(JOBS 개발 핸드오프)의 S-xx 를 따른다.
   ========================================================================== */
(() => {
  'use strict'
  const API = '/api/jobs'
  const app = document.getElementById('app')
  const S = { token: localStorage.getItem('jobs_token') || '', user: null, sites: null, month: null, draft: null, draftKey: '', rangeTab: '7', geo: null, busy: false }

  // ------------------------------------------------------------ 유틸 ----
  const fmt = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const won = n => fmt(n) + '원'
  const man = n => { n = Math.round(Number(n) || 0); const a = Math.abs(n); if (a >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억'; if (a >= 1e4) return fmt(Math.round(n / 1e4)) + '만'; return fmt(n) }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  const pad2 = n => String(n).padStart(2, '0')
  const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
  const ymd = d => d.toISOString().slice(0, 10)
  const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
  const addDays = (s, n) => { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d) }
  const monthEnd = s => { const d = parseYmd(s); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) }
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5)
  const kdate = s => { if (!isYmd(s)) return '-'; const d = parseYmd(s); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})` }
  const kshort = s => (isYmd(s) ? `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '-')
  const kmonth = m => `${m.slice(0, 4)}년 ${+m.slice(5, 7)}월`
  const shiftMonth = (m, n) => ymd(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1))).slice(0, 7)
  const period = (a, b) => `${kshort(a)} ~ ${kshort(b)}`
  const nowHm = () => { const d = new Date(Date.now() + 9 * 3600e3); return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) }
  const num = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0 }
  const ph = p => (p || '').replace(/\D/g, '').replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')

  // 명세 03 계산 규칙 — 서버(src/jobs/calc.ts)와 같은 공식. 화면의 즉시 합계용. 저장값은 항상 서버가 다시 계산한다.
  const TAX = { rate33: { label: '3.3% 사업소득', short: '3.3%' }, dailyWorker: { label: '일용직 신고', short: '일용직' }, insurance4: { label: '4대보험 가입', short: '4대보험' }, none: { label: '공제 없음', short: '없음' } }
  const RULES = { sameDay: { label: '당일 지급', s: '일 끝난 날 바로' }, weeklyFri: { label: '주급 · 매주 금요일', s: '그 주 금요일에 한 번에' }, monthEnd: { label: '월말 지급', s: '매달 마지막 날' }, nextMonth10: { label: '익월 10일', s: '다음 달 10일에 한 번에' } }
  const EXP = { fuel: '주유비', parking: '주차비', tool: '공구비', material: '자재비', etc: '기타' }
  const STATUS = { draft: '미발송', sent: '발송', partial: '일부 입금', overdue: '예정일 지남', paid: '입금 완료' }
  const floor10 = n => Math.floor(Math.round(n * 100) / 1000) * 10
  function taxParts(gross, mode, dayPays) {
    gross = Math.max(0, Math.round(gross))
    if (mode === 'none') return []
    if (mode === 'rate33') { let i = floor10(gross * 0.03); if (i < 1000) i = 0; return [['소득세 3%', i], ['지방소득세 0.3%', floor10(i * 0.1)]] }
    if (mode === 'dailyWorker') { let i = 0; for (const p of (dayPays && dayPays.length ? dayPays : [gross])) i += floor10(Math.max(0, Math.round(p) - 150000) * 0.027); if (i < 1000) i = 0; return [['소득세 2.7%', i], ['지방소득세 0.27%', floor10(i * 0.1)]] }
    const h = floor10(gross * 0.03545)
    return [['국민연금 4.5%', floor10(gross * 0.045)], ['건강보험 3.545%', h], ['장기요양', floor10(h * 0.1295)], ['고용보험 0.9%', floor10(gross * 0.009)]]
  }
  const taxOf = (g, m, dp) => taxParts(g, m, dp).reduce((s, p) => s + p[1], 0)

  // ------------------------------------------------------------ API ----
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (S.token) headers.Authorization = 'Bearer ' + S.token
    let res
    try { res = await fetch(API + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined }) }
    catch { throw new Error('네트워크 연결을 확인해 주세요') }
    let data = null
    try { data = await res.json() } catch { /* no body */ }
    if (res.status === 401 && !path.startsWith('/auth/')) { logout(false); throw new Error('다시 로그인해 주세요') }
    if (!res.ok) { const e = new Error((data && data.error) || `오류가 났습니다 (${res.status})`); e.data = data; e.status = res.status; throw e }
    return data
  }
  async function loadSites(force) { if (!S.sites || force) S.sites = await api('/sites?all=1'); return S.sites }
  const activeSites = () => (S.sites || []).filter(s => !s.archived)
  const siteById = id => (S.sites || []).find(s => s.id === id)
  function logout(callApi = true) { if (callApi) api('/auth/logout', { method: 'POST' }).catch(() => null); S.token = ''; S.user = null; S.sites = null; localStorage.removeItem('jobs_token'); location.hash = '#/login' }

  // ------------------------------------------------------------ UI 조각 ----
  let toastTimer = null
  function toast(msg, err) {
    document.querySelectorAll('.toast').forEach(t => t.remove())
    const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; document.body.appendChild(t)
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), err ? 3200 : 2200)
  }
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    settle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>',
    market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 8h14l1 13H4z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    work: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M2 16h20v3H2z"/><path d="M12 8v8M9 9v2M15 9v2"/></svg>',
    all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
  }
  const TABS = [['home', '홈'], ['cal', '캘린더'], ['settle', '정산'], ['market', '중고장터'], ['work', '일자리찾기'], ['all', '전체']]
  const tabbar = on => `<nav class="tabbar"><div class="inner">${TABS.map(([k, l]) => `<a href="#/${k}" class="${on === k ? 'on' : ''}">${ICON[k]}<span>${l}</span></a>`).join('')}</div></nav>`
  const screen = (html, tab, cls = '') => `<div class="screen ${tab ? '' : 'no-tab'} ${html.includes('class="fixed') ? 'has-fixed' : ''} ${cls}">${html}</div>${tab ? tabbar(tab) : ''}`
  const topbar = (left, title, right = '', o = {}) => `<div class="topbar"><button class="tb ${o.leftClass || ''}" data-act="${o.leftAct || 'back'}" data-to="${o.leftTo || ''}">${esc(left)}</button><div class="ttl">${esc(title)}</div><button class="tb right ${o.rightClass || ''}" data-act="${o.rightAct || 'none'}" ${right ? '' : 'disabled'}>${esc(right)}</button></div>`
  const sec = (title, link = '', to = '') => `<div class="sec"><span>${esc(title)}</span>${link ? `<a href="${to}">${esc(link)}</a>` : ''}</div>`
  const seg = (items, cur, act, extra = '') => `<div class="seg ${extra}">${items.map(([k, l]) => `<button type="button" class="${k === cur ? 'on' : ''}" data-act="${act}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`
  const toggle = (on, act, extra = '') => `<button type="button" class="toggle ${on ? 'on' : ''}" data-act="${act}" ${extra} aria-pressed="${on}"></button>`
  const fixed = (html, noTab) => `<div class="fixed ${noTab ? 'no-tab' : ''}"><div class="inner">${html}</div></div>`
  const ck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  function sheet(html) {
    closeSheet()
    const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet'
    bg.innerHTML = `<div class="sheet"><div class="grip"></div>${html}</div>`
    bg.addEventListener('click', e => { if (e.target === bg) closeSheet() })
    document.body.appendChild(bg)
  }
  const closeSheet = () => document.getElementById('sheet')?.remove()
  const busy = async (fn) => { if (S.busy) return; S.busy = true; try { return await fn() } catch (e) { toast(e.message, true) } finally { S.busy = false } }
  function getGeo() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('이 기기는 위치를 지원하지 않습니다'))
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), () => rej(new Error('위치를 가져오지 못했습니다. 위치 권한을 허용해 주세요')), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
    })
  }
  function distM(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))) }
  function fileToDataUrl(file, max = 1280, q = 0.72) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file)
      img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)) }
      img.onerror = () => rej(new Error('사진을 읽지 못했습니다')); img.src = url
    })
  }
  async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('복사했습니다') } catch { prompt('복사해 주세요', t) } }

  // ------------------------------------------------------------ 라우터 ----
  const go = h => { location.hash = h }
  function route() { const h = location.hash.replace(/^#\/?/, '') || 'home'; const [p, q] = h.split('?'); return { parts: p.split('/'), path: p, query: Object.fromEntries(new URLSearchParams(q || '')) } }
  async function render() {
    const r = route()
    closeSheet()
    if (!S.token) { if (r.parts[0] !== 'login') { location.replace('#/login'); return } ; if (S.draftKey !== 'login') { S.draft = null; S.draftKey = 'login' } ; return renderLogin() }
    if (!S.user) { try { S.user = (await api('/auth/me')).user } catch (e) { if (S.token) app.innerHTML = `<div class="empty"><b>불러오지 못했습니다</b>${esc(e.message)}<br><br><button class="btn sm" data-act="reload">다시 시도</button></div>`; return } }
    if (r.parts[0] === 'login') { location.replace('#/home'); return }
    if (S.draftKey !== r.path) { S.draft = null; S.draftKey = r.path }
    const [a, b, c] = r.parts
    if (S.lastPath !== r.path) { window.scrollTo(0, 0); S.lastPath = r.path } // 화면이 바뀔 때만 맨 위로 — 같은 화면의 재렌더(스테퍼 · 토글)는 스크롤 유지
    try {
      switch (a) {
        case 'home': return await renderHome()
        case 'cal': return await renderCal(r.query)
        case 'settle': return await renderSettle()
        case 'market': return renderSoon('market', '중고장터', '공구 · 자재 · 장비를 근처 현장 사람과 직거래하는 장터는 2차 출시에 들어갑니다.')
        case 'work': return renderSoon('work', '일자리찾기', '사람 구하기 · 지원 · 채택은 직업정보제공사업 신고 후 2차 출시에 들어갑니다.')
        case 'all': return await renderAll()
        case 'site': return await renderSite(b, r.query)
        case 'log': return await renderLog(b, r.query)
        case 'invoice':
          if (b === 'new') return await renderInvoiceNew(r.query)
          if (c === 'pay') return await renderPay(b)
          if (c === 'dunning') return await renderDunning(b)
          return await renderInvoice(b)
        case 'payments': return await renderPayments()
        case 'sendlogs': return await renderSendlogs()
        case 'settings': return await renderSettings()
        default: location.replace('#/home')
      }
    } catch (e) {
      app.innerHTML = screen(topbar('홈', '오류', '', { leftAct: 'nav', leftTo: '#/home' }) + `<div class="empty"><b>불러오지 못했습니다</b>${esc(e.message)}</div>`, 'home')
    }
  }

  // ------------------------------------------------------------ 로그인 ----
  function renderLogin() {
    const d = S.draft || (S.draft = { step: 'phone', phone: '', code: '', devCode: '' })
    app.innerHTML = `<div class="login">
      <div class="mark">J</div><h1>JOBS</h1><p>하루 일한 것을 기록하고 · 청구하고 · 입금을 확인합니다</p>
      ${d.step === 'phone' ? `
        <div class="field big"><input type="tel" inputmode="numeric" data-bind="phone" placeholder="010-0000-0000" value="${esc(d.phone)}" autocomplete="tel" autofocus></div>
        <button class="btn primary" data-act="login.request">인증번호 받기</button>
        <p class="label" style="text-align:center;margin-top:18px">휴대폰 번호로 로그인합니다. 비밀번호가 없습니다.</p>`
      : `
        <p class="label" style="text-align:center;margin:-10px 0 12px">${esc(ph(d.phone))} 로 보낸 인증번호 6자리</p>
        <div class="field big code"><input type="tel" inputmode="numeric" maxlength="6" data-bind="code" placeholder="000000" value="${esc(d.code)}" autocomplete="one-time-code" autofocus></div>
        ${d.devCode ? `<div class="note">개발 모드 — 인증번호 <b>${esc(d.devCode)}</b> (JOBS_DEV_OTP=1 환경에서만 표시)</div>` : ''}
        <button class="btn primary" data-act="login.verify">확인</button>
        <button class="btn ghost" data-act="login.reset">번호 다시 입력</button>`}
    </div>`
    app.querySelector('input')?.focus()
  }

  // ------------------------------------------------------------ S-01 홈 ----
  function calGrid(month, cal, o = {}) {
    const first = month + '-01', days = +monthEnd(first).slice(8, 10), startDow = parseYmd(first).getUTCDay(), today = todayKst()
    let cells = ''
    for (let i = 0; i < startDow; i++) cells += '<div class="cal-day pad"></div>'
    for (let d = 1; d <= days; d++) {
      const ds = month + '-' + pad2(d), info = cal.byDate[ds], dow = (startDow + d - 1) % 7, due = cal.dueMarks[ds]
      const overdue = cal.overdueLogDates.includes(ds)
      const cls = ['cal-day', info ? 'has' : (dow === 0 || dow === 6 ? 'off' : ''), ds === today ? 'today' : '', o.sel === ds ? 'sel' : '', due && due !== 'paid' ? 'due' : ''].join(' ')
      const dots = (info ? `<i class="dot ${overdue ? 'red' : ''}"></i>` : '') + (due === 'overdue' ? '<i class="dot red"></i>' : '')
      cells += `<button type="button" class="${cls}" data-act="${o.act || 'cal.sel'}" data-date="${ds}"><b>${d}</b>${info && !o.mini ? `<span class="m">${man(info.net)}</span>` : ''}<span class="dots">${dots}</span></button>`
    }
    return `<div class="cal ${o.mini ? 'mini' : ''}"><div class="wd">${DOW.map(x => `<span>${x}</span>`).join('')}</div><div class="grid">${cells}</div>${o.legend ? '<div class="legend"><span><i class="dot"></i>출근</span><span><i class="dot red"></i>미정산(예정일 지남)</span><span><i class="ring"></i>정산 예정일</span></div>' : ''}</div>`
  }
  const invRow = (i, o = {}) => {
    const over = i.status === 'overdue', mk = over ? 'red' : i.status === 'paid' ? '' : i.status === 'draft' ? 'dark' : 'blue'
    const sub = over ? `<span class="red">${i.daysOverdue}일 지남</span> · 예정일 ${kshort(i.dueDate)}` : i.status === 'paid' ? '입금 완료' : i.status === 'draft' ? '미발송 · 보내기 전' : `${STATUS[i.status]} · 예정일 ${kshort(i.dueDate)}`
    return `<a class="row link" href="#/invoice/${i.id}"><span class="marker ${mk}"></span><div class="main"><div class="t">${esc(i.siteName)} <span class="label" style="font-weight:500">${esc(i.siteCompany || '')}</span></div><div class="s">${period(i.periodStart, i.periodEnd)} · ${sub}</div></div><div class="amt ${over ? 'red' : ''}">${won(o.net ? i.net : i.remaining)}${i.paidAmount && i.status !== 'paid' ? `<small>일부 입금 ${man(i.paidAmount)}</small>` : ''}</div></a>`
  }
  const logRow = l => `<a class="row link" href="#/log/${l.id}"><div class="main"><div class="t">${esc(kshort(l.date))} <span class="label" style="font-weight:500">${DOW[parseYmd(l.date).getUTCDay()]}</span> · ${esc(l.siteName)}</div><div class="s">${l.attendance === 'half' ? '반일' : '1일'}${l.overtimeHours ? ` + 연장 ${l.overtimeHours}시간` : ''}${l.expenses?.length ? ` · 경비 ${l.expenses.length}건` : ''}${l.invoiceId ? ' · 청구됨' : ''}</div></div><div class="amt">${won(l.net)}</div></a>`

  async function renderHome() {
    const month = S.month || (S.month = todayKst().slice(0, 7))
    app.innerHTML = screen(`<div class="hdr"><div class="brand"><div class="logo"><i>J</i>JOBS</div></div><div class="skeleton" style="background:rgba(255,255,255,.2)"></div></div><div class="skeleton"></div>`, 'home')
    const [d, sites] = await Promise.all([api('/dashboard?month=' + month), loadSites()])
    if (route().path !== 'home') return
    const today = d.today, hasToday = d.todayLogs.length > 0, r = d.ranges[S.rangeTab] || d.ranges['7']
    const noSites = activeSites().length === 0
    app.innerHTML = screen(`
      <div class="hdr">
        <div class="brand"><div class="logo"><i>J</i>JOBS</div><a href="#/settings" class="tb" style="color:#fff;display:flex;align-items:center;justify-content:center;min-width:44px;height:44px" aria-label="설정"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a></div>
        <div class="sub" style="display:flex;align-items:center;gap:4px"><button class="tb" data-act="month.prev" style="color:#fff;font-size:22px;min-width:36px;height:36px;padding:0">‹</button><span>${kmonth(month)} 수익</span><button class="tb" data-act="month.next" style="color:#fff;font-size:22px;min-width:36px;height:36px;padding:0">›</button></div>
        <div class="big">${fmt(d.monthNet)}<small>원</small></div>
        <div class="line"><span>청구 (출근 ${d.monthDays}일)</span><span class="num">${won(d.monthGross)}</span></div>
        <div class="line"><span>세액공제</span><span class="red num">− ${won(d.monthTax)}</span></div>
        <div class="kpi inhdr"><div><div class="l">정산 완료</div><b>${man(d.kpi.settled)}</b></div><div><div class="l">미정산</div><b>${man(d.kpi.unsettledMonth)}</b></div><div><div class="l">출근</div><b>${d.kpi.days}일</b></div></div>
      </div>
      ${noSites ? `<div class="card"><div class="empty"><b>현장을 먼저 만들어 주세요</b>현장을 한 번 만들어 두면 이후 기록 · 청구 · 입금이 전부 자동입니다.</div><button class="btn primary" data-act="nav" data-to="#/site/new">현장 추가</button></div>` : `
      <div class="card" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
        <span class="choice-ck" style="width:40px;height:40px;border-radius:12px;background:${hasToday ? 'var(--blue)' : '#E9E9EE'};color:#fff;display:flex;align-items:center;justify-content:center;flex:none">${ck}</span>
        <div class="main" style="flex:1"><div class="t" style="font-weight:800;font-size:16px">오늘 출근 기록</div><div class="s label">${kdate(today)} · ${hasToday ? esc(d.todayLogs.map(l => l.siteName).join(', ')) + ' 기록됨' : '아직 기록 없음'}</div></div>
        ${hasToday ? `<a class="btn sm" href="#/log/${d.todayLogs[0].id}">보기</a>` : '<button class="btn sm primary" data-act="sheet.record">출근</button>'}
      </div>`}
      ${sec('근무 기록 집계', '자세히 보기', '#/cal')}
      ${seg([['7', '7일'], ['14', '14일'], ['30', '30일']], S.rangeTab, 'home.range')}
      <div class="kpi" style="margin-top:10px"><div><div class="l">출근</div><b>${r.days}일</b><div class="ss">${S.rangeTab}일 중</div></div><div><div class="l">수익</div><b>${man(r.net)}</b><div class="ss">일 평균 ${r.days ? man(r.net / r.days) : '-'}</div></div><div><div class="l">미정산</div><b>${man(r.unsettled)}</b><div class="ss">${r.count}건</div></div></div>
      ${sec(`${+month.slice(5)}월 캘린더`, '자세히 보기', '#/cal')}
      ${calGrid(month, d.calendar, { mini: true, act: 'cal.go' })}
      ${d.dueSoon.length ? sec('정산 예정') + `<div class="card tight">${d.dueSoon.map(i => `<a class="row link" href="#/invoice/${i.id}"><div class="main"><div class="t">${esc(i.siteName)}</div><div class="s">${period(i.periodStart, i.periodEnd)} · 예정일 ${kshort(i.dueDate)}</div></div><span class="badge sky">D-${i.dDay}</span><div class="amt">${won(i.remaining)}</div></a>`).join('')}</div>` : ''}
      ${sec('미정산', '전체 보기', '#/settle')}
      ${d.unsettled.length ? `<div class="card tight">${d.unsettled.slice(0, 5).map(i => invRow(i)).join('')}</div>` : `<div class="card"><div class="empty" style="padding:14px">못 받은 돈이 없습니다</div></div>`}
      ${sec('최근 출근', '전체 보기', '#/cal')}
      ${d.logs.length ? `<div class="card tight">${d.logs.slice(0, 4).map(logRow).join('')}</div>` : `<div class="card"><div class="empty" style="padding:14px">${kmonth(month)} 출근 기록이 없습니다</div></div>`}
    `, 'home')
  }

  // ------------------------------------------------------------ S-02 기록 방법 시트 ----
  function recordSheet(date) {
    date = date || todayKst()
    sheet(`<h3>${date === todayKst() ? '오늘' : kshort(date)} 출근 기록</h3><div class="s">${kdate(date)} · 어떻게 넣을까요</div>
      <button class="opt primary" data-act="nav" data-to="#/log/new?date=${date}"><span class="ic">✎</span><div><div class="t">직접 입력하기</div><div class="d">현장 → 근무 → 확인, 3번이면 끝</div></div><span class="chev">›</span></button>
      <button class="opt" data-act="log.copy" data-date="${date}"><span class="ic">⟳</span><div><div class="t">어제 기록 그대로 복사</div><div class="d">직전 기록을 복제하고 날짜만 바꿉니다</div></div><span class="chev">›</span></button>
      <button class="opt" data-act="soon" data-msg="음성 입력은 다음 버전에 들어갑니다"><span class="ic">🎤</span><div><div class="t">음성으로 말하기</div><div class="d">“문정동 하루 일했어” 한 마디면 끝 · 준비 중</div></div><span class="chev">›</span></button>`)
  }

  // ------------------------------------------------------------ S-07 캘린더 ----
  async function renderCal(q) {
    const month = S.month || (S.month = todayKst().slice(0, 7))
    const sel = S.draft?.sel || (isYmd(q.d) ? q.d : (month === todayKst().slice(0, 7) ? todayKst() : month + '-01'))
    S.draft = { sel }
    app.innerHTML = screen(`<div class="skeleton"></div>`, 'cal')
    const d = await api('/dashboard?month=' + month)
    if (route().path !== 'cal') return
    const dayLogs = d.logs.filter(l => l.date === sel)
    const dow = parseYmd(sel).getUTCDay()
    app.innerHTML = screen(`
      <div class="topbar" style="height:60px"><div style="display:flex;align-items:center;gap:2px"><button class="tb" data-act="month.prev" style="font-size:22px">‹</button><b style="font-size:22px">${kmonth(month)}</b><button class="tb" data-act="month.next" style="font-size:22px">›</button></div>
        ${seg([['m', '월'], ['w', '주']], 'm', 'cal.mode', 'dark')}</div>
      <div class="kpi"><div><div class="l">출근</div><b>${d.monthDays}일</b></div><div><div class="l">수익</div><b>${man(d.monthNet)}</b></div><div><div class="l">미정산</div><b>${man(d.kpi.unsettledMonth)}</b></div></div>
      ${calGrid(month, d.calendar, { sel, legend: true })}
      ${sec(kdate(sel), dayLogs.length ? '' : '', '')}
      ${dayLogs.length ? dayLogs.map(l => `<div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:17px">${esc(l.siteName)}</b><a href="#/log/${l.id}" class="btn sm">수정</a></div>
          <div class="sum"><div class="line"><span class="l">근무</span><span>${l.attendance === 'half' ? '반일' : '1일'}${l.overtimeHours ? ` + 연장 ${l.overtimeHours}시간` : ''}</span></div>
          ${l.checkInAt || l.checkOutAt ? `<div class="line"><span class="l">출퇴근</span><span>${esc(l.checkInAt || '-')} ~ ${esc(l.checkOutAt || '-')}</span></div>` : ''}
          ${l.expenses?.length ? `<div class="line"><span class="l">경비</span><span>${l.expenses.map(e => `${esc(e.typeLabel)} ${fmt(e.amount)}${e.chargeToClient ? '' : '(제외)'}`).join(' · ')}</span></div>` : ''}
          <div class="line"><span class="l">청구</span><span>${won(l.gross)}</span></div><div class="line"><span class="l">세액공제</span><span class="red">− ${won(l.tax)}</span></div><div class="line net"><span class="l">수익</span><span>${won(l.net)}</span></div></div>
        </div>`).join('') + `<button class="btn" data-act="nav" data-to="#/log/new?date=${sel}">+ 같은 날 다른 현장 기록</button>`
      : `<div class="card"><div class="empty"><b>${dow === 0 || dow === 6 ? '쉬는 날' : '기록 없음'}</b>${sel > todayKst() ? '아직 오지 않은 날입니다' : '이 날 일했다면 지금 넣어 두세요'}</div>${sel <= todayKst() ? `<button class="btn primary" data-act="sheet.record" data-date="${sel}">이 날 기록하기</button>` : ''}</div>`}
    `, 'cal')
  }

  // ------------------------------------------------------------ 정산 탭 ----
  async function renderSettle() {
    app.innerHTML = screen(`<div class="hdr"><div class="ttl">정산</div><div class="skeleton" style="background:rgba(255,255,255,.2)"></div></div>`, 'settle')
    const month = todayKst().slice(0, 7)
    const [invs, pays] = await Promise.all([api('/invoices'), api('/payments?month=' + month)])
    if (route().path !== 'settle') return
    await loadSites()
    const open = invs.filter(i => ['sent', 'partial', 'overdue'].includes(i.status)).sort((a, b) => (b.daysOverdue - a.daysOverdue) || a.dueDate.localeCompare(b.dueDate))
    const drafts = invs.filter(i => i.status === 'draft'), paid = invs.filter(i => i.status === 'paid')
    const unpaid = open.reduce((s, i) => s + i.remaining, 0), paidMonth = pays.filter(p => !p.excluded).reduce((s, p) => s + p.amount, 0)
    app.innerHTML = screen(`
      <div class="hdr">
        <div class="brand"><div class="ttl">정산</div><a href="#/sendlogs" class="tb" style="color:#fff">보낸 기록</a></div>
        <div class="sub">미입금 합계</div><div class="big">${fmt(unpaid)}<small>원</small></div>
        <div class="line"><span>${+month.slice(5)}월 입금</span><span class="num">${won(paidMonth)}</span></div>
        <div class="line"><span>미입금 청구서</span><span class="num">${open.length}건${open.filter(i => i.status === 'overdue').length ? ` · <span class="red">예정일 지남 ${open.filter(i => i.status === 'overdue').length}건</span>` : ''}</span></div>
      </div>
      <button class="btn primary" data-act="nav" data-to="#/invoice/new">새 청구서 만들기</button>
      <div class="note" style="margin-top:10px">계좌를 연결하면 입금이 자동으로 기록됩니다 — 오픈뱅킹 이용기관 등록 후 제공 예정. 지금은 청구서에서 «입금 확인»으로 직접 기록합니다.</div>
      ${sec('미입금', '입금 내역', '#/payments')}
      ${open.length ? `<div class="card tight">${open.map(i => invRow(i)).join('')}</div>` : '<div class="card"><div class="empty" style="padding:14px">미입금 청구서가 없습니다</div></div>'}
      ${drafts.length ? sec('보내기 전 (미발송)') + `<div class="card tight">${drafts.map(i => invRow(i, { net: true })).join('')}</div>` : ''}
      ${paid.length ? sec('입금 완료') + `<div class="card tight">${paid.slice(0, 10).map(i => invRow(i, { net: true })).join('')}</div>` : ''}
    `, 'settle')
  }

  // ------------------------------------------------------------ 준비 중 탭 ----
  function renderSoon(tab, title, msg) {
    app.innerHTML = screen(`<div class="hdr"><div class="ttl">${esc(title)}</div><div class="sub">2차 출시 예정</div></div><div class="card"><div class="empty"><b>준비 중입니다</b>${esc(msg)}</div></div>`, tab)
  }

  // ------------------------------------------------------------ 전체 탭 (S-18 현장 목록 포함) ----
  async function renderAll() {
    app.innerHTML = screen(`<div class="topbar" style="height:60px"><b style="font-size:26px">전체</b></div><div class="skeleton"></div>`, 'all')
    const [me, sites] = await Promise.all([api('/me'), loadSites(true)])
    if (route().path !== 'all') return
    const u = me.user, active = sites.filter(s => !s.archived), done = sites.filter(s => s.archived)
    const siteRow = s => { const st = s.stats || {}; const mk = st.overdue ? 'red' : st.unpaid > 0 ? 'blue' : s.archived ? '' : 'dark'
      return `<a class="row link" href="#/site/${s.id}"><span class="marker ${mk}"></span><div class="main"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.company || '-')}${s.contactName ? ' · ' + esc(s.contactName) : ''}</div><div class="s">${RULES[s.settlementRule]?.label || ''} · ${TAX[s.taxMode]?.short || ''}${st.monthDays ? ` · 이번 달 ${st.monthDays}일` : ''}</div></div>
        <div class="amt ${st.overdue ? 'red' : ''}">${s.archived ? '<small>종료</small>' : st.overdue ? `<small class="red">예정일 지남</small>` : st.unpaid > 0 ? `<small>미입금 · ${kshort(st.nextDue)}</small>` : '<small>진행중</small>'}${won(st.unpaid || 0)}</div></a>` }
    app.innerHTML = screen(`
      <div class="topbar" style="height:60px"><b style="font-size:26px">전체</b></div>
      <a class="card row link" href="#/settings" style="margin-bottom:14px"><span style="width:48px;height:48px;border-radius:14px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex:none">${esc((u.name || '반').slice(0, 1))}</span><div class="main"><div class="t">${esc(u.name || '이름을 넣어 주세요')}</div><div class="s">기본 세금 ${TAX[u.defaultTaxMode]?.short || '3.3%'}${u.bizNo ? ' · 사업자 ' + esc(u.bizNo) : ''} · ${esc(ph(u.phone))}</div></div><span class="chev">›</span></a>
      ${sec(`내 현장 ${active.length}곳`, '현장 추가', '#/site/new')}
      ${active.length ? `<div class="card tight">${active.map(siteRow).join('')}</div>` : `<div class="card"><div class="empty"><b>현장이 없습니다</b>현장을 만들어야 출근 기록과 청구서를 만들 수 있습니다</div><button class="btn primary" data-act="nav" data-to="#/site/new">현장 추가</button></div>`}
      ${done.length ? sec(`끝난 현장 ${done.length}곳`) + `<div class="card tight">${done.map(siteRow).join('')}</div>` : ''}
      ${sec('서류')}
      <div class="card tight">
        <a class="row link" href="#/sendlogs"><span style="font-size:22px;width:36px;text-align:center">✉</span><div class="main"><div class="t">보낸 기록</div><div class="s">청구 · 독촉을 언제 누구에게 보냈는지 — 분쟁 근거</div></div><span class="chev">›</span></a>
        <a class="row link" href="#/payments"><span style="font-size:22px;width:36px;text-align:center">₩</span><div class="main"><div class="t">입금 내역</div><div class="s">직접 기록한 입금 목록</div></div><span class="chev">›</span></a>
        <button class="row link" data-act="soon" data-msg="연간 세액 정산서(PDF)는 다음 버전에 들어갑니다" style="width:100%;background:none;border:0;text-align:left"><span style="font-size:22px;width:36px;text-align:center">▤</span><div class="main"><div class="t">연간 세액 정산서</div><div class="s">올해 ${me.stats.yearDays}일 · 실수령 ${won(me.stats.yearNet)}</div></div><span class="badge">준비 중</span></button>
      </div>
      <div class="version">JOBS ${esc(window.JOBS_VERSION || '')} · 기록은 삭제해도 보낸 기록은 남습니다</div>
    `, 'all')
  }

  // ------------------------------------------------------------ S-08 현장 추가 / 수정 ----
  async function renderSite(id, q) {
    await loadSites()
    const isNew = id === 'new'
    const site = isNew ? null : siteById(id) || (await api('/sites/' + id))
    if (!S.draft) S.draft = isNew
      ? { name: '', company: '', address: '', lat: null, lng: null, contactName: '', contactPhone: '', dayRate: '', overtimeRate: '', settlementRule: '', taxMode: S.user.defaultTaxMode || 'rate33', clockOutTime: '', alarmDue: true, alarmClockOut: true, memo: '', ret: q.return || '' }
      : { ...site, dayRate: site.dayRate || '', overtimeRate: site.overtimeRate || site.hourRate || '', ret: '' }
    const d = S.draft
    app.innerHTML = screen(`
      ${topbar('취소', isNew ? '현장 추가' : '현장 수정', '', { leftAct: 'back' })}
      ${sec('기본')}
      <div class="field"><label>현장명</label><input data-bind="name" value="${esc(d.name)}" placeholder="문정동 현장" maxlength="40"></div>
      <div class="field"><label>회사</label><input data-bind="company" value="${esc(d.company)}" placeholder="대성건설" maxlength="60"></div>
      <div class="field"><label>주소</label><input data-bind="address" value="${esc(d.address)}" placeholder="송파구 문정동 000-0" maxlength="200"><button type="button" class="act" data-act="site.pin">${d.lat ? '핀 다시' : '지도 핀'}</button></div>
      ${d.lat ? `<div class="note" style="margin-top:-4px">현장 핀 ${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)} · 반경 150m 안에서 «출근»을 누르면 현장 안으로 확인됩니다</div>` : '<div class="note" style="margin-top:-4px">현장에 서서 «지도 핀»을 누르면 지금 위치가 현장 중심(지오펜스)이 됩니다</div>'}
      <div class="field"><label>담당자</label><input data-bind="contactName" value="${esc(d.contactName)}" placeholder="김반장" maxlength="30"></div>
      <div class="field"><label>연락처</label><input type="tel" data-bind="contactPhone" value="${esc(d.contactPhone)}" placeholder="010-0000-0000" maxlength="20"></div>
      ${sec('기본 단가')}
      <div class="two"><div class="rate"><div class="l">1일</div><input type="tel" inputmode="numeric" data-bind="dayRate" data-money="1" value="${d.dayRate ? fmt(d.dayRate) : ''}" placeholder="280,000"></div><div class="rate"><div class="l">연장 1시간</div><input type="tel" inputmode="numeric" data-bind="overtimeRate" data-money="1" value="${d.overtimeRate ? fmt(d.overtimeRate) : ''}" placeholder="35,000"></div></div>
      <div class="note">여기 넣은 단가가 이 현장 기록의 기본값이 됩니다. 그날만 다르면 기록할 때 고칠 수 있습니다.</div>
      ${sec('정산 규칙 (필수)')}
      ${Object.entries(RULES).map(([k, v]) => `<button type="button" class="choice ${d.settlementRule === k ? 'on' : ''}" data-act="site.set" data-k="settlementRule" data-v="${k}"><span class="ck">${d.settlementRule === k ? ck : ''}</span><div><div class="t">${v.label}</div><div class="s">${v.s}</div></div></button>`).join('')}
      ${sec('세금 처리 (필수)')}
      ${Object.entries(TAX).map(([k, v]) => `<button type="button" class="choice ${d.taxMode === k ? 'on' : ''}" data-act="site.set" data-k="taxMode" data-v="${k}"><span class="ck">${d.taxMode === k ? ck : ''}</span><div><div class="t">${v.label}</div><div class="s">${k === 'rate33' ? '청구액의 3.3%를 떼고 받습니다 — 가장 흔함' : k === 'dailyWorker' ? '(일급 − 15만) × 2.97%, 하루 단위' : k === 'insurance4' ? '본인부담 약 9.4% (국민연금 · 건강 · 장기요양 · 고용)' : '세금 없이 전액'}</div></div></button>`).join('')}
      ${sec('알림')}
      <div class="field"><label>입금 예정일 알람 (D-3)</label>${toggle(d.alarmDue, 'site.toggle', 'data-k="alarmDue"')}</div>
      <div class="field"><label>퇴근 알람 시각</label><input type="time" data-bind="clockOutTime" value="${esc(d.clockOutTime || '')}" style="text-align:right"></div>
      <div class="field col"><label>메모</label><input data-bind="memo" value="${esc(d.memo || '')}" placeholder="출입 절차, 주차, 담당자 특징 …" maxlength="500"></div>
      ${!isNew ? `<button class="btn ghost danger" data-act="site.archive" data-id="${esc(id)}">${site?.archived ? '현장 다시 열기' : '현장 보관 (목록에서 숨김)'}</button>` : ''}
      ${fixed(`<button class="btn primary" data-act="site.save" data-id="${isNew ? '' : esc(id)}">현장 저장</button>`)}
    `, 'home')
  }

  // ------------------------------------------------------------ S-06 출근 직접 입력 ----
  function calcDraft(d) {
    const site = siteById(d.siteId)
    const mode = d.taxModeOverride || site?.taxMode || S.user.defaultTaxMode || 'rate33'
    const labor = d.attendance === 'half' ? Math.round(num(d.dayRate) / 2) : Math.round(num(d.dayRate))
    const overtime = Math.round(num(d.overtimeHours) * num(d.hourRate))
    let charged = 0, own = 0
    for (const e of d.expenses) { const a = Math.round(num(e.amount)); if (e.chargeToClient) charged += a; else own += a }
    const gross = labor + overtime + charged, parts = taxParts(gross, mode, [gross]), tax = parts.reduce((s, p) => s + p[1], 0)
    return { mode, labor, overtime, charged, own, gross, parts, tax, net: gross - tax }
  }
  async function renderLog(id, q) {
    await loadSites()
    const isNew = id === 'new'
    if (activeSites().length === 0) { app.innerHTML = screen(topbar('취소', '출근 기록') + `<div class="card"><div class="empty"><b>현장이 없습니다</b>현장을 먼저 만들어 주세요</div><button class="btn primary" data-act="nav" data-to="#/site/new?return=log">현장 추가</button></div>`, 'home'); return }
    if (!S.draft) {
      if (isNew) {
        const recent = [...activeSites()].sort((a, b) => ((b.stats?.lastDate || '') > (a.stats?.lastDate || '') ? 1 : -1))
        const site = siteById(q.site) || recent[0]
        S.draft = { id: null, siteId: site.id, date: isYmd(q.date) ? q.date : todayKst(), attendance: 'full', overtimeHours: 0, dayRate: site.dayRate, hourRate: site.overtimeRate || site.hourRate, ratesTouched: false, taxModeOverride: null, checkInAt: '', checkOutAt: '', expenses: [], photos: [], memo: '', geo: null, invoiceId: null }
      } else {
        const l = await api('/worklogs/' + id)
        S.draft = { id: l.id, siteId: l.siteId, date: l.date, attendance: l.attendance, overtimeHours: l.overtimeHours, dayRate: l.dayRate, hourRate: l.hourRate, ratesTouched: true, taxModeOverride: l.taxModeOverride, checkInAt: l.checkInAt, checkOutAt: l.checkOutAt, expenses: l.expenses.map(e => ({ type: e.type, name: e.name, amount: e.amount, chargeToClient: e.chargeToClient })), photos: l.photos.map(p => ({ uri: p.uri, takenAt: p.takenAt, lat: p.lat, lng: p.lng, label: p.label })), memo: l.memo, geo: l.checkInLat ? { lat: l.checkInLat, lng: l.checkInLng, dist: l.geoDistanceM } : null, invoiceId: l.invoiceId }
      }
    }
    const d = S.draft, site = siteById(d.siteId), c = calcDraft(d)
    const locked = !!d.invoiceId
    const recent = [...activeSites()].sort((a, b) => ((b.stats?.lastDate || '') > (a.stats?.lastDate || '') ? 1 : -1))
    const geoLine = d.geo ? (site?.lat ? (d.geo.dist <= (site.geoRadius || 150) ? `<span class="badge sky">현장 안 · ${d.geo.dist}m</span>` : `<span class="badge red">현장 밖 · ${d.geo.dist >= 1000 ? (d.geo.dist / 1000).toFixed(1) + 'km' : d.geo.dist + 'm'}</span>`) : `<span class="badge">위치 기록됨 · 현장 핀 없음</span>`) : '<span class="label">위치 미확인</span>'
    app.innerHTML = screen(`
      ${topbar('취소', isNew ? '출근 기록' : '기록 수정', '', { leftAct: 'back' })}
      ${locked ? '<div class="card danger"><b>청구서에 들어간 기록입니다.</b><div class="s">수정하려면 정산 탭에서 해당 청구서(미발송)를 먼저 삭제해 주세요.</div></div>' : ''}
      <div class="field"><label>날짜</label><input type="date" data-bind="date" value="${esc(d.date)}" max="${todayKst()}" ${locked ? 'disabled' : ''}></div>
      ${sec('현장')}
      ${recent.map(s => `<button type="button" class="choice ${d.siteId === s.id ? 'on' : ''}" data-act="log.site" data-id="${s.id}" ${locked ? 'disabled' : ''}><span class="ck">${d.siteId === s.id ? ck : ''}</span><div><div class="t">${esc(s.name)}</div><div class="s">${esc(s.company || '')}${s.contactName ? ' · ' + esc(s.contactName) : ''} · 1일 ${man(s.dayRate)} · ${RULES[s.settlementRule]?.label || ''}</div></div></button>`).join('')}
      <a class="choice" href="#/site/new?return=log" style="justify-content:center;font-weight:700">＋ 현장 새로 추가</a>
      ${sec('근무')}
      ${seg([['full', '1일'], ['half', '반나절']], d.attendance, 'log.att')}
      <div class="field" style="margin-top:10px"><label>연장</label><div class="stepper"><button type="button" data-act="log.ot" data-v="-1">−</button><b>${num(d.overtimeHours)}시간</b><button type="button" class="plus" data-act="log.ot" data-v="1">＋</button></div></div>
      ${sec('출퇴근 시간 · 위치')}
      <div class="two"><div class="field"><label>출근</label><input type="time" data-bind="checkInAt" value="${esc(d.checkInAt)}"></div><div class="field"><label>퇴근</label><input type="time" data-bind="checkOutAt" value="${esc(d.checkOutAt)}"></div></div>
      <div class="field" style="margin-top:10px"><label>GPS</label><div>${geoLine}</div><button type="button" class="act" data-act="log.geo">${d.geo ? '다시 확인' : 'GPS 확인'}</button></div>
      ${sec('현장 사진')}
      <div class="photos">${d.photos.map((p, i) => `<div class="ph"><img src="${p.uri}" alt=""><button type="button" class="x" data-act="log.photo.del" data-i="${i}">×</button><div class="cap">${esc((p.takenAt || '').slice(5, 16).replace('T', ' '))}${p.lat ? ' · 위치' : ''}</div></div>`).join('')}${d.photos.length < 6 ? '<button type="button" class="add" data-act="log.photo.add"><span style="font-size:22px">📷</span>찍기 · 추가</button>' : ''}</div>
      <input type="file" id="photoInput" accept="image/*" capture="environment" multiple hidden>
      ${sec('단가')}
      <div class="two"><div class="rate"><div class="l">1일</div><input type="tel" inputmode="numeric" data-bind="dayRate" data-money="1" value="${d.dayRate ? fmt(d.dayRate) : ''}" placeholder="280,000"></div><div class="rate"><div class="l">연장 1시간</div><input type="tel" inputmode="numeric" data-bind="hourRate" data-money="1" value="${d.hourRate ? fmt(d.hourRate) : ''}" placeholder="35,000"></div></div>
      ${sec('세액공제', site ? `현장 기본 ${TAX[site.taxMode]?.short}` : '')}
      ${seg(Object.entries(TAX).map(([k, v]) => [k, v.short]), c.mode, 'log.tax')}
      <div class="note" style="margin-top:10px">오늘 공제액 <b class="red" data-live="tax">${won(c.tax)}</b> · 바꾸면 이 기록에만 적용되고 현장 기본값은 그대로입니다</div>
      ${sec('경비 · 자재', '')}
      ${d.expenses.map((e, i) => `<div class="card" style="padding:10px 16px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><select data-bind="expenses.${i}.type" style="border:0;background:var(--bg);border-radius:8px;padding:8px 10px;font-weight:700">${Object.entries(EXP).map(([k, v]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input data-bind="expenses.${i}.name" value="${esc(e.name || '')}" placeholder="내용 (선택)" style="flex:1;border:0;background:var(--bg);border-radius:8px;padding:8px 10px;min-width:0"><button type="button" class="act red" data-act="log.exp.del" data-i="${i}">삭제</button></div>
        <div style="display:flex;gap:10px;align-items:center"><input type="tel" inputmode="numeric" data-bind="expenses.${i}.amount" data-money="1" value="${e.amount ? fmt(e.amount) : ''}" placeholder="금액" style="flex:1;border:0;font-size:20px;font-weight:800;background:transparent;min-width:0;outline:none"><span class="label">청구</span>${toggle(e.chargeToClient, 'log.exp.charge', `data-i="${i}"`)}</div>
        <div class="s label">${e.chargeToClient ? '청구서에 넣습니다' : '청구서에서 «제외» · 내가 쓴 경비로만 집계'}</div></div>`).join('')}
      <button type="button" class="btn" data-act="log.exp.add" style="margin-bottom:14px">＋ 경비 추가 (주유 · 주차 · 공구 · 자재)</button>
      ${sec('합계')}
      <div class="sum">
        <div class="line"><span class="l">출근 ${d.attendance === 'half' ? '반일' : '1일'}${num(d.overtimeHours) ? ` + 연장 ${num(d.overtimeHours)}시간` : ''}</span><span data-live="labor">${won(c.labor + c.overtime)}</span></div>
        <div class="line"><span class="l">경비 (청구)</span><span data-live="charged">${won(c.charged)}</span></div>
        <div class="line"><span class="l">청구</span><span data-live="gross">${won(c.gross)}</span></div>
        <div class="line"><span class="l">세액공제 ${TAX[c.mode]?.short}</span><span class="red" data-live="tax2">− ${won(c.tax)}</span></div>
        <div class="line net"><span class="l">실수령</span><span data-live="net">${won(c.net)}</span></div>
        ${c.own ? `<div class="line"><span class="l">내가 쓴 경비 (청구 제외)</span><span class="label" data-live="own">${won(c.own)}</span></div>` : ''}
      </div>
      <div class="field col" style="margin-top:14px"><label>메모</label><input data-bind="memo" value="${esc(d.memo || '')}" placeholder="오늘 작업 내용 (선택)" maxlength="300"></div>
      ${!isNew && !locked ? `<button class="btn ghost danger" data-act="log.del" data-id="${esc(id)}">기록 삭제</button>` : ''}
      ${fixed(`<button class="btn primary" data-act="log.save" ${locked ? 'disabled' : ''}>저장</button>`)}
    `, 'home')
  }
  function refreshLive() {
    const d = S.draft; if (!d || !d.expenses) return
    const c = calcDraft(d), set = (k, v) => app.querySelectorAll(`[data-live="${k}"]`).forEach(el => { el.textContent = v })
    set('labor', won(c.labor + c.overtime)); set('charged', won(c.charged)); set('gross', won(c.gross)); set('tax', won(c.tax)); set('tax2', '− ' + won(c.tax)); set('net', won(c.net)); set('own', won(c.own))
  }

  // ------------------------------------------------------------ S-11 청구서 (새로 만들기 · 미리보기) ----
  async function renderInvoiceNew(q) {
    await loadSites()
    if (activeSites().length === 0) { app.innerHTML = screen(topbar('취소', '새 청구서') + '<div class="card"><div class="empty"><b>현장이 없습니다</b>현장과 출근 기록이 있어야 청구서를 만들 수 있습니다</div></div>', 'settle'); return }
    if (!S.draft) {
      const today = todayKst(), site = siteById(q.site) || activeSites()[0]
      const m = q.from && isYmd(q.from) ? q.from.slice(0, 7) : (+today.slice(8) <= 10 ? shiftMonth(today.slice(0, 7), -1) : today.slice(0, 7))
      S.draft = { siteId: site.id, periodStart: m + '-01', periodEnd: monthEnd(m + '-01'), taxMode: site.taxMode, attachPhotos: true, preview: null, error: '', loading: true }
      S.draft.loading = true
    }
    const d = S.draft
    if (d.loading) {
      d.loading = false
      try { d.preview = await api('/invoices/preview', { body: { siteId: d.siteId, periodStart: d.periodStart, periodEnd: d.periodEnd, taxMode: d.taxMode } }); d.error = '' }
      catch (e) { d.preview = null; d.error = e.message }
      if (route().path !== 'invoice/new') return
    }
    const p = d.preview, site = siteById(d.siteId), thisM = todayKst().slice(0, 7), lastM = shiftMonth(thisM, -1)
    const pm = d.periodStart.slice(0, 7), isFull = d.periodStart.endsWith('-01') && d.periodEnd === monthEnd(d.periodStart)
    const mode = isFull && pm === thisM ? 'this' : isFull && pm === lastM ? 'last' : 'custom'
    app.innerHTML = screen(`
      ${topbar('취소', '새 청구서', '', { leftAct: 'nav', leftTo: '#/settle' })}
      ${sec('현장')}
      <div class="chips">${activeSites().map(s => `<button type="button" class="chip ${d.siteId === s.id ? 'on' : ''}" data-act="inv.site" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div>
      ${sec('기간')}
      ${seg([['last', `${+lastM.slice(5)}월`], ['this', `${+thisM.slice(5)}월`], ['custom', '직접']], mode, 'inv.period')}
      ${mode === 'custom' ? `<div class="two" style="margin-top:10px"><div class="field"><label>부터</label><input type="date" data-bind="periodStart" value="${d.periodStart}"></div><div class="field"><label>까지</label><input type="date" data-bind="periodEnd" value="${d.periodEnd}"></div></div>` : ''}
      ${sec('세액공제', site ? `현장 설정 ${TAX[site.taxMode]?.short}` : '')}
      ${seg(Object.entries(TAX).map(([k, v]) => [k, v.short]), d.taxMode, 'inv.tax')}
      ${d.error ? `<div class="card" style="margin-top:14px"><div class="empty"><b>${esc(d.error)}</b>${period(d.periodStart, d.periodEnd)} · ${esc(site?.name || '')}</div><button class="btn" data-act="nav" data-to="#/log/new?site=${d.siteId}">출근 기록 넣기</button></div>` : ''}
      ${p ? `
        ${sec('청구서 미리보기')}
        <div class="card doc">
          <div class="head"><div><div class="kind">청 구 서</div><div class="site">${esc(p.site.name)}</div><div class="label">${period(p.periodStart, p.periodEnd)} · ${esc(p.site.company || '')}</div></div><span class="badge">초안</span></div>
          ${p.rows.map(r => `<div class="row ${r.excluded ? 'ex' : ''}"><div class="main"><div class="t">${esc(r.label)}</div><div class="s">${esc(r.detail)}</div></div><div class="amt">${r.excluded ? '제외' : won(r.amount)}</div></div>`).join('')}
          <div class="total"><span>청구 금액</span><b>${won(p.gross)}</b></div>
        </div>
        <div class="card blue"><div class="sum">
          <div class="line"><span class="l">청구 금액</span><span>${won(p.gross)}</span></div>
          ${p.breakdown.parts.map(x => `<div class="line"><span class="l">${esc(x.label)}</span><span class="red">− ${won(x.amount)}</span></div>`).join('')}
          <div class="line net"><span class="l">실수령액</span><span>${won(p.net)}</span></div></div></div>
        <div class="field"><label>현장 사진 ${p.photoCount}장 첨부</label>${toggle(d.attachPhotos && p.photoCount > 0, 'inv.photos', p.photoCount ? '' : 'disabled')}</div>
        <div class="field"><label>입금 예정일</label><b>${kdate(p.dueDate)}</b></div>
        <div class="note">${RULES[p.site.settlementRule]?.label} 규칙으로 계산했습니다. 출근 ${p.days}일${p.halfDays ? ` · 반일 ${p.halfDays}일` : ''}${p.overtimeHours ? ` · 연장 ${p.overtimeHours}시간` : ''}${p.ownExpenses ? ` · 내가 쓴 경비 ${won(p.ownExpenses)}(제외)` : ''}</div>
        ${fixed('<button class="btn primary" data-act="inv.create">청구서 만들기</button>')}` : ''}
    `, 'settle')
  }

  // ------------------------------------------------------------ S-11 청구서 (저장본) ----
  async function renderInvoice(id) {
    app.innerHTML = screen(topbar('뒤로', '청구서', '') + '<div class="skeleton"></div>', 'settle')
    const i = await api('/invoices/' + id)
    if (route().path !== 'invoice/' + id) return
    const over = i.status === 'overdue', paid = i.status === 'paid'
    app.innerHTML = screen(`
      ${topbar('뒤로', `${+i.periodStart.slice(5, 7)}월 청구서`, 'PDF', { leftAct: 'nav', leftTo: '#/settle', rightAct: 'inv.pdf' })}
      ${over ? `<div class="card danger" style="display:flex;align-items:center;gap:12px"><div class="main" style="flex:1"><b>입금 예정일 ${i.daysOverdue}일 지남</b><div class="s">남은 금액 ${won(i.remaining)} · 독촉 문안을 자동으로 만들어 드립니다</div></div><a class="btn sm dark" href="#/invoice/${i.id}/dunning" style="min-height:44px">독촉</a></div>` : ''}
      <div class="card doc">
        <div class="head"><div><div class="kind">청 구 서</div><div class="site">${esc(i.siteName)}</div><div class="label">${period(i.periodStart, i.periodEnd)} · ${esc(i.siteCompany || '')}</div></div><span class="badge ${over ? 'red' : paid ? 'sky' : i.status === 'draft' ? '' : 'sky'}">${STATUS[i.status]}</span></div>
        ${i.rows.map(r => `<div class="row ${r.excluded ? 'ex' : ''}"><div class="main"><div class="t">${esc(r.label)}</div><div class="s">${esc(r.detail)}</div></div><div class="amt">${r.excluded ? '제외' : won(r.amount)}</div></div>`).join('')}
        <div class="total"><span>청구 금액</span><b>${won(i.gross)}</b></div>
      </div>
      ${sec('세액공제', `현장 설정 ${TAX[i.site.taxMode]?.short || ''}`)}
      ${paid ? `<div class="note">입금이 끝난 청구서는 세액을 바꿀 수 없습니다 — ${TAX[i.taxMode]?.label}</div>` : seg(Object.entries(TAX).map(([k, v]) => [k, v.short]), i.taxMode, 'inv.retax')}
      <div class="card blue" style="margin-top:14px"><div class="sum">
        <div class="line"><span class="l">청구 금액</span><span>${won(i.gross)}</span></div>
        ${i.breakdown.parts.map(x => `<div class="line"><span class="l">${esc(x.label)}</span><span class="red">− ${won(x.amount)}</span></div>`).join('')}
        <div class="line net"><span class="l">실수령액</span><span>${won(i.net)}</span></div>
        ${i.paidAmount ? `<div class="line"><span class="l">입금 확인</span><span>${won(i.paidAmount)}</span></div><div class="line"><span class="l">남은 금액</span><span class="${i.remaining ? 'red' : ''}">${won(i.remaining)}</span></div>` : ''}
      </div></div>
      <div class="field"><label>현장 사진 ${i.photoCount}장 첨부 (날짜 · 위치 각인)</label>${toggle(i.attachPhotos, 'inv.photos.saved', i.photoCount ? '' : 'disabled')}</div>
      <div class="field"><label>입금 예정일</label><b>${kdate(i.dueDate)}</b></div>
      <div class="note">출근일: ${i.worklogs.map(w => `${+w.date.slice(8, 10)}${w.attendance === 'half' ? '(반)' : ''}${w.overtime_hours ? `+${w.overtime_hours}h` : ''}`).join(' · ') || '-'}</div>
      ${i.payments.length ? sec('입금 내역') + `<div class="card tight">${i.payments.map(p => `<div class="row"><div class="main"><div class="t">${kshort(p.paidAt)} · ${p.method === 'cash' ? '현금' : p.method === 'check' ? '수표' : '계좌이체'}</div><div class="s">${esc(p.payerName || '입금자 미입력')}</div></div><div class="amt">${won(p.amount)}</div></div>`).join('')}</div>` : ''}
      ${i.sendLogs.length ? sec('보낸 기록') + `<div class="card tight">${i.sendLogs.map(s => `<div class="row"><div class="main"><div class="t">${s.docType === 'dunning' ? '독촉' : '청구서'} · ${s.channel === 'sms' ? '문자' : s.channel === 'kakao' ? '카카오톡' : s.channel === 'pdf' ? 'PDF' : '링크'}</div><div class="s">${esc((s.sentAt || '').replace('T', ' ').slice(0, 16))}${s.to ? ' · ' + esc(ph(s.to)) : ''}</div></div></div>`).join('')}</div>` : ''}
      ${!i.payments.length ? `<button class="btn ghost danger" data-act="inv.del" data-id="${i.id}">청구서 삭제 (기록은 남습니다)</button>` : ''}
      ${fixed(paid ? '<button class="btn" data-act="inv.share">링크 공유</button>' : `<button class="btn secondary" data-act="nav" data-to="#/invoice/${i.id}/pay">입금 확인</button><button class="btn primary" data-act="inv.sendsheet">청구서 보내기</button>`)}
    `, 'settle')
    S.draft = { inv: i }
  }
  function sendSheet(i) {
    const to = S.draft?.to ?? (i.site?.contactPhone || '')
    sheet(`<h3>청구서 보내기</h3><div class="s">${esc(i.siteCompany || i.siteName)} · 실수령 ${won(i.net)} · 세액공제 ${TAX[i.taxMode]?.short}</div>
      <div class="field" style="box-shadow:inset 0 0 0 1px var(--line2)"><label>받는 번호</label><input type="tel" data-bind="to" value="${esc(to)}" placeholder="010-0000-0000"></div>
      <button class="opt primary" data-act="inv.send" data-ch="sms"><span class="ic">✉</span><div><div class="t">문자</div><div class="d">금액 요약 + 청구서 링크 (로그인 없이 열림)</div></div><span class="chev">›</span></button>
      <button class="opt" data-act="inv.send" data-ch="kakao"><span class="ic">💬</span><div><div class="t">카카오톡</div><div class="d">알림톡 템플릿 심사 전까지 문자로 보냅니다</div></div><span class="chev">›</span></button>
      <button class="opt" data-act="inv.send" data-ch="link"><span class="ic">🔗</span><div><div class="t">링크 공유 · 복사</div><div class="d">카톡 · 메일 등 원하는 앱으로 직접 보내기</div></div><span class="chev">›</span></button>
      <button class="opt" data-act="inv.send" data-ch="pdf"><span class="ic">▤</span><div><div class="t">PDF로 내보내기</div><div class="d">인쇄 · 저장 · 다른 앱</div></div><span class="chev">›</span></button>
      <div class="label" style="text-align:center;font-size:13px">보낸 기록을 남깁니다 (S-17)</div>`)
  }

  // ------------------------------------------------------------ S-13 입금 확인 · 일부 입금 ----
  async function renderPay(id) {
    app.innerHTML = screen(topbar('뒤로', '입금 확인', '') + '<div class="skeleton"></div>', 'settle')
    const i = S.draft?.inv?.id === id ? S.draft.inv : await api('/invoices/' + id)
    if (route().path !== `invoice/${id}/pay`) return
    if (!S.draft || S.draft.inv?.id !== id) S.draft = { inv: i, amount: i.remaining, paidAt: todayKst(), method: 'transfer', payerName: i.siteCompany || '' }
    const d = S.draft, amount = Math.round(num(d.amount)), remaining = i.remaining, left = Math.max(0, remaining - amount), partial = amount > 0 && amount < remaining
    app.innerHTML = screen(`
      ${topbar('뒤로', '입금 확인', '', { leftAct: 'nav', leftTo: '#/invoice/' + id })}
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><b style="font-size:16px">${esc(i.siteName)} · ${+i.periodStart.slice(5, 7)}월 청구서</b></div><span class="badge ${i.status === 'overdue' ? 'red' : 'sky'}">${STATUS[i.status]}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px"><span class="label">받을 금액</span><b style="font-size:26px" class="num">${won(remaining)}</b></div>
        <div class="s label" style="margin-top:4px">청구 ${fmt(i.gross)} · 세액공제 ${TAX[i.taxMode]?.short} ${fmt(i.tax)}${i.paidAmount ? ` · 이미 입금 ${fmt(i.paidAmount)}` : ''} · 예정일 ${kshort(i.dueDate)}</div></div>
      ${sec('얼마 들어왔어요?')}
      <div class="field big focus"><input type="tel" inputmode="numeric" data-bind="amount" data-money="1" value="${amount ? fmt(amount) : ''}" placeholder="0" autofocus><span class="unit">원</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px 10px"><span class="label">전액 ${fmt(remaining)}</span><div style="display:flex;gap:8px"><button type="button" class="chip ${amount >= remaining ? 'on' : ''}" data-act="pay.full">전액</button><button type="button" class="chip ${partial ? 'on' : ''}" data-act="pay.half">일부만</button></div></div>
      ${partial ? `<div class="card sky"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>남는 금액</b><b style="font-size:22px" class="num">${won(left)}</b></div><div class="s" style="margin-top:4px">미정산으로 그대로 남고, 예정일이 지나면 독촉 문안을 만들어 드립니다.</div></div>` : amount > remaining ? `<div class="card danger"><b>받을 금액보다 ${won(amount - remaining)} 많습니다</b><div class="s">다음 청구서 몫이면 금액을 나눠 기록해 주세요.</div></div>` : ''}
      ${sec('입금 정보')}
      <div class="field"><label>받은 날</label><input type="date" data-bind="paidAt" value="${esc(d.paidAt)}" max="${todayKst()}"></div>
      ${seg([['transfer', '계좌이체'], ['cash', '현금'], ['check', '수표']], d.method, 'pay.method')}
      <div class="field" style="margin-top:10px"><label>입금자명</label><input data-bind="payerName" value="${esc(d.payerName)}" placeholder="대성건설" maxlength="40"></div>
      ${fixed(`<button class="btn primary" data-act="pay.save" ${amount <= 0 ? 'disabled' : ''}>${amount >= remaining ? '전액 확인' : '일부 입금 기록'}</button>`)}
    `, 'settle')
  }

  // ------------------------------------------------------------ S-14 독촉 ----
  async function renderDunning(id) {
    app.innerHTML = screen(topbar('뒤로', '미정산 독촉', '') + '<div class="skeleton"></div>', 'settle')
    const [i, dn] = await Promise.all([api('/invoices/' + id), api(`/invoices/${id}/dunning`)])
    if (route().path !== `invoice/${id}/dunning`) return
    if (!S.draft || S.draft.id !== id) S.draft = { id, level: dn.level === 'firm' ? 'firm' : 'polite', text: dn.level === 'firm' ? dn.firm : dn.polite, to: i.site?.contactPhone || '', dn }
    const d = S.draft
    app.innerHTML = screen(`
      ${topbar('뒤로', '미정산 독촉', '', { leftAct: 'nav', leftTo: '#/invoice/' + id })}
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">${esc(i.siteName)} · ${+i.periodStart.slice(5, 7)}월 청구서</b><span class="badge red">${dn.daysOverdue}일 지남</span></div>
        <div class="sum" style="margin-top:8px;padding:0"><div class="line"><span class="l">입금 예정액</span><span class="red">${won(dn.remaining)}</span></div><div class="line"><span class="l">청구</span><span>${won(i.net)}</span></div><div class="line"><span class="l">받은 금액</span><span>${won(i.paidAmount)}</span></div><div class="line"><span class="l">예정일</span><span>${kdate(i.dueDate)}</span></div></div></div>
      ${sec('독촉 문안')}
      ${seg([['polite', '정중 (3일 이상)'], ['firm', '단호 (10일 이상)']], d.level, 'dun.level')}
      <textarea class="ta" data-bind="text" style="margin-top:10px">${esc(d.text)}</textarea>
      <div class="field" style="margin-top:10px"><label>받는 번호</label><input type="tel" data-bind="to" value="${esc(d.to)}" placeholder="010-0000-0000"></div>
      <div class="note">상대가 읽었는지(문자 수신)까지만 기록합니다. 보낸 기록은 S-17 «보낸 기록»에 남고 삭제되지 않습니다.</div>
      ${fixed('<button class="btn secondary" data-act="dun.copy">복사</button><button class="btn primary" data-act="dun.send">문자로 보내기</button>')}
    `, 'settle')
  }

  // ------------------------------------------------------------ 입금 내역 · 보낸 기록 ----
  async function renderPayments() {
    const month = S.month || (S.month = todayKst().slice(0, 7))
    app.innerHTML = screen(topbar('뒤로', '입금 내역', '', { leftAct: 'nav', leftTo: '#/settle' }) + '<div class="skeleton"></div>', 'settle')
    const pays = await api('/payments?month=' + month)
    if (route().path !== 'payments') return
    const total = pays.filter(p => !p.excluded).reduce((s, p) => s + p.amount, 0)
    app.innerHTML = screen(`
      ${topbar('뒤로', '입금 내역', '', { leftAct: 'nav', leftTo: '#/settle' })}
      <div class="hdr" style="margin-top:0"><div class="sub" style="display:flex;align-items:center;gap:4px"><button class="tb" data-act="month.prev" style="color:#fff;font-size:22px;min-width:36px;height:36px;padding:0">‹</button><span>${kmonth(month)} 입금</span><button class="tb" data-act="month.next" style="color:#fff;font-size:22px;min-width:36px;height:36px;padding:0">›</button></div><div class="big">${fmt(total)}<small>원</small></div><div class="line"><span>${pays.length}건 · 직접 기록</span><span>자동 기록은 계좌 연결 후</span></div></div>
      ${pays.length ? `<div class="card tight">${pays.map(p => `<a class="row link" href="#/invoice/${p.invoiceId}"><div class="main"><div class="t">${kshort(p.paidAt)} · ${esc(p.siteName || '')}</div><div class="s">${esc(p.payerName || '입금자 미입력')} · ${p.method === 'cash' ? '현금' : p.method === 'check' ? '수표' : '계좌이체'} · <span class="badge">직접 입력</span></div></div><div class="amt">${won(p.amount)}</div></a>`).join('')}</div>` : '<div class="card"><div class="empty">이 달 입금 기록이 없습니다</div></div>'}
    `, 'settle')
  }
  async function renderSendlogs() {
    app.innerHTML = screen(topbar('뒤로', '보낸 기록', '', { leftAct: 'nav', leftTo: '#/all' }) + '<div class="skeleton"></div>', 'all')
    const logs = await api('/sendlogs')
    if (route().path !== 'sendlogs') return
    const DT = { quote: '견적서', invoice: '청구서', dunning: '독촉', yearSummary: '정산서' }, CH = { sms: '문자', kakao: '카카오톡', email: '메일', pdf: 'PDF', link: '링크' }
    app.innerHTML = screen(`
      ${topbar('뒤로', '보낸 기록', '', { leftAct: 'nav', leftTo: '#/all' })}
      <div class="note">언제 누구에게 무엇을 보냈는지. 분쟁 때 이 화면을 그대로 보여줍니다. 삭제되지 않습니다.</div>
      ${logs.length ? `<div class="card tight">${logs.map(s => `<a class="row link" href="#/invoice/${s.docId}"><div class="main"><div class="t">${DT[s.docType] || s.docType}${s.dunningLevel ? ` (${s.dunningLevel === 'firm' ? '단호' : '정중'})` : ''} · ${CH[s.channel] || s.channel}</div><div class="s">${esc((s.sentAt || '').replace('T', ' ').slice(0, 16))} · ${esc(s.siteName || '')}${s.to ? ' · ' + esc(ph(s.to)) : ''}</div></div><div class="amt">${won(s.amount)}</div></a>`).join('')}</div>` : '<div class="card"><div class="empty">아직 보낸 문서가 없습니다</div></div>'}
    `, 'all')
  }

  // ------------------------------------------------------------ S-37 설정 ----
  async function renderSettings() {
    const u = S.user
    if (!S.draft) S.draft = { name: u.name || '', bizNo: u.bizNo || '', defaultTaxMode: u.defaultTaxMode || 'rate33', clockOutTime: u.clockOutTime || '18:00', prefs: { due: true, clockOut: true, ...(u.notifPrefs || {}) } }
    const d = S.draft
    app.innerHTML = screen(`
      ${topbar('뒤로', '설정', '', { leftAct: 'nav', leftTo: '#/all' })}
      <div class="hdr"><div class="brand"><div style="display:flex;align-items:center;gap:12px"><span style="width:56px;height:56px;border-radius:16px;background:#fff;color:var(--blue);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:24px">${esc((d.name || '반').slice(0, 1))}</span><div><div style="font-size:22px;font-weight:800">${esc(d.name || '이름 없음')}</div><div class="sub">${esc(ph(u.phone))} · 휴대폰 인증</div></div></div></div></div>
      ${sec('내 정보')}
      <div class="field"><label>이름</label><input data-bind="name" value="${esc(d.name)}" placeholder="김철수" maxlength="30"></div>
      <div class="field"><label>사업자번호 (선택)</label><input type="tel" data-bind="bizNo" value="${esc(d.bizNo)}" placeholder="000-00-00000" maxlength="12"></div>
      ${sec('세액공제 기본값')}
      ${seg(Object.entries(TAX).map(([k, v]) => [k, v.short]), d.defaultTaxMode, 'set.tax')}
      <div class="note" style="margin-top:10px">새 현장을 만들 때 기본으로 들어갑니다. 지난 기록은 바뀌지 않습니다. 현장별 설정(S-08)이 우선입니다.</div>
      ${sec('알림')}
      <div class="field"><label>퇴근 알람 시간</label><input type="time" data-bind="clockOutTime" value="${esc(d.clockOutTime)}" style="text-align:right"></div>
      <div class="field"><label>독촉 예정일 알림 (D-3 · 초과)</label>${toggle(d.prefs.due, 'set.pref', 'data-k="due"')}</div>
      <div class="field"><label>퇴근 알람</label>${toggle(d.prefs.clockOut, 'set.pref', 'data-k="clockOut"')}</div>
      <div class="note">잠금화면 알림(S-05)과 입금 알림은 앱 스토어 버전(푸시)에서 켜집니다. 지금은 설정값만 저장합니다.</div>
      ${sec('연결된 계좌')}
      <div class="card"><b>아직 연결할 수 없습니다</b><div class="s label" style="margin-top:4px">조회 전용 오픈뱅킹(금융결제원 이용기관 등록) 심사 후 제공합니다. 그때까지 입금은 청구서에서 직접 기록합니다.</div></div>
      <button class="btn ghost" data-act="logout">로그아웃</button>
      <div class="version">JOBS ${esc(window.JOBS_VERSION || '')}</div>
      ${fixed('<button class="btn primary" data-act="set.save">저장</button>')}
    `, 'all')
  }

  // ------------------------------------------------------------ 액션 ----
  const ACT = {
    none() {},
    reload() { location.reload() },
    nav(el) { go(el.dataset.to) },
    back() { if (history.length > 1) history.back(); else go('#/home') },
    soon(el) { toast(el.dataset.msg || '준비 중입니다') },
    logout() { logout(true) },
    'month.prev'() { S.month = shiftMonth(S.month || todayKst().slice(0, 7), -1); S.draft = null; render() },
    'month.next'() { S.month = shiftMonth(S.month || todayKst().slice(0, 7), 1); S.draft = null; render() },
    'home.range'(el) { S.rangeTab = el.dataset.v; render() },
    'cal.sel'(el) { S.draft = { sel: el.dataset.date }; render() },
    'cal.go'(el) { S.draft = null; go('#/cal?d=' + el.dataset.date) },
    'cal.mode'(el) { if (el.dataset.v === 'w') toast('주 보기는 다음 버전에 들어갑니다') },
    'sheet.record'(el) { recordSheet(el.dataset.date) },
    async 'log.copy'(el) { closeSheet(); await busy(async () => { const l = await api('/worklogs/copy', { body: { date: el.dataset.date } }); toast(`${l.siteName} 기록을 복사했습니다`); S.month = l.date.slice(0, 7); go('#/log/' + l.id) }) },
    // 로그인
    async 'login.request'() { await busy(async () => { const d = S.draft; const r = await api('/auth/request-code', { body: { phone: d.phone } }); d.step = 'code'; d.devCode = r.devCode || ''; d.code = ''; renderLogin(); if (!r.devCode) toast('인증번호를 문자로 보냈습니다') }) },
    async 'login.verify'() { await busy(async () => { const d = S.draft; const r = await api('/auth/verify', { body: { phone: d.phone, code: d.code } }); S.token = r.token; localStorage.setItem('jobs_token', r.token); S.user = r.user; S.draft = null; toast(r.isNew ? '처음 오셨네요. 현장부터 만들어 볼까요' : '다시 오셨네요'); location.replace(r.isNew ? '#/site/new' : '#/home') }) },
    'login.reset'() { S.draft.step = 'phone'; renderLogin() },
    // 현장
    'site.set'(el) { S.draft[el.dataset.k] = el.dataset.v; render() },
    'site.toggle'(el) { S.draft[el.dataset.k] = !S.draft[el.dataset.k]; render() },
    async 'site.pin'() { await busy(async () => { toast('위치 확인 중…'); const g = await getGeo(); S.draft.lat = g.lat; S.draft.lng = g.lng; toast(`현장 핀을 찍었습니다 (오차 ±${g.acc}m)`); render() }) },
    async 'site.save'(el) {
      const d = S.draft, id = el.dataset.id, prev = id ? siteById(id) : null
      if (!d.name.trim()) return toast('현장명을 입력해 주세요', true)
      if (!d.settlementRule) return toast('정산 규칙을 골라 주세요 (필수)', true)
      if (!d.taxMode) return toast('세금 처리 방식을 골라 주세요 (필수)', true)
      if (prev && prev.taxMode !== d.taxMode && !d.applyDecided) {
        sheet(`<h3>세금 처리를 바꿨습니다</h3><div class="s">${TAX[prev.taxMode]?.label} → ${TAX[d.taxMode]?.label}</div>
          <button class="opt primary" data-act="site.apply" data-v="future"><div><div class="t">앞으로만 적용</div><div class="d">지난 기록은 그대로 둡니다 (권장)</div></div></button>
          <button class="opt" data-act="site.apply" data-v="past"><div><div class="t">지난 기록에도 적용</div><div class="d">청구서에 안 들어간 지난 기록을 다시 계산합니다</div></div></button>`)
        return
      }
      await busy(async () => {
        const body = { name: d.name, company: d.company, address: d.address, lat: d.lat, lng: d.lng, contactName: d.contactName, contactPhone: d.contactPhone, dayRate: num(d.dayRate), overtimeRate: num(d.overtimeRate), hourRate: num(d.overtimeRate), settlementRule: d.settlementRule, taxMode: d.taxMode, clockOutTime: d.clockOutTime, alarmDue: d.alarmDue, alarmClockOut: d.alarmClockOut, memo: d.memo, applyToPast: d.applyToPast === true }
        const s = id ? await api('/sites/' + id, { method: 'PUT', body }) : await api('/sites', { body })
        await loadSites(true); toast('현장을 저장했습니다')
        const ret = d.ret; S.draft = null
        go(ret === 'log' ? `#/log/new?site=${s.id}` : '#/all')
      })
    },
    'site.apply'(el) { closeSheet(); S.draft.applyDecided = true; S.draft.applyToPast = el.dataset.v === 'past'; ACT['site.save']({ dataset: { id: route().parts[1] } }) },
    async 'site.archive'(el) { await busy(async () => { const s = siteById(el.dataset.id); if (s?.archived) { await api('/sites/' + s.id, { method: 'PUT', body: { archived: false } }); toast('현장을 다시 열었습니다') } else { const r = await api('/sites/' + el.dataset.id, { method: 'DELETE' }); toast(r.archived ? '현장을 보관했습니다 (기록 · 청구서는 남습니다)' : '현장을 삭제했습니다') } await loadSites(true); S.draft = null; go('#/all') }) },
    // 출근 기록
    'log.site'(el) { const d = S.draft, s = siteById(el.dataset.id); d.siteId = s.id; if (!d.ratesTouched) { d.dayRate = s.dayRate; d.hourRate = s.overtimeRate || s.hourRate } ; if (d.geo && s.lat) d.geo.dist = distM(d.geo, s); render() },
    'log.att'(el) { S.draft.attendance = el.dataset.v; render() },
    'log.ot'(el) { S.draft.overtimeHours = Math.max(0, Math.min(24, num(S.draft.overtimeHours) + Number(el.dataset.v))); render() },
    'log.tax'(el) { const site = siteById(S.draft.siteId); S.draft.taxModeOverride = el.dataset.v === site?.taxMode ? null : el.dataset.v; render() },
    async 'log.geo'() { await busy(async () => { toast('위치 확인 중…'); const g = await getGeo(); const site = siteById(S.draft.siteId); S.draft.geo = { lat: g.lat, lng: g.lng, acc: g.acc, dist: site?.lat ? distM(g, site) : null }; if (!S.draft.checkInAt) S.draft.checkInAt = nowHm(); render() }) },
    'log.photo.add'() { document.getElementById('photoInput')?.click() },
    'log.photo.del'(el) { S.draft.photos.splice(+el.dataset.i, 1); render() },
    'log.exp.add'() { S.draft.expenses.push({ type: 'fuel', name: '', amount: '', chargeToClient: true }); render(); setTimeout(() => app.querySelector(`[data-bind="expenses.${S.draft.expenses.length - 1}.amount"]`)?.focus(), 50) },
    'log.exp.del'(el) { S.draft.expenses.splice(+el.dataset.i, 1); render() },
    'log.exp.charge'(el) { const e = S.draft.expenses[+el.dataset.i]; e.chargeToClient = !e.chargeToClient; render() },
    async 'log.save'() {
      const d = S.draft
      if (!d.siteId) return toast('현장을 골라 주세요', true)
      if (!isYmd(d.date)) return toast('날짜를 확인해 주세요', true)
      if (num(d.dayRate) <= 0) return toast('1일 단가를 입력해 주세요', true)
      await busy(async () => {
        const body = { siteId: d.siteId, date: d.date, attendance: d.attendance, overtimeHours: num(d.overtimeHours), dayRate: num(d.dayRate), hourRate: num(d.hourRate), taxModeOverride: d.taxModeOverride, checkInAt: d.checkInAt, checkOutAt: d.checkOutAt, memo: d.memo, source: 'manual',
          expenses: d.expenses.map(e => ({ type: e.type, name: e.name, amount: num(e.amount), chargeToClient: e.chargeToClient })).filter(e => e.amount > 0), photos: d.photos,
          ...(d.geo ? { checkInLat: d.geo.lat, checkInLng: d.geo.lng, geoDistanceM: d.geo.dist } : {}) }
        try {
          const l = d.id ? await api('/worklogs/' + d.id, { method: 'PUT', body }) : await api('/worklogs', { body })
          toast(`${kshort(l.date)} ${l.siteName} · 실수령 ${won(l.net)} 저장`)
          S.month = l.date.slice(0, 7); S.sites = null; S.draft = null
          go(d.id ? '#/cal?d=' + l.date : '#/home')
        } catch (e) {
          if (e.status === 409 && e.data?.existingId) { if (confirm(e.message + '\n기존 기록을 열까요?')) { S.draft = null; go('#/log/' + e.data.existingId) } ; return }
          throw e
        }
      })
    },
    async 'log.del'(el) { if (!confirm('이 기록을 삭제할까요?')) return; await busy(async () => { await api('/worklogs/' + el.dataset.id, { method: 'DELETE' }); toast('삭제했습니다'); S.sites = null; S.draft = null; go('#/cal') }) },
    // 청구서
    'inv.site'(el) { const d = S.draft; d.siteId = el.dataset.id; d.taxMode = siteById(d.siteId)?.taxMode || d.taxMode; d.loading = true; render() },
    'inv.period'(el) { const d = S.draft, thisM = todayKst().slice(0, 7); if (el.dataset.v === 'this') { d.periodStart = thisM + '-01'; d.periodEnd = monthEnd(d.periodStart) } else if (el.dataset.v === 'last') { const m = shiftMonth(thisM, -1); d.periodStart = m + '-01'; d.periodEnd = monthEnd(d.periodStart) } else { d.periodEnd = addDays(d.periodEnd, -1) } ; d.loading = true; render() },
    'inv.tax'(el) { S.draft.taxMode = el.dataset.v; S.draft.loading = true; render() },
    'inv.photos'() { S.draft.attachPhotos = !S.draft.attachPhotos; render() },
    async 'inv.create'() { await busy(async () => { const d = S.draft; const i = await api('/invoices', { body: { siteId: d.siteId, periodStart: d.periodStart, periodEnd: d.periodEnd, taxMode: d.taxMode, attachPhotos: d.attachPhotos } }); toast('청구서를 만들었습니다. 이제 보내 보세요'); S.draft = null; go('#/invoice/' + i.id) }) },
    async 'inv.retax'(el) { await busy(async () => { const id = route().parts[1]; await api('/invoices/' + id, { method: 'PUT', body: { taxMode: el.dataset.v } }); S.draft = null; render() }) },
    async 'inv.photos.saved'() { await busy(async () => { const i = S.draft.inv; await api('/invoices/' + i.id, { method: 'PUT', body: { attachPhotos: !i.attachPhotos } }); S.draft = null; render() }) },
    'inv.pdf'() { const i = S.draft?.inv; if (i?.shareUrl) window.open(i.shareUrl, '_blank') },
    async 'inv.share'() { const i = S.draft?.inv; if (!i) return; if (navigator.share) { try { await navigator.share({ title: `${i.siteName} 청구서`, text: `실수령 ${won(i.net)} · 입금 예정일 ${i.dueDate}`, url: i.shareUrl }) } catch { /* 취소 */ } } else copyText(i.shareUrl) },
    'inv.sendsheet'() { S.draft.to = S.draft.to ?? S.draft.inv.site?.contactPhone ?? ''; sendSheet(S.draft.inv) },
    async 'inv.send'(el) {
      const i = S.draft.inv, chn = el.dataset.ch
      await busy(async () => {
        if (chn === 'link') {
          const r = await api(`/invoices/${i.id}/send`, { body: { channel: 'link' } }); closeSheet()
          if (navigator.share) { try { await navigator.share({ title: `${i.siteName} 청구서`, text: r.text, url: r.link }) } catch { /* 취소 */ } } else await copyText(r.text)
          S.draft = null; render(); return
        }
        if (chn === 'pdf') { await api(`/invoices/${i.id}/send`, { body: { channel: 'pdf' } }); closeSheet(); window.open(i.shareUrl, '_blank'); S.draft = null; render(); return }
        const r = await api(`/invoices/${i.id}/send`, { body: { channel: chn, to: S.draft.to } })
        closeSheet(); toast(chn === 'kakao' ? '카카오톡 대신 문자로 보냈습니다' : '문자로 보냈습니다'); S.draft = null; render()
      })
    },
    async 'inv.del'(el) { if (!confirm('청구서를 삭제할까요? 출근 기록은 남고 다시 청구서를 만들 수 있습니다.')) return; await busy(async () => { await api('/invoices/' + el.dataset.id, { method: 'DELETE' }); toast('삭제했습니다'); S.draft = null; go('#/settle') }) },
    // 입금
    'pay.full'() { S.draft.amount = S.draft.inv.remaining; render() },
    'pay.half'() { const d = S.draft; if (num(d.amount) >= d.inv.remaining) d.amount = ''; render(); setTimeout(() => app.querySelector('[data-bind="amount"]')?.focus(), 50) },
    'pay.method'(el) { S.draft.method = el.dataset.v; render() },
    async 'pay.save'() { await busy(async () => { const d = S.draft; const r = await api(`/invoices/${d.inv.id}/payments`, { body: { amount: num(d.amount), paidAt: d.paidAt, method: d.method, payerName: d.payerName } }); toast(r.invoice.status === 'paid' ? '전액 입금을 확인했습니다' : `일부 입금 기록 · 남은 금액 ${won(r.remaining)}`); S.draft = null; go('#/invoice/' + d.inv.id) }) },
    // 독촉
    'dun.level'(el) { const d = S.draft; d.level = el.dataset.v; d.text = d.level === 'firm' ? d.dn.firm : d.dn.polite; render() },
    'dun.copy'() { copyText(S.draft.text) },
    async 'dun.send'() { await busy(async () => { const d = S.draft; await api(`/invoices/${d.id}/dunning`, { body: { level: d.level, channel: 'sms', to: d.to, text: d.text } }); toast('독촉 문자를 보냈습니다'); S.draft = null; go('#/invoice/' + d.id) }) },
    // 설정
    'set.tax'(el) { S.draft.defaultTaxMode = el.dataset.v; render() },
    'set.pref'(el) { S.draft.prefs[el.dataset.k] = !S.draft.prefs[el.dataset.k]; render() },
    async 'set.save'() { await busy(async () => { const d = S.draft; const r = await api('/me', { method: 'PUT', body: { name: d.name, bizNo: d.bizNo, defaultTaxMode: d.defaultTaxMode, clockOutTime: d.clockOutTime, notifPrefs: d.prefs } }); S.user = r.user; toast('저장했습니다'); S.draft = null; go('#/all') }) },
  }

  // ------------------------------------------------------------ 이벤트 ----
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]')
    if (!el || el.disabled) return
    const fn = ACT[el.dataset.act]
    if (!fn) return
    e.preventDefault()
    const r = fn(el, e); if (r && r.catch) r.catch(err => toast(err.message, true))
  })
  function setBind(path, value) {
    const d = S.draft; if (!d) return
    const keys = path.split('.'); let o = d
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]]
    o[keys[keys.length - 1]] = value
  }
  document.addEventListener('input', e => {
    const el = e.target; if (!el.dataset || !el.dataset.bind) return
    if (el.dataset.money) { const v = num(el.value); const s = v ? fmt(v) : ''; if (el.value !== s) { el.value = s } ; setBind(el.dataset.bind, v) }
    else setBind(el.dataset.bind, el.value)
    if (el.dataset.bind === 'dayRate' || el.dataset.bind === 'hourRate') S.draft.ratesTouched = true
    if (el.dataset.bind === 'amount' && S.draft?.inv) { /* 입금 화면: 전액/일부 표시 갱신 */ clearTimeout(S._t); S._t = setTimeout(() => { const a = el; const pos = a.selectionStart; render(); setTimeout(() => { const n = app.querySelector('[data-bind="amount"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos) } catch { /* ios */ } } }, 0) }, 500) }
    refreshLive()
  })
  document.addEventListener('change', async e => {
    const el = e.target
    if (el.id === 'photoInput') {
      const files = Array.from(el.files || []).slice(0, 6 - S.draft.photos.length)
      let geo = S.draft.geo
      if (!geo) { try { geo = await getGeo() } catch { geo = null } }
      for (const f of files) { try { S.draft.photos.push({ uri: await fileToDataUrl(f), takenAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19), lat: geo?.lat ?? null, lng: geo?.lng ?? null, label: '' }) } catch (err) { toast(err.message, true) } }
      el.value = ''; render(); return
    }
    if (el.dataset && el.dataset.bind) {
      setBind(el.dataset.bind, el.dataset.money ? num(el.value) : el.value)
      if (['periodStart', 'periodEnd'].includes(el.dataset.bind) && S.draft && 'preview' in S.draft && isYmd(S.draft.periodStart) && isYmd(S.draft.periodEnd)) { S.draft.loading = true; render() }
      if (el.dataset.bind === 'date' && S.draft && 'expenses' in S.draft) render()
    }
  })
  window.addEventListener('hashchange', render)
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/jobs/sw.js').catch(() => null)
  render()
})()
