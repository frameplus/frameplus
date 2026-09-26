// ===== 인사이트 피드 · 공고 레이더 (v8.7) =====
// app.js 전역(api, svgIcon, escHtml, openModal, closeModal, toast, isAdmin, nav, fmt)을 사용한다.

const NEWS_TOPICS = [
  { id: 'arch_ai', label: '건축·인테리어 AI', icon: '🏗️' },
  { id: 'ai_news', label: 'AI 뉴스', icon: '📰' },
  { id: 'ai_apps', label: 'AI 앱', icon: '🧩' },
  { id: 'mcp', label: 'MCP', icon: '🔌' },
  { id: 'api', label: 'API', icon: '⚙️' },
  { id: 'github', label: 'GitHub', icon: '🐙' },
];
const topicOf = id => NEWS_TOPICS.find(t => t.id === id) || { label: id || '-', icon: '•' };
const topicBadge = id => { const t = topicOf(id); return `<span class="badge" style="background:var(--gray-100,#F3F4F6);color:var(--text)">${t.icon} ${escHtml(t.label)}</span>`; };
const rEsc = s => escHtml(s == null ? '' : String(s));
const rTime = s => { if (!s) return '-'; const d = new Date(s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z'); return isNaN(d) ? s : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ddayOf = d => d ? Math.round((Date.parse(d) - Date.parse(todayKst())) / 86400e3) : null;
const ddayHtml = d => { const n = ddayOf(d); if (n === null) return '<span style="color:var(--text-muted)">마감 미상</span>'; if (n < 0) return `<span style="color:var(--text-muted)">마감</span>`; return `<b style="color:${n <= 3 ? 'var(--danger,#DC2626)' : 'var(--text)'}">D-${n}</b>`; };
const wonShort = n => { n = Number(n) || 0; if (!n) return '-'; if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + '억'; if (n >= 1e4) return Math.round(n / 1e4).toLocaleString() + '만'; return n.toLocaleString(); };

// ---------------------------------------------------------------
// 뉴스 페이지 /insights
// ---------------------------------------------------------------
const INS = { topic: 'all', days: 7, min: 60, q: '', page: 1, bookmarked: false };
function renderInsights() {
  document.getElementById('tb-actions').innerHTML = isAdmin()
    ? `<button class="btn btn-outline btn-sm" onclick="insCollectNow()">⟳ 지금 수집</button>` : '';
  const tabs = [{ id: 'all', label: '전체', icon: '🗂️' }, ...NEWS_TOPICS].map(t =>
    `<button class="btn btn-sm ${INS.topic === t.id ? 'btn-primary' : 'btn-outline'}" onclick="INS.topic='${t.id}';INS.page=1;loadInsights()">${t.icon} ${t.label}</button>`).join('');
  document.getElementById('content').innerHTML = `
  <div style="animation:fadeIn .4s ease">
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px" id="ins-tabs">${tabs}</div>
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <select class="sel" style="width:auto" onchange="INS.days=+this.value;INS.page=1;loadInsights()">
        ${[[1, '오늘'], [7, '7일'], [30, '30일']].map(([v, l]) => `<option value="${v}"${INS.days === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px">점수 ≥ <b id="ins-min-v">${INS.min}</b>
        <input type="range" min="0" max="100" step="5" value="${INS.min}" oninput="document.getElementById('ins-min-v').textContent=this.value" onchange="INS.min=+this.value;INS.page=1;loadInsights()"></label>
      <label style="display:flex;align-items:center;gap:4px;font-size:12px"><input type="checkbox" ${INS.bookmarked ? 'checked' : ''} onchange="INS.bookmarked=this.checked;INS.page=1;loadInsights()"> ★ 북마크만</label>
      <input class="inp" style="flex:1;min-width:160px" placeholder="제목·요약·태그 검색" value="${rEsc(INS.q)}" onkeydown="if(event.key==='Enter'){INS.q=this.value;INS.page=1;loadInsights()}">
    </div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px" class="ins-grid">
      <div class="card" style="padding:0"><div id="ins-list" style="padding:4px 16px">불러오는 중…</div><div id="ins-pager" style="padding:10px 16px;display:flex;gap:8px;justify-content:center"></div></div>
      <div class="card" id="ins-bm"><div class="card-title">★ 북마크 · 메모장</div><div style="font-size:12px;color:var(--text-muted)">불러오는 중…</div></div>
    </div>
    ${isAdmin() ? `<div class="card" style="margin-top:16px" id="ins-sources"></div>` : ''}
  </div>
  <style>@media(max-width:900px){.ins-grid{grid-template-columns:1fr!important}}</style>`;
  loadInsights();
  loadInsightMemos();
  if (isAdmin()) loadNewsSources();
}
async function loadInsights() {
  document.querySelectorAll('#ins-tabs button').forEach((b, i) => { const id = i === 0 ? 'all' : NEWS_TOPICS[i - 1].id; b.className = `btn btn-sm ${INS.topic === id ? 'btn-primary' : 'btn-outline'}`; });
  const qs = new URLSearchParams({ topic: INS.topic, days: INS.days, min_score: INS.min, page: INS.page });
  if (INS.q) qs.set('q', INS.q);
  if (INS.bookmarked) qs.set('bookmarked', '1');
  const rows = await api('news?' + qs);
  const el = document.getElementById('ins-list');
  if (!el) return;
  if (rows?.__error) { el.innerHTML = `<div style="padding:20px;color:var(--danger)">불러오기 실패</div>`; return; }
  el.innerHTML = rows.length ? rows.map(n => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);${n.read_at ? 'opacity:.62' : ''}" id="ins-${n.id}">
      <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:var(--text-muted);margin-bottom:4px">
        ${topicBadge(n.topic)}<span>${rEsc(n.source_name || (n.author === 'weekly_research' ? '주간 리서치' : ''))}</span><span>${rTime(n.published_at || n.created_at)}</span>
        <span style="margin-left:auto;font-weight:700;color:var(--text)">${n.score ?? '-'}</span>
        <button class="btn btn-ghost btn-icon" title="북마크 → 메모장" style="font-size:16px;color:${n.bookmarked ? '#F59E0B' : 'var(--text-muted)'}" onclick="toggleNewsBookmark(${n.id},this)">${n.bookmarked ? '★' : '☆'}</button>
      </div>
      <a href="${rEsc(n.url)}" target="_blank" rel="noopener" onclick="api('news/${n.id}/read','POST');this.closest('[id^=ins-]').style.opacity='.62'" style="font-size:14px;font-weight:700;color:var(--text);text-decoration:none;line-height:1.4">${rEsc(n.title)}</a>
      ${n.why_relevant ? `<div style="font-size:12px;color:var(--primary,#6D28D9);margin-top:3px">→ ${rEsc(n.why_relevant)}</div>` : ''}
      <details style="margin-top:4px"><summary style="font-size:12px;color:var(--text-muted);cursor:pointer">요약 보기${n.tags ? ` · #${rEsc(n.tags).split(',').join(' #')}` : ''}</summary>
        <div style="font-size:12.5px;white-space:pre-line;margin-top:4px;line-height:1.55">${rEsc(n.summary_ko)}</div></details>
    </div>`).join('') : `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">조건에 맞는 항목이 없습니다.</div>`;
  const pg = document.getElementById('ins-pager');
  if (pg) pg.innerHTML = `${INS.page > 1 ? `<button class="btn btn-outline btn-sm" onclick="INS.page--;loadInsights()">← 이전</button>` : ''}<span style="font-size:12px;align-self:center">${INS.page}쪽</span>${rows.length === 30 ? `<button class="btn btn-outline btn-sm" onclick="INS.page++;loadInsights()">다음 →</button>` : ''}`;
}
async function toggleNewsBookmark(id, btn) {
  const r = await api(`news/${id}/bookmark`, 'POST');
  if (r?.__error) return toast('북마크 실패', 'error');
  btn.textContent = r.bookmarked ? '★' : '☆';
  btn.style.color = r.bookmarked ? '#F59E0B' : 'var(--text-muted)';
  toast(r.bookmarked ? '메모장에 링크 메모를 만들었습니다' : '북마크 해제');
  loadInsightMemos();
}
async function loadInsightMemos() {
  const memos = await api('memos?source=insight');
  const el = document.getElementById('ins-bm');
  if (!el || memos?.__error) return;
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div class="card-title" style="margin:0">★ 북마크 · 메모장</div><button class="btn btn-ghost btn-sm" onclick="openMemoPad()">메모장에서 열기</button></div>
    <div style="margin-top:8px">${memos.length ? memos.slice(0, 12).map(m => `<div style="padding:7px 0;border-top:1px solid var(--border)"><a href="${rEsc(m.url)}" target="_blank" rel="noopener" style="font-size:12.5px;font-weight:600;color:var(--text);text-decoration:none">${rEsc(m.title)}</a><div style="font-size:11px;color:var(--text-muted)">${rTime(m.created_at)}</div></div>`).join('') : '<div style="font-size:12px;color:var(--text-muted)">☆를 누르면 여기 쌓입니다 — 유튜브·블로그 소재함.</div>'}</div>`;
}
async function openMemoPad() {
  const memos = await api('memos');
  if (memos?.__error) return toast('메모장 불러오기 실패', 'error');
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:760px">
    <div class="modal-hdr"><span class="modal-title">📝 메모장 (${memos.length})</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:6px;margin-bottom:12px"><input class="inp" id="memo-new-t" placeholder="새 메모 제목"><input class="inp" id="memo-new-u" placeholder="링크(선택)"><button class="btn btn-primary btn-sm" onclick="addMemo()">추가</button></div>
      <div style="max-height:60vh;overflow:auto">${memos.map(m => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:8px;align-items:center"><span class="badge" style="background:var(--gray-100,#F3F4F6)">${m.source === 'insight' ? '💡 인사이트' : '✍️ 직접'}</span>
          ${m.url ? `<a href="${rEsc(m.url)}" target="_blank" rel="noopener" style="font-weight:600;color:var(--text)">${rEsc(m.title)}</a>` : `<b>${rEsc(m.title)}</b>`}
          <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">${rTime(m.created_at)}</span>
          <button class="btn btn-ghost btn-icon" onclick="delMemo(${m.id})">${svgIcon('trash', 12)}</button></div>
        ${m.body ? `<div style="font-size:12px;white-space:pre-line;color:var(--text-muted);margin-top:4px">${rEsc(m.body)}</div>` : ''}</div>`).join('') || '<div style="color:var(--text-muted);font-size:13px">메모가 없습니다.</div>'}</div>
    </div></div></div>`);
}
async function addMemo() {
  const t = document.getElementById('memo-new-t').value.trim();
  if (!t) return toast('제목을 입력하세요', 'error');
  await api('memos', 'POST', { title: t, url: document.getElementById('memo-new-u').value.trim() || null });
  openMemoPad();
}
async function delMemo(id) { if (!confirm('메모를 삭제할까요?')) return; await api(`memos/${id}`, 'DELETE'); openMemoPad(); loadInsightMemos(); }
async function insCollectNow() {
  toast('수집 중… (소스 6개씩)');
  const r = await api('news/collect', 'POST', {});
  if (r?.__error) return toast('수집 실패: ' + (r.error || ''), 'error');
  const kept = (r.summary || []).reduce((a, s) => a + (s.kept || 0), 0);
  toast(`소스 ${r.sources}개 처리 · 신규 ${kept}건 저장`);
  loadInsights(); loadNewsSources();
}

async function loadNewsSources() {
  const el = document.getElementById('ins-sources');
  if (!el) return;
  const rows = await api('news/sources');
  if (rows?.__error) return;
  const on = rows.filter(r => r.enabled).length;
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <div class="card-title" style="margin:0">⚙️ 소스 관리 <span style="font-size:12px;color:var(--text-muted);font-weight:400">켜짐 ${on} / 전체 ${rows.length}</span></div>
      <div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="verifyAllNewsSources()">시드 전체 검증</button><button class="btn btn-primary btn-sm" onclick="openAddNewsSource()">+ 소스</button></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>이름</th><th>유형</th><th>토픽 힌트</th><th>마지막 수집</th><th>실패</th><th>켜기</th><th></th></tr></thead><tbody>
    ${rows.map(s => `<tr style="${s.enabled ? '' : 'opacity:.55'}">
      <td><div style="font-weight:600">${rEsc(s.name)}</div><div style="font-size:11px;color:var(--text-muted);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${rEsc(s.url)}">${rEsc(s.url)}</div>${s.last_error ? `<div style="font-size:11px;color:var(--danger)">${rEsc(s.last_error)}</div>` : ''}</td>
      <td>${rEsc(s.type)}</td><td>${s.topic_hint === 'bid_discovery' ? '📢 공고 발견' : topicOf(s.topic_hint).icon + ' ' + rEsc(topicOf(s.topic_hint).label)}</td>
      <td style="font-size:12px">${rTime(s.last_fetch_at)}</td><td>${s.fail_count || 0}</td>
      <td><input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="api('news/sources/${s.id}','PATCH',{enabled:this.checked?1:0}).then(loadNewsSources)"></td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="testNewsSource(${s.id})">테스트</button><button class="btn btn-ghost btn-sm" onclick="editNewsSourceUrl(${s.id},'${rEsc(s.url).replace(/'/g, '&#39;')}')">URL</button></td></tr>`).join('')}
    </tbody></table></div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">5회 연속 실패 시 자동으로 꺼집니다. Google Alerts RSS는 토픽 힌트를 「공고 발견」으로 추가하면 공고 레이더 발견 엔진으로 들어갑니다.</div>`;
}
async function testNewsSource(id) {
  toast('테스트 중…');
  const r = await api(`news/sources/${id}/test`, 'POST');
  if (!r.ok) { toast('실패: ' + (r.error || ''), 'error'); return loadNewsSources(); }
  openModal(`<div class="modal-bg"><div class="modal"><div class="modal-hdr"><span class="modal-title">테스트 결과 · ${r.count}건</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">${(r.sample || []).map(i => `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><a href="${rEsc(i.url)}" target="_blank" style="font-weight:600">${rEsc(i.title)}</a><div style="font-size:11px;color:var(--text-muted)">${rEsc(i.published_at || '')}</div><div style="font-size:12px">${rEsc((i.excerpt || '').slice(0, 200))}</div></div>`).join('') || '<div style="font-size:13px">항목 없음 (page_diff는 기준점만 저장)</div>'}</div></div></div>`);
}
async function editNewsSourceUrl(id, url) {
  const v = prompt('새 URL', url.replace(/&#39;/g, "'"));
  if (!v || v === url) return;
  await api(`news/sources/${id}`, 'PATCH', { url: v, enabled: 1 });
  loadNewsSources();
}
async function verifyAllNewsSources() {
  if (!confirm('모든 소스를 즉시 fetch해 검증합니다. 실패 소스는 꺼집니다. 진행할까요?')) return;
  toast('검증 중… (30초~1분)');
  const r = await api('news/sources/verify-all', 'POST');
  if (r?.__error) return toast('검증 실패', 'error');
  toast(`통과 ${r.ok} · 실패 ${r.failed}`);
  loadNewsSources();
}
function openAddNewsSource() {
  openModal(`<div class="modal-bg"><div class="modal"><div class="modal-hdr"><span class="modal-title">+ 인사이트 소스</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" style="display:grid;gap:10px">
      <div><label class="lbl">이름</label><input class="inp" id="ns-name"></div>
      <div><label class="lbl">유형</label><select class="sel" id="ns-type">${['rss', 'reddit', 'hn', 'github_atom', 'github_search', 'page_diff', 'youtube'].map(t => `<option>${t}</option>`).join('')}</select></div>
      <div><label class="lbl">토픽 힌트</label><select class="sel" id="ns-topic">${NEWS_TOPICS.map(t => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}<option value="bid_discovery">📢 공고 발견(Google Alerts RSS)</option></select></div>
      <div><label class="lbl">URL</label><input class="inp" id="ns-url" placeholder="https://… (YouTube: https://www.youtube.com/feeds/videos.xml?channel_id=…)"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">취소</button><button class="btn btn-primary" onclick="saveNewsSource()">저장</button></div></div></div>`);
}
async function saveNewsSource() {
  const v = id => document.getElementById(id).value.trim();
  const r = await api('news/sources', 'POST', { name: v('ns-name'), type: v('ns-type'), topic_hint: v('ns-topic'), url: v('ns-url') });
  if (r?.__error) return toast(r.error || '저장 실패', 'error');
  closeModal(); loadNewsSources();
}

// ---------------------------------------------------------------
// 공고 페이지 /bids
// ---------------------------------------------------------------
const BIDS = { tab: 'vendor_reg', chips: {}, q: '', rows: [] };
const BID_TABS = [['vendor_reg', '🤝 협력사 등록'], ['interior_bid', '🏢 인테리어 입찰'], ['public', '🏛️ 관급'], ['', '🗂️ 전체'], ['calendar', '📅 등록 캘린더']];
const BID_CHIPS = [['d7', '마감 7일'], ['todo', '미검토'], ['finance', '금융권만'], ['ok', '판정 충족만']];
const ORIGIN_ICON = { api: '🏛️ API', crawl: '🕷️ 크롤', chrome: '🌐 Chrome', discovery: '🔎 발견' };
function verdictBadge(v) {
  const st = { '충족': 'background:#111827;color:#fff', '부분': 'background:#E5E7EB;color:#374151', '미달': 'background:transparent;color:#6B7280;border:1px solid #9CA3AF', '판정불가': 'background:transparent;color:#6B7280;border:1px dashed #9CA3AF' }[v || '판정불가'];
  return `<span class="badge" style="${st}">${rEsc(v || '판정불가')}</span>`;
}
function renderBids() {
  document.getElementById('tb-actions').innerHTML = `
    <button class="btn btn-outline btn-sm" onclick="openBidImport()">📥 Chrome 가져오기</button>
    ${isAdmin() ? `<button class="btn btn-outline btn-sm" onclick="copyChromePrompt()">📋 쇼트컷 프롬프트</button>` : ''}`;
  document.getElementById('content').innerHTML = `
  <div style="animation:fadeIn .4s ease">
    <div id="bid-cand"></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px" id="bid-tabs"></div>
    <div id="bid-body"></div>
    ${isAdmin() ? `<div id="bid-admin" style="margin-top:16px"></div>` : ''}
  </div>`;
  drawBidTabs();
  loadBidCandidates();
  loadBids();
  if (isAdmin()) renderBidAdmin();
  if (S.subPage === 'import') setTimeout(openBidImport, 100);
}
function drawBidTabs() {
  const el = document.getElementById('bid-tabs');
  if (el) el.innerHTML = BID_TABS.map(([id, l]) => `<button class="btn btn-sm ${BIDS.tab === id ? 'btn-primary' : 'btn-outline'}" onclick="BIDS.tab='${id}';drawBidTabs();loadBids()">${l}</button>`).join('');
}
async function loadBids() {
  const body = document.getElementById('bid-body');
  if (!body) return;
  if (BIDS.tab === 'calendar') return renderBidCalendar(body);
  const qs = new URLSearchParams();
  if (BIDS.tab) qs.set('kind', BIDS.tab);
  if (BIDS.chips.d7) qs.set('deadline_within', '7');
  if (BIDS.chips.todo) qs.set('status', '검토');
  if (BIDS.chips.finance) qs.set('finance', '1');
  if (BIDS.chips.ok) qs.set('verdict', '충족');
  if (BIDS.q) qs.set('q', BIDS.q);
  const rows = await api('bids?' + qs);
  BIDS.rows = rows?.__error ? [] : rows;
  body.innerHTML = `
    <div class="filter-bar" style="flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${BID_CHIPS.map(([k, l]) => `<button class="btn btn-sm ${BIDS.chips[k] ? 'btn-primary' : 'btn-outline'}" style="border-radius:20px" onclick="BIDS.chips.${k}=!BIDS.chips.${k};loadBids()">${l}</button>`).join('')}
      <input class="inp" style="flex:1;min-width:160px" placeholder="발주처·제목 검색" value="${rEsc(BIDS.q)}" onkeydown="if(event.key==='Enter'){BIDS.q=this.value;loadBids()}">
      <span style="font-size:12px;color:var(--text-muted);align-self:center">${BIDS.rows.length}건 · 판정은 참고 배지(목록에서 숨기지 않음)</span>
    </div>
    <div class="card" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>발주처</th><th>제목</th><th>마감</th><th style="text-align:right">예산</th><th>판정</th><th>출처</th><th>상태</th></tr></thead><tbody>
    ${BIDS.rows.map(b => `<tr>
      <td style="white-space:nowrap"><div style="font-weight:600">${rEsc(b.group_name && b.branch_level === 'branch' ? b.group_name : b.org)}</div><div style="font-size:11px;color:var(--text-muted)">${b.group_name ? (b.branch_level === 'branch' ? '지점·조합 · ' + rEsc(b.org) : '본점·중앙회') : rEsc(b.tier || '')}</div></td>
      <td><a href="javascript:void(0)" onclick="openBidDetail(${b.id})" style="font-weight:600;color:var(--text)">${rEsc(b.title)}</a>${b.summary_ko ? `<div style="font-size:11.5px;color:var(--text-muted)">${rEsc(b.summary_ko).slice(0, 90)}</div>` : ''}</td>
      <td style="white-space:nowrap">${ddayHtml(b.deadline)}<div style="font-size:11px;color:var(--text-muted)">${rEsc(b.deadline || '')}</div></td>
      <td style="text-align:right;white-space:nowrap">${wonShort(b.budget_krw)}</td>
      <td title="${rEsc(b.fit_reason)}">${verdictBadge(b.fit_verdict)}</td>
      <td style="white-space:nowrap;font-size:12px">${ORIGIN_ICON[b.origin] || b.origin}</td>
      <td><select class="sel" style="width:auto;padding:2px 6px;font-size:12px" onchange="setBidStatus(${b.id},this.value)">${['검토', '참여', '불참', '제출', '결과'].map(s => `<option${s === b.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">공고가 없습니다.</td></tr>`}
    </tbody></table></div></div>`;
}
async function setBidStatus(id, status) {
  if (status === '참여' && !confirm('참여로 바꾸면 상담 관리(파이프라인)에 리드가 생성됩니다. 진행할까요?')) return loadBids();
  const r = await api(`bids/${id}`, 'PATCH', { status });
  if (r?.__error) return toast('변경 실패', 'error');
  if (r.pipeline_id && status === '참여') {
    toast('파이프라인 리드 생성됨 → 상담 관리');
    const cs = await api('consultations?limit=500'); if (!cs?.__error) _d.consultations = cs;
  } else toast(`상태: ${status}`);
}
async function openBidDetail(id) {
  const b = await api(`bids/${id}`);
  if (b?.__error) return toast('불러오기 실패', 'error');
  let req = {}; try { req = JSON.parse(b.requirements_json || '{}'); } catch (_) {}
  const checks = req._checks || [];
  const val = v => typeof v === 'number' ? wonShort(v) + '원' : rEsc(v ?? '-');
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:760px">
    <div class="modal-hdr"><span class="modal-title">${rEsc(b.org)} · ${ddayHtml(b.deadline)}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">${rEsc(b.title)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);margin-bottom:12px">
        ${verdictBadge(b.fit_verdict)}<span>${ORIGIN_ICON[b.origin] || ''}</span><span>게시 ${rEsc(b.posted_at || '-')}</span><span>마감 ${rEsc(b.deadline || '미상')}</span><span>예산 ${wonShort(b.budget_krw)}</span><span>${rEsc(b.region || '')}</span>
      </div>
      <div style="font-size:12.5px;background:var(--gray-50,#F9FAFB);padding:10px 12px;border-radius:8px;margin-bottom:12px;white-space:pre-line">${rEsc(b.summary_ko || '요약 없음')}\n<b>판정 근거:</b> ${rEsc(b.fit_reason || '-')}</div>
      <div class="card-title" style="font-size:13px">요구사항 vs 회사값</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>항목</th><th>요구값</th><th>회사값</th><th>결과</th></tr></thead><tbody>
        ${checks.map(c => `<tr style="${c.ok === false ? 'color:var(--danger,#DC2626);font-weight:600' : ''}"><td>${rEsc(c.item)}</td><td>${val(c.required)}</td><td>${val(c.company)}</td><td>${c.ok === true ? '충족' : c.ok === false ? '불일치' : '확인 필요'}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--text-muted)">추출된 요구사항 없음 — 공고문·현장설명회 확인</td></tr>'}
      </tbody></table></div>
      <div style="margin-top:12px"><label class="lbl">메모</label><textarea class="inp" id="bid-memo" rows="3">${rEsc(b.memo || '')}</textarea></div>
    </div>
    <div class="modal-footer">
      <a class="btn btn-outline" href="${rEsc(b.url)}" target="_blank" rel="noopener">원문 열기</a>
      <button class="btn btn-outline" onclick="api('bids/${b.id}','PATCH',{memo:document.getElementById('bid-memo').value}).then(()=>toast('메모 저장'))">메모 저장</button>
      ${b.pipeline_id ? `<button class="btn btn-outline" onclick="closeModal();nav('consult')">파이프라인 보기</button>` : `<button class="btn btn-primary" onclick="setBidStatus(${b.id},'참여').then(()=>{closeModal();loadBids()})">참여 → 파이프라인</button>`}
    </div></div></div>`);
}
async function renderBidCalendar(body) {
  const rows = await api('bids/calendar');
  const now = new Date(Date.now() + 9 * 3600e3).getUTCMonth() + 1;
  const by = {}; (rows?.__error ? [] : rows).forEach(r => { (by[r.expected_month] = by[r.expected_month] || []).push(r); });
  body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
    ${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<div class="card" style="padding:12px;${m === now ? 'border:2px solid var(--danger,#DC2626)' : ''}">
      <div style="font-weight:800;margin-bottom:6px;${m === now ? 'color:var(--danger,#DC2626)' : ''}">${m}월</div>
      ${(by[m] || []).map(r => `<div style="font-size:12px;padding:3px 0"><a href="${rEsc(r.url)}" target="_blank" style="color:var(--text)">${rEsc(r.org)}</a> <span style="color:var(--text-muted)">${rEsc(r.tier || '')}</span></div>`).join('') || '<div style="font-size:11px;color:var(--text-muted)">-</div>'}
    </div>`).join('')}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">협력업체 등록 공고가 수집되면 해당 소스의 게시 월이 자동 기록되고, 매월 1일 "작년 이맘때" 사전 알림이 나갑니다.</div>`;
}
async function loadBidCandidates() {
  const el = document.getElementById('bid-cand');
  if (!el) return;
  const rows = await api('bids/sources?status=candidate');
  if (rows?.__error || !rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card" style="margin-bottom:12px;border-left:4px solid var(--primary,#6D28D9)">
    <div class="card-title">🆕 새로 발견된 발주처 ${rows.length}곳</div>
    ${rows.slice(0, 20).map(s => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--border);flex-wrap:wrap">
      <b>${rEsc(s.org)}</b><span class="badge" style="background:var(--gray-100,#F3F4F6)">${rEsc(s.tier || 'T7')}</span>
      <a href="${rEsc(s.discovered_from || s.url)}" target="_blank" style="font-size:12px;color:var(--text-muted);flex:1;min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">근거: ${rEsc(s.discovered_from || s.url)}</a>
      ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="setSourceStatus(${s.id},'approved')">승인</button><button class="btn btn-outline btn-sm" onclick="setSourceStatus(${s.id},'rejected')">제외</button>` : ''}
    </div>`).join('')}</div>`;
}
async function setSourceStatus(id, status) {
  await api(`bids/sources/${id}`, 'PATCH', { status });
  toast(status === 'approved' ? '승인 — 정기 크롤에 편입' : '제외');
  loadBidCandidates(); if (isAdmin()) loadBidSources();
}
function openBidImport() {
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:720px">
    <div class="modal-hdr"><span class="modal-title">📥 Chrome 쇼트컷 결과 가져오기</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">JSON 배열 <code>[{org, title, url, posted_at, deadline, body_text}]</code>을 붙여넣으세요. 중복(URL)은 자동 제외됩니다.</div>
      <textarea class="inp" id="bid-import-json" rows="12" style="font-family:monospace;font-size:12px" placeholder='[{"org":"○○은행","title":"2026년 인테리어 협력업체 모집","url":"https://…","posted_at":"2026-09-20","deadline":"2026-10-05","body_text":"…"}]'></textarea>
      <div id="bid-import-res" style="margin-top:8px;font-size:13px"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">닫기</button><button class="btn btn-primary" onclick="doBidImport()">가져오기</button></div></div></div>`);
}
async function doBidImport() {
  let rows;
  const raw = document.getElementById('bid-import-json').value.trim();
  try { rows = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)); } catch (e) { return toast('JSON 형식 오류', 'error'); }
  document.getElementById('bid-import-res').textContent = '처리 중… (분류·판정 포함)';
  const r = await api('bids/import', 'POST', rows);
  if (r?.__error) { document.getElementById('bid-import-res').textContent = '실패: ' + (r.error || ''); return; }
  document.getElementById('bid-import-res').innerHTML = `✅ 수신 ${r.received}건 · 신규 ${r.inserted}건 · 중복 ${r.duplicates}건`;
  loadBids();
}
async function copyChromePrompt() {
  const src = await api('bids/sources');
  const portals = (src?.__error ? [] : src).filter(s => s.needs_login || s.method === 'chrome').map(s => `- ${s.org}: ${s.url}`).join('\n') || '- (소스 관리에서 로그인 필요 포털을 등록하세요)';
  const txt = `아래 포털 목록을 순서대로 열어 각 사이트의 협력업체 모집·입찰 공고 게시판에서 최근 14일 내 게시글을 모아라.
로그인은 1Password를 사용한다. 제목에 인테리어·실내건축·리모델링·사무환경·협력업체·협력사·파트너·등록·모집 중 하나라도 있으면 수집.
각 건은 {org, title, url, posted_at, deadline, body_text(첫 800자)} JSON으로 만들고, 전부 모아 배열로 만든 뒤
${location.origin}/bids/import 페이지의 텍스트 상자에 붙여넣고 "가져오기"를 눌러라.
결과 건수와 실패한 사이트를 마지막에 보고하라. 포털 목록:
${portals}`;
  try { await navigator.clipboard.writeText(txt); toast('쇼트컷 프롬프트를 복사했습니다'); }
  catch (_) { openModal(`<div class="modal-bg"><div class="modal"><div class="modal-hdr"><span class="modal-title">쇼트컷 프롬프트</span><button class="modal-close" onclick="closeModal()">✕</button></div><div class="modal-body"><textarea class="inp" rows="14">${rEsc(txt)}</textarea></div></div></div>`); }
}

