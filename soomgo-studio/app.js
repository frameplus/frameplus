/* 숨고 상담 스튜디오 — 프로토타입 화면 로직 (목업 데이터, 서버·숨고 연동 없음) */
(function () {
  const D = window.SG_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = {
    route: 'inbox', convId: 'c1', filter: 'all', q: '', open: false,
    catId: 'edu', assetCat: 'edu', sample: 'c1',
    autoOn: true, connected: true, sellerFilter: 'all', vendorOpen: null,
  };

  const ROUTES = [
    { id: 'inbox', label: '상담 목록', icon: 'inbox' },
    { id: 'categories', label: '카테고리 관리', icon: 'layers' },
    { id: 'assets', label: '첨부자료 관리', icon: 'clip' },
    { id: 'connect', label: '연결·알림 설정', icon: 'bell' },
    { id: 'company', label: '업체 설정', icon: 'building' },
    { sep: true },
    { id: 'seller', label: '판매자 운영', icon: 'chart' },
  ];

  const ICONS = {
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    building: '<path d="M4 21V4h10v17"/><path d="M14 9h6v12"/><path d="M8 8h2M8 12h2M8 16h2M3 21h18"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    back: '<path d="m14 6-6 6 6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    dash: '<path d="M6 12h12"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  };
  const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  const statusLabel = (id) => D.STATUSES.find((s) => s.id === id)?.label || id;
  const cat = (id) => D.cats.find((c) => c.id === id);
  const conv = (id) => D.convs.find((c) => c.id === id);
  const tag = (st) => `<span class="tag ${st}">${esc(statusLabel(st))}</span>`;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* 예시 시공 이미지: 사진이 등록되기 전 자리 표시용 도면 스케치 */
  function art(v) {
    const extra = [
      '<path d="M48 104l34-18h36l34 18M70 92h60M84 86v-8h32v8"/><path d="M62 112l22-12M138 112l-22-12"/>',
      '<path d="M36 22v96M48 28v82M60 34v68M36 60l24 8M36 86l24 2"/><path d="M116 92h14v-22h-14z"/>',
      '<path d="M72 38h56M68 34l-20-14M132 34l20-14M84 26h32M78 20h44"/><path d="M90 30v4M110 30v4M100 22v4"/>',
      '<path d="M92 90V56h16v34"/><path d="M105 74h.01"/><path d="M40 118l26-22M160 118l-26-22"/>',
      '<path d="M66 96h68v14H66z"/><path d="M66 96l8-8h52l8 8"/><path d="M86 52h28v14H86z"/>',
      '<ellipse cx="100" cy="100" rx="34" ry="9"/><path d="M100 109v9M74 96v-9M126 96v-9M88 92v-8M112 92v-8"/>',
    ][v % 6];
    return `<svg class="art" viewBox="0 0 200 132" preserveAspectRatio="xMidYMid slice" role="img" aria-label="예시 이미지">
      <rect width="200" height="132" fill="#f4f2ec"/>
      <g fill="none" stroke="#17181c" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" opacity=".78">
        <rect x="60" y="34" width="80" height="56"/><path d="M60 34 16 6M140 34l44-28M60 90l-44 36M140 90l44 36"/>${extra}
      </g></svg>`;
  }
  const photoHtml = (p) => (p.src ? `<img src="${esc(p.src)}" alt="${esc(p.name)}">` : art(p.variant));

  /* 문구 변수 치환 */
  function fill(tpl, c) {
    const co = D.company;
    const map = { 이름: c.name, 지역: c.region, 공사: c.work, 평형: c.size && c.size !== '—' ? c.size : '', 담당자: co.manager, 연락처: co.phone, 상호: co.name };
    return String(tpl).replace(/\{(이름|지역|공사|평형|담당자|연락처|상호)\}/g, (_, k) => map[k]).replace(/ {2,}/g, ' ');
  }

  /* 첫 상담 발송 순서: 인사 → 홈페이지 → 가이드 → 사진 n장 → 미팅 제안 */
  function buildSeq(catId, c) {
    const k = cat(catId), a = D.assets[catId];
    return [
      { kind: 'text', label: '맞춤 인사', text: fill(k.greeting, c) },
      { kind: 'link', label: '업체 홈페이지', text: D.company.site },
      { kind: 'file', label: 'RFP 가이드', text: a.guide.name },
      ...a.photos.map((p, i) => ({ kind: 'photo', label: `시공 사진 ${i + 1}`, photo: p })),
      { kind: 'text', label: '무료 현장 미팅 제안', text: fill(k.meeting, c) },
    ];
  }
  function bubble(it) {
    if (it.kind === 'photo') return `<div class="b photo">${photoHtml(it.photo)}</div>`;
    if (it.kind === 'file') return `<div class="b file">${ic('file')}<span>${esc(it.text)}</span></div>`;
    if (it.kind === 'link') return `<div class="b link">${esc(it.text)}</div>`;
    return `<div class="b">${esc(it.text)}</div>`;
  }

  /* 평형대별 예상 견적 찾기 */
  function estimate(c) {
    const n = parseFloat(c.size);
    if (!n) return '현장 확인 후 제시';
    const rows = cat(c.catId).quote;
    for (const [label, amt] of rows) {
      const nums = (label.match(/\d+/g) || []).map(Number);
      const max = /이상/.test(label) ? Infinity : nums[nums.length - 1];
      if (n <= max) return amt;
    }
    return rows[rows.length - 1][1];
  }

  /* ---------- 골격 ---------- */
  function renderNav() {
    const need = D.convs.filter((c) => c.status === 'call' || c.status === 'meet').length;
    $('#nav').innerHTML = ROUTES.map((r) => r.sep ? '<hr>' :
      `<a href="#${r.id}" ${S.route === r.id ? 'aria-current="page"' : ''}>${ic(r.icon)}<span>${r.label}</span>${r.id === 'inbox' && need ? `<span class="cnt num" title="담당자 확인 필요">${need}</span>` : ''}</a>`).join('');
    $('#brand-co').textContent = D.company.name;
    $('#linkstate').innerHTML = `<span class="dot ${S.connected ? '' : 'off'}"></span><span>${S.connected ? '숨고 연결됨 · 2분 전 수신' : '숨고 재연결 필요'}</span>`;
    $('#auto-master').checked = S.autoOn;
    $('#topbar-title').textContent = ROUTES.find((r) => r.id === S.route)?.label || '';
    $('#menu-btn').innerHTML = ic('menu');
  }

  const VIEWS = {};
  function render() {
    renderNav();
    $('#page').innerHTML = VIEWS[S.route]();
    after[S.route]?.();
  }
  const after = {};

  /* ---------- 1. 상담 목록 + 고객 상세 ---------- */
  function visibleConvs() {
    const q = S.q.trim().toLowerCase();
    return D.convs.filter((c) => (S.filter === 'all' || c.status === S.filter)
      && (!q || [c.name, c.region, c.work, c.request, cat(c.catId).name].join(' ').toLowerCase().includes(q)));
  }
  function lastLine(c) {
    const m = [...c.msgs].reverse().find((x) => x.from !== 'sys');
    if (m) return m.text;
    return c.sending ? `첫 상담 발송 중 (${c.seq}/10)` : c.request;
  }
  function listHtml() {
    const items = visibleConvs();
    if (!items.length) return `<div class="empty">조건에 맞는 상담이 없습니다.<br>필터를 '전체'로 바꾸거나 검색어를 지워보세요.</div>`;
    return items.map((c) => `
      <button class="item" data-act="open" data-id="${c.id}" ${c.id === S.convId ? 'aria-current="true"' : ''}>
        <span class="nm">${c.unread ? '<span class="unread" title="읽지 않음"></span>' : ''}${esc(c.name)}</span>
        <span class="tm num">${esc(c.time)}</span>
        <span class="sub">${esc(c.region)} · ${esc(cat(c.catId).name)}${c.size !== '—' ? ' · ' + esc(c.size) : ''}</span>
        <span class="last">${esc(lastLine(c))}</span>
        <span class="tags">${tag(c.status)}${c.assignee ? `<span class="tag">${esc(c.assignee)}</span>` : ''}${c.seq < 10 ? `<span class="tag warn num">발송 ${c.seq}/10</span>` : ''}</span>
      </button>`).join('');
  }
  function filtersHtml() {
    const all = [{ id: 'all', label: '전체' }, ...D.STATUSES];
    return all.map((s) => {
      const n = s.id === 'all' ? D.convs.length : D.convs.filter((c) => c.status === s.id).length;
      return `<button class="chip" data-act="filter" data-id="${s.id}" aria-pressed="${S.filter === s.id}">${s.label}<span class="num">${n}</span></button>`;
    }).join('');
  }
  function threadHtml(c) {
    if (!c) return `<div class="empty" style="margin:auto">왼쪽 목록에서 상담을 선택하세요.</div>`;
    const k = cat(c.catId), seq = buildSeq(c.catId, c);
    const sent = seq.slice(0, c.seq), pending = seq.slice(c.seq);
    const msg = (m) => m.from === 'sys'
      ? `<div class="sys ${/요청 감지/.test(m.text) ? 'alert' : ''}">${esc(m.text)} · <span class="num">${esc(m.t)}</span></div>`
      : `<div class="m ${m.from}"><div class="b">${esc(m.text)}</div><div class="meta">${m.from === 'auto' ? '자동답변' : m.from === 'human' ? esc(c.assignee || '담당자') : esc(c.name)} · <span class="num">${esc(m.t)}</span></div></div>`;
    const stateLine = {
      new: c.sending ? `첫 상담을 보내는 중입니다. ${c.seq}/10 완료.` : '신규 요청서입니다. 첫 상담 발송을 기다리고 있습니다.',
      auto: '자동답변이 상담을 이어가고 있습니다. 빠진 정보만 질문합니다.',
      call: '고객이 통화를 원합니다. 담당자가 전화한 뒤 이어받아 주세요.',
      meet: '고객이 현장 미팅을 원합니다. 가능 여부를 회신해야 합니다.',
      human: `${c.assignee || '담당자'}가 응대 중입니다. 자동답변은 멈췄습니다.`,
      closed: '종료된 상담입니다.',
    }[c.status];
    const human = c.status === 'human';
    return `
      <header class="thread-h">
        <button class="btn ghost icon back" data-act="back" aria-label="목록으로">${ic('back')}</button>
        <div class="who"><b>${esc(c.name)}</b> ${tag(c.status)}<div>${esc(c.region)} · ${esc(k.name)} · ${esc(c.work)}</div></div>
        <button class="btn sm" data-act="soomgo">${ic('chat')}숨고 채팅방</button>
        <button class="btn sm info-btn" data-act="toggle-detail">${ic('info')}고객 정보</button>
      </header>
      <div class="msgs" id="msgs">
        <div class="req">
          <h3>스마트견적 요청서</h3>
          <p>${esc(c.request)}</p>
          <dl><dt>지역</dt><dd>${esc(c.region)}</dd><dt>평형</dt><dd>${esc(c.size)}</dd><dt>예산</dt><dd>${esc(c.budget)}</dd><dt>일정</dt><dd>${esc(c.schedule)}</dd></dl>
        </div>
        ${sent.map((it, i) => `<div class="m auto">${bubble(it)}<div class="meta"><span class="num">${i + 1}/10</span> ${esc(it.label)}</div></div>`).join('')}
        ${c.msgs.map(msg).join('')}
        ${pending.length ? `<div class="sys">${c.sending ? '발송 대기' : '보류'} ${pending.length}건 · 같은 항목은 다시 보내지 않습니다</div>
          ${pending.map((it, i) => `<div class="m auto pending">${bubble(it)}<div class="meta"><span class="num">${c.seq + i + 1}/10</span> ${esc(it.label)}</div></div>`).join('')}` : ''}
      </div>
      <footer class="composer">
        <div class="state">
          <p>${esc(stateLine)}${c.seqNote ? ' ' + esc(c.seqNote) : ''}</p>
          ${pending.length && !c.sending ? `<button class="btn sm" data-act="resume-seq">보류 ${pending.length}건 이어서 발송</button>` : ''}
          ${human ? `<button class="btn sm" data-act="release">자동답변 다시 켜기</button>`
            : c.status !== 'closed' ? `<button class="btn act sm" data-act="takeover">${ic('phone')}담당자가 이어받기</button>` : ''}
          ${c.status !== 'closed' ? `<button class="btn ghost sm" data-act="close-conv">상담 종료</button>` : `<button class="btn sm" data-act="release">다시 열기</button>`}
        </div>
        ${human ? `<div class="row"><input class="inp" id="reply" placeholder="담당자 답변 입력 (프로토타입: 숨고로 전송되지 않습니다)" aria-label="답변 입력"><button class="btn primary" data-act="send">보내기</button></div>` : ''}
      </footer>`;
  }
  function detailHtml(c) {
    if (!c) return '';
    const k = cat(c.catId);
    const seq = buildSeq(c.catId, c);
    return `
      <section>
        <div style="display:flex;justify-content:space-between;align-items:center"><h2>고객 정보</h2><button class="btn ghost icon sm info-btn" data-act="toggle-detail" aria-label="닫기">${ic('x')}</button></div>
        <dl class="kv">
          <dt>이름</dt><dd>${esc(c.name)}</dd>
          <dt>지역</dt><dd>${esc(c.region)}</dd>
          <dt>평형대</dt><dd>${esc(c.size)}</dd>
          <dt>예산</dt><dd>${c.budgetNow ? `<del>${esc(c.budget)}</del>${esc(c.budgetNow)}` : esc(c.budget)}</dd>
          <dt>요청사항</dt><dd>${esc(c.work)}</dd>
          ${c.wish ? `<dt>희망</dt><dd>${esc(c.wish)}</dd>` : ''}
        </dl>
        <div class="orig"><span class="hint">요청 원문</span><br>${esc(c.request)}</div>
      </section>
      <section>
        <h3>업종과 공사 내용 판단</h3>
        <div class="pair"><div><small>카테고리</small><b>${esc(k.name)}</b></div><div><small>숨고 분류</small><b>${esc(k.soomgo)}</b></div></div>
      </section>
      <section>
        <h3>예산과 예상 견적</h3>
        <div class="pair"><div><small>고객이 적은 예산</small><b>${esc(c.budgetNow || c.budget)}</b></div><div><small>업체 기준 예상 견적</small><b>${esc(estimate(c))}</b></div></div>
        <p class="hint">두 값은 따로 관리합니다. 예상 견적은 카테고리의 평형대 기준에서 가져옵니다.</p>
      </section>
      <section>
        <h3>확인된 정보와 빠진 정보</h3>
        <ul class="checks">
          ${c.known.map((x) => `<li><span class="y">${ic('check')}</span>${esc(x)} <span class="muted">· 다시 묻지 않음</span></li>`).join('')}
          ${c.missing.map((x) => `<li><span class="n">${ic('dash')}</span>${esc(x)} <span class="muted">· 질문 예정</span></li>`).join('')}
        </ul>
      </section>
      <section>
        <h3>첫 상담 발송 <span class="num muted">${c.seq}/10</span></h3>
        <ol class="seq" aria-label="발송 진행">${seq.map((it, i) => `<li class="${i < c.seq ? 'done' : c.sending ? '' : 'hold'}" title="${esc(it.label)}">${i + 1}</li>`).join('')}</ol>
        <p class="hint">${c.seq === 10 ? '10건 모두 발송했습니다.' : `마지막 성공: ${c.seq}번 ${esc(seq[c.seq - 1]?.label || '')}`}${c.sendFail ? ' · ' + esc(c.sendFail) : ''}</p>
      </section>
      <section>
        <h3>상태와 담당자</h3>
        <div class="grid2" style="gap:8px">
          <select class="sel" data-change="status" aria-label="상담 상태">${D.STATUSES.map((s) => `<option value="${s.id}" ${s.id === c.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          <select class="sel" data-change="assignee" aria-label="담당자"><option value="">미배정</option>${D.team.map((t) => `<option ${t.name === c.assignee ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        </div>
      </section>
      <section>
        <h3>담당자 알림 기록</h3>
        ${c.alerts.length ? `<ul class="alog">${c.alerts.map((a) => `<li><span class="num muted">${esc(a.t)}</span><span>${esc(a.type)} → ${esc(a.to)} (${esc(a.channel)})</span><span class="tag ok">${esc(a.status)}</span></li>`).join('')}</ul>` : `<p class="hint">통화·방문 요청이 없어 알림을 보내지 않았습니다.</p>`}
      </section>`;
  }
  VIEWS.inbox = () => {
    const c = conv(S.convId);
    return `<div class="inbox ${S.open ? 'open' : ''}" id="inbox">
      <section class="list" aria-label="상담 목록">
        <div class="list-h">
          <h1>상담 목록</h1>
          <label class="search">${ic('search')}<span class="sr">검색</span><input class="inp" id="q" placeholder="이름, 지역, 요청 내용" value="${esc(S.q)}"></label>
        </div>
        <div class="filters" id="filters">${filtersHtml()}</div>
        <div class="items" id="items">${listHtml()}</div>
      </section>
      <section class="thread" id="thread" aria-label="대화">${threadHtml(c)}</section>
      <aside class="detail" id="detail" aria-label="고객 상세">${detailHtml(c)}</aside>
    </div>`;
  };
  function refreshInbox(scroll) {
    const c = conv(S.convId);
    $('#items').innerHTML = listHtml();
    $('#filters').innerHTML = filtersHtml();
    $('#thread').innerHTML = threadHtml(c);
    $('#detail').innerHTML = detailHtml(c);
    renderNav();
    if (scroll) { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; }
  }
  after.inbox = () => { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; };
  const nowT = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- 2. 카테고리 관리 ---------- */
  const VARS = ['이름', '지역', '공사', '평형', '상호', '담당자', '연락처'];
  function catsNav() {
    return `<nav class="cats" aria-label="카테고리">
      <h2>카테고리</h2>
      ${D.cats.map((k) => `<button class="cat" data-act="pick-cat" data-id="${k.id}" ${k.id === S.catId ? 'aria-current="true"' : ''}><span>${esc(k.name)}</span><small>${esc(k.soomgo)}</small></button>`).join('')}
      <button class="cat" data-act="add-cat" style="color:var(--ink-3)"><span style="display:flex;gap:6px;align-items:center">${ic('plus')}카테고리 추가</span></button>
    </nav>`;
  }
  function previewHtml(catId) {
    const c = conv(S.sample);
    const seq = buildSeq(catId, c);
    const k = cat(catId);
    const firstQ = k.questions[0];
    return `<aside class="preview" aria-label="채팅 미리보기">
      <div class="preview-h">
        <div style="display:flex;justify-content:space-between;align-items:center"><h2>채팅 미리보기</h2><button class="btn ghost icon sm preview-close" data-act="toggle-preview" aria-label="닫기">${ic('x')}</button></div>
        <label class="field"><span>예시 고객</span><select class="sel" data-change="sample">${D.convs.map((x) => `<option value="${x.id}" ${x.id === S.sample ? 'selected' : ''}>${esc(x.name)} · ${esc(x.region)} · ${esc(x.work)}</option>`).join('')}</select></label>
      </div>
      <div class="phone" id="phone">
        ${seq.map((it, i) => `<div class="m auto">${bubble(it)}<div class="meta step">${i + 1} · ${esc(it.label)}</div></div>`).join('')}
        ${firstQ ? `<div class="sys">고객 답변 후 첫 질문</div><div class="m auto"><div class="b">${esc(firstQ)}</div></div>` : ''}
      </div>
    </aside>`;
  }
  VIEWS.categories = () => {
    const k = cat(S.catId);
    return `<div class="split" id="split">
      ${catsNav()}
      <div class="editor">
        <div class="stack-lg">
          <div class="page-head" style="margin-bottom:0">
            <div><h1>${esc(k.name)}</h1><p>숨고 분류만으로는 문구를 정할 수 없어, 업종과 실제 공사 내용을 함께 보고 이 카테고리를 고릅니다.</p></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn preview-toggle" data-act="toggle-preview">${ic('eye')}미리보기</button>
              <button class="btn" data-act="copy-cat">${ic('copy')}복사</button>
              <button class="btn primary" data-act="save">저장</button>
            </div>
          </div>
          <div class="grid2">
            <label class="field"><span>카테고리 이름</span><input class="inp" data-bind="name" value="${esc(k.name)}"></label>
            <label class="field"><span>연결할 숨고 분류</span><input class="inp" data-bind="soomgo" value="${esc(k.soomgo)}"></label>
          </div>
          <div class="field">
            <span>1번 · 맞춤 인사와 회사 소개</span>
            <textarea class="ta" id="greeting" data-bind="greeting" rows="4">${esc(k.greeting)}</textarea>
            <div class="vars" aria-label="넣을 수 있는 변수">${VARS.map((v) => `<button class="var" data-act="var" data-v="${v}" data-for="greeting">{${v}}</button>`).join('')}</div>
            <span class="hint">회사 소개는 인사에 짧게 넣습니다. 회사소개서 파일은 보내지 않습니다.</span>
          </div>
          <div class="field">
            <span>확인 질문</span>
            <div class="stack" style="gap:6px" id="qs">
              ${k.questions.map((q, i) => `<div class="qrow"><span class="n num">${i + 1}</span><input class="inp" data-q="${i}" value="${esc(q)}" aria-label="질문 ${i + 1}">
                <span class="tools"><button class="btn ghost icon sm" data-act="q-up" data-i="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="btn ghost icon sm" data-act="q-down" data-i="${i}" aria-label="아래로" ${i === k.questions.length - 1 ? 'disabled' : ''}>${ic('down')}</button><button class="btn ghost icon sm" data-act="q-del" data-i="${i}" aria-label="삭제">${ic('x')}</button></span></div>`).join('')}
            </div>
            <div><button class="btn sm" data-act="q-add">${ic('plus')}질문 추가</button></div>
            <span class="hint">위에서부터 한 번에 하나씩 묻습니다. 요청서나 대화에서 이미 알려준 내용은 건너뜁니다.</span>
          </div>
          <div class="field">
            <span>10번 · 무료 현장 미팅 제안</span>
            <textarea class="ta" id="meeting" data-bind="meeting" rows="4">${esc(k.meeting)}</textarea>
            <div class="vars">${VARS.map((v) => `<button class="var" data-act="var" data-v="${v}" data-for="meeting">{${v}}</button>`).join('')}</div>
            <span class="hint">현장에서 확인할 항목: ${k.checks.map(esc).join(', ')}</span>
          </div>
          <div class="sheet">
            <div class="sheet-h"><h2>견적 기준</h2><span class="tag">예시값 · 업체가 직접 입력</span></div>
            <div class="sheet-b stack">
              <div class="stack" style="gap:6px">
                <div class="quote hint"><span>평형대</span><span>기준 금액 (VAT 별도)</span><span></span></div>
                ${k.quote.map((r, i) => `<div class="quote"><input class="inp" data-quote="${i}:0" value="${esc(r[0])}" aria-label="평형대"><input class="inp num" data-quote="${i}:1" value="${esc(r[1])}" aria-label="기준 금액"><button class="btn ghost icon sm" data-act="quote-del" data-i="${i}" aria-label="삭제">${ic('x')}</button></div>`).join('')}
                <div><button class="btn sm" data-act="quote-add">${ic('plus')}구간 추가</button></div>
              </div>
              <div class="grid2">
                <label class="field"><span>포함 공사</span><textarea class="ta" data-bind="included" rows="2">${esc(k.included)}</textarea></label>
                <label class="field"><span>별도 공사</span><textarea class="ta" data-bind="excluded" rows="2">${esc(k.excluded)}</textarea></label>
              </div>
              <label class="field"><span>현장 확인이 필요한 조건</span><input class="inp" data-bind="onsite" value="${esc(k.onsite)}"><span class="hint">이 조건에 해당하면 금액 대신 현장 확인을 안내합니다.</span></label>
            </div>
          </div>
        </div>
      </div>
      ${previewHtml(S.catId)}
    </div>`;
  };
  function refreshPreview() {
    const old = $('.preview'); if (!old) return;
    const id = S.route === 'assets' ? S.assetCat : S.catId;
    const shown = old.parentElement.classList.contains('show-preview');
    old.outerHTML = previewHtml(id);
    if (shown) $('.preview').parentElement.classList.add('show-preview');
  }

  /* ---------- 3. 첨부자료 관리 ---------- */
  VIEWS.assets = () => {
    const a = D.assets[S.assetCat], k = cat(S.assetCat);
    const n = a.photos.length;
    let no = 3;
    return `<div class="two" id="two">
      <div class="editor">
        <div class="stack-lg" style="max-width:760px">
          <div class="page-head" style="margin-bottom:0">
            <div><h1>첨부자료 관리</h1><p>아래 순서 그대로 채팅방에 한 건씩 보냅니다. 사진은 설명 문구 없이 한 장씩 개별 발송합니다.</p></div>
            <div style="display:flex;gap:6px"><button class="btn preview-toggle" data-act="toggle-preview">${ic('eye')}미리보기</button><button class="btn primary" data-act="save">저장</button></div>
          </div>
          <div class="tabs" role="tablist">${D.cats.map((c) => `<button role="tab" aria-selected="${c.id === S.assetCat}" data-act="pick-asset-cat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>
          <ol class="seq-list" id="seq-list">
            <li class="seq-item"><span class="no">1</span><span class="thumb">${ic('chat')}</span><span class="t"><b>맞춤 인사와 회사 소개</b><span>${esc(k.greeting.split('\n')[0])}</span></span><span class="tools"><a class="btn sm" href="#categories" data-act="goto-cat">문구 수정</a></span></li>
            <li class="seq-item"><span class="no">2</span><span class="thumb">${ic('link')}</span><span class="t"><b>업체 홈페이지</b><span>${esc(D.company.site)}</span></span><span class="tools"><a class="btn sm" href="#company">주소 변경</a></span></li>
            <li class="seq-item"><span class="no">3</span><span class="thumb">${ic('file')}</span><span class="t"><b>RFP 가이드</b><span>${esc(a.guide.name)} · ${esc(a.guide.size)} · ${esc(a.guide.updated)} 등록</span></span><span class="tools"><button class="btn sm" data-act="replace-guide">${ic('swap')}교체</button></span></li>
            ${a.photos.map((p, i) => `<li class="seq-item" draggable="true" data-photo="${i}"><span class="no">${++no}</span><span class="thumb">${photoHtml(p)}</span><span class="t"><b>${esc(p.name)}</b><span>${p.src ? '업로드한 사진' : '예시 이미지 · 실제 시공 사진으로 교체하세요'}</span></span>
              <span class="tools"><span class="muted" title="끌어서 순서 변경" style="display:inline-flex;padding:0 4px">${ic('grip')}</span><button class="btn ghost icon sm" data-act="p-up" data-i="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="btn ghost icon sm" data-act="p-down" data-i="${i}" aria-label="아래로" ${i === n - 1 ? 'disabled' : ''}>${ic('down')}</button><button class="btn sm" data-act="p-replace" data-i="${i}">교체</button><button class="btn ghost icon sm" data-act="p-del" data-i="${i}" aria-label="삭제">${ic('x')}</button></span></li>`).join('')}
            <li class="seq-item"><span class="no">${++no}</span><span class="thumb">${ic('building')}</span><span class="t"><b>무료 현장 미팅 제안</b><span>${esc(k.meeting.split('\n')[0])}</span></span><span class="tools"><a class="btn sm" href="#categories" data-act="goto-cat">문구 수정</a></span></li>
          </ol>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn" data-act="p-add" ${n >= 6 ? 'disabled' : ''}>${ic('plus')}사진 추가</button>
            <span class="hint">${n === 6 ? '사진 6장, 총 10건으로 기본 구성과 같습니다.' : `사진이 ${n}장입니다. 기본 구성은 6장(총 10건)입니다.`}</span>
          </div>
          <input type="file" id="file" accept="image/*" hidden>
          <input type="file" id="gfile" accept=".xlsx,.xls,.pdf,.docx" hidden>
        </div>
      </div>
      ${previewHtml(S.assetCat)}
    </div>`;
  };
  let dragFrom = null, fileTarget = null;
  after.assets = () => {
    const list = $('#seq-list');
    list.addEventListener('dragstart', (e) => { const li = e.target.closest('[data-photo]'); if (!li) return; dragFrom = +li.dataset.photo; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
    list.addEventListener('dragover', (e) => { const li = e.target.closest('[data-photo]'); if (li == null || dragFrom == null) return; e.preventDefault(); list.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); li.classList.add('over'); });
    list.addEventListener('dragend', () => { dragFrom = null; list.querySelectorAll('.over,.drag').forEach((x) => x.classList.remove('over', 'drag')); });
    list.addEventListener('drop', (e) => {
      const li = e.target.closest('[data-photo]'); if (li == null || dragFrom == null) return; e.preventDefault();
      const ph = D.assets[S.assetCat].photos, to = +li.dataset.photo;
      ph.splice(to, 0, ph.splice(dragFrom, 1)[0]); dragFrom = null; render(); toast('사진 순서를 바꿨습니다');
    });
    $('#file').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const ph = D.assets[S.assetCat].photos, src = URL.createObjectURL(f);
      if (fileTarget == null) ph.push({ id: 'u' + Date.now(), name: f.name, variant: ph.length, src });
      else { ph[fileTarget].src = src; ph[fileTarget].name = f.name; }
      render(); toast('사진을 반영했습니다 (이 브라우저에서만 보입니다)');
    });
    $('#gfile').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      Object.assign(D.assets[S.assetCat].guide, { name: f.name, size: Math.max(1, Math.round(f.size / 1024)) + 'KB', updated: new Date().toISOString().slice(0, 10) });
      render(); toast('RFP 가이드를 교체했습니다');
    });
  };

  /* ---------- 4. 연결·알림 설정 ---------- */
  VIEWS.connect = () => {
    const c = conv('c1'), k = cat(c.catId);
    return `<div class="page-pad"><div class="stack-lg">
      <div class="page-head" style="margin-bottom:0"><div><h1>연결·알림 설정</h1><p>숨고 자체 알림은 새 메시지를 감지하는 수단입니다. 여기서 설정하는 알림은 담당자가 직접 움직여야 하는 통화·방문 요청만 골라 보냅니다.</p></div></div>
      <div class="sheet"><div class="sheet-b conn ${S.connected ? '' : 'off'}">
        <span class="big">${ic('plug')}</span>
        <div><h2>${S.connected ? '숨고 계정 연결됨' : '숨고 재연결이 필요합니다'}</h2>
          ${S.connected ? `<dl><div><dt>계정</dt><dd>${esc(D.company.name)}</dd></div><div><dt>마지막 수신</dt><dd class="num">오늘 14:05</dd></div><div><dt>마지막 발송</dt><dd class="num">오늘 14:05</dd></div><div><dt>오늘 신규 채팅</dt><dd class="num">4건</dd></div></dl>`
            : `<p class="muted" style="margin-top:4px">로그인이 만료되어 새 채팅을 받지 못하고 있습니다. 숨고 공식 화면에서 다시 로그인하세요. 그동안 자동응대는 멈춥니다.</p>`}
        </div>
        ${S.connected ? `<button class="btn" data-act="disconnect">연결 끊김 상태 보기</button>` : `<button class="btn act" data-act="reconnect">숨고에서 다시 로그인</button>`}
      </div></div>
      <div class="sheet">
        <div class="sheet-h"><h2>자동응대</h2><label class="switch"><input type="checkbox" data-change="auto" ${S.autoOn ? 'checked' : ''}><i></i><span>${S.autoOn ? '켜짐' : '꺼짐'}</span></label></div>
        <div class="sheet-b grid2">
          <label class="field"><span>응대 시간</span><select class="sel"><option>24시간</option><option>평일 09:00~18:00</option><option>매일 08:00~22:00</option></select><span class="hint">시간 외에 온 채팅은 접수 안내만 보내고 다음 응대 시간에 이어갑니다.</span></label>
          <label class="field"><span>자동답변을 멈추는 조건</span><select class="sel"><option>담당자가 이어받으면 즉시 멈춤</option><option>담당자가 숨고에서 직접 답하면 멈춤</option></select><span class="hint">담당자가 응대를 시작한 채팅방에는 자동답변을 보내지 않습니다.</span></label>
        </div>
      </div>
      <div class="sheet">
        <div class="sheet-h"><h2>알림 받을 담당자</h2><button class="btn sm" data-act="rcp-add">${ic('plus')}담당자 추가</button></div>
        <div class="rows">
          ${D.recipients.map((r, i) => `<div class="rcp">
            <input class="inp" value="${esc(r.name)}" aria-label="이름"><input class="inp num" value="${esc(r.phone)}" aria-label="휴대폰 번호">
            <span class="seg" role="group" aria-label="알림 채널">${['문자', '알림톡'].map((ch) => `<button data-act="rcp-ch" data-i="${i}" data-v="${ch}" aria-pressed="${r.channel === ch}">${ch}</button>`).join('')}</span>
            <label class="switch"><input type="checkbox" data-change="rcp-call" data-i="${i}" ${r.call ? 'checked' : ''}><i></i><span>통화 요청</span></label>
            <label class="switch"><input type="checkbox" data-change="rcp-meet" data-i="${i}" ${r.meet ? 'checked' : ''}><i></i><span>미팅 요청</span></label>
            <button class="btn ghost icon sm" data-act="rcp-del" data-i="${i}" aria-label="삭제">${ic('x')}</button>
          </div>`).join('')}
        </div>
      </div>
      <div class="grid2">
        <div class="sheet"><div class="sheet-h"><h2>담당자가 받는 알림</h2><button class="btn sm" data-act="test-alert">테스트 발송</button></div>
          <div class="sheet-b stack"><div class="sms">[숨고 미팅 요청]
${esc(c.name)} · ${esc(c.region)}
${esc(k.name)} · ${esc(c.size)}
희망: ${esc(c.wish)}
"내일 오후 3시 현장 미팅 가능할까요?"
채팅방: soomgo.com/chat/…</div>
          <p class="hint">고객명, 지역, 업종, 평수, 요청 원문, 희망 시간, 숨고 채팅방 바로가기가 들어갑니다. 같은 메시지로는 한 번만 보냅니다.</p></div></div>
        <div class="sheet"><div class="sheet-h"><h2>최근 알림</h2></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>시각</th><th>고객</th><th>유형</th><th>수신</th><th>결과</th></tr></thead><tbody>
          ${D.alertLog.map((a) => `<tr><td class="num">${esc(a.t)}</td><td>${esc(a.who)}</td><td>${esc(a.type)}</td><td>${esc(a.to)} · ${esc(a.channel)}</td><td><span class="tag ${a.status === '도착' ? 'ok' : a.status === '중복 차단' ? '' : 'warn'}">${esc(a.status)}</span></td></tr>`).join('')}
          </tbody></table></div></div>
      </div>
    </div></div>`;
  };

  /* ---------- 5. 업체 설정 ---------- */
  VIEWS.company = () => {
    const co = D.company;
    const steps = [['업체 정보', 'done'], ['숨고 연결', S.connected ? 'done' : 'now'], ['카테고리 문구', 'done'], ['첨부자료', D.assets.office.photos.some((p) => p.src) ? 'done' : 'now'], ['알림 설정', 'done']];
    return `<div class="page-pad">
      <div class="page-head"><div><h1>업체 설정</h1><p>여기 정보는 인사 문구의 {상호}, {담당자}, {연락처}와 2번 홈페이지 발송에 그대로 들어갑니다.</p></div><button class="btn primary" data-act="save">저장</button></div>
      <ol class="steps" aria-label="설정 진행">${steps.map(([l, s]) => `<li class="${s}">${l}</li>`).join('')}</ol>
      <div class="stack-lg" style="max-width:820px">
        <div class="sheet"><div class="sheet-h"><h2>업체 정보</h2></div><div class="sheet-b stack">
          <div class="grid2">
            <label class="field"><span>상호</span><input class="inp" data-co="name" value="${esc(co.name)}"></label>
            <label class="field"><span>상담 담당자</span><input class="inp" data-co="manager" value="${esc(co.manager)}"></label>
            <label class="field"><span>고객에게 남길 연락처</span><input class="inp num" data-co="phone" value="${esc(co.phone)}"></label>
            <label class="field"><span>알림 받을 번호</span><input class="inp num" data-co="alertPhone" value="${esc(co.alertPhone)}"></label>
          </div>
          <label class="field"><span>홈페이지</span><input class="inp" data-co="site" value="${esc(co.site)}"><span class="hint">첫 상담 2번으로 이 주소를 보냅니다.</span></label>
        </div></div>
        <div class="sheet"><div class="sheet-h"><h2>직원 계정</h2><button class="btn sm" data-act="invite">${ic('plus')}직원 초대</button></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>이름</th><th>역할</th><th>권한</th><th>연락처</th></tr></thead><tbody>
            ${D.team.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.role)}</td><td>${esc(t.perms)}</td><td class="num">${esc(t.phone)}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="sheet-b" style="border-top:1px solid var(--line)"><p class="hint">문구·사진·고객 채팅은 업체 단위로 서버에 저장해, 대표가 PC에서 바꾼 내용을 직원 휴대폰에서 바로 쓰게 하는 것이 목표입니다. 이 프로토타입에서는 저장되지 않습니다.</p></div>
        </div>
      </div>
    </div>`;
  };

  /* ---------- 6. 판매자 운영 ---------- */
  VIEWS.seller = () => {
    const pays = ['all', '결제 완료', '미결제', '환불 요청'];
    const rows = D.vendors.filter((v) => S.sellerFilter === 'all' || v.pay === S.sellerFilter);
    const payTag = (p) => `<span class="tag ${p === '결제 완료' ? 'ok' : 'warn'}">${p}</span>`;
    const linkTag = (l) => `<span class="tag ${l === '연결됨' ? 'ok' : l === '미연결' ? '' : 'warn'}">${l}</span>`;
    return `<div class="page-pad" style="max-width:1280px">
      <div class="page-head"><div><h1>판매자 운영</h1><p>구매 업체의 결제, 이용 기간, 사용량, 발송 실패를 봅니다. 판매가는 업체당 300,000원이며 무료 플랜은 없습니다. 일회성 판매인지 월 구독인지는 미확정입니다.</p></div></div>
      <div class="filters" style="padding:0 0 12px;border:0">${pays.map((p) => `<button class="chip" data-act="seller-filter" data-id="${p}" aria-pressed="${S.sellerFilter === p}">${p === 'all' ? '전체' : p}<span class="num">${p === 'all' ? D.vendors.length : D.vendors.filter((v) => v.pay === p).length}</span></button>`).join('')}</div>
      <div class="sheet"><div class="tbl-wrap"><table class="tbl wide">
        <thead><tr><th>업체</th><th>결제</th><th>이용 기간</th><th>숨고 연결</th><th class="r">신규 상담</th><th class="r">AI 답변</th><th class="r">문자·알림톡</th><th class="r">발송 실패</th></tr></thead>
        <tbody>${rows.map((v) => `<tr class="click" data-act="vendor" data-id="${esc(v.name)}" tabindex="0">
          <td><b>${esc(v.name)}</b><div class="muted" style="font-size:12px">${esc(v.field)}</div></td><td>${payTag(v.pay)}</td>
          <td class="num">${esc(v.from)}${v.to !== '—' ? ' ~ ' + esc(v.to) : ''}</td><td>${linkTag(v.link)}</td>
          <td class="r num">${v.leads}</td><td class="r num">${v.ai.toLocaleString()}</td><td class="r num">${v.sms}</td>
          <td class="r num" style="${v.fail ? 'color:var(--accent-ink);font-weight:600' : ''}">${v.fail}</td></tr>
          ${S.vendorOpen === v.name ? `<tr><td colspan="8" style="background:var(--paper)"><b>${v.fail ? '확인할 내용' : '특이사항'}</b> · ${esc(v.note || '없습니다.')}${v.link !== '연결됨' && v.pay === '결제 완료' ? ' <button class="btn sm" data-act="nudge" style="margin-left:8px">재연결 안내 보내기</button>' : ''}</td></tr>` : ''}`).join('') || `<tr><td colspan="8" class="empty">해당 상태의 업체가 없습니다.</td></tr>`}</tbody>
      </table></div></div>
      <p class="hint" style="margin-top:10px">행을 누르면 발송 실패 원인과 조치를 볼 수 있습니다. 수치는 이번 이용 기간 기준 목업입니다.</p>
    </div>`;
  };

  /* ---------- 이벤트 ---------- */
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const ACT = {
    open(el) { S.convId = el.dataset.id; S.open = true; const c = conv(S.convId); c.unread = 0; $('#inbox').classList.add('open'); refreshInbox(true); },
    back() { S.open = false; $('#inbox').classList.remove('open', 'show-detail'); },
    filter(el) { S.filter = el.dataset.id; $('#items').innerHTML = listHtml(); $('#filters').innerHTML = filtersHtml(); },
    'toggle-detail'() { $('#inbox').classList.toggle('show-detail'); },
    soomgo() { toast('실제 서비스에서는 숨고 채팅방이 새 창으로 열립니다'); },
    takeover() {
      const c = conv(S.convId); c.status = 'human'; c.assignee = c.assignee || D.company.manager;
      c.msgs.push({ from: 'sys', text: `${c.assignee}가 상담을 이어받음 · 자동답변 중지`, t: nowT() }); refreshInbox(true); toast('자동답변을 멈췄습니다');
    },
    release() {
      const c = conv(S.convId); c.status = 'auto';
      c.msgs.push({ from: 'sys', text: '자동답변 다시 시작', t: nowT() }); refreshInbox(true);
    },
    'close-conv'() { const c = conv(S.convId); c.status = 'closed'; c.msgs.push({ from: 'sys', text: '상담 종료 처리', t: nowT() }); refreshInbox(true); },
    'resume-seq'() { const c = conv(S.convId); const n = 10 - c.seq; c.seq = 10; c.seqNote = ''; c.msgs.push({ from: 'sys', text: `보류했던 ${n}건 발송 완료`, t: nowT() }); refreshInbox(true); },
    send() {
      const inp = $('#reply'), v = inp.value.trim(); if (!v) { inp.focus(); return; }
      conv(S.convId).msgs.push({ from: 'human', text: v, t: nowT() }); refreshInbox(true); $('#reply')?.focus();
    },
    'pick-cat'(el) { S.catId = el.dataset.id; render(); },
    'add-cat'() {
      const id = 'c' + Date.now();
      D.cats.push({ ...JSON.parse(JSON.stringify(cat('office'))), id, name: '새 카테고리', soomgo: '' });
      D.assets[id] = JSON.parse(JSON.stringify(D.assets.office)); S.catId = id; render(); toast('사무실 카테고리를 바탕으로 새 카테고리를 만들었습니다');
    },
    'copy-cat'() {
      const src = cat(S.catId), id = 'c' + Date.now();
      D.cats.push({ ...JSON.parse(JSON.stringify(src)), id, name: src.name + ' 복사본' });
      D.assets[id] = JSON.parse(JSON.stringify(D.assets[S.catId])); S.catId = id; render(); toast('카테고리를 복사했습니다');
    },
    save() { toast('반영했습니다. 프로토타입이라 새로고침하면 처음 상태로 돌아갑니다'); },
    var(el) {
      const ta = $('#' + el.dataset.for), ins = `{${el.dataset.v}}`, s = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd ?? s);
      ta.focus(); ta.setSelectionRange(s + ins.length, s + ins.length); cat(S.catId)[ta.dataset.bind] = ta.value; refreshPreview();
    },
    'q-up'(el) { move(cat(S.catId).questions, +el.dataset.i, -1); render(); },
    'q-down'(el) { move(cat(S.catId).questions, +el.dataset.i, 1); render(); },
    'q-del'(el) { cat(S.catId).questions.splice(+el.dataset.i, 1); render(); },
    'q-add'() { cat(S.catId).questions.push(''); render(); const all = document.querySelectorAll('[data-q]'); all[all.length - 1]?.focus(); },
    'quote-add'() { cat(S.catId).quote.push(['', '']); render(); },
    'quote-del'(el) { cat(S.catId).quote.splice(+el.dataset.i, 1); render(); },
    'toggle-preview'() { (document.getElementById('split') || document.getElementById('two')).classList.toggle('show-preview'); },
    'pick-asset-cat'(el) { S.assetCat = el.dataset.id; render(); },
    'goto-cat'() { S.catId = S.assetCat; },
    'p-up'(el) { move(D.assets[S.assetCat].photos, +el.dataset.i, -1); render(); },
    'p-down'(el) { move(D.assets[S.assetCat].photos, +el.dataset.i, 1); render(); },
    'p-del'(el) { D.assets[S.assetCat].photos.splice(+el.dataset.i, 1); render(); toast('사진을 뺐습니다'); },
    'p-replace'(el) { fileTarget = +el.dataset.i; $('#file').click(); },
    'p-add'() { fileTarget = null; $('#file').click(); },
    'replace-guide'() { $('#gfile').click(); },
    disconnect() { S.connected = false; S.autoOn = false; render(); },
    reconnect() { S.connected = true; S.autoOn = true; render(); toast('다시 연결했습니다 (프로토타입: 실제 로그인은 하지 않습니다)'); },
    'rcp-add'() { D.recipients.push({ name: '', phone: '', channel: '문자', call: true, meet: true }); render(); },
    'rcp-del'(el) { D.recipients.splice(+el.dataset.i, 1); render(); },
    'rcp-ch'(el) { D.recipients[+el.dataset.i].channel = el.dataset.v; render(); },
    'test-alert'() { toast('프로토타입에서는 문자·알림톡을 실제로 보내지 않습니다'); },
    invite() { toast('직원 초대는 서버 저장 단계에서 연결합니다'); },
    'seller-filter'(el) { S.sellerFilter = el.dataset.id; render(); },
    vendor(el) { S.vendorOpen = S.vendorOpen === el.dataset.id ? null : el.dataset.id; render(); },
    nudge() { toast('프로토타입에서는 안내를 실제로 보내지 않습니다'); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && ACT[el.dataset.act]) { ACT[el.dataset.act](el, e); }
    if (e.target.closest('#menu-btn')) $('#app').classList.add('menu');
    if (e.target.closest('#scrim') || e.target.closest('#nav a')) $('#app').classList.remove('menu');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'reply') ACT.send();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act]')) { e.preventDefault(); ACT[e.target.dataset.act](e.target); }
    if (e.key === 'Escape') { $('#app').classList.remove('menu'); document.querySelectorAll('.show-detail,.show-preview').forEach((x) => x.classList.remove('show-detail', 'show-preview')); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { S.q = t.value; $('#items').innerHTML = listHtml(); return; }
    if (t.dataset.bind) { cat(S.catId)[t.dataset.bind] = t.value; refreshPreview(); return; }
    if (t.dataset.q != null) { cat(S.catId).questions[+t.dataset.q] = t.value; refreshPreview(); return; }
    if (t.dataset.quote) { const [i, j] = t.dataset.quote.split(':').map(Number); cat(S.catId).quote[i][j] = t.value; return; }
    if (t.dataset.co) { D.company[t.dataset.co] = t.value; $('#brand-co').textContent = D.company.name; }
  });
  document.addEventListener('change', (e) => {
    const t = e.target, k = t.dataset.change;
    if (t.id === 'auto-master' || k === 'auto') {
      if (t.checked && !S.connected) { t.checked = false; toast('숨고를 다시 연결해야 자동응대를 켤 수 있습니다'); return; }
      S.autoOn = t.checked; toast(S.autoOn ? '자동응대를 켰습니다' : '자동응대를 껐습니다. 새 채팅에 답하지 않습니다');
      if (S.route === 'connect') render(); else renderNav(); return;
    }
    if (k === 'status') { const c = conv(S.convId); c.status = t.value; refreshInbox(); }
    else if (k === 'assignee') { conv(S.convId).assignee = t.value || null; refreshInbox(); }
    else if (k === 'sample') { S.sample = t.value; refreshPreview(); }
    else if (k === 'rcp-call') D.recipients[+t.dataset.i].call = t.checked;
    else if (k === 'rcp-meet') D.recipients[+t.dataset.i].meet = t.checked;
  });

  function route() {
    const h = location.hash.slice(1);
    S.route = VIEWS[h] ? h : 'inbox';
    if (S.route === 'inbox') S.open = false;
    render();
  }
  window.addEventListener('hashchange', route);
  route();
})();