// --- 대표 전용: 소스 · 검색어 · 회사 자격 프로필 ---
const BSRC = { tier: '', status: '' };
function renderBidAdmin() {
  const el = document.getElementById('bid-admin');
  if (!el) return;
  el.innerHTML = `<div class="card" id="bid-sources"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-top:16px"><div class="card" id="bid-queries"></div><div class="card" id="bid-profile"></div></div>`;
  loadBidSources(); loadBidQueries(); loadBidProfile();
}
async function loadBidSources() {
  const el = document.getElementById('bid-sources');
  if (!el) return;
  const qs = new URLSearchParams(); if (BSRC.tier) qs.set('tier', BSRC.tier); if (BSRC.status) qs.set('status', BSRC.status);
  const rows = await api('bids/sources?' + qs);
  if (rows?.__error) return;
  el.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <div class="card-title" style="margin:0;margin-right:auto">🗂️ 발주처 소스 (${rows.length})</div>
      <select class="sel" style="width:auto" onchange="BSRC.tier=this.value;loadBidSources()"><option value="">전 계층</option>${['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(t => `<option${BSRC.tier === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select class="sel" style="width:auto" onchange="BSRC.status=this.value;loadBidSources()"><option value="">전 상태</option>${['candidate', 'approved', 'rejected'].map(t => `<option${BSRC.status === t ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn btn-outline btn-sm" onclick="runBidJob('g2b')">나라장터 수집</button>
      <button class="btn btn-outline btn-sm" onclick="runBidJob('crawl')">크롤 실행</button>
      <button class="btn btn-outline btn-sm" onclick="runBidJob('discovery')">발견 엔진</button>
      <button class="btn btn-outline btn-sm" onclick="openBulkSources()">일괄 등록</button>
      <button class="btn btn-primary btn-sm" onclick="openAddBidSource()">+ 소스</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>기관</th><th>계층</th><th>묶음</th><th>방식</th><th>상태</th><th>반복 월</th><th>마지막 수집</th><th></th></tr></thead><tbody>
    ${rows.map(s => `<tr style="${s.enabled ? '' : 'opacity:.5'}">
      <td><div style="font-weight:600">${rEsc(s.org)}${s.needs_login ? ' 🔒' : ''}</div><div style="font-size:11px;color:var(--text-muted);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${rEsc(s.url)}">${rEsc(s.url)}</div>${s.last_error ? `<div style="font-size:11px;color:var(--danger)">${rEsc(s.last_error)}</div>` : ''}</td>
      <td>${rEsc(s.tier || '')}</td><td style="font-size:12px">${rEsc(s.group_name || '')}${s.group_name ? (s.branch_level === 'branch' ? ' · 지점' : ' · 본점') : ''}</td>
      <td>${ORIGIN_ICON[s.method] || rEsc(s.method)}</td><td>${rEsc(s.status)}</td><td>${s.expected_month || '-'}</td><td style="font-size:12px">${rTime(s.last_fetch_at)}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="testBidSource(${s.id})">테스트</button>
        <button class="btn btn-ghost btn-sm" onclick="api('bids/sources/${s.id}','PATCH',{enabled:${s.enabled ? 0 : 1}}).then(loadBidSources)">${s.enabled ? '끄기' : '켜기'}</button></td></tr>`).join('') || '<tr><td colspan="8" style="color:var(--text-muted);text-align:center;padding:20px">등록된 소스 없음 — [+ 소스] 또는 [일괄 등록]</td></tr>'}
    </tbody></table></div>`;
}
async function runBidJob(job) {
  toast('실행 중…');
  const r = await api(`bids/run/${job}`, 'POST');
  if (r?.__error || r.error) return toast('실패: ' + (r.error || ''), 'error');
  toast(`완료: ${JSON.stringify({ ...r, summary: undefined }).slice(0, 120)}`);
  loadBids(); loadBidCandidates(); loadBidSources();
}
async function testBidSource(id) {
  toast('테스트 중…');
  const r = await api(`bids/sources/${id}/test`, 'POST');
  if (r.ok === false || r.error) { toast('실패: ' + (r.error || ''), 'error'); return loadBidSources(); }
  openModal(`<div class="modal-bg"><div class="modal"><div class="modal-hdr"><span class="modal-title">테스트 결과</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">${Array.isArray(r.links) ? (r.links.map(l => `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><a href="${rEsc(l.url)}" target="_blank">${rEsc(l.title)}</a> <span style="font-size:11px;color:var(--text-muted)">${rEsc(l.posted_at || '')}</span></div>`).join('') || '키워드에 맞는 링크 0건 — selector_json의 link_pattern을 조정하세요.') : `<pre style="font-size:12px">${rEsc(JSON.stringify(r, null, 2))}</pre>`}</div></div></div>`);
}
function openAddBidSource() {
  openModal(`<div class="modal-bg"><div class="modal"><div class="modal-hdr"><span class="modal-title">+ 발주처 소스</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label class="lbl">기관명</label><input class="inp" id="bs-org" placeholder="예: ○○새마을금고 강남지점"></div>
      <div><label class="lbl">계층</label><select class="sel" id="bs-tier">${['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(t => `<option>${t}</option>`).join('')}</select></div>
      <div><label class="lbl">묶음명(기관 그룹)</label><input class="inp" id="bs-group" placeholder="예: 새마을금고"></div>
      <div><label class="lbl">본점/지점</label><select class="sel" id="bs-branch"><option value="hq">본점·중앙회</option><option value="branch">지점·단위조합</option></select></div>
      <div style="grid-column:1/-1"><label class="lbl">공고 목록 페이지 URL</label><input class="inp" id="bs-url"></div>
      <div><label class="lbl">방식</label><select class="sel" id="bs-method"><option value="crawl">crawl (공개 게시판)</option><option value="chrome">chrome (로그인 포털)</option></select></div>
      <div><label class="lbl">주기(시간)</label><input class="inp" id="bs-int" type="number" value="24"></div>
      <div style="grid-column:1/-1"><label class="lbl">selector_json (선택)</label><input class="inp" id="bs-sel" placeholder='{"link_pattern":"view|detail|bbs","keyword_filter":true}'></div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">취소</button><button class="btn btn-primary" onclick="saveBidSource()">저장</button></div></div></div>`);
}
async function saveBidSource() {
  const v = id => document.getElementById(id).value.trim();
  const method = v('bs-method');
  const r = await api('bids/sources', 'POST', { org: v('bs-org'), tier: v('bs-tier'), group_name: v('bs-group') || null, branch_level: v('bs-branch'), url: v('bs-url'), method, needs_login: method === 'chrome' ? 1 : 0, interval_hours: +v('bs-int') || 24, selector_json: v('bs-sel') || null });
  if (r?.__error) return toast(r.error || '저장 실패', 'error');
  closeModal(); loadBidSources();
}
function openBulkSources() {
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:720px"><div class="modal-hdr"><span class="modal-title">일괄 등록 (소스 · 기관명 사전)</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <label class="lbl">대상</label><select class="sel" id="bulk-target" style="margin-bottom:8px"><option value="sources">발주처 소스 — [{org, tier, group_name, branch_level, url, method, needs_login}]</option><option value="dict">기관명 사전 — [{name, tier, group_name, domain, source_list}]</option></select>
      <textarea class="inp" id="bulk-json" rows="12" style="font-family:monospace;font-size:12px" placeholder='[{"org":"○○은행 본점","tier":"T3","group_name":"○○은행","branch_level":"hq","url":"https://…","method":"crawl"}]'></textarea>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">명부 엑셀(알리오·클린아이·공정위·파인·중견기업정보마당)은 JSON으로 변환해 기관명 사전에 넣습니다. 금융권은 본점(hq)+지점(branch)을 같은 group_name으로 묶어 등록하세요.</div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">취소</button><button class="btn btn-primary" onclick="doBulkSources()">등록</button></div></div></div>`);
}
async function doBulkSources() {
  let rows; try { rows = JSON.parse(document.getElementById('bulk-json').value); } catch (_) { return toast('JSON 형식 오류', 'error'); }
  const target = document.getElementById('bulk-target').value;
  const r = await api(target === 'dict' ? 'bids/org-dictionary' : 'bids/sources/bulk', 'POST', rows);
  if (r?.__error) return toast(r.error || '실패', 'error');
  toast(`${r.count}건 등록`); closeModal(); loadBidSources();
}
async function loadBidQueries() {
  const el = document.getElementById('bid-queries');
  if (!el) return;
  const rows = await api('bids/queries');
  if (rows?.__error) return;
  el.innerHTML = `<div class="card-title">🔎 발견 엔진 검색어</div>
    <div style="display:flex;gap:6px;margin-bottom:8px"><input class="inp" id="bq-new" placeholder='예: "은행 지점" 인테리어 입찰'><button class="btn btn-primary btn-sm" onclick="addBidQuery()">추가</button></div>
    <div style="max-height:300px;overflow:auto">${rows.map(q => `<div style="display:flex;gap:6px;align-items:center;padding:4px 0;border-top:1px solid var(--border);font-size:12.5px;${q.enabled ? '' : 'opacity:.5'}">
      <input type="checkbox" ${q.enabled ? 'checked' : ''} onchange="api('bids/queries/${q.id}','PATCH',{enabled:this.checked}).then(loadBidQueries)">
      <span class="badge" style="background:var(--gray-100,#F3F4F6)">${q.channel === 'naver' ? '네이버' : q.channel === 'google_cse' ? '구글' : rEsc(q.channel)}</span>
      <span style="flex:1">${rEsc(q.query)}</span><span style="color:var(--text-muted)">${q.hits_30d || 0}</span>
      <button class="btn btn-ghost btn-icon" onclick="api('bids/queries/${q.id}','DELETE').then(loadBidQueries)">${svgIcon('x', 11)}</button></div>`).join('')}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Google Alerts는 "RSS로 받기" 주소를 인사이트 > 소스 관리에 토픽 「공고 발견」으로 추가합니다.</div>`;
}
async function addBidQuery() {
  const q = document.getElementById('bq-new').value.trim();
  if (!q) return;
  await api('bids/queries', 'POST', { query: q });
  loadBidQueries();
}
const PROFILE_FIELDS = [['license', '보유 면허(쉼표)', '실내건축공사업'], ['sales_3y', '최근 3년 합산 매출(원)', '예: 12000000000'], ['max_single_perf', '최대 단일 실적(원)', '예: 1500000000'], ['credit_grade', '기업신용등급', '예: BB+'], ['years', '업력(년)', ''], ['certs', '인증(쉼표)', '예: ISO9001'], ['region', '주력 지역', '서울,경기,인천']];
async function loadBidProfile() {
  const el = document.getElementById('bid-profile');
  if (!el) return;
  const p = await api('bids/company-profile');
  if (p?.__error) return;
  el.innerHTML = `<div class="card-title">🏷️ 회사 자격 프로필 <span style="font-size:11px;color:var(--text-muted);font-weight:400">판정 배지 기준</span></div>
    <div style="display:grid;gap:8px">${PROFILE_FIELDS.map(([k, l, ph]) => `<div><label class="lbl">${l}</label><input class="inp" id="cp-${k}" value="${rEsc(p[k] || '')}" placeholder="${ph}"></div>`).join('')}</div>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="saveBidProfile()">저장 + 판정 재계산</button></div>`;
}
async function saveBidProfile() {
  const body = {}; PROFILE_FIELDS.forEach(([k]) => body[k] = document.getElementById('cp-' + k).value.trim());
  const r = await api('bids/company-profile', 'PATCH', body);
  if (r?.__error) return toast('저장 실패', 'error');
  const rj = await api('bids/rejudge', 'POST');
  toast(`저장 · 공고 ${rj.count || 0}건 판정 재계산`);
  loadBids();
}
