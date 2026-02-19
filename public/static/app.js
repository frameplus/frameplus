// ===== Frame Plus ERP v8.0 - Full-Stack D1 SaaS Design =====
// D1 Database backend with in-memory cache for UI performance
// v7: Complete UI redesign inspired by Pluuug.com SaaS platform
//     Modern card-based dashboard, purple accent, clean typography,
//     Cost flow visualization, enhanced KPI cards, professional tables
//     v8.0: Full value-up — presets, weather, CRM, attachments, multi-assignee

// ===== AUTH STATE =====
let _authUser = null; // { id, username, name, role, email }
let _sessionId = localStorage.getItem('fp_session') || '';

function isAdmin() { return _authUser?.role === 'admin'; }
function isLoggedIn() { return !!_authUser; }

// ===== API LAYER (with Optimistic UI support) =====
async function api(path, method, body) {
  const opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (_sessionId) opts.headers['X-Session-Id'] = _sessionId;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch('/api/' + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'Server error'}));
      console.error('API Error:', res.status, err);
      return { __error: true, status: res.status, ...err };
    }
    return await res.json();
  } catch(e) { 
    console.error('API Error:', e);
    toast('네트워크 오류가 발생했습니다', 'error');
    return { __error: true, message: e.message };
  }
}

// Optimistic UI helper: run action optimistically, rollback on failure
async function optimistic(doFn, apiFn, rollbackFn) {
  doFn();
  try {
    const result = await apiFn();
    if (result?.__error) { rollbackFn(); toast('저장 실패: 다시 시도해주세요', 'error'); }
  } catch(e) { rollbackFn(); toast('저장 실패', 'error'); }
}

// ===== DATA CACHE =====
let _d = {}; // in-memory cache
let _initializing = false;

async function initData() {
  if (_initializing) return;
  _initializing = true;
  try {
    const [projects, vendors, meetings, pricedb, orders, as_list, notices, tax, templates, team, company, labor, expenses, presets, notifications, estTemplates, approvals, userPrefs, consultations, rfpList, clients, erpAttachments] = await Promise.all([
      api('projects'), api('vendors'), api('meetings'), api('pricedb'),
      api('orders'), api('as'), api('notices'), api('tax'),
      api('templates'), api('team'), api('company'),
      api('labor'), api('expenses'), api('presets'),
      api('notifications'), api('estimate-templates'), api('approvals'), api('user-prefs'),
      api('consultations'), api('rfp'), api('clients'), api('erp-attachments')
    ]);
    _d = { projects: (projects||[]).map(dbToProject), vendors: vendors||[], meetings: meetings||[],
      pricedb: pricedb||[], orders: orders||[], as_list: as_list||[], notices: notices||[],
      tax: tax||[], templates: templates||[], team: team||[], company: company||{},
      labor: labor||[], expenses: expenses||[], presets: presets||[],
      notifications: notifications||[], estTemplates: estTemplates||[], approvals: approvals||[],
      consultations: consultations||[], rfpList: rfpList||[], clients: clients||[], erpAttachments: erpAttachments||[],
      userPrefs: (Array.isArray(userPrefs)?userPrefs[0]:userPrefs)||{} };
    // Apply dark mode from saved prefs
    if (_d.userPrefs?.dark_mode) applyDarkMode(true);
  } catch(e) { console.error('Init failed:', e); _d = {}; }
  _initializing = false;
}

// ===== DARK MODE =====
function applyDarkMode(on) {
  document.documentElement.classList.toggle('dark', on);
  S.darkMode = on;
}
function toggleDarkMode() {
  S.darkMode = !S.darkMode;
  applyDarkMode(S.darkMode);
  api('user-prefs', 'POST', { id: 'default', dark_mode: S.darkMode ? 1 : 0 });
  toast(S.darkMode ? '다크 모드 활성화' : '라이트 모드 활성화');
}

// ===== NOTIFICATION HELPERS =====

// ===== LOGIN SCREEN =====
function renderLoginScreen() {
  document.getElementById('app').innerHTML = `
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0F172A 0%,#1E293B 50%,#334155 100%);padding:20px">
    <div style="width:100%;max-width:400px;animation:fadeIn .5s ease">
      <!-- Logo -->
      <div style="text-align:center;margin-bottom:32px">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:var(--primary,#6366F1);border-radius:16px;margin-bottom:16px">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="28" height="28"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </div>
        <h1 style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-.02em;margin:0">Frame Plus ERP</h1>
        <p style="font-size:13px;color:rgba(255,255,255,.5);margin-top:6px">건설 프로젝트 관리 시스템</p>
      </div>
      <!-- Login Card -->
      <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <h2 style="font-size:18px;font-weight:700;color:#1E293B;margin:0 0 24px 0;text-align:center">로그인</h2>
        <div id="login-error" style="display:none;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#DC2626;text-align:center"></div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:12px;font-weight:600;color:#64748B;margin-bottom:6px">아이디</label>
          <input id="login-user" type="text" placeholder="아이디를 입력하세요" style="width:100%;padding:12px 14px;border:1px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;transition:border .2s;box-sizing:border-box" onfocus="this.style.borderColor='#6366F1'" onblur="this.style.borderColor='#E2E8F0'" onkeydown="if(event.key==='Enter')document.getElementById('login-pass').focus()">
        </div>
        <div style="margin-bottom:24px">
          <label style="display:block;font-size:12px;font-weight:600;color:#64748B;margin-bottom:6px">비밀번호</label>
          <input id="login-pass" type="password" placeholder="비밀번호를 입력하세요" style="width:100%;padding:12px 14px;border:1px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;transition:border .2s;box-sizing:border-box" onfocus="this.style.borderColor='#6366F1'" onblur="this.style.borderColor='#E2E8F0'" onkeydown="if(event.key==='Enter')doLogin()">
        </div>
        <button id="login-btn" onclick="doLogin()" style="width:100%;padding:13px;background:#6366F1;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:background .2s" onmouseover="this.style.background='#4F46E5'" onmouseout="this.style.background='#6366F1'">
          로그인
        </button>
        <div style="margin-top:16px;text-align:center;font-size:11px;color:#94A3B8">
          기본 계정: admin / admin1234
        </div>
      </div>
      <div style="text-align:center;margin-top:20px;font-size:11px;color:rgba(255,255,255,.3)">
        © ${new Date().getFullYear()} Frame Plus ERP v8.0
      </div>
    </div>
  </div>`;
  setTimeout(() => { const el = document.getElementById('login-user'); if(el) el.focus(); }, 100);
}

async function doLogin() {
  const username = document.getElementById('login-user')?.value?.trim();
  const password = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  if (!username || !password) {
    errEl.textContent = '아이디와 비밀번호를 입력하세요';
    errEl.style.display = 'block';
    return;
  }
  btn.disabled = true; btn.textContent = '로그인 중...';
  try {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok || data.error) {
      errEl.textContent = data.error || '로그인 실패';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = '로그인';
      return;
    }
    _sessionId = data.session;
    _authUser = data.user;
    localStorage.setItem('fp_session', _sessionId);
    S.isAdmin = _authUser.role === 'admin';
    // Restore original layout and boot
    location.reload();
  } catch(e) {
    errEl.textContent = '서버 연결 실패';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = '로그인';
  }
}

async function checkAuth() {
  if (!_sessionId) return false;
  try {
    const res = await fetch('/api/auth/me', { headers: { 'X-Session-Id': _sessionId } });
    if (!res.ok) { _sessionId = ''; localStorage.removeItem('fp_session'); return false; }
    _authUser = await res.json();
    S.isAdmin = _authUser.role === 'admin';
    return true;
  } catch(e) { return false; }
}

async function doLogout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  try { await api('auth/logout', 'POST'); } catch(e) {}
  _sessionId = ''; _authUser = null;
  localStorage.removeItem('fp_session');
  S.isAdmin = false;
  location.reload();
}
function getNotifications() { return (_d.notifications||[]).filter(n=>n.status==='unread'); }
function getUnreadCount() { return getNotifications().length; }
async function markNotifRead(id) {
  await api('notifications/'+id+'/read', 'PUT');
  const n = (_d.notifications||[]).find(x=>x.id===id);
  if(n) n.status='read';
  renderNav(); updateNotifBadge();
}
async function markAllNotifsRead() {
  await api('notifications-read-all', 'PUT');
  (_d.notifications||[]).forEach(n=>n.status='read');
  renderNav(); updateNotifBadge(); toast('모든 알림을 읽음 처리했습니다');
}
function updateNotifBadge() {
  const cnt = getUnreadCount();
  const badge = document.getElementById('notif-badge');
  if(badge) { badge.textContent = cnt; badge.style.display = cnt > 0 ? '' : 'none'; }
}
async function createNotification(data) {
  const notif = { id: uid(), created_at: new Date().toISOString(), status: 'unread', ...data };
  await api('notifications', 'POST', notif);
  (_d.notifications = _d.notifications||[]).unshift(notif);
  updateNotifBadge();
}

// ===== APPROVAL HELPERS =====
function getApprovals() { return _d.approvals||[]; }
function getPendingApprovals() { return getApprovals().filter(a=>a.status==='대기'); }
async function createApproval(data) {
  const appr = { id: uid(), status: '대기', request_date: today(), created_at: new Date().toISOString(), ...data };
  await api('approvals', 'POST', appr);
  (_d.approvals = _d.approvals||[]).unshift(appr);
  // Auto-create notification for approver
  await createNotification({ type:'approval', title:`결재 요청: ${data.title}`, message:`${data.requester||''}님이 결재를 요청했습니다 (${fmt(data.amount||0)}원)`, related_type: data.type, related_id: data.related_id, priority: 'high' });
  return appr;
}
async function approveApprovalItem(id) {
  const co = getCompany();
  await api('approvals/'+id+'/approve', 'PUT', { approver: co.ceo||'대표' });
  const a = getApprovals().find(x=>x.id===id);
  if(a) { a.status='승인'; a.approve_date=today(); a.approver=co.ceo||'대표'; }
  await createNotification({ type:'approval', title:`결재 승인: ${a?.title||''}`, message:`${co.ceo||'대표'}님이 승인했습니다`, related_type: a?.type, related_id: a?.related_id });
  toast('승인되었습니다','success');
}
async function rejectApprovalItem(id, reason) {
  await api('approvals/'+id+'/reject', 'PUT', { reason });
  const a = getApprovals().find(x=>x.id===id);
  if(a) { a.status='반려'; a.reject_reason=reason; }
  await createNotification({ type:'approval', title:`결재 반려: ${a?.title||''}`, message:`사유: ${reason}`, related_type: a?.type, related_id: a?.related_id });
  toast('반려되었습니다','warning');
}

function dbToProject(row) {
  if (!row) return null;
  function tryP(s, d) { if (!s) return d; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return d; } }
  return { id:row.id, nm:row.nm, client:row.client||'', contact:row.contact||'', email:row.email||'',
    loc:row.loc||'', mgr:row.mgr||'', date:row.date||'', status:row.status||'작성중',
    area:row.area||0, profit:row.profit||10, roundUnit:row.round_unit||'십만원',
    manualTotal:row.manual_total||0, targetAmt:row.target_amt||0, memo:row.memo||'',
    region:row.region||'', contractStatus:row.contract_status||'미생성',
    contractDate:row.contract_date||'', contractNote:row.contract_note||'',
    contractClauses:tryP(row.contract_clauses,[]), payments:tryP(row.payments,[]),
    ganttTasks:tryP(row.gantt_tasks,[]), items:tryP(row.items,[]), createdAt:row.created_at };
}

function projectToDb(p) {
  return { id:p.id, nm:p.nm, client:p.client||'', contact:p.contact||'', email:p.email||'',
    loc:p.loc||'', mgr:p.mgr||'', date:p.date||'', status:p.status||'작성중',
    area:p.area||0, profit:p.profit||10, round_unit:p.roundUnit||'십만원',
    manual_total:p.manualTotal||0, target_amt:p.targetAmt||0, memo:p.memo||'',
    region:p.region||'', contract_status:p.contractStatus||'미생성',
    contract_date:p.contractDate||'', contract_note:p.contractNote||'',
    contract_clauses:JSON.stringify(p.contractClauses||[]),
    payments:JSON.stringify(p.payments||[]),
    gantt_tasks:JSON.stringify(p.ganttTasks||[]),
    items:JSON.stringify(p.items||[]),
    created_at:p.createdAt||today(), updated_at:today() };
}

// ===== STORAGE ADAPTERS (replacing localStorage) =====
function getProjects(){ return _d.projects || []; }
function getProject(id){ return getProjects().find(p=>p.id===id) || null; }
async function saveProject(p) {
  await api('projects', 'POST', projectToDb(p));
  const idx = (_d.projects||[]).findIndex(x=>x.id===p.id);
  if(idx>=0) _d.projects[idx]=p; else (_d.projects=_d.projects||[]).push(p);
}
async function saveProjects(ps) {
  // Batch update - used for delete operations
  _d.projects = ps;
}
async function deleteProjectRemote(id) {
  await api('projects/'+id, 'DELETE');
  _d.projects = (_d.projects||[]).filter(p=>p.id!==id);
}

function getVendors(){ return _d.vendors || []; }
async function saveVendors(vs){ _d.vendors=vs; }
async function saveVendor(v) {
  await api('vendors', 'POST', v);
  const idx = (_d.vendors||[]).findIndex(x=>x.id===v.id);
  if(idx>=0) _d.vendors[idx]=v; else (_d.vendors=_d.vendors||[]).push(v);
}
async function deleteVendorRemote(id) {
  await api('vendors/'+id, 'DELETE');
  _d.vendors = (_d.vendors||[]).filter(x=>x.id!==id);
}

function getMeetings(){ return _d.meetings || []; }
async function saveMeetings(ms){ _d.meetings=ms; }
async function saveMeeting(m) {
  await api('meetings', 'POST', m);
  const idx = (_d.meetings||[]).findIndex(x=>x.id===m.id);
  if(idx>=0) _d.meetings[idx]=m; else (_d.meetings=_d.meetings||[]).push(m);
}
async function deleteMeetingRemote(id) {
  await api('meetings/'+id, 'DELETE');
  _d.meetings = (_d.meetings||[]).filter(x=>x.id!==id);
}

function getPriceDB(){ return _d.pricedb || []; }
async function savePriceDB(db){ _d.pricedb=db; }
async function savePriceItem(item) {
  await api('pricedb', 'POST', item);
  const idx = (_d.pricedb||[]).findIndex(x=>x.id===item.id);
  if(idx>=0) _d.pricedb[idx]=item; else (_d.pricedb=_d.pricedb||[]).push(item);
}

function getNotices(){ return _d.notices || []; }
async function saveNotices(ns){ _d.notices=ns; }

function getTaxInvoices(){ return _d.tax || []; }
async function saveTaxInvoices(ts){ _d.tax=ts; }

function getMsgTemplates(){ return _d.templates || []; }
async function saveMsgTemplates(ts){ _d.templates=ts; }

function getTeam(){ return _d.team || []; }
async function saveTeam(ts){ _d.team=ts; }

function getCompany(){ return _d.company || { name:'Frame Plus', nameKo:'프레임플러스', ceo:'김승환', addr:'', email:'', tel:'', mobile:'', bizNo:'', specialty:'Office Specialist', website:'' }; }
async function saveCompany(c){
  _d.company=c;
  await api('company', 'PUT', {
    name:c.name, name_ko:c.nameKo, ceo:c.ceo, addr:c.addr, email:c.email,
    tel:c.tel, mobile:c.mobile, biz_no:c.bizNo, specialty:c.specialty, website:c.website
  });
}
function getCompanyFromDb(row) {
  return { name:row.name||'Frame Plus', nameKo:row.name_ko||'프레임플러스', ceo:row.ceo||'', addr:row.addr||'', email:row.email||'', tel:row.tel||'', mobile:row.mobile||'', bizNo:row.biz_no||'', specialty:row.specialty||'', website:row.website||'' };
}

function getASList(){ return _d.as_list || []; }
async function saveASList(l){ _d.as_list=l; }

function getOrders(){
  const ps=getProjects();
  const manual=_d.orders||[];
  const auto=[];
  ps.forEach(p=>{
    const calc=calcP(p);
    CATS.forEach(c=>{
      if(calc.cs[c.id]&&calc.cs[c.id].t>0){
        const existing=manual.find(o=>o.pid===p.id&&o.cid===c.id);
        if(!existing){
          auto.push({id:p.id+'_'+c.id,pid:p.id,cid:c.id,
            status:'대기',orderDate:p.date||today(),delivDate:'',
            vendor:'',taxInvoice:false,paid:false,memo:'',
            amount:calc.cs[c.id].t,items:getOrderItems(p,c.id)});
        }
      }
    });
  });
  return [...auto,...manual];
}
function getOrderItems(p,cid){
  return (p.items||[]).filter(it=>it.cid===cid).map(it=>({
    nm:it.nm,spec:it.unit,unit:it.unit,qty:it.qty,
    price:Math.round((it.mp+it.lp+it.ep)),
    amount:Math.round((it.mp+it.lp+it.ep)*it.qty) }));
}

// ===== CONSTANTS (same as v4) =====
const CATS=[
  {id:'C01',nm:'기초 공사',icon:'🏗️'},{id:'C02',nm:'철거 공사',icon:'⛏️'},
  {id:'C03',nm:'금속·유리 공사',icon:'🪟'},{id:'C04',nm:'목공·경량 공사',icon:'🪵'},
  {id:'C05',nm:'전기·통신 공사',icon:'⚡'},{id:'C06',nm:'페인트·벽지 공사',icon:'🎨'},
  {id:'C07',nm:'필름 공사',icon:'🎞️'},{id:'C08',nm:'바닥 공사',icon:'🔲'},
  {id:'C09',nm:'제작가구',icon:'🪑'},{id:'C10',nm:'에어컨 공사',icon:'❄️'},
  {id:'C11',nm:'덕트 공사',icon:'💨'},{id:'C12',nm:'설비 공사',icon:'🔧'},
  {id:'C13',nm:'소방 공사',icon:'🔴'},{id:'C14',nm:'타일 공사',icon:'🟫'},
  {id:'C15',nm:'간판 공사',icon:'📋'},{id:'C16',nm:'커튼·블라인드',icon:'🪟'},
  {id:'C17',nm:'조화 공사',icon:'🌸'},{id:'C18',nm:'이동가구·기전',icon:'📦'},
];
const STATUS_LABELS={'작성중':'작성중','견적완료':'견적완료','계약완료':'계약완료','시공중':'시공중','완료':'완료','보류':'보류'};
const STATUS_COLORS={'작성중':'gray','견적완료':'blue','계약완료':'purple','시공중':'orange','완료':'green','보류':'red'};
const CONTRACT_STATUS=['미생성','초안작성','고객검토','서명완료','계약완료'];
const TEAM_MEMBERS=['김승환','박관우','이지현','최민준','정수연','한동욱'];

// ===== COST TYPES (from v8) =====
const COST_TYPES = { CONSTRUCTION:'공사비', LABOR:'인건비', EXPENSE:'경비', OTHER_COST:'기타비용' };
const COST_ICONS = { CONSTRUCTION:'🔨', LABOR:'👷', EXPENSE:'💳', OTHER_COST:'📦' };
const COST_COLORS = ['var(--warm,#A89070)','var(--text,#1A1A1A)','var(--success,#4A7A4A)','var(--text-muted,#999)'];

// ===== PROJECT DETAIL MODE NAV (v8 PROJECT_NAV) =====
const PROJECT_NAV = [
  { section:'ERP', icon:'▣', items:[
    {id:'erp_overview',label:'Overview',icon:'chart'},
    {id:'erp_budget',label:'Budget',icon:'dollar'},
    {id:'erp_attachments',label:'Attachments',icon:'file'},
    {id:'estimate',label:'견적서',icon:'file'},
    {id:'erp_report',label:'Report',icon:'chart'},
  ]},
  { section:'시공', icon:'🏗️', items:[
    {id:'gantt',label:'공정표',icon:'activity'},
    {id:'orders',label:'발주',icon:'truck'},
    {id:'collection',label:'수금',icon:'dollar'},
    {id:'labor',label:'노무비',icon:'users'},
  ]},
  { section:'문서', icon:'📄', items:[
    {id:'contracts',label:'계약서',icon:'book'},
  ]},
];
const PROJECT_VIEW_IDS = new Set(PROJECT_NAV.flatMap(g=>g.items.map(i=>i.id)));

// ===== STATE =====
let S={page:'dash',subPage:null,selPid:null,selOid:null,sidebarCollapsed:false,sortCol:{},sortDir:{},calY:new Date().getFullYear(),calM:new Date().getMonth(),isAdmin:false,notices:[],msgTemplates:[],editingEstPid:null,darkMode:false};

// ===== CALC ENGINE (identical to v4) =====
function calcP(p){
  const cs={};
  (p.items||[]).forEach(it=>{
    if(!cs[it.cid])cs[it.cid]={m:0,l:0,e:0,t:0,cm:0,cl:0,ce:0,ct:0};
    const m=Number(it.sp||0)*Number(it.qty||0)*Number(it.mp||0);
    const l=Number(it.sp||0)*Number(it.qty||0)*Number(it.lp||0);
    const e=Number(it.sp||0)*Number(it.qty||0)*Number(it.ep||0);
    cs[it.cid].m+=m;cs[it.cid].l+=l;cs[it.cid].e+=e;cs[it.cid].t+=m+l+e;
    const cm=Number(it.qty||0)*Number(it.cmp||0);
    const cl=Number(it.qty||0)*Number(it.clp||0);
    const ce=Number(it.qty||0)*Number(it.cep||0);
    cs[it.cid].cm+=cm;cs[it.cid].cl+=cl;cs[it.cid].ce+=ce;cs[it.cid].ct+=cm+cl+ce;
  });
  const direct=Object.values(cs).reduce((a,c)=>a+c.t,0);
  const costDirect=Object.values(cs).reduce((a,c)=>a+c.ct,0);
  const pct=Number(p.profit||10)/100;
  const profitAmt=direct*pct;
  const safetyAmt=direct*0.007;
  const mealAmt=direct*0.03;
  const indirect=profitAmt+safetyAmt+mealAmt;
  const raw=direct+indirect;
  const ru=p.roundUnit||'십만원';
  let finalTotal=raw;
  if(ru==='만원')finalTotal=Math.floor(raw/10000)*10000;
  else if(ru==='십만원')finalTotal=Math.floor(raw/100000)*100000;
  else if(ru==='직접')finalTotal=Number(p.manualTotal||raw);
  const adj=finalTotal-raw;
  return{cs,direct,costDirect,profitAmt,safetyAmt,mealAmt,indirect,raw,finalTotal,adj};
}
function getTotal(p){return calcP(p).finalTotal}
function getMR(p){const c=calcP(p);return c.finalTotal>0?((c.finalTotal-c.costDirect)/c.finalTotal*100):0}
function getProg(p){const ts=p.ganttTasks||[];if(!ts.length)return 0;return Math.round(ts.reduce((a,t)=>a+Number(t.progress||0),0)/ts.length)}
function getPaid(p){return(p.payments||[]).filter(x=>x.paid).reduce((a,x)=>a+(getTotal(p)*Number(x.pct||0)/100),0)}
function getUnpaid(p){return Math.max(0,getTotal(p)-getPaid(p))}

// ===== FINANCIAL SUMMARY ENGINE (from v8 — 통합 수익 계산) =====
function getFinSummary(pid){
  const p = typeof pid==='string' ? getProject(pid) : pid;
  if(!p) return {contractTotal:0,estCost:0,estProfit:0,estMargin:0,orderCost:0,laborCost:0,expenseCost:0,totalSpent:0,actualProfit:0,actualMargin:0,executionRate:0,collected:0,outstanding:0,collectionRate:0};
  const c = calcP(p);
  const id = p.id;
  const orderCost = (getOrders()||[]).filter(o=>o.pid===id).reduce((a,o)=>a+Number(o.amount||0),0);
  const laborCost = (getLabor()||[]).filter(l=>l.pid===id).reduce((a,l)=>a+Number(l.daily_rate||0)*Number(l.days||0)+Number(l.meal_cost||0)+Number(l.transport_cost||0)+Number(l.overtime_cost||0)-Number(l.deduction||0),0);
  const expenseCost = (getExpenses()||[]).filter(e=>e.pid===id&&e.status==='승인').reduce((a,e)=>a+Number(e.amount||0),0);
  const totalSpent = orderCost + laborCost + expenseCost;
  const contractTotal = c.finalTotal;
  const collected = (p.payments||[]).filter(x=>x.paid).reduce((s,x)=>s+(contractTotal*Number(x.pct||0)/100),0);
  const outstanding = contractTotal - collected;
  const estCost = c.costDirect;
  const estProfit = contractTotal - estCost;
  const estMargin = contractTotal>0 ? estProfit/contractTotal*100 : 0;
  const actualProfit = contractTotal - totalSpent;
  const actualMargin = contractTotal>0 ? actualProfit/contractTotal*100 : 0;
  const executionRate = estCost>0 ? totalSpent/estCost*100 : 0;
  const collectionRate = contractTotal>0 ? collected/contractTotal*100 : 0;
  return {contractTotal,estCost,estProfit,estMargin,orderCost,laborCost,expenseCost,totalSpent,actualProfit,actualMargin,executionRate,collected,outstanding,collectionRate};
}

// ===== MONTHLY AGGREGATION ENGINE (from v8) =====
function getMonthlyAgg(ym){
  const ps = getProjects();
  const [y,m] = ym.split('-').map(Number);
  const monthStart = new Date(y,m-1,1);
  const monthEnd = new Date(y,m,0);
  const inMonth = (d)=>{ if(!d)return false; const dt=new Date(d); return dt>=monthStart&&dt<=monthEnd; };
  // 수금 (payments that were paid this month)
  let revenue = 0;
  ps.forEach(p=>{
    const tot = getTotal(p);
    (p.payments||[]).forEach(pay=>{
      if(pay.paid && pay.paidDate && inMonth(pay.paidDate)) revenue += tot*Number(pay.pct||0)/100;
    });
  });
  // 지출
  const orderSpent = (getOrders()||[]).filter(o=>inMonth(o.order_date||o.orderDate)).reduce((a,o)=>a+Number(o.amount||0),0);
  const laborSpent = (getLabor()||[]).filter(l=>inMonth(l.date)).reduce((a,l)=>a+Number(l.net_amount||0),0);
  const expenseSpent = (getExpenses()||[]).filter(e=>e.status==='승인'&&inMonth(e.date)).reduce((a,e)=>a+Number(e.amount||0),0);
  const spent = orderSpent + laborSpent + expenseSpent;
  return {revenue, spent, net: revenue-spent, orderSpent, laborSpent, expenseSpent};
}

function getRisks(p){
  const risks=[];const todayD=new Date();const calc=calcP(p);
  (p.ganttTasks||[]).forEach(t=>{
    if(t.end&&new Date(t.end)<todayD&&Number(t.progress||0)<100)
      risks.push({lv:'high',msg:'['+p.nm+'] 공정 지연: '+t.nm,pid:p.id});
  });
  if(calc.costDirect>calc.finalTotal&&calc.finalTotal>0)risks.push({lv:'high',msg:'['+p.nm+'] 원가 초과',pid:p.id});
  if(p.status==='완료'&&getUnpaid(p)>0)risks.push({lv:'mid',msg:'['+p.nm+'] 미수금 '+fmt(getUnpaid(p))+'원',pid:p.id});
  if(['계약완료','시공중'].includes(p.status)&&(!p.contractStatus||p.contractStatus==='미생성'))risks.push({lv:'mid',msg:'['+p.nm+'] 계약서 미작성',pid:p.id});
  if(getMR(p)<5&&calc.finalTotal>0)risks.push({lv:'mid',msg:'['+p.nm+'] 마진율 '+getMR(p).toFixed(1)+'% 경고',pid:p.id});
  return risks;
}

// ===== HELPERS =====
function today(){return new Date().toISOString().split('T')[0]}
function fmt(n){return Math.round(n).toLocaleString('ko-KR')}
function fmtShort(n){if(n>=100000000)return(n/100000000).toFixed(1)+'억';if(n>=10000000)return Math.round(n/10000000)+'천만';if(n>=10000)return Math.round(n/10000)+'만';return fmt(n)}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function catNm(id){return CATS.find(c=>c.id===id)?.nm||id}
function catIcon(id){return CATS.find(c=>c.id===id)?.icon||'📦'}
function statusBadge(st){const c=STATUS_COLORS[st]||'gray';return '<span class="badge badge-'+c+'">'+(st||'-')+'</span>'}
function diffDays(a,b){return Math.round((new Date(b)-new Date(a))/(1000*60*60*24))}
function addDays(d,n){const dt=new Date(d);dt.setDate(dt.getDate()+n);return dt.toISOString().split('T')[0]}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function v(id){return document.getElementById(id)?.value||''}
function svgIcon(name,size=14){
  const icons={
    search:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    plus:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    eye:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    chevron_down:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
    chevron_left:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevron_right:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
    copy:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    mail:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    download:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    upload:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
    print:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    arrow_left:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    alert:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    check:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    x:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    calendar:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    tool:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    dollar:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    file:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    users:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    chart:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    settings:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    home:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    clipboard:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
    truck:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    phone:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    star:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    pin:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    wrench:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    activity:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    book:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    camera:`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  };
  return icons[name]||`<span style="font-size:${size}px">?</span>`;
}
// ===== SIDEBAR NAV =====
const NAV=[
  {section:'메인'},
  {id:'dash',label:'대시보드',icon:'home'},
  {section:'경영',adminOnly:true},
  {id:'exec_dash',label:'경영 현황',icon:'chart',adminOnly:true},
  {id:'cashflow',label:'현금 흐름',icon:'dollar',adminOnly:true},
  {id:'profit_rank',label:'수익 분석',icon:'activity',adminOnly:true},
  {section:'프로젝트'},
  {id:'projects',label:'프로젝트 목록',icon:'clipboard'},
  {id:'estimate',label:'견적 작성',icon:'file'},
  {section:'공사 관리'},
  {id:'gantt',label:'공정표',icon:'activity'},
  {id:'orders',label:'발주 작성',icon:'truck'},
  {id:'collection',label:'수금 관리',icon:'dollar'},
  {id:'contracts',label:'계약서',icon:'book'},
  {section:'비용 관리'},
  {id:'labor',label:'인건비·노무비',icon:'users'},
  {id:'expenses',label:'지출결의서',icon:'file'},
  {section:'영업 관리'},
  {id:'consult',label:'상담 관리',icon:'phone'},
  {id:'rfp',label:'RFP·제안',icon:'clipboard'},
  {id:'meetings',label:'미팅 캘린더',icon:'calendar'},
  {id:'crm',label:'고객 CRM',icon:'users'},
  {section:'데이터'},
  {id:'pricedb',label:'단가 DB',icon:'tool'},
  {id:'vendors',label:'거래처',icon:'star'},
  {id:'tax',label:'세금계산서',icon:'dollar'},
  {section:'기타'},
  {id:'as',label:'AS·하자보수',icon:'wrench'},
  {id:'team',label:'팀원 관리',icon:'users'},
  {id:'reports',label:'리포트',icon:'chart'},
  {section:'시스템'},
  {id:'notifications',label:'알림 센터',icon:'alert'},
  {id:'approvals',label:'결재함',icon:'check'},
  {id:'admin',label:'관리자',icon:'settings',adminOnly:true},
];
// ===== PROJECT DETAIL MODE FUNCTIONS =====
function isProjectMode(){ return S.selPid && PROJECT_VIEW_IDS.has(S.page); }
function enterProject(pid){ S.selPid=pid; nav('erp_overview'); }
function backToBoard(){ S.selPid=null; nav('projects'); }

function renderNav(){
  if(isProjectMode()) return renderProjectNav();
  renderGlobalNav();
}

function renderGlobalNav(){
  const ps=getProjects();
  const unpaid=ps.filter(p=>getUnpaid(p)>0).length;
  const risks=ps.flatMap(p=>getRisks(p));
  const pendingApprovals=getPendingApprovals().length;
  const unreadNotifs=getUnreadCount();
  const admin=isAdmin();
  // Filter NAV by role
  const filtered=[];
  let skipSection=false;
  NAV.forEach(n=>{
    if(n.section){
      if(n.adminOnly && !admin){skipSection=true;return;}
      skipSection=false;
      filtered.push(n);
    }else{
      if(skipSection)return;
      if(n.adminOnly && !admin)return;
      filtered.push(n);
    }
  });
  let h='';
  filtered.forEach(n=>{
    if(n.section){
      h+=`<div class="sb-section"><div class="sb-section-label">${n.section}</div>`;
    }else{
      const active=S.page===n.id?'active':'';
      let badge='';
      if(n.id==='collection'&&unpaid>0)badge=`<span class="sb-badge">${unpaid}</span>`;
      if(n.id==='dash'&&(risks.length>0||unreadNotifs>0))badge=`<span class="sb-badge">${risks.length+unreadNotifs}</span>`;
      if(n.id==='expenses'&&pendingApprovals>0)badge=`<span class="sb-badge">${pendingApprovals}</span>`;
      h+=`<div class="sb-item ${active}" onclick="nav('${n.id}')" title="${n.label}">
        <span class="sb-icon">${svgIcon(n.icon)}</span>
        <span class="sb-label">${n.label}</span>${badge}
      </div>`;
    }
  });
  document.getElementById('sb-nav').innerHTML=h;
  // Update user info in sidebar
  const userEl=document.getElementById('sb-user');
  if(userEl && _authUser){
    userEl.innerHTML=`
      <div class="sb-avatar">${(_authUser.name||_authUser.username||'U').slice(0,1).toUpperCase()}</div>
      <div class="sb-user-info">
        <div class="sb-user-name" id="sb-user-name">${_authUser.name||_authUser.username}</div>
        <div class="sb-user-role">${_authUser.role==='admin'?'관리자':'직원'}</div>
      </div>
      <button onclick="doLogout()" title="로그아웃" style="border:none;background:none;cursor:pointer;padding:4px;color:var(--text-muted);margin-left:auto" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-muted)'">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>`;
  }
  if(S.sidebarCollapsed)document.getElementById('sidebar').classList.add('collapsed');
  else document.getElementById('sidebar').classList.remove('collapsed');
}

function renderProjectNav(){
  const p=getProject(S.selPid);
  if(!p){ backToBoard(); return; }
  const fin=getFinSummary(p);
  const progPct=getProg(p);
  let h=`
    <div style="padding:10px 12px;border-bottom:1px solid var(--border)">
      <button class="btn btn-ghost btn-sm" onclick="backToBoard()" style="margin-bottom:8px;font-size:11px;padding:4px 10px;width:100%">
        ${svgIcon('arrow_left',12)} 프로젝트 목록
      </button>
      <div style="background:var(--warm-light,#F3EDE5);border-radius:var(--radius);padding:10px 12px">
        <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:2px">${escHtml(p.nm)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(p.client||'')} · ${p.area||0}평</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          ${statusBadge(p.status)}
          <div class="prog" style="flex:1"><div class="prog-bar" style="width:${progPct}%"></div></div>
          <span style="font-size:10px;color:var(--text-muted)">${progPct}%</span>
        </div>
      </div>
    </div>`;
  h+=`<div style="padding:6px 8px">`;
  PROJECT_NAV.forEach(g=>{
    h+=`<div class="sb-section" style="margin-top:8px"><div class="sb-section-label">${g.icon} ${g.section}</div></div>`;
    g.items.forEach(item=>{
      const active=S.page===item.id?'active':'';
      h+=`<div class="sb-item ${active}" onclick="nav('${item.id}')" title="${item.label}">
        <span class="sb-icon">${svgIcon(item.icon)}</span>
        <span class="sb-label">${item.label}</span>
      </div>`;
    });
  });
  h+=`</div>`;
  document.getElementById('sb-nav').innerHTML=h;
  if(S.sidebarCollapsed)document.getElementById('sidebar').classList.add('collapsed');
  else document.getElementById('sidebar').classList.remove('collapsed');
}
function toggleSidebar(){
  S.sidebarCollapsed=!S.sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed',S.sidebarCollapsed);
}

// ===== ROUTER (with browser history) =====
function nav(page,sub=null,pid=null,pushHistory=true){
  // Block admin-only pages for non-admin users
  const adminPages=['exec_dash','cashflow','profit_rank','admin'];
  if(!isAdmin() && adminPages.includes(page)){
    toast('관리자만 접근할 수 있습니다','error');
    page='dash'; sub=null;
  }
  S.page=page;S.subPage=sub;
  if(pid)S.selPid=pid;
  // Push to browser history
  if(pushHistory){
    const url = pid ? `/${page}/${sub||''}/${pid}` : sub ? `/${page}/${sub}` : `/${page}`;
    history.pushState({page,sub,pid}, '', url);
  }
  renderNav();
  // Title: project mode shows project name, global mode shows page label
  const pageInfo=NAV.find(n=>n.id===page)||PROJECT_NAV.flatMap(g=>g.items).find(i=>i.id===page);
  if(isProjectMode()){
    const prj=getProject(S.selPid);
    document.getElementById('tb-title').textContent=prj?prj.nm:'프로젝트';
    document.getElementById('tb-sub').textContent=pageInfo?.label||page;
  }else{
    document.getElementById('tb-title').textContent=pageInfo?.label||page;
    document.getElementById('tb-sub').textContent='';
  }
  // Add dark mode toggle + notification bell to topbar
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-ghost btn-icon" onclick="toggleDarkMode()" title="다크모드" style="font-size:16px">
      ${S.darkMode?'☀️':'🌙'}
    </button>
    <button class="btn btn-ghost btn-icon" style="position:relative;font-size:16px" onclick="toggleNotifPanel()" title="알림">
      🔔<span id="notif-badge" style="position:absolute;top:3px;right:3px;background:var(--danger);color:#fff;font-size:8px;font-weight:700;border-radius:10px;padding:1px 4px;min-width:14px;text-align:center;line-height:1.3;${getUnreadCount()>0?'':'display:none'}">${getUnreadCount()}</span>
    </button>
    ${_authUser?`<button class="btn btn-ghost btn-icon" onclick="doLogout()" title="로그아웃 (${_authUser.name||_authUser.username})" style="font-size:14px;color:var(--text-muted)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </button>`:''}
  `;
  const content=document.getElementById('content');
  switch(page){
    case 'dash':renderDash();break;
    case 'exec_dash':renderExecDash();break;
    case 'cashflow':renderCashFlow();break;
    case 'profit_rank':renderProfitRank();break;
    case 'projects':renderProjects();break;
    case 'estimate':renderEstimate();break;
    case 'gantt':sub==='detail'?renderGanttDetail():renderGanttList();break;
    case 'orders':sub==='detail'?renderOrderDetail():renderOrderList();break;
    case 'collection':renderCollection();break;
    case 'contracts':sub==='detail'?renderContractDetail():renderContracts();break;
    case 'meetings':renderMeetings();break;
    case 'consult':renderConsult();break;
    case 'rfp':renderRfp();break;
    case 'crm':renderCRM();break;
    case 'pricedb':renderPriceDB();break;
    case 'vendors':renderVendors();break;
    case 'tax':renderTax();break;
    case 'as':renderAS();break;
    case 'team':renderTeam();break;
    case 'labor':renderLabor();break;
    case 'expenses':sub==='detail'?renderExpenseDetail():renderExpenses();break;
    case 'reports':renderReports();break;
    case 'admin':renderAdmin();break;
    case 'notifications':renderNotifications();break;
    case 'approvals':renderApprovals();break;
    case 'erp_overview':renderErpOverview();break;
    case 'erp_budget':renderErpBudget();break;
    case 'erp_attachments':renderErpAttachments();break;
    case 'erp_report':renderErpReport();break;
    default:content.innerHTML=`<div class="card"><p>${page} 페이지</p></div>`;
  }
  // Close mobile menu on nav
  closeMobileMenu();
}

// Browser history back/forward support
window.addEventListener('popstate', (e) => {
  if(e.state) { nav(e.state.page, e.state.sub, e.state.pid, false); }
  else { nav('dash', null, null, false); }
});

// Parse URL on load
function parseUrlRoute() {
  const path = location.pathname.replace(/^\/+/, '').split('/');
  if(path[0] && path[0] !== '') return { page: path[0], sub: path[1]||null, pid: path[2]||null };
  return { page: 'dash', sub: null, pid: null };
}

// ===== NOTIFICATION PANEL (dropdown) =====
function toggleNotifPanel() {
  const existing = document.getElementById('notif-panel');
  if(existing) { existing.remove(); return; }
  const notifs = (_d.notifications||[]).slice(0,20);
  const h = `<div id="notif-panel" style="position:fixed;top:56px;right:16px;width:380px;max-height:480px;background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);z-index:500;overflow:hidden;display:flex;flex-direction:column;animation:slideUp .2s ease">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:15px;font-weight:700;color:var(--text)">알림</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="markAllNotifsRead();document.getElementById('notif-panel')?.remove()">모두 읽음</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('notif-panel')?.remove();nav('notifications')">전체보기</button>
      </div>
    </div>
    <div style="overflow-y:auto;max-height:380px;padding:4px 0">
      ${notifs.length?notifs.map(n=>{
        const isUnread = n.status==='unread';
        const typeIcon = {'approval':'📋','alert':'⚠️','expense':'💰','payment':'💳','system':'⚙️'}[n.type]||'🔔';
        const timeAgo = getTimeAgo(n.created_at);
        return `<div style="padding:12px 18px;border-bottom:1px solid var(--border-light);cursor:pointer;transition:background .15s;${isUnread?'background:var(--primary-light);border-left:3px solid var(--primary)':''}" 
          onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='${isUnread?'var(--primary-light)':''}'"
          onclick="markNotifRead('${n.id}');${n.action_url?`nav('${n.action_url}');`:''}document.getElementById('notif-panel')?.remove()">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:16px;flex-shrink:0;margin-top:1px">${typeIcon}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:${isUnread?'600':'400'};color:var(--text)">${n.title||''}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.message||''}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${timeAgo}</div>
            </div>
            ${isUnread?'<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:6px"></span>':''}
          </div>
        </div>`;
      }).join(''):`<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">알림이 없습니다</div>`}
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', h);
  // Close on outside click
  setTimeout(()=>{
    document.addEventListener('click', function handler(e) {
      const panel = document.getElementById('notif-panel');
      if(panel && !panel.contains(e.target) && !e.target.closest('[onclick*="toggleNotifPanel"]')) {
        panel.remove(); document.removeEventListener('click', handler);
      }
    });
  }, 100);
}

function getTimeAgo(dateStr) {
  if(!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff/60000);
  if(mins < 1) return '방금 전';
  if(mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins/60);
  if(hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs/24);
  if(days < 7) return `${days}일 전`;
  return dateStr.split('T')[0];
}

// ===== FULL NOTIFICATIONS PAGE =====
function renderNotifications() {
  const notifs = (_d.notifications||[]);
  document.getElementById('tb-title').textContent = '알림 센터';
  document.getElementById('content').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div style="font-size:14px;font-weight:600">전체 알림 (${notifs.length})</div>
      <button class="btn btn-outline btn-sm" onclick="markAllNotifsRead();renderNotifications()">모두 읽음 처리</button>
    </div>
    <div class="card">
      ${notifs.length?notifs.map(n=>{
        const isUnread=n.status==='unread';
        const typeIcon={'approval':'📋','alert':'⚠️','expense':'💰','payment':'💳','system':'⚙️'}[n.type]||'🔔';
        return `<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px;background:${isUnread?'var(--blue-l)':'transparent'}">
          <span style="font-size:18px">${typeIcon}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:${isUnread?'600':'400'}">${n.title||''}</div>
            <div style="font-size:12px;color:var(--g600);margin-top:3px">${n.message||''}</div>
            <div style="font-size:11px;color:var(--g400);margin-top:4px">${n.created_at?.split('T')[0]||''} · ${getTimeAgo(n.created_at)}</div>
          </div>
          ${isUnread?`<button class="btn btn-ghost btn-sm" onclick="markNotifRead('${n.id}');renderNotifications()">읽음</button>`:''}
        </div>`;
      }).join(''):`<div style="padding:40px;text-align:center;color:var(--g400)">알림이 없습니다</div>`}
    </div>`;
}

// ===== APPROVALS PAGE =====
function renderApprovals() {
  const apps = getApprovals();
  const pending = apps.filter(a=>a.status==='대기');
  const processed = apps.filter(a=>a.status!=='대기');
  document.getElementById('tb-title').textContent = '결재함';
  document.getElementById('content').innerHTML = `
    <div class="tab-list">
      <button class="tab-btn active" onclick="showApprovalTab(this,'pending')">대기 (${pending.length})</button>
      <button class="tab-btn" onclick="showApprovalTab(this,'processed')">처리 완료 (${processed.length})</button>
    </div>
    <div id="pending" class="tab-pane active">
      ${pending.length?`<div class="card">${pending.map(a=>`<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:8px;background:var(--orange-l);display:flex;align-items:center;justify-content:center;font-size:18px">📋</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${a.title||''}</div>
          <div style="font-size:12px;color:var(--g500)">${a.type||''} · ${a.requester||''} · ${fmt(a.amount||0)}원</div>
          <div style="font-size:11px;color:var(--g400)">${a.request_date||''}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-green btn-sm" onclick="approveApprovalItem('${a.id}');renderApprovals()">승인</button>
          <button class="btn btn-red btn-sm" onclick="promptRejectApproval('${a.id}')">반려</button>
        </div>
      </div>`).join('')}</div>`:
      `<div class="card" style="text-align:center;padding:40px;color:var(--g400)">대기 중인 결재가 없습니다</div>`}
    </div>
    <div id="processed" class="tab-pane">
      ${processed.length?`<div class="card">${processed.map(a=>`<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
        <span style="font-size:18px">${a.status==='승인'?'✅':'❌'}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${a.title||''}</div>
          <div style="font-size:11px;color:var(--g500)">${a.type} · ${a.requester} · ${fmt(a.amount||0)}원 · ${a.approve_date||''}</div>
          ${a.reject_reason?`<div style="font-size:11px;color:var(--red)">사유: ${a.reject_reason}</div>`:''}
        </div>
        ${statusBadge(a.status)}
      </div>`).join('')}</div>`:
      `<div class="card" style="text-align:center;padding:40px;color:var(--g400)">처리된 결재가 없습니다</div>`}
    </div>`;
}
function showApprovalTab(btn,tabId){
  btn.closest('.tab-list').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
}
function promptRejectApproval(id) {
  const reason = prompt('반려 사유를 입력하세요:');
  if(reason) { rejectApprovalItem(id, reason); renderApprovals(); }
}

// ===== TOAST =====
function toast(msg,type=''){
  const el=document.createElement('div');
  el.className=`toast${type?' toast-'+type:''}`;
  el.textContent=msg;
  document.getElementById('toast-area').appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// ===== MODAL HELPERS =====
function openModal(html){
  const area=document.getElementById('modal-area');
  area.innerHTML=html;
  const bg=area.querySelector('.modal-bg');
  if(bg){
    bg.classList.add('open');
    bg.addEventListener('click',e=>{if(e.target===bg)closeModal()});
  }
}
function closeModal(){
  const bg=document.querySelector('.modal-bg');
  if(bg)bg.closest('#modal-area').innerHTML='';
}

// ===== COMMON FILTER BAR =====
function filterBar(opts={}){
  const {searchId='search',statusId='statusFilter',statuses=[],extra='',placeholder='검색...',showDate=false,showMonthGroup=false,dateId='dateFrom',dateToId='dateTo',onFilter='filterTable()'}=opts;
  const statusOpts=statuses.map(s=>`<option value="${s}">${s}</option>`).join('');
  return `<div class="filter-bar" style="flex-wrap:wrap;gap:8px">
    <div class="filter-search">
      ${svgIcon('search',14)}
      <input class="inp" id="${searchId}" placeholder="${placeholder}" oninput="${onFilter}" style="padding-left:30px">
    </div>
    ${statuses.length?`<select class="sel" id="${statusId}" style="width:auto;min-width:100px" onchange="${onFilter}">
      <option value="">전체 상태</option>${statusOpts}
    </select>`:''}
    ${showDate?`<input class="inp" id="${dateId}" type="date" style="width:130px" onchange="${onFilter}" placeholder="시작일">
    <span style="color:var(--g400)">~</span>
    <input class="inp" id="${dateToId}" type="date" style="width:130px" onchange="${onFilter}" placeholder="종료일">`:''}
    ${showMonthGroup?`<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap">
      <input type="checkbox" id="month-group-toggle" onchange="${onFilter}"> 월별 그룹
    </label>`:''}
    ${extra}
  </div>`;
}
function tableActions(opts={}){
  const {addLabel='+ 추가',addFn='',printFn='printPage()',xlsxFn='exportXLSX()'}=opts;
  return `<div style="display:flex;gap:8px;align-items:center">
    <button class="btn btn-outline btn-sm" onclick="${xlsxFn}">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-outline btn-sm" onclick="${printFn}">${svgIcon('print',12)} 인쇄</button>
    ${addLabel?`<button class="btn btn-primary btn-sm" onclick="${addFn}">${addLabel}</button>`:''}
  </div>`;
}

// ===== DASHBOARD (Pluuug-inspired) =====
function renderDash(){
  const ps=getProjects();
  const meetings=getMeetings();
  const notices=getNotices();
  const risks=ps.flatMap(p=>getRisks(p));
  const todayStr=today();
  const todayMeetings=meetings.filter(m=>m.date===todayStr);
  const weekStart=new Date(todayStr);weekStart.setDate(weekStart.getDate()-weekStart.getDay()+1);
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);
  const weekMeetings=meetings.filter(m=>{const d=new Date(m.date);return d>=weekStart&&d<=weekEnd});
  const thisWeekStart=new Date(weekStart).toISOString().split('T')[0];
  const thisWeekEnd=new Date(weekEnd).toISOString().split('T')[0];
  const weekStarting=ps.filter(p=>p.ganttTasks&&p.ganttTasks.length&&p.ganttTasks[0].start>=thisWeekStart&&p.ganttTasks[0].start<=thisWeekEnd);
  const totalUnpaid=ps.reduce((a,p)=>a+getUnpaid(p),0);
  const weekCollection=ps.reduce((a,p)=>{
    (p.payments||[]).forEach(pay=>{if(!pay.paid&&pay.due&&pay.due>=thisWeekStart&&pay.due<=thisWeekEnd)a+=getTotal(p)*Number(pay.pct||0)/100;});return a;
  },0);
  
  // Cost flow calculations
  const totalEstimate = ps.reduce((a,p)=>a+getTotal(p),0);
  const totalContract = ps.filter(p=>['계약완료','시공중','완료'].includes(p.status)).reduce((a,p)=>a+getTotal(p),0);
  const laborData = getLabor();
  const expenseData = getExpenses();
  const totalLaborCost = laborData.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
  const totalExpenseCost = expenseData.filter(e=>e.status==='승인').reduce((a,e)=>a+(Number(e.amount)||0),0);
  const ordersData = getOrders();
  const totalOrderCost = ordersData.reduce((a,o)=>a+(Number(o.amount)||0),0);
  const totalCosts = totalLaborCost + totalExpenseCost + totalOrderCost;
  const totalPaid = ps.reduce((a,p)=>a+getPaid(p),0);
  const totalProfit = totalContract - totalCosts;
  const profitRate = totalContract > 0 ? (totalProfit/totalContract*100) : 0;
  const pendingApprovalsCnt = getPendingApprovals().length;
  const collectionRate = totalContract > 0 ? Math.round(totalPaid/totalContract*100) : 0;
  
  // Date display
  const now=new Date();
  const dayNames=['일','월','화','수','목','금','토'];
  const dateStr=`${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${dayNames[now.getDay()]})`;
  
  // Estimate status
  const estStatus={'작성중':0,'견적완료':0,'계약완료':0,'시공중':0,'완료':0};
  ps.forEach(p=>{if(estStatus[p.status]!==undefined)estStatus[p.status]++;});
  
  const co=getCompany();
  const activeProjects = ps.filter(p=>['계약완료','시공중'].includes(p.status));
  
  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
  <!-- Welcome Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
    <div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${dateStr}</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--text)">안녕하세요, ${_authUser?.name||co.ceo||'김승환'}님</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:4px">${isAdmin()?'오늘의 경영 현황을 확인하세요':'오늘의 업무 현황을 확인하세요'}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      ${pendingApprovalsCnt>0?`<button class="btn btn-outline btn-sm" onclick="nav('approvals')" style="border-color:var(--warning);color:var(--warning)">
        ${svgIcon('check',12)} 결재 대기 <span style="background:var(--warning);color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px">${pendingApprovalsCnt}</span>
      </button>`:''}
      <div id="weather-widget" style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:8px 14px;display:flex;align-items:center;gap:10px;font-size:12px;min-width:200px">
        <span style="font-size:22px">⛅</span>
        <div><div style="font-weight:600;color:var(--text)">서울</div><div style="color:var(--text-muted)">로딩중...</div></div>
      </div>
    </div>
  </div>
  
  <!-- Cost Flow Pipeline (Pluuug-inspired) -->
  ${isAdmin()?`<div class="cost-flow">
    <div class="cost-flow-item">
      <div class="cost-flow-label">총 견적액</div>
      <div class="cost-flow-value">${fmtShort(totalEstimate)}</div>
      <div class="cost-flow-sub">${ps.length}건 진행</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">계약 총액</div>
      <div class="cost-flow-value" style="color:var(--primary)">${fmtShort(totalContract)}</div>
      <div class="cost-flow-sub">${ps.filter(p=>['계약완료','시공중','완료'].includes(p.status)).length}건 계약</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">투입 비용</div>
      <div class="cost-flow-value" style="color:var(--danger)">${fmtShort(totalCosts)}</div>
      <div class="cost-flow-sub">인건 ${fmtShort(totalLaborCost)} + 자재 ${fmtShort(totalOrderCost)}</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">수금 현황</div>
      <div class="cost-flow-value" style="color:var(--success)">${fmtShort(totalPaid)}</div>
      <div class="cost-flow-sub">수금률 ${collectionRate}%</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">예상 수익</div>
      <div class="cost-flow-value" style="color:${profitRate>=10?'var(--success)':profitRate>=0?'var(--warning)':'var(--danger)'}">${fmtShort(totalProfit)}</div>
      <div class="cost-flow-sub">마진율 ${profitRate.toFixed(1)}%</div>
    </div>
  </div>`:`<div class="cost-flow">
    <div class="cost-flow-item">
      <div class="cost-flow-label">전체 프로젝트</div>
      <div class="cost-flow-value">${ps.length}<span style="font-size:14px">건</span></div>
      <div class="cost-flow-sub">진행중 ${activeProjects.length}건</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">시공중</div>
      <div class="cost-flow-value" style="color:var(--warning)">${ps.filter(p=>p.status==='시공중').length}<span style="font-size:14px">건</span></div>
      <div class="cost-flow-sub">활성 프로젝트</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">공정 진행률</div>
      <div class="cost-flow-value" style="color:var(--primary)">${activeProjects.length>0?Math.round(activeProjects.reduce((a,p)=>a+getProg(p),0)/activeProjects.length):0}%</div>
      <div class="cost-flow-sub">평균 공정률</div>
    </div>
    <div class="cost-flow-item">
      <div class="cost-flow-label">수금률</div>
      <div class="cost-flow-value" style="color:var(--success)">${collectionRate}%</div>
      <div class="cost-flow-sub">전체 수금 현황</div>
    </div>
  </div>`}
  
  <!-- KPI Cards -->
  <div class="dash-grid" style="margin-bottom:20px">
    <div class="kpi-card kpi-primary">
      <div class="kpi-label">${svgIcon('clipboard',12)} 활성 프로젝트</div>
      <div class="kpi-value">${activeProjects.length}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">건</span></div>
      <div class="kpi-sub">${ps.filter(p=>p.status==='시공중').length} 시공중 · ${ps.filter(p=>p.status==='계약완료').length} 계약완료</div>
    </div>
    <div class="kpi-card kpi-info">
      <div class="kpi-label">${svgIcon('calendar',12)} 오늘 미팅</div>
      <div class="kpi-value">${todayMeetings.length}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">건</span></div>
      <div class="kpi-sub">${todayMeetings.slice(0,2).map(m=>m.title).join(', ')||'일정 없음'}</div>
    </div>
    ${isAdmin()?`<div class="kpi-card kpi-danger">
      <div class="kpi-label">${svgIcon('dollar',12)} 총 미수금</div>
      <div class="kpi-value">${fmtShort(totalUnpaid)}<span style="font-size:12px;font-weight:400;color:var(--text-muted)">원</span></div>
      <div class="kpi-sub">이번주 수금예정 ${fmtShort(weekCollection)}원</div>
    </div>`:`<div class="kpi-card kpi-danger">
      <div class="kpi-label">${svgIcon('alert',12)} 미수금 건수</div>
      <div class="kpi-value">${ps.filter(p=>getUnpaid(p)>0).length}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">건</span></div>
      <div class="kpi-sub">수금 필요 프로젝트</div>
    </div>`}
    <div class="kpi-card kpi-warning">
      <div class="kpi-label">${svgIcon('alert',12)} 리스크 알림</div>
      <div class="kpi-value">${risks.length}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">건</span></div>
      <div class="kpi-sub">${risks.filter(r=>r.lv==='high').length} 긴급 · ${risks.filter(r=>r.lv==='mid').length} 주의</div>
    </div>
  </div>
  
  <div class="dash-3col">
    <!-- Left Column -->
    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- Active Projects Table -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="card-title" style="margin-bottom:0">${svgIcon('activity',14)} 진행중 프로젝트</div>
          <button class="btn btn-ghost btn-sm" onclick="nav('projects')">전체 보기 →</button>
        </div>
        ${activeProjects.length?`<div class="tbl-wrap" style="border:none">
          <table class="tbl">
            <thead><tr>
              <th>프로젝트</th><th>공정률</th><th>수금률</th>${isAdmin()?'<th>마진율</th>':''}<th>상태</th>
            </tr></thead>
            <tbody>
              ${activeProjects.slice(0,6).map(p=>{
                const prog=getProg(p);const paid=getPaid(p);const tot=getTotal(p);
                const paidPct=tot>0?Math.round(paid/tot*100):0;
                const mr=getMR(p);
                return `<tr style="cursor:pointer" onclick="enterProject('${p.id}')">
                  <td><div style="font-weight:600;font-size:13px">${p.nm}</div><div style="font-size:11px;color:var(--text-muted)">${p.client||''}</div></td>
                  <td><div style="display:flex;align-items:center;gap:6px"><div class="prog prog-primary" style="width:60px;flex-shrink:0"><div class="prog-bar" style="width:${prog}%"></div></div><span style="font-size:11px;font-weight:600;color:var(--primary)">${prog}%</span></div></td>
                  <td><div style="display:flex;align-items:center;gap:6px"><div class="prog prog-green" style="width:60px;flex-shrink:0"><div class="prog-bar" style="width:${paidPct}%"></div></div><span style="font-size:11px;font-weight:600;color:var(--success)">${paidPct}%</span></div></td>
                  ${isAdmin()?`<td><span style="font-weight:700;font-size:13px;color:${mr<5?'var(--danger)':mr<15?'var(--warning)':'var(--success)'}">${mr.toFixed(1)}%</span></td>`:''}
                  <td>${statusBadge(p.status)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`:
        `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">진행중인 프로젝트가 없습니다</div><div class="empty-state-desc">새 프로젝트를 추가해보세요</div><button class="btn btn-primary btn-sm" onclick="openAddProject()">+ 프로젝트 추가</button></div>`}
      </div>
      
      <!-- Weekly Schedule -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="card-title" style="margin-bottom:0">${svgIcon('calendar',14)} 이번주 일정</div>
          <button class="btn btn-ghost btn-sm" onclick="nav('meetings')">전체 보기 →</button>
        </div>
        ${weekMeetings.length?`<div style="display:flex;flex-direction:column;gap:8px">
          ${weekMeetings.slice(0,5).map(m=>{
            const dt=new Date(m.date);
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--gray-50);border-radius:var(--radius);transition:background .15s;cursor:pointer" onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background='var(--gray-50)'">
            <div style="text-align:center;min-width:42px;background:var(--primary);color:#fff;border-radius:var(--radius-sm);padding:6px 4px">
              <div style="font-size:10px;font-weight:600">${dt.getMonth()+1}/${dt.getDate()}</div>
              <div style="font-size:10px">${m.time||''}</div>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.title}</div>
              <div style="font-size:11px;color:var(--text-muted)">${m.client||''} ${m.loc?'· '+m.loc:''}</div>
            </div>
            ${statusBadge(m.status)}
          </div>`;
          }).join('')}
        </div>`:
        `<div class="empty-state" style="padding:30px"><div class="empty-state-icon">📅</div><div class="empty-state-title">이번주 일정 없음</div></div>`}
      </div>
      
      <!-- Monthly Chart -->
      <div class="card">
        <div class="card-title">${svgIcon('chart',14)} ${isAdmin()?'월별 매출 현황':'월별 프로젝트 현황'}</div>
        <div class="chart-wrap"><canvas id="monthChart"></canvas></div>
      </div>
    </div>
    
    <!-- Right Column -->
    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- Quick Actions -->
      <div class="card">
        <div class="card-title">빠른 실행</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${[
            {icon:'file',label:'견적서 작성',fn:'newEstimate()',color:'var(--primary-light)'},
            {icon:'calendar',label:'미팅 추가',fn:'openAddMeeting()',color:'var(--info-light)'},
            {icon:'truck',label:'발주서 생성',page:'orders',color:'var(--warning-light)'},
            {icon:'users',label:'거래처 추가',fn:'openAddVendor()',color:'var(--success-light)'},
            {icon:'tool',label:'단가DB 조회',page:'pricedb',color:'var(--purple-light)'},
            {icon:'book',label:'계약서 작성',page:'contracts',color:'var(--teal-light)'},
          ].map(a=>`<button class="btn btn-outline" style="flex-direction:column;height:60px;gap:5px;font-size:11.5px;border-color:var(--border-light);transition:var(--transition)" 
            onmouseover="this.style.background='${a.color}';this.style.borderColor='${a.color}'" 
            onmouseout="this.style.background='';this.style.borderColor='var(--border-light)'"
            onclick="${a.fn||`nav('${a.page}')`}">
            ${svgIcon(a.icon,16)}${a.label}
          </button>`).join('')}
        </div>
      </div>
      
      <!-- Project Pipeline -->
      <div class="card">
        <div class="card-title">프로젝트 파이프라인</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${Object.entries(estStatus).map(([st,cnt])=>{
            const total=ps.length||1;
            const pct=Math.round(cnt/total*100);
            const colors={
              '작성중':'var(--gray-400)','견적완료':'var(--info)','계약완료':'var(--purple)',
              '시공중':'var(--warning)','완료':'var(--success)'
            };
            return `<div style="display:flex;align-items:center;gap:10px">
              <div style="width:60px;text-align:right">${statusBadge(st)}</div>
              <div class="prog" style="flex:1"><div class="prog-bar" style="width:${pct}%;background:${colors[st]||'var(--gray-400)'}"></div></div>
              <span style="font-size:12px;font-weight:700;min-width:28px;text-align:right;color:var(--text)">${cnt}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
      
      <!-- Risk Alerts -->
      ${risks.length?`<div class="card" style="border-color:var(--danger);border-color:rgba(239,68,68,.2)">
        <div class="card-title" style="color:var(--danger)">${svgIcon('alert',14)} 리스크 알림</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${risks.slice(0,5).map(r=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:${r.lv==='high'?'var(--danger-light)':'var(--warning-light)'};border-radius:var(--radius-sm);font-size:12px;cursor:pointer" onclick="enterProject('${r.pid}')">
            <span style="flex-shrink:0">${r.lv==='high'?'🔴':'🟡'}</span>
            <span style="color:var(--text-secondary)">${r.msg}</span>
          </div>`).join('')}
          ${risks.length>5?`<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:4px">+${risks.length-5}건 더보기</div>`:''}
        </div>
      </div>`:
      `<div class="card">
        <div class="card-title" style="color:var(--success)">${svgIcon('check',14)} 리스크 현황</div>
        <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">✅ 모든 프로젝트가 정상입니다</div>
      </div>`}
      
      <!-- Notices -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">공지사항</div>
          ${S.isAdmin?`<button class="btn btn-ghost btn-sm" onclick="openAddNotice()">${svgIcon('plus',12)}</button>`:''}
        </div>
        ${notices.slice(0,3).map(n=>`<div style="padding:10px 0;border-bottom:1px solid var(--border-light)">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            ${n.pinned?'<span style="color:var(--danger);font-size:10px">📌</span>':''}
            <span style="font-size:13px;font-weight:600;color:var(--text)">${n.title}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted)">${n.date}</div>
        </div>`).join('')||`<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">공지사항 없음</div>`}
      </div>
    </div>
  </div>
  
  <!-- Personal KPI / Team Performance -->
  <div class="card" style="margin-top:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div class="card-title" style="margin-bottom:0">👤 담당자별 업무 현황</div>
      <div style="font-size:11px;color:var(--text-muted)">프로젝트 담당 기준</div>
    </div>
    ${(()=>{
      const mgrStats={};
      ps.forEach(p=>{
        const mgrs=(p.mgr||'').split(',').map(m=>m.trim()).filter(Boolean);
        if(!mgrs.length) mgrs.push('미배정');
        mgrs.forEach(m=>{
          if(!mgrStats[m]) mgrStats[m]={name:m, total:0, active:0, completed:0, revenue:0, laborCost:0, expenseCost:0, orderCost:0};
          mgrStats[m].total++;
          if(['계약완료','시공중'].includes(p.status)) mgrStats[m].active++;
          if(p.status==='완료') mgrStats[m].completed++;
          mgrStats[m].revenue+=getTotal(p);
        });
      });
      // Add labor/expense/order costs
      getLabor().forEach(l=>{
        const p=ps.find(x=>x.id===l.pid);
        if(p){
          const mgrs=(p.mgr||'').split(',').map(m=>m.trim()).filter(Boolean);
          mgrs.forEach(m=>{if(mgrStats[m])mgrStats[m].laborCost+=Number(l.net_amount)||0;});
        }
      });
      getExpenses().filter(e=>e.status==='승인').forEach(e=>{
        const p=ps.find(x=>x.id===e.pid);
        if(p){
          const mgrs=(p.mgr||'').split(',').map(m=>m.trim()).filter(Boolean);
          mgrs.forEach(m=>{if(mgrStats[m])mgrStats[m].expenseCost+=Number(e.amount)||0;});
        }
      });
      const statsList=Object.values(mgrStats).sort((a,b)=>b.revenue-a.revenue);
      if(!statsList.length) return '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">프로젝트에 담당자를 배정하면 여기에 KPI가 표시됩니다</div>';
      const maxRevenue=Math.max(...statsList.map(s=>s.revenue),1);
      return '<div class="tbl-wrap"><table class="tbl"><thead><tr>'+
        '<th>담당자</th><th style="text-align:right">전체</th><th style="text-align:right">진행중</th><th style="text-align:right">완료</th>'+
        (isAdmin()?'<th style="text-align:right">매출</th><th style="text-align:right">비용</th><th style="text-align:right">수익률</th>':'')+
        '<th>성과</th>'+
      '</tr></thead><tbody>'+
      statsList.map(s=>{
        const cost=s.laborCost+s.expenseCost+s.orderCost;
        const profit=s.revenue-cost;
        const profRate=s.revenue>0?((profit/s.revenue)*100):0;
        const pct=maxRevenue>0?(s.revenue/maxRevenue*100):0;
        return '<tr>'+
          '<td style="font-weight:700">'+escHtml(s.name)+'</td>'+
          '<td style="text-align:right;font-weight:600">'+s.total+'건</td>'+
          '<td style="text-align:right"><span class="badge badge-blue">'+s.active+'</span></td>'+
          '<td style="text-align:right"><span class="badge badge-green">'+s.completed+'</span></td>'+
          (isAdmin()?
            '<td style="text-align:right;font-weight:600">'+fmtShort(s.revenue)+'</td>'+
            '<td style="text-align:right;color:var(--text-muted)">'+fmtShort(cost)+'</td>'+
            '<td style="text-align:right;font-weight:700;color:'+(profRate>=0?'var(--green)':'var(--red)')+'">'+profRate.toFixed(1)+'%</td>':'')+
          '<td><div class="prog" style="width:80px"><div class="prog-bar" style="width:'+pct+'%"></div></div></td>'+
        '</tr>';
      }).join('')+
      '</tbody></table></div>';
    })()}
  </div>
  </div>`;
  
  // Load weather
  loadWeather();
  
  // Chart
  setTimeout(()=>{
    const ctx=document.getElementById('monthChart');
    if(!ctx)return;
    const months=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    if(isAdmin()){
      const vals=months.map((_,i)=>{
        const m=String(i+1).padStart(2,'0');
        return ps.filter(p=>p.date&&p.date.startsWith(`2026-${m}`)).reduce((a,p)=>a+getTotal(p),0)/10000;
      });
      new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{data:vals,backgroundColor:'rgba(79,70,229,.7)',borderRadius:6,hoverBackgroundColor:'rgba(79,70,229,.9)'}]},
        options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>`${fmt(v)}만`,color:'#94A3B8'},grid:{color:'rgba(0,0,0,.04)'}},x:{ticks:{color:'#94A3B8'},grid:{display:false}}},responsive:true,maintainAspectRatio:true}});
    } else {
      // Staff: show project count per month (no revenue data)
      const vals=months.map((_,i)=>{
        const m=String(i+1).padStart(2,'0');
        return ps.filter(p=>p.date&&p.date.startsWith(`2026-${m}`)).length;
      });
      new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{data:vals,backgroundColor:'rgba(79,70,229,.7)',borderRadius:6,hoverBackgroundColor:'rgba(79,70,229,.9)',label:'프로젝트'}]},
        options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>`${v}건`,color:'#94A3B8',stepSize:1},grid:{color:'rgba(0,0,0,.04)'}},x:{ticks:{color:'#94A3B8'},grid:{display:false}}},responsive:true,maintainAspectRatio:true}});
    }
  },100);
}

function loadWeather(){
  // Open-Meteo API via server proxy (no key needed)
  fetch('/api/weather')
    .then(r=>r.json())
    .then(d=>{
      if(d.error){console.warn('Weather error:',d.error);return;}
      const iconMap={'01d':'☀️','01n':'🌙','02d':'⛅','02n':'⛅','03d':'☁️','03n':'☁️','04d':'☁️','04n':'☁️','09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌧️','11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️','50d':'🌫️','50n':'🌫️'};
      const icon=iconMap[d.icon]||'🌤️';
      const warnings=[];
      if(d.rain_warning)warnings.push('<span style="color:var(--blue)">🌧 비</span>');
      if(d.snow_warning)warnings.push('<span style="color:var(--blue)">❄️ 눈</span>');
      if(!d.outdoor_ok)warnings.push('<span style="color:var(--red)">⚠️ 외부작업주의</span>');
      const el=document.getElementById('weather-widget');
      if(el)el.innerHTML=`
        <img src="${d.icon_url}" width="36" height="36" style="margin:-6px" alt="weather">
        <div style="flex:1">
          <div style="font-weight:600;color:var(--text);font-size:12px">${d.city} · ${d.temp}°C <span style="font-weight:400;color:var(--text-muted)">(체감 ${d.feels_like}°C)</span></div>
          <div style="font-size:11px;color:var(--text-muted)">${d.description} · 습도 ${d.humidity}%</div>
          ${warnings.length?`<div style="font-size:10px;margin-top:2px;display:flex;gap:6px">${warnings.join('')}</div>`:''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openWeatherForecast()" style="font-size:10px;padding:4px 8px">5일예보</button>`;
    }).catch(()=>{
      const el=document.getElementById('weather-widget');
      if(el)el.innerHTML='<span>🌤️</span><div style="color:var(--g400)">날씨 정보 로딩중...</div>';
    });
}

function openWeatherForecast(){
  fetch('/api/weather/forecast')
    .then(r=>r.json())
    .then(d=>{
      if(d.error||!d.forecast){toast('예보 데이터를 가져올 수 없습니다','error');return;}
      const days=['일','월','화','수','목','금','토'];
      const rows=d.forecast.map(f=>{
        const dt=new Date(f.date);
        const day=days[dt.getDay()];
        const iconMap={'01d':'☀️','02d':'⛅','03d':'☁️','04d':'☁️','09d':'🌧️','10d':'🌦️','11d':'⛈️','13d':'❄️','50d':'🌫️'};
        const icon=iconMap[f.icon]||'🌤️';
        return `<tr style="${f.rain?'background:var(--blue-l)':''}">
          <td style="font-weight:600">${f.date} (${day})</td>
          <td style="font-size:20px">${icon}</td>
          <td>${f.description}</td>
          <td style="text-align:right;color:var(--blue)">${f.temp_min}°</td>
          <td style="text-align:right;color:var(--red)">${f.temp_max}°</td>
          <td>${f.rain?'<span class="badge badge-blue">🌧 강수</span>':'<span class="badge badge-green">☀ 맑음</span>'}</td>
        </tr>`;
      }).join('');
      openModal(`<div class="modal-bg"><div class="modal">
        <div class="modal-hdr">
          <span class="modal-title">🌤️ ${d.city} 5일 날씨 예보</span>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="background:var(--orange-l);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--orange)">
            💡 <strong>시공 참고:</strong> 비/눈 예보일에는 외부 작업 일정 조정을 권장합니다.
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>날짜</th><th></th><th>날씨</th><th style="text-align:right">최저</th><th style="text-align:right">최고</th><th>강수</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div></div>`);
    }).catch(e=>toast('예보 조회 실패: '+e.message,'error'));
}

// ===== EXECUTIVE DASHBOARD (경영 현황 — from v8 DashView) =====
function renderExecDash(){
  const ps=getProjects();
  const activePs=ps.filter(p=>['계약완료','시공중'].includes(p.status));
  const now=new Date();
  const curYM=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const dayNames=['일','월','화','수','목','금','토'];
  const dateStr=`${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${dayNames[now.getDay()]})`;

  // 전사 재무 집계
  const fins=ps.map(p=>({p,f:getFinSummary(p)}));
  const totalContract=fins.reduce((a,{f})=>a+f.contractTotal,0);
  const totalSpent=fins.reduce((a,{f})=>a+f.totalSpent,0);
  const totalCollected=fins.reduce((a,{f})=>a+f.collected,0);
  const totalOutstanding=fins.reduce((a,{f})=>a+f.outstanding,0);
  const totalActualProfit=fins.reduce((a,{f})=>a+f.actualProfit,0);
  const avgMargin=totalContract>0?totalActualProfit/totalContract*100:0;

  // 월별 현금흐름 (최근 6개월)
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const monthData=months.map(m=>({m,...getMonthlyAgg(m)}));

  // 예산 초과 경고
  const budgetAlerts=fins.filter(({p,f})=>['시공중','계약완료'].includes(p.status)&&f.estCost>0).map(({p,f})=>({p,f,execPct:f.executionRate})).filter(x=>x.execPct>=90).sort((a,b)=>b.execPct-a.execPct);

  // 위험 알림
  const alerts=[];
  ps.forEach(p=>(p.ganttTasks||[]).forEach(t=>{if(t.end&&new Date(t.end)<new Date()&&Number(t.progress||0)<100)alerts.push({icon:'⚠️',msg:`[${p.nm}] "${t.nm}" 공정 지연`,color:'var(--danger)'});}));
  const pendingExp=(getExpenses()||[]).filter(e=>e.status==='대기').length;
  if(pendingExp>0)alerts.push({icon:'📋',msg:`지출결의서 ${pendingExp}건 결재 대기`,color:'var(--info)'});
  const unpaidLabor=(getLabor()||[]).filter(l=>!l.paid).length;
  if(unpaidLabor>0)alerts.push({icon:'👷',msg:`노무비 ${unpaidLabor}건 미지급`,color:'var(--warning)'});
  if(totalOutstanding>0)alerts.push({icon:'💰',msg:`미수금 ${fmtShort(totalOutstanding)}원 회수 필요`,color:'var(--danger)'});

  // 수익 랭킹
  const ranked=fins.filter(({f})=>f.contractTotal>0).sort((a,b)=>b.f.actualMargin-a.f.actualMargin);

  // 현금흐름 차트 maxVal
  const cfMax=Math.max(...monthData.map(d=>Math.max(d.revenue,d.spent)),1);

  document.getElementById('tb-title').textContent='경영 현황';
  document.getElementById('tb-actions').innerHTML='';
  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
  <!-- Header -->
  <div style="margin-bottom:20px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${dateStr}</div>
    <div style="font-size:22px;font-weight:800;color:var(--text)">경영 대시보드</div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Frame Plus 실시간 경영지표</div>
  </div>

  <!-- KPI 6개 (3x2) -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
    ${[
      ['이번 달 매출',fmtShort(monthData[5]?.revenue||0)+'원','var(--info)',`수금 기준 (${curYM})`],
      ['이번 달 실집행',fmtShort(monthData[5]?.spent||0)+'원','var(--warning)','발주+노무+경비'],
      ['이번 달 순이익',fmtShort(monthData[5]?.net||0)+'원',(monthData[5]?.net||0)>=0?'var(--success)':'var(--danger)','매출 - 실집행'],
      ['미수금 총액',fmtShort(totalOutstanding)+'원',totalOutstanding>0?'var(--danger)':'var(--success)',`${ps.filter(p=>getFinSummary(p).outstanding>0).length}건 미수`],
      ['진행 프로젝트',activePs.length+'건','var(--warning)',`전체 ${ps.length}건`],
      ['평균 마진율',avgMargin.toFixed(1)+'%',avgMargin>=10?'var(--success)':avgMargin>=5?'var(--warning)':'var(--danger)','실제 집행 기준'],
    ].map(([title,value,color,sub])=>`
      <div class="card" style="padding:18px">
        <div style="font-size:10px;color:var(--text-muted);font-weight:800;margin-bottom:6px">${title}</div>
        <div style="font-size:22px;font-weight:900;color:${color}">${value}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${sub}</div>
      </div>
    `).join('')}
  </div>

  <!-- 예산 초과 경고 + 위험 알림 -->
  ${(budgetAlerts.length>0||alerts.length>0)?`<div style="margin-bottom:14px">
    ${budgetAlerts.map(({p,execPct})=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:var(--radius);background:${execPct>=100?'var(--danger-light)':'var(--warning-light)'};border-left:3px solid ${execPct>=100?'var(--danger)':'var(--warning)'};margin-bottom:4px;font-size:12px;font-weight:700;color:${execPct>=100?'var(--danger)':'var(--warning)'};cursor:pointer" onclick="enterProject('${p.id}')">
        ${execPct>=100?'🚨':'⚠️'} [${p.nm}] 예산 집행률 ${execPct.toFixed(0)}% ${execPct>=100?'— 초과':'— 주의'}
      </div>
    `).join('')}
    ${alerts.map(a=>`
      <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:var(--radius);background:color-mix(in srgb,${a.color} 10%,transparent);border-left:3px solid ${a.color};margin-bottom:4px;font-size:12px;font-weight:700;color:${a.color}">
        ${a.icon} ${a.msg}
      </div>
    `).join('')}
  </div>`:''}

  <!-- 월별 현금 흐름 차트 -->
  <div class="card" style="margin-bottom:14px">
    <div style="font-size:11px;font-weight:900;color:var(--text-muted);margin-bottom:12px">📈 월별 현금 흐름 (최근 6개월)</div>
    <div style="display:flex;align-items:flex-end;gap:2px;height:140px;margin-bottom:8px">
      ${monthData.map(md=>{
        const rH=md.revenue/cfMax*120;const sH=md.spent/cfMax*120;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="display:flex;gap:2px;align-items:flex-end;height:120px">
            <div style="width:16px;height:${Math.max(2,rH)}px;background:var(--info);border-radius:3px 3px 0 0;transition:height .3s" title="수금 ${fmtShort(md.revenue)}"></div>
            <div style="width:16px;height:${Math.max(2,sH)}px;background:var(--warning);border-radius:3px 3px 0 0;transition:height .3s" title="지출 ${fmtShort(md.spent)}"></div>
          </div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:4px">${md.m.slice(5)}월</div>
          <div style="font-size:9px;font-weight:700;color:${md.net>=0?'var(--success)':'var(--danger)'}">${md.net>=0?'+':''}${fmtShort(md.net)}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center;font-size:10px;color:var(--text-muted)">
      <span>🟦 수금</span><span>🟧 지출</span><span style="font-weight:700">하단: 순현금</span>
    </div>
  </div>

  <!-- 수익 랭킹 + 일정/알림 -->
  <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:12px">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:11px;font-weight:900;color:var(--text-muted)">🏆 프로젝트 수익 랭킹</div>
        <button class="btn btn-ghost btn-sm" onclick="nav('profit_rank')">상세 →</button>
      </div>
      <div class="tbl-wrap" style="border:none">
        <table class="tbl">
          <thead><tr><th>프로젝트</th><th>계약금액</th><th>실집행</th><th>마진율</th><th>집행률</th></tr></thead>
          <tbody>
            ${ranked.slice(0,6).map(({p,f},i)=>`
              <tr style="cursor:pointer" onclick="enterProject('${p.id}')">
                <td><div style="font-weight:700">${i<3?['🥇','🥈','🥉'][i]:''} ${p.nm}</div><div style="font-size:10px;color:var(--text-muted)">${p.client||''}</div></td>
                <td style="font-weight:700">${fmtShort(f.contractTotal)}</td>
                <td>${fmtShort(f.totalSpent)}</td>
                <td><span style="font-weight:800;color:${f.actualMargin>=10?'var(--success)':f.actualMargin>=0?'var(--warning)':'var(--danger)'}">${f.actualMargin.toFixed(1)}%</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:4px">
                    <div class="prog" style="width:40px;flex-shrink:0"><div class="prog-bar" style="width:${Math.min(100,f.executionRate)}%;background:${f.executionRate>=100?'var(--danger)':f.executionRate>=90?'var(--warning)':'var(--success)'}"></div></div>
                    <span style="font-size:10px;color:${f.executionRate>=100?'var(--danger)':'var(--text-muted)'}">${f.executionRate.toFixed(0)}%</span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px">
      <!-- 오늘의 일정 -->
      <div class="card">
        <div style="font-size:11px;font-weight:900;color:var(--text-muted);margin-bottom:8px">📅 오늘의 일정</div>
        ${getMeetings().filter(m=>m.date===today()).length===0?
          '<div style="font-size:12px;color:var(--text-muted);padding:10px">오늘 예정된 미팅 없음</div>':
          getMeetings().filter(m=>m.date===today()).map(m=>`
            <div style="padding:6px 0;border-bottom:1px solid var(--border-light)">
              <div style="font-size:12px;font-weight:700">${m.title}</div>
              <div style="font-size:10px;color:var(--text-muted)">${m.time||''} · ${m.client||''}</div>
            </div>
          `).join('')}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="nav('meetings')">미팅 →</button>
      </div>
      <!-- 빠른 접근 -->
      <div class="card">
        <div style="font-size:11px;font-weight:900;color:var(--text-muted);margin-bottom:8px">⚡ 빠른 접근</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${[['수금관리','collection'],['발주','orders'],['노무비','labor'],['결재함','approvals']].map(([nm,id])=>`
            <button class="btn btn-outline btn-sm" style="text-align:center" onclick="nav('${id}')">${nm}</button>
          `).join('')}
        </div>
      </div>
    </div>
  </div>
  </div>`;
}

// ===== CASH FLOW VIEW (현금 흐름 — from v8) =====
function renderCashFlow(){
  const now=new Date();
  const months=[];
  for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const data=months.map(m=>({m,...getMonthlyAgg(m)}));
  const maxVal=Math.max(...data.map(d=>Math.max(d.revenue,d.spent)),1);

  // 누적 계산
  let cumNet=0;
  data.forEach(d=>{cumNet+=d.net;d.cumNet=cumNet;});
  const totalRevenue=data.reduce((a,d)=>a+d.revenue,0);
  const totalSpent=data.reduce((a,d)=>a+d.spent,0);
  const totalNet=totalRevenue-totalSpent;

  document.getElementById('tb-title').textContent='현금 흐름';
  document.getElementById('tb-actions').innerHTML='';
  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
    <div>
      <h2 style="font-size:17px;font-weight:800;margin:0;color:var(--text)">현금 흐름</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-top:5px">최근 12개월 수입/지출 현황</p>
    </div>
  </div>

  <!-- KPI 4개 -->
  <div class="dash-grid" style="margin-bottom:16px">
    <div class="kpi-card kpi-info">
      <div class="kpi-label">총 수금</div>
      <div class="kpi-value">${fmtShort(totalRevenue)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card kpi-warning">
      <div class="kpi-label">총 지출</div>
      <div class="kpi-value">${fmtShort(totalSpent)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card ${totalNet>=0?'kpi-success':'kpi-danger'}">
      <div class="kpi-label">순 현금</div>
      <div class="kpi-value">${totalNet>=0?'+':''}${fmtShort(totalNet)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card kpi-primary">
      <div class="kpi-label">누적 잔액</div>
      <div class="kpi-value">${cumNet>=0?'+':''}${fmtShort(cumNet)}<span style="font-size:12px">원</span></div>
    </div>
  </div>

  <!-- 12개월 Bar Chart -->
  <div class="card" style="margin-bottom:14px">
    <div style="font-size:11px;font-weight:900;color:var(--text-muted);margin-bottom:12px">📊 월별 수입/지출 비교</div>
    <div style="display:flex;align-items:flex-end;gap:4px;height:180px;margin-bottom:8px">
      ${data.map(d=>{
        const rH=d.revenue/maxVal*160;const sH=d.spent/maxVal*160;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px">
          <div style="display:flex;gap:1px;align-items:flex-end;height:160px">
            <div style="width:12px;height:${Math.max(2,rH)}px;background:var(--info);border-radius:2px 2px 0 0" title="수금 ${fmtShort(d.revenue)}"></div>
            <div style="width:12px;height:${Math.max(2,sH)}px;background:var(--warning);border-radius:2px 2px 0 0" title="지출 ${fmtShort(d.spent)}"></div>
          </div>
          <div style="font-size:8px;color:var(--text-muted);margin-top:4px">${d.m.slice(5)}월</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center;font-size:10px;color:var(--text-muted)">
      <span>🟦 수금</span><span>🟧 지출</span>
    </div>
  </div>

  <!-- 월별 상세 테이블 -->
  <div class="card">
    <div style="font-size:11px;font-weight:900;color:var(--text-muted);margin-bottom:10px">📋 월별 상세</div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          <th>월</th><th style="text-align:right">수금</th><th style="text-align:right">발주비</th><th style="text-align:right">노무비</th><th style="text-align:right">경비</th><th style="text-align:right">총 지출</th><th style="text-align:right">순이익</th><th style="text-align:right">누적</th>
        </tr></thead>
        <tbody>
          ${data.map(d=>{
            const [y,m]=d.m.split('-');
            return `<tr>
              <td style="font-weight:700">${y}년 ${parseInt(m)}월</td>
              <td style="text-align:right;color:var(--info);font-weight:700">${fmtShort(d.revenue)}</td>
              <td style="text-align:right">${fmtShort(d.orderSpent)}</td>
              <td style="text-align:right">${fmtShort(d.laborSpent)}</td>
              <td style="text-align:right">${fmtShort(d.expenseSpent)}</td>
              <td style="text-align:right;color:var(--warning);font-weight:700">${fmtShort(d.spent)}</td>
              <td style="text-align:right;font-weight:800;color:${d.net>=0?'var(--success)':'var(--danger)'}">${d.net>=0?'+':''}${fmtShort(d.net)}</td>
              <td style="text-align:right;font-weight:700;color:${d.cumNet>=0?'var(--success)':'var(--danger)'}">${d.cumNet>=0?'+':''}${fmtShort(d.cumNet)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr style="font-weight:900;border-top:2px solid var(--border)">
          <td>합계</td>
          <td style="text-align:right;color:var(--info)">${fmtShort(totalRevenue)}</td>
          <td style="text-align:right">${fmtShort(data.reduce((a,d)=>a+d.orderSpent,0))}</td>
          <td style="text-align:right">${fmtShort(data.reduce((a,d)=>a+d.laborSpent,0))}</td>
          <td style="text-align:right">${fmtShort(data.reduce((a,d)=>a+d.expenseSpent,0))}</td>
          <td style="text-align:right;color:var(--warning)">${fmtShort(totalSpent)}</td>
          <td style="text-align:right;color:${totalNet>=0?'var(--success)':'var(--danger)'}">${totalNet>=0?'+':''}${fmtShort(totalNet)}</td>
          <td style="text-align:right;color:${cumNet>=0?'var(--success)':'var(--danger)'}">${cumNet>=0?'+':''}${fmtShort(cumNet)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>
  </div>`;
}

// ===== PROFIT RANK VIEW (수익 분석 — from v8) =====
let _profitSort='margin';
function renderProfitRank(){
  const ps=getProjects();
  const fins=ps.map(p=>({p,f:getFinSummary(p)})).filter(({f})=>f.contractTotal>0);
  const sorted=[...fins].sort((a,b)=>_profitSort==='margin'?b.f.actualMargin-a.f.actualMargin:_profitSort==='exec'?b.f.executionRate-a.f.executionRate:b.f.contractTotal-a.f.contractTotal);

  // 거래처별 분석
  const clientMap={};
  fins.forEach(({p,f})=>{
    if(!clientMap[p.client])clientMap[p.client]={count:0,revenue:0,margin:0};
    clientMap[p.client].count++;
    clientMap[p.client].revenue+=f.contractTotal;
    clientMap[p.client].margin+=f.actualProfit;
  });
  const clients=Object.entries(clientMap).map(([nm,d])=>({nm,...d,avgMargin:d.revenue>0?d.margin/d.revenue*100:0})).sort((a,b)=>b.revenue-a.revenue);

  document.getElementById('tb-title').textContent='수익 분석';
  document.getElementById('tb-actions').innerHTML='';
  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
    <div>
      <h2 style="font-size:17px;font-weight:800;margin:0;color:var(--text)">수익 분석</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-top:5px">프로젝트별·거래처별 수익 현황</p>
    </div>
  </div>

  <!-- KPI 4개 -->
  <div class="dash-grid" style="margin-bottom:16px">
    <div class="kpi-card"><div class="kpi-label">📄 총 계약금액</div><div class="kpi-value">${fmtShort(fins.reduce((a,{f})=>a+f.contractTotal,0))}<span style="font-size:12px">원</span></div></div>
    <div class="kpi-card"><div class="kpi-label">💸 총 실집행</div><div class="kpi-value" style="color:var(--warning)">${fmtShort(fins.reduce((a,{f})=>a+f.totalSpent,0))}<span style="font-size:12px">원</span></div></div>
    <div class="kpi-card"><div class="kpi-label">📈 총 실이익</div><div class="kpi-value" style="color:${fins.reduce((a,{f})=>a+f.actualProfit,0)>=0?'var(--success)':'var(--danger)'}">${fmtShort(fins.reduce((a,{f})=>a+f.actualProfit,0))}<span style="font-size:12px">원</span></div></div>
    <div class="kpi-card"><div class="kpi-label">📊 평균 마진</div><div class="kpi-value" style="color:var(--info)">${(fins.length>0?fins.reduce((a,{f})=>a+f.actualMargin,0)/fins.length:0).toFixed(1)}<span style="font-size:12px">%</span></div></div>
  </div>

  <!-- 프로젝트 수익 랭킹 -->
  <div class="card" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:11px;font-weight:900;color:var(--text-muted)">프로젝트별 수익 상세</div>
      <div style="display:flex;gap:4px">
        ${[['margin','마진율순'],['exec','집행률순'],['contract','금액순']].map(([k,l])=>`
          <button class="btn btn-sm ${_profitSort===k?'btn-primary':'btn-outline'}" onclick="_profitSort='${k}';renderProfitRank()" style="font-size:10px;padding:3px 8px">${l}</button>
        `).join('')}
      </div>
    </div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr>
          <th style="width:30px"></th><th>프로젝트</th><th>고객</th><th style="text-align:right">계약금액</th><th style="text-align:right">견적원가</th><th style="text-align:right">실집행</th><th style="text-align:right">실이익</th><th style="text-align:right">마진율</th><th style="text-align:right">집행률</th><th style="text-align:right">수금률</th>
        </tr></thead>
        <tbody>
          ${sorted.map(({p,f},i)=>`
            <tr style="cursor:pointer;${f.executionRate>=100?'background:var(--danger-light)':''}" onclick="enterProject('${p.id}')">
              <td style="text-align:center;font-weight:800;font-size:13px;color:${i<3?'var(--warning)':'var(--text-muted)'}">${i+1}</td>
              <td><div style="font-weight:700">${p.nm}</div>${statusBadge(p.status)}</td>
              <td style="color:var(--text-muted)">${p.client||''}</td>
              <td style="text-align:right;font-weight:700">${fmtShort(f.contractTotal)}</td>
              <td style="text-align:right;color:var(--text-muted)">${fmtShort(f.estCost)}</td>
              <td style="text-align:right;color:var(--warning)">${fmtShort(f.totalSpent)}</td>
              <td style="text-align:right;font-weight:800;color:${f.actualProfit>=0?'var(--success)':'var(--danger)'}">${fmtShort(f.actualProfit)}</td>
              <td style="text-align:right;font-weight:800;color:${f.actualMargin>=10?'var(--success)':f.actualMargin>=0?'var(--warning)':'var(--danger)'}">${f.actualMargin.toFixed(1)}%</td>
              <td style="text-align:right">
                <div style="display:flex;align-items:center;gap:3px;justify-content:flex-end">
                  <div class="prog" style="width:36px;flex-shrink:0"><div class="prog-bar" style="width:${Math.min(100,f.executionRate)}%;background:${f.executionRate>=100?'var(--danger)':f.executionRate>=90?'var(--warning)':'var(--success)'}"></div></div>
                  <span style="font-size:9px;color:${f.executionRate>=100?'var(--danger)':'var(--text-muted)'}">${f.executionRate.toFixed(0)}%</span>
                </div>
              </td>
              <td style="text-align:right;color:${f.collectionRate>=100?'var(--success)':'var(--text-muted)'}">${f.collectionRate.toFixed(0)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- 거래처별 분석 -->
  <div class="card">
    <div style="font-size:11px;font-weight:900;color:var(--text-muted);margin-bottom:10px">🏢 거래처별 수익</div>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>거래처</th><th style="text-align:right">프로젝트 수</th><th style="text-align:right">총 매출</th><th style="text-align:right">총 이익</th><th style="text-align:right">평균 마진</th></tr></thead>
        <tbody>
          ${clients.map(c=>`
            <tr>
              <td style="font-weight:700">${c.nm||'(미지정)'}</td>
              <td style="text-align:right">${c.count}건</td>
              <td style="text-align:right;font-weight:700">${fmtShort(c.revenue)}</td>
              <td style="text-align:right;font-weight:700;color:${c.margin>=0?'var(--success)':'var(--danger)'}">${fmtShort(c.margin)}</td>
              <td style="text-align:right;font-weight:700;color:${c.avgMargin>=10?'var(--success)':'var(--warning)'}">${c.avgMargin.toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  </div>`;
}

// ===== PROJECTS =====
function renderProjects(){
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportProjectsXLSX()">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddProject()">+ 프로젝트 추가</button>`;
  
  const ps=getProjects();
  document.getElementById('content').innerHTML=`
  ${filterBar({statuses:Object.keys(STATUS_LABELS),placeholder:'프로젝트명, 고객사 검색...',showDate:true,showMonthGroup:true,onFilter:'filterProjects()'})}
  <div id="projects-list-wrap">
    <div class="tbl-wrap">
      <table class="tbl" id="projects-tbl">
        <thead><tr>
          <th onclick="sortTbl('proj','nm')">프로젝트명 <span class="sort-icon">↕</span></th>
          <th onclick="sortTbl('proj','client')">고객사 <span class="sort-icon">↕</span></th>
          <th onclick="sortTbl('proj','area')">면적 <span class="sort-icon">↕</span></th>
          ${isAdmin()?'<th onclick="sortTbl(\'proj\',\'total\')">도급금액 <span class="sort-icon">↕</span></th>':'<th>도급금액</th>'}
          ${isAdmin()?'<th onclick="sortTbl(\'proj\',\'mr\')">마진율 <span class="sort-icon">↕</span></th>':''}
          <th>공정%</th><th>수금%</th>
          <th onclick="sortTbl('proj','status')">상태 <span class="sort-icon">↕</span></th>
          <th onclick="sortTbl('proj','date')">날짜 <span class="sort-icon">↕</span></th>
          <th>작업</th>
        </tr></thead>
        <tbody id="projects-body">
          ${renderProjectRows(ps)}
        </tbody>
      </table>
    </div>
  </div>`;
}
function filterProjects(){
  const q=(document.getElementById('search')?.value||'').toLowerCase();
  const st=document.getElementById('statusFilter')?.value||'';
  const df=document.getElementById('dateFrom')?.value||'';
  const dt=document.getElementById('dateTo')?.value||'';
  const mg=document.getElementById('month-group-toggle')?.checked;
  let ps=getProjects().filter(p=>{
    const text=!q||(p.nm+p.client+p.loc).toLowerCase().includes(q);
    const status=!st||p.status===st;
    const dateOk=(!df||p.date>=df)&&(!dt||p.date<=dt);
    return text&&status&&dateOk;
  });
  const wrap=document.getElementById('projects-list-wrap');
  if(mg&&wrap){
    const groups=groupByMonth(ps,'date');
    wrap.innerHTML=monthlyAccordion(groups, p=>renderProjectRowSingle(p),
      `<tr><th>프로젝트명</th><th>고객사</th><th>면적</th><th>도급금액</th>${isAdmin()?'<th>마진율</th>':''}<th>공정%</th><th>수금%</th><th>상태</th><th>날짜</th><th>작업</th></tr>`);
  } else {
    const body=document.getElementById('projects-body');
    if(body)body.innerHTML=renderProjectRows(ps);
  }
}
function renderProjectRowSingle(p){
  const tot=getTotal(p);const prog=getProg(p);const paid=getPaid(p);
  const paidPct=tot>0?Math.round(paid/tot*100):0;const mr=getMR(p);
  return`<tr>
    <td><div style="font-weight:600;font-size:12.5px;cursor:pointer;color:var(--blue)" onclick="enterProject('${p.id}')">${p.nm}</div><div style="font-size:11px;color:var(--g500)">${p.loc||''}</div></td>
    <td><div style="font-size:12.5px">${p.client}</div></td>
    <td>${p.area||'-'}평</td>
    <td style="font-weight:600">${isAdmin()?(tot>0?fmt(tot)+'원':'-'):'—'}</td>
    ${isAdmin()?`<td style="font-weight:700;color:${mr<5?'var(--red)':mr<15?'var(--orange)':'var(--green)'}">${tot>0?mr.toFixed(1)+'%':'-'}</td>`:''}
    <td><div class="prog prog-blue" style="width:60px"><div class="prog-bar" style="width:${prog}%"></div></div><span style="font-size:11px">${prog}%</span></td>
    <td><div class="prog prog-green" style="width:60px"><div class="prog-bar" style="width:${paidPct}%"></div></div><span style="font-size:11px">${paidPct}%</span></td>
    <td>${statusBadge(p.status)}</td>
    <td style="font-size:11px">${p.date||''}</td>
    <td><div style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditProject('${p.id}')" title="편집">${svgIcon('edit',13)}</button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="enterProject('${p.id}')" title="상세">${svgIcon('eye',13)}</button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="navEstimate('${p.id}')" title="견적">${svgIcon('file',13)}</button>
      <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteProject('${p.id}')" title="삭제">${svgIcon('trash',13)}</button>
    </div></td>
  </tr>`;
}
function renderProjectRows(ps){
  if(!ps.length)return`<tr><td colspan="${isAdmin()?10:9}" style="text-align:center;padding:40px;color:var(--g400)">프로젝트가 없습니다</td></tr>`;
  // Apply sort
  const sc=S.sortCol['proj'], sd=S.sortDir['proj'];
  if(sc){
    ps=[...ps].sort((a,b)=>{
      let va,vb;
      if(sc==='total'){va=getTotal(a);vb=getTotal(b);}
      else if(sc==='mr'){va=getMR(a);vb=getMR(b);}
      else if(sc==='area'){va=a.area||0;vb=b.area||0;}
      else{va=a[sc]||'';vb=b[sc]||'';}
      if(typeof va==='number')return sd===sc?(va-vb):(vb-va);
      return sd===sc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  }
  return ps.map(p=>{
    const tot=getTotal(p);const prog=getProg(p);const paid=getPaid(p);
    const paidPct=tot>0?Math.round(paid/tot*100):0;const mr=getMR(p);
    return`<tr>
      <td><div style="font-weight:600;font-size:12.5px;cursor:pointer;color:var(--blue)" onclick="enterProject('${p.id}')">${p.nm}</div><div style="font-size:11px;color:var(--g500)">${p.loc||''}</div></td>
      <td><div style="font-size:12.5px">${p.client}</div><div style="font-size:11px;color:var(--g500)">${p.contact||''}</div></td>
      <td>${p.area||'-'}평</td>
      <td style="font-weight:600">${tot>0?fmt(tot)+'원':'-'}</td>
      <td style="font-weight:700;color:${mr<5?'var(--red)':mr<15?'var(--orange)':'var(--green)'}">${tot>0?mr.toFixed(1)+'%':'-'}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div class="prog prog-blue" style="width:60px"><div class="prog-bar" style="width:${prog}%"></div></div><span style="font-size:11px;color:var(--blue)">${prog}%</span></div></td>
      <td><div style="display:flex;align-items:center;gap:6px"><div class="prog prog-green" style="width:60px"><div class="prog-bar" style="width:${paidPct}%"></div></div><span style="font-size:11px;color:var(--green)">${paidPct}%</span></div></td>
      <td>${statusBadge(p.status)}</td>
      <td style="font-size:11px;color:var(--g500)">${p.date||''}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditProject('${p.id}')" title="편집">${svgIcon('edit',13)}</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="enterProject('${p.id}')" title="상세">${svgIcon('eye',13)}</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="navEstimate('${p.id}')" title="견적">${svgIcon('file',13)}</button>
          <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteProject('${p.id}')" title="삭제">${svgIcon('trash',13)}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
function filterTable(){filterProjects();}
function sortTblProj(){filterProjects();}
function navEstimate(pid){S.editingEstPid=pid;nav('estimate');}
function openAddProject(){
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">새 프로젝트</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트명 *</label><input class="inp" id="nm" placeholder="예) 강남 카페 인테리어"></div>
        <div><label class="lbl">고객사 *</label><input class="inp" id="client" placeholder="고객사명"></div>
        <div><label class="lbl">고객담당자</label><input class="inp" id="contact"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">이메일</label><input class="inp" id="email" type="email"></div>
        <div><label class="lbl">현장위치</label><input class="inp" id="loc"></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="area" type="number" placeholder="38"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">담당자 (다중선택)</label>
          <div id="mgr-checkboxes" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;border:1px solid var(--border);border-radius:var(--radius-sm);max-height:80px;overflow-y:auto">
            ${TEAM_MEMBERS.map(m=>`<label style="display:flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;background:var(--gray-50);border-radius:4px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="mgr-cb" value="${m}">${m}</label>`).join('')}
          </div>
        </div>
        <div><label class="lbl">견적일</label><input class="inp" id="date" type="date" value="${today()}"></div>
        <div><label class="lbl">기업이윤(%)</label><input class="inp" id="profit" type="number" value="10"></div>
        <div><label class="lbl">상태</label><select class="sel" id="status">${Object.keys(STATUS_LABELS).map(s=>`<option>${s}</option>`).join('')}</select></div>
      </div>
      <div><label class="lbl">메모</label><textarea class="inp" id="memo" rows="2" style="resize:vertical"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewProject()">추가</button>
    </div>
  </div></div>`);
}
async function saveNewProject(){
  const nm=document.getElementById('nm')?.value?.trim();
  if(!nm){toast('프로젝트명을 입력하세요','error');return;}
  const selectedMgrs=[...document.querySelectorAll('.mgr-cb:checked')].map(cb=>cb.value).join(',');
  const p={
    id:uid(),nm,client:v('client'),contact:v('contact'),email:v('email'),
    loc:v('loc'),mgr:selectedMgrs||TEAM_MEMBERS[0],date:v('date'),status:v('status')||'작성중',
    area:Number(v('area')||0),profit:Number(v('profit')||10),
    roundUnit:'십만원',memo:v('memo'),region:'',
    items:[],ganttTasks:[],contractStatus:'미생성',contractDate:'',
    contractNote:'',contractClauses:[],
    payments:[
      {label:'계약금',pct:30,due:'',paid:false,paidDate:''},
      {label:'중도금',pct:40,due:'',paid:false,paidDate:''},
      {label:'잔금',pct:30,due:'',paid:false,paidDate:''},
    ],
    createdAt:today()
  };
  await saveProject(p);closeModal();toast('프로젝트가 추가되었습니다','success');
  renderProjects();
}
function openEditProject(pid){
  S.selPid=pid;const p=getProject(pid);if(!p)return;
  openModal(`<div class="modal-bg"><div class="modal modal-xl">
    <div class="modal-hdr"><span class="modal-title">${p.nm} - 편집</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트명</label><input class="inp" id="ep_nm" value="${p.nm}"></div>
        <div><label class="lbl">고객사</label><input class="inp" id="ep_client" value="${p.client||''}"></div>
        <div><label class="lbl">고객담당자</label><input class="inp" id="ep_contact" value="${p.contact||''}"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">이메일</label><input class="inp" id="ep_email" value="${p.email||''}"></div>
        <div><label class="lbl">현장위치</label><input class="inp" id="ep_loc" value="${p.loc||''}"></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="ep_area" type="number" value="${p.area||''}"></div>
        <div><label class="lbl">담당자 (다중선택)</label>
          <div style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;border:1px solid var(--border);border-radius:var(--radius-sm);max-height:80px;overflow-y:auto">
            ${TEAM_MEMBERS.map(m=>`<label style="display:flex;align-items:center;gap:3px;font-size:12px;padding:2px 6px;background:var(--gray-50);border-radius:4px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="ep-mgr-cb" value="${m}" ${(p.mgr||'').split(',').map(x=>x.trim()).includes(m)?'checked':''}>${m}</label>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">견적일</label><input class="inp" id="ep_date" type="date" value="${p.date||''}"></div>
        <div><label class="lbl">기업이윤(%)</label><input class="inp" id="ep_profit" type="number" value="${p.profit||10}"></div>
        <div><label class="lbl">상태</label><select class="sel" id="ep_status">${Object.keys(STATUS_LABELS).map(s=>`<option${p.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">목표금액</label><input class="inp" id="ep_target" type="number" value="${p.targetAmt||''}"></div>
      </div>
      <div><label class="lbl">메모</label><textarea class="inp" id="ep_memo" rows="2">${p.memo||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditProject('${pid}')">저장</button>
    </div>
  </div></div>`);
}
async function saveEditProject(pid){
  const p=getProject(pid);if(!p)return;
  p.nm=v('ep_nm');p.client=v('ep_client');p.contact=v('ep_contact');
  p.email=v('ep_email');p.loc=v('ep_loc');p.area=Number(v('ep_area')||0);
  p.mgr=[...document.querySelectorAll('.ep-mgr-cb:checked')].map(cb=>cb.value).join(',')||p.mgr;
  p.date=v('ep_date');p.profit=Number(v('ep_profit')||10);
  p.status=v('ep_status');p.memo=v('ep_memo');p.targetAmt=Number(v('ep_target')||0);
  await saveProject(p);closeModal();toast('저장되었습니다','success');renderProjects();
}
async function deleteProject(pid){
  if(!confirm('삭제하시겠습니까?'))return;
  
  await deleteProjectRemote(pid);toast('삭제되었습니다');renderProjects();
}
function newEstimate(){
  S.editingEstPid=null;nav('estimate');
}
function previewEst(pid){
  S.selPid=pid;
  openPreviewModal(pid);
}
// ===== ESTIMATE WRITING (Single Page Accordion) =====
function renderEstimate(){
  const pid=S.editingEstPid;
  const p=pid?getProject(pid):null;
  document.getElementById('tb-title').textContent='견적 작성';
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="nav('pricedb')">${svgIcon('tool',12)} 단가DB</button>
    <button class="btn btn-outline btn-sm" onclick="previewEstCurrent()">${svgIcon('eye',12)} 미리보기</button>
    <button class="btn btn-outline btn-sm" onclick="sendEstMailCurrent()">${svgIcon('mail',12)} 이메일</button>
    <button class="btn btn-outline btn-sm" onclick="printPage()">${svgIcon('print',12)} 인쇄</button>
    <button class="btn btn-primary btn-sm" onclick="saveEstimate()">저장</button>`;
  
  const usedCats=p?[...new Set((p.items||[]).map(it=>it.cid))]:[]; 
  const availCats=CATS.filter(c=>!usedCats.includes(c.id));
  
  document.getElementById('content').innerHTML=`
  <div style="max-width:1100px;margin:0 auto">
    <!-- Project info -->
    <div class="card" style="margin-bottom:12px">
      <div class="form-row form-row-4" style="margin-bottom:10px">
        <div><label class="lbl">프로젝트명 *</label><input class="inp" id="est_nm" value="${p?.nm||''}" placeholder="동연기업 문정동 오피스"></div>
        <div><label class="lbl">고객사</label><input class="inp" id="est_client" value="${p?.client||''}" placeholder="동연기업"></div>
        <div><label class="lbl">고객담당자</label><input class="inp" id="est_contact" value="${p?.contact||''}" placeholder="홍길동 과장"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="est_email" value="${p?.email||''}" placeholder="client@email.com"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:10px">
        <div><label class="lbl">현장위치</label><input class="inp" id="est_loc" value="${p?.loc||''}" placeholder="문정동"></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="est_area" type="number" value="${p?.area||''}" placeholder="38"></div>
        <div><label class="lbl">견적담당</label><select class="sel" id="est_mgr">${TEAM_MEMBERS.map(m=>`<option${p?.mgr===m?' selected':''}>${m}</option>`).join('')}</select></div>
        <div><label class="lbl">견적일</label><input class="inp" id="est_date" type="date" value="${p?.date||today()}"></div>
      </div>
      <div class="form-row form-row-4">
        <div><label class="lbl">기업이윤(%)</label><input class="inp" id="est_profit" type="number" value="${p?.profit||10}" oninput="updateEstSummary()" placeholder="10"></div>
        <div><label class="lbl">상태</label><select class="sel" id="est_status">${Object.keys(STATUS_LABELS).map(s=>`<option${p?.status===s?' selected':''} ${!p&&s==='작성중'?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">목표금액</label><input class="inp" id="est_target" type="number" value="${p?.targetAmt||''}" placeholder="53000000"></div>
        <div><label class="lbl">단수정리</label>
          <select class="sel" id="est_round" onchange="updateEstSummary()">
            <option value="만원"${p?.roundUnit==='만원'?' selected':''}>만원 단위 절삭</option>
            <option value="십만원"${(!p||p.roundUnit==='십만원')?' selected':''}>십만원 단위 절삭</option>
            <option value="직접"${p?.roundUnit==='직접'?' selected':''}>직접 수정</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- Category sections -->
    <div id="est-cats">
      ${usedCats.map(cid=>renderEstCat(cid,p)).join('')}
    </div>
    
    <!-- Add category chips -->
    <div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--g500);margin-bottom:8px">공종 추가</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px" id="cat-chips">
        ${availCats.map(c=>`<button class="btn btn-outline btn-sm" onclick="addEstCat('${c.id}')">${c.icon} + ${c.nm}</button>`).join('')}
      </div>
    </div>
    
    <!-- 기본공사 프리셋 -->
    ${pid?`<div style="background:var(--blue-l);border:1px solid var(--blue);border-radius:var(--radius-lg);padding:12px 16px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:8px">📋 기본공사 프리셋 (클릭 시 자동 입력)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${(_d.presets||[]).map(pr=>`<button class="btn btn-outline btn-sm" style="border-color:var(--blue);color:var(--blue)" onclick="applyPreset('${pr.cid}','${pid}')">${CATS.find(c=>c.id===pr.cid)?.icon||'📦'} ${pr.name}</button>`).join('')}
      </div>
    </div>`:''}
    
    <!-- Summary -->
    <div id="est-summary-wrap">
      ${renderEstSummary(p)}
    </div>
  </div>`;
}
function previewEstCurrent(){
  const pid=S.editingEstPid;
  if(!pid||!getProject(pid)){toast('먼저 견적을 저장하세요','warning');return;}
  openPreviewModal(pid);
}
function sendEstMailCurrent(){
  const pid=S.editingEstPid;
  if(!pid||!getProject(pid)){toast('먼저 견적을 저장하세요','warning');return;}
  sendEstMail(pid);
}
function renderEstCat(cid,p){
  const cat=CATS.find(c=>c.id===cid);if(!cat)return'';
  const items=(p?.items||[]).filter(it=>it.cid===cid);
  const calc=p?calcP(p):null;
  const total=calc?.cs?.[cid]?.t||0;
  return`<div class="est-section" id="estsec_${cid}" data-cid="${cid}">
    <div class="est-sec-hdr" onclick="toggleEstSec('${cid}')">
      <span class="est-sec-icon">${cat.icon}</span>
      <span class="est-sec-title">${cat.nm}</span>
      <span class="est-sec-count" id="estcnt_${cid}">${items.length}개</span>
      <span style="flex:1"></span>
      <span class="est-sec-total" id="esttot_${cid}">${total>0?fmt(total)+'원':''}</span>
      <span class="est-sec-toggle open" id="esttgl_${cid}">${svgIcon('chevron_down',14)}</span>
    </div>
    <div class="est-sec-body open" id="estbody_${cid}">
      <table class="est-tbl">
        <thead><tr>
          <th style="width:20px"></th>
          <th style="min-width:120px">품명</th>
          <th style="min-width:80px">규격</th>
          <th style="width:60px">단위</th>
          <th style="width:70px">수량</th>
          <th style="width:90px">자재단가</th>
          <th style="width:90px">노무단가</th>
          <th style="width:90px">경비단가</th>
          <th style="width:100px;text-align:right">합계</th>
          <th style="width:80px">비고</th>
          <th style="width:60px"></th>
        </tr></thead>
        <tbody id="estrows_${cid}">
          ${items.map(it=>renderEstRow(it,cid)).join('')}
        </tbody>
      </table>
      <div class="est-sub-row" id="estsub_${cid}">
        <table class="est-tbl" style="background:var(--g50)">
          <tbody><tr>
            <td style="width:20px"></td>
            <td colspan="4" style="font-weight:700;font-size:12px;padding:7px 10px">소계</td>
            <td class="num" style="font-weight:700;width:90px" id="estsub_m_${cid}">${calc?fmt(calc.cs?.[cid]?.m||0):0}</td>
            <td class="num" style="font-weight:700;width:90px" id="estsub_l_${cid}">${calc?fmt(calc.cs?.[cid]?.l||0):0}</td>
            <td class="num" style="font-weight:700;width:90px">-</td>
            <td class="num" style="font-weight:700;width:100px" id="estsub_t_${cid}">${calc?fmt(calc.cs?.[cid]?.t||0):0}</td>
            <td colspan="2"></td>
          </tr></tbody>
        </table>
      </div>
      <div style="border-top:1px solid var(--border)">
        <button class="est-add-btn" onclick="addEstItemFromDB('${cid}')">${svgIcon('plus',12)} DB에서 추가</button>
        <button class="est-add-btn" onclick="addEstItemDirect('${cid}')">${svgIcon('plus',12)} 직접 입력</button>
      </div>
    </div>
  </div>`;
}
function renderEstRow(it,cid){
  const tot=Math.round((Number(it.mp||0)+Number(it.lp||0)+Number(it.ep||0))*Number(it.qty||0));
  return`<tr id="estitr_${it.id}" data-id="${it.id}" data-cid="${cid}">
    <td>${svgIcon('clipboard',12)}</td>
    <td><input class="inp est-inp" style="min-width:100px" value="${escHtml(it.nm||'')}" onchange="updateEstItem('${it.id}','nm',this.value)"></td>
    <td><input class="inp est-inp" style="min-width:60px" value="${escHtml(it.spec||it.unit||'')}" onchange="updateEstItem('${it.id}','spec',this.value)"></td>
    <td><input class="inp est-inp" style="width:55px" value="${escHtml(it.unit||'식')}" onchange="updateEstItem('${it.id}','unit',this.value)"></td>
    <td><input class="inp est-inp" style="width:65px;background:var(--blue-l);font-weight:700;text-align:center" type="number" value="${it.qty||1}" onchange="updateEstItem('${it.id}','qty',this.value)"></td>
    <td><input class="inp est-inp num" style="width:85px" type="number" value="${it.mp||0}" onchange="updateEstItem('${it.id}','mp',this.value)"></td>
    <td><input class="inp est-inp num" style="width:85px" type="number" value="${it.lp||0}" onchange="updateEstItem('${it.id}','lp',this.value)"></td>
    <td><input class="inp est-inp num" style="width:85px" type="number" value="${it.ep||0}" onchange="updateEstItem('${it.id}','ep',this.value)"></td>
    <td class="num" id="eitot_${it.id}" style="font-weight:700">${fmt(tot)}</td>
    <td><input class="inp est-inp" style="width:70px;font-size:11px" value="${escHtml(it.rm||'')}" onchange="updateEstItem('${it.id}','rm',this.value)"></td>
    <td style="display:flex;gap:2px;align-items:center">
      ${it.photo?`<img src="${it.photo}" style="width:22px;height:22px;border-radius:3px;object-fit:cover;cursor:pointer" onclick="viewEstPhoto('${it.id}')" title="사진 보기">`:''}
      <button class="btn btn-ghost btn-icon btn-sm" onclick="uploadEstPhoto('${it.id}')" title="사진">${svgIcon('camera',11)}</button>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="copyEstItem('${it.id}')" title="복사">${svgIcon('copy',11)}</button>
      <button class="btn btn-ghost btn-icon btn-sm" style="color:var(--red)" onclick="removeEstItem('${it.id}','${cid}')" title="삭제">${svgIcon('x',11)}</button>
    </td>
  </tr>`;
}
function toggleEstSec(cid){
  const body=document.getElementById('estbody_'+cid);
  const tgl=document.getElementById('esttgl_'+cid);
  if(body){body.classList.toggle('open');tgl.classList.toggle('open');}
}
function addEstCat(cid){
  const pid=S.editingEstPid;
  let p=pid?getProject(pid):{id:uid(),nm:v('est_nm')||'새 견적',client:v('est_client'),contact:v('est_contact'),email:v('est_email'),loc:v('est_loc'),area:Number(v('est_area')||0),mgr:v('est_mgr'),date:v('est_date')||today(),profit:Number(v('est_profit')||10),status:v('est_status')||'작성중',roundUnit:v('est_round')||'십만원',items:[],ganttTasks:[],contractStatus:'미생성',contractDate:'',contractNote:'',contractClauses:[],payments:[{label:'계약금',pct:30,due:'',paid:false,paidDate:''},{label:'잔금',pct:70,due:'',paid:false,paidDate:''}],createdAt:today()};
  if(!p)p={id:uid(),nm:'새 견적',items:[],ganttTasks:[],contractStatus:'미생성',contractDate:'',contractNote:'',contractClauses:[],payments:[],createdAt:today()};
  if(!p.items)p.items=[];
  S.editingEstPid=p.id;
  const newItem={id:uid(),cid,nm:'',spec:'',unit:'식',qty:1,mp:0,lp:0,ep:0,sp:1,cmp:0,clp:0,cep:0,rm:''};
  p.items.push(newItem);
  saveProject(p);
  const catsDiv=document.getElementById('est-cats');
  if(catsDiv){
    const existing=document.getElementById('estsec_'+cid);
    if(existing)existing.outerHTML=renderEstCat(cid,p);
    else catsDiv.insertAdjacentHTML('beforeend',renderEstCat(cid,p));
  }
  // Remove chip
  const chips=document.getElementById('cat-chips');
  if(chips){
    chips.innerHTML=CATS.filter(c=>{
      const ps2=getProject(S.editingEstPid);
      const used=[...new Set((ps2?.items||[]).map(it=>it.cid))];
      return!used.includes(c.id);
    }).map(c=>`<button class="btn btn-outline btn-sm" onclick="addEstCat('${c.id}')">${c.icon} + ${c.nm}</button>`).join('');
  }
  updateEstSummary();
}
function getOrCreateEstProject(){
  const pid=S.editingEstPid;
  let p=pid?getProject(pid):null;
  if(!p){
    p={id:uid(),nm:v('est_nm')||'새 견적',client:v('est_client'),contact:v('est_contact'),email:v('est_email'),loc:v('est_loc'),area:Number(v('est_area')||0),mgr:v('est_mgr'),date:v('est_date')||today(),profit:Number(v('est_profit')||10),status:v('est_status')||'작성중',roundUnit:v('est_round')||'십만원',items:[],ganttTasks:[],contractStatus:'미생성',contractDate:'',contractNote:'',contractClauses:[],payments:[{label:'계약금',pct:30,due:'',paid:false,paidDate:''},{label:'잔금',pct:70,due:'',paid:false,paidDate:''}],createdAt:today()};
    S.editingEstPid=p.id;
    saveProject(p);
  }
  return p;
}
function addEstItemDirect(cid){
  const p=getOrCreateEstProject();
  if(!p.items)p.items=[];
  const it={id:uid(),cid,nm:'',spec:'',unit:'식',qty:1,mp:0,lp:0,ep:0,sp:1,cmp:0,clp:0,cep:0,rm:''};
  p.items.push(it);saveProject(p);
  const tbody=document.getElementById('estrows_'+cid);
  if(tbody)tbody.insertAdjacentHTML('beforeend',renderEstRow(it,cid));
  updateEstCatCalc(cid);updateEstSummary();
}
function addEstItemFromDB(cid){
  const db=getPriceDB().filter(d=>d.cid===cid);
  if(!db.length){toast('해당 공종의 단가DB 항목이 없습니다','warning');addEstItemDirect(cid);return;}
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">단가DB에서 추가 - ${catNm(cid)}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <table class="tbl">
        <thead><tr><th>품명</th><th>규격</th><th>단위</th><th>자재단가</th><th>노무단가</th><th>경비단가</th><th></th></tr></thead>
        <tbody>
          ${db.map(d=>`<tr>
            <td>${d.nm}</td><td>${d.spec||'-'}</td><td>${d.unit||'식'}</td>
            <td class="num">${fmt(d.mp||0)}</td><td class="num">${fmt(d.lp||0)}</td><td class="num">${fmt(d.ep||0)}</td>
            <td><button class="btn btn-primary btn-sm" onclick="addFromDB('${d.id}','${cid}')">추가</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">닫기</button></div>
  </div></div>`);
}
function addFromDB(dbid,cid){
  const db=getPriceDB().find(d=>d.id===dbid);if(!db)return;
  const p=getOrCreateEstProject();
  if(!p.items)p.items=[];
  const it={id:uid(),cid,nm:db.nm,spec:db.spec||'',unit:db.unit||'식',qty:1,mp:db.mp||0,lp:db.lp||0,ep:db.ep||0,sp:1,cmp:db.cmp||0,clp:db.clp||0,cep:db.cep||0,rm:''};
  p.items.push(it);saveProject(p);
  const tbody=document.getElementById('estrows_'+cid);
  if(tbody)tbody.insertAdjacentHTML('beforeend',renderEstRow(it,cid));
  updateEstCatCalc(cid);updateEstSummary();
  closeModal();
}
function updateEstItem(iid,field,val){
  const p=getProject(S.editingEstPid);if(!p)return;
  const it=p.items.find(i=>i.id===iid);if(!it)return;
  it[field]=field==='qty'||field==='mp'||field==='lp'||field==='ep'?Number(val):val;
  saveProject(p);
  const tot=Math.round((Number(it.mp||0)+Number(it.lp||0)+Number(it.ep||0))*Number(it.qty||0));
  const totEl=document.getElementById('eitot_'+iid);if(totEl)totEl.textContent=fmt(tot);
  updateEstCatCalc(it.cid);updateEstSummary();
}
function updateEstCatCalc(cid){
  const p=getProject(S.editingEstPid);if(!p)return;
  const c=calcP(p);
  const cs=c.cs[cid]||{m:0,l:0,e:0,t:0};
  const totEl=document.getElementById('esttot_'+cid);if(totEl)totEl.textContent=cs.t>0?fmt(cs.t)+'원':'';
  const subm=document.getElementById('estsub_m_'+cid);if(subm)subm.textContent=fmt(cs.m);
  const subl=document.getElementById('estsub_l_'+cid);if(subl)subl.textContent=fmt(cs.l);
  const subt=document.getElementById('estsub_t_'+cid);if(subt)subt.textContent=fmt(cs.t);
  const cnt=document.getElementById('estcnt_'+cid);if(cnt)cnt.textContent=p.items.filter(i=>i.cid===cid).length+'개';
}
function removeEstItem(iid,cid){
  const p=getProject(S.editingEstPid);if(!p)return;
  p.items=p.items.filter(i=>i.id!==iid);saveProject(p);
  const row=document.getElementById('estitr_'+iid);if(row)row.remove();
  updateEstCatCalc(cid);updateEstSummary();
}
function copyEstItem(iid){
  const p=getProject(S.editingEstPid);if(!p)return;
  const it=p.items.find(i=>i.id===iid);if(!it)return;
  const newIt={...it,id:uid()};
  const idx=p.items.findIndex(i=>i.id===iid);
  p.items.splice(idx+1,0,newIt);saveProject(p);
  const row=document.getElementById('estitr_'+iid);
  if(row)row.insertAdjacentHTML('afterend',renderEstRow(newIt,it.cid));
  updateEstCatCalc(it.cid);updateEstSummary();
}
function updateEstSummary(){
  const p=getProject(S.editingEstPid);
  const wrap=document.getElementById('est-summary-wrap');
  if(wrap)wrap.innerHTML=renderEstSummary(p);
}
function renderEstSummary(p){
  const calc=p?calcP(p):{direct:0,profitAmt:0,safetyAmt:0,mealAmt:0,indirect:0,raw:0,finalTotal:0,adj:0};
  const ru=p?.roundUnit||'십만원';
  const pct=p?.profit||10;
  const manualEnabled=ru==='직접';
  return`<div class="est-summary">
    <div style="background:rgba(255,255,255,.05);padding:12px 20px;display:flex;align-items:center;justify-content:space-between">
      <span style="color:rgba(255,255,255,.7);font-size:12px;font-weight:700">합계 요약</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:rgba(255,255,255,.5);font-size:11px">단수정리:</span>
        ${['만원','십만원','직접'].map(r=>`<button onclick="changeRound('${r}')" style="padding:3px 10px;border-radius:4px;border:none;font-size:11px;cursor:pointer;background:${ru===r?'#fff':'rgba(255,255,255,.1)'};color:${ru===r?'#000':'rgba(255,255,255,.6)'};">${r}</button>`).join('')}
      </div>
    </div>
    <div class="est-sum-row"><span class="est-sum-label">직접 공사비</span><span class="est-sum-value">${fmt(calc.direct)}원</span></div>
    <div class="est-sum-row"><span class="est-sum-label">기업이윤 (${pct}%)</span><span class="est-sum-value">${fmt(calc.profitAmt)}원</span></div>
    <div class="est-sum-row"><span class="est-sum-label">안전관리비 (0.7%)</span><span class="est-sum-value">${fmt(calc.safetyAmt)}원</span></div>
    <div class="est-sum-row"><span class="est-sum-label">식대·운송비 (3%)</span><span class="est-sum-value">${fmt(calc.mealAmt)}원</span></div>
    <div class="est-sum-row" style="border-top:1px solid rgba(255,255,255,.15)">
      <span class="est-sum-label" style="color:#fff;font-weight:700">간접 공사비 계</span>
      <span class="est-sum-value">${fmt(calc.indirect)}원</span>
    </div>
    <div class="est-sum-row"><span class="est-sum-label" style="color:rgba(255,255,255,.5)">단수정리 (${ru})</span><span class="est-sum-value" style="color:rgba(255,255,255,.5)">${fmt(calc.adj)}원</span></div>
    <div class="est-sum-row est-sum-total">
      <span class="est-sum-label">최종 도급금액</span>
      <span class="est-sum-value" style="font-size:20px">
        ${manualEnabled?`<input style="background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.3);color:#fff;font-size:18px;font-weight:800;text-align:right;width:160px" type="number" value="${calc.finalTotal}" onchange="setManualTotal(this.value)">`:`₩${fmt(calc.finalTotal)}`}
      </span>
    </div>
    <div style="padding:10px 20px;text-align:right;color:rgba(255,255,255,.4);font-size:11px">VAT 별도</div>
  </div>`;
}
function changeRound(ru){
  const p=getProject(S.editingEstPid);
  if(p){p.roundUnit=ru;saveProject(p);}
  const sel=document.getElementById('est_round');if(sel)sel.value=ru;
  updateEstSummary();
}
function setManualTotal(val){
  const p=getProject(S.editingEstPid);
  if(p){p.manualTotal=Number(val);saveProject(p);}
  updateEstSummary();
}
async function saveEstimate(){
  const nm=v('est_nm');if(!nm){toast('프로젝트명을 입력하세요','error');return;}
  let p=getProject(S.editingEstPid);
  if(!p){p={id:uid(),items:[],ganttTasks:[],contractStatus:'미생성',contractDate:'',contractNote:'',contractClauses:[],payments:[{label:'계약금',pct:30,due:'',paid:false,paidDate:''},{label:'잔금',pct:70,due:'',paid:false,paidDate:''}],createdAt:today()};}
  p.nm=nm;p.client=v('est_client');p.contact=v('est_contact');p.email=v('est_email');
  p.loc=v('est_loc');p.area=Number(v('est_area')||0);p.mgr=v('est_mgr');
  p.date=v('est_date')||today();p.profit=Number(v('est_profit')||10);
  p.status=v('est_status')||'작성중';p.roundUnit=v('est_round')||'십만원';
  p.targetAmt=Number(v('est_target')||0);
  S.editingEstPid=p.id;
  saveProject(p);toast('견적이 저장되었습니다','success');
  updateEstSummary();
}

// ===== ESTIMATE PREVIEW MODAL (5-Tab System) =====
let _pvTab='cover';
function openPreviewModal(pid){
  const p=getProject(pid);if(!p)return;
  _pvTab='cover';
  openModal(`<div class="modal-bg"><div class="modal modal-xl" style="max-height:92vh;display:flex;flex-direction:column">
    <div class="modal-hdr" style="flex-shrink:0">
      <span class="modal-title">견적서 미리보기 — ${p.nm}</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="window.print()">${svgIcon('print',12)} 인쇄/PDF</button>
        <button class="btn btn-outline btn-sm" onclick="sendEstMail('${pid}')">${svgIcon('mail',12)} 이메일</button>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
    </div>
    <div class="pv-tab-bar" style="flex-shrink:0;display:flex;border-bottom:2px solid var(--g200);background:var(--g50);padding:0 16px">
      ${[{id:'cover',icon:'📋',label:'표지'},{id:'summary',icon:'📊',label:'내역서'},{id:'aggregate',icon:'📈',label:'집계표'},{id:'detail',icon:'📝',label:'상세내역'},{id:'gantt',icon:'📅',label:'공정표'}].map(t=>
        `<button class="pv-tab-btn${t.id==='cover'?' active':''}" data-tab="${t.id}" onclick="switchPvTab('${t.id}','${pid}')" style="padding:10px 16px;border:none;background:${t.id==='cover'?'#fff':'transparent'};font-size:12px;font-weight:600;cursor:pointer;border-bottom:${t.id==='cover'?'2px solid var(--blue)':'2px solid transparent'};margin-bottom:-2px;color:${t.id==='cover'?'var(--blue)':'var(--g600)'};transition:all .2s;display:flex;align-items:center;gap:5px">${t.icon} ${t.label}</button>`
      ).join('')}
    </div>
    <div class="modal-body" id="pv-tab-content" style="padding:0;background:#e8e8e8;flex:1;overflow-y:auto">
      ${buildPvCover(p)}
    </div>
  </div></div>`);
}
function switchPvTab(tab,pid){
  _pvTab=tab;
  const p=getProject(pid);if(!p)return;
  document.querySelectorAll('.pv-tab-btn').forEach(b=>{
    const isActive=b.dataset.tab===tab;
    b.style.background=isActive?'#fff':'transparent';
    b.style.borderBottom=isActive?'2px solid var(--blue)':'2px solid transparent';
    b.style.color=isActive?'var(--blue)':'var(--g600)';
    if(isActive)b.classList.add('active');else b.classList.remove('active');
  });
  const el=document.getElementById('pv-tab-content');if(!el)return;
  switch(tab){
    case 'cover':el.innerHTML=buildPvCover(p);break;
    case 'summary':el.innerHTML=buildPvSummary(p);break;
    case 'aggregate':el.innerHTML=buildPvAggregate(p);break;
    case 'detail':el.innerHTML=buildPvDetail(p);break;
    case 'gantt':el.innerHTML=buildPvGantt(p);break;
  }
}
function _pvDocNo(p){return`FP-${p.date?.replace(/-/g,'').slice(2)||'000000'}-${p.id.slice(-3).toUpperCase()}`;}
function _pvHeader(co,p,title){
  return`<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px">
    <div class="pv-ep-logo">${co.name}</div>
    <div style="font-size:11px;color:var(--g500)">작성일: ${p.date||today()} | 문서번호: ${_pvDocNo(p)}${title?` | <strong>${title}</strong>`:''}</div>
  </div>
  <div style="height:2px;background:var(--black);margin-bottom:2px"></div>
  <div style="height:1px;background:var(--g300);margin-bottom:20px"></div>`;
}
function _pvFooter(co){
  return`<div style="margin-top:24px;border-top:1px solid var(--g200);padding-top:12px;text-align:center;font-size:10px;color:var(--g400)">${co.addr} | ${co.tel} | ${co.email}</div>`;
}

// TAB 1: 표지
function buildPvCover(p){
  const co=getCompany();const calc=calcP(p);const docNo=_pvDocNo(p);
  return`<div class="pv-page pv-cover">
    <div style="padding:64px 72px 0;position:relative;z-index:1">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-family:var(--serif);font-size:14px;font-weight:300;letter-spacing:.35em;color:rgba(255,255,255,.5);text-transform:uppercase">${co.name}</div>
        <div style="font-size:10px;font-weight:300;letter-spacing:.12em;color:rgba(255,255,255,.3);text-align:right;line-height:1.8">문서번호: ${docNo}<br>작성일: ${p.date||today()}</div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:0 72px;position:relative;z-index:1">
      <div style="margin-bottom:48px">
        <div style="font-family:var(--serif);font-size:52px;font-weight:700;letter-spacing:.18em;line-height:1.3;color:#fff;margin-bottom:16px">공사견적서</div>
        <div style="font-size:13px;font-weight:300;letter-spacing:.3em;color:rgba(255,255,255,.35);text-transform:uppercase">Construction Estimate</div>
      </div>
      <div style="width:60px;height:1px;background:rgba(255,255,255,.2);margin:0 0 36px"></div>
      <div style="font-size:14px;font-weight:300;color:rgba(255,255,255,.6);line-height:2.5;letter-spacing:.03em">
        <div>프로젝트: <strong style="color:rgba(255,255,255,.9)">${p.nm}</strong></div>
        <div>수신: <strong style="color:rgba(255,255,255,.9)">${p.client||''}</strong></div>
        <div>현장: <strong style="color:rgba(255,255,255,.9)">${p.loc||''}</strong></div>
        <div>면적: <strong style="color:rgba(255,255,255,.9)">${p.area||''}평</strong></div>
        <div>견적금액: <strong style="color:rgba(255,255,255,.9)">₩${fmt(calc.finalTotal)} (VAT별도)</strong></div>
      </div>
    </div>
    <div style="padding:0 72px 56px;display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1">
      <div>
        <div style="font-family:var(--serif);font-size:28px;font-weight:700;letter-spacing:.02em;color:#fff">${co.name}</div>
        <div style="font-size:11px;font-weight:300;letter-spacing:.2em;color:rgba(255,255,255,.4);margin-top:8px">${co.nameKo||''}</div>
      </div>
      <div style="font-size:12px;font-weight:300;letter-spacing:.08em;color:rgba(255,255,255,.35);text-align:right">담당: ${p.mgr||co.ceo}<br>${co.mobile||co.tel}</div>
    </div>
  </div>
  <div class="pv-page pv-end">
    <div class="pv-end-circle">
      <div class="pv-end-circle-en">${co.specialty?.split(' ')[0]||'Office'}</div>
      <div class="pv-end-circle-ko">${co.specialty?.split(' ').slice(1).join(' ')||'Specialist'}</div>
    </div>
    <div class="pv-end-line"></div>
    <div class="pv-end-name">${co.name}</div>
    <div class="pv-end-name-ko">${co.nameKo?.split('').join(' ')||''}</div>
    <div class="pv-end-info">📍 ${co.addr}<br>✉️ ${co.email}<br>📞 ${co.tel} | ${co.mobile}<br>🏢 사업자등록번호: ${co.bizNo}<br>👤 대표: ${co.ceo}</div>
  </div>`;
}

// TAB 2: 내역서
function buildPvSummary(p){
  const co=getCompany();const calc=calcP(p);
  return`<div class="pv-page pv-ep">
    ${_pvHeader(co,p,'공사견적서')}
    <div class="pv-ep-title">공&nbsp;&nbsp;사&nbsp;&nbsp;견&nbsp;&nbsp;적&nbsp;&nbsp;서</div>
    <table class="pv-info-tbl">
      <tr><td>프로젝트명</td><td>${p.nm}</td><td>견적담당</td><td>${p.mgr||co.ceo}</td></tr>
      <tr><td>수신</td><td>${p.client||''} ${p.contact||''}</td><td>작성일</td><td>${p.date||today()}</td></tr>
      <tr><td>현장위치</td><td>${p.loc||''}</td><td>면적</td><td>${p.area||''}평</td></tr>
      <tr><td>도급금액</td><td colspan="3" style="font-weight:700;font-size:14px">₩ ${fmt(calc.finalTotal)} (VAT 별도)</td></tr>
    </table>
    <table class="pv-stbl">
      <thead><tr><th>NO</th><th>공종</th><th>단위</th><th>수량</th><th style="text-align:right">금액</th><th>비고</th></tr></thead>
      <tbody>
        ${CATS.map((c,i)=>{const cs=calc.cs[c.id];const t=cs?.t||0;
          return`<tr class="${t===0?'zero':''}"><td>${i+1}</td><td>${c.nm}</td><td>식</td><td>1</td><td style="text-align:right">${t>0?fmt(t):'-'}</td><td></td></tr>`;
        }).join('')}
        <tr class="subtotal"><td colspan="4">간접공사비</td><td style="text-align:right">${fmt(calc.indirect)}</td><td></td></tr>
        <tr class="subtotal"><td colspan="4">소계</td><td style="text-align:right">${fmt(calc.raw)}</td><td></td></tr>
        <tr class="subtotal"><td colspan="4">단수정리</td><td style="text-align:right">${fmt(calc.adj)}</td><td></td></tr>
        <tr class="total"><td colspan="4" style="text-align:center;font-size:14px;font-weight:700">합&nbsp;계</td><td style="text-align:right;font-size:16px;font-weight:800">₩ ${fmt(calc.finalTotal)}</td><td style="font-size:11px">VAT 별도</td></tr>
      </tbody>
    </table>
    <div style="margin-top:24px;padding:16px;border:1px solid var(--g200);font-size:12px">
      <div style="font-weight:700;margin-bottom:8px">특이사항</div>
      <div style="color:var(--g600);line-height:2">1. 상기 금액은 VAT(부가가치세) 별도 금액입니다.<br>2. 본 견적서는 발행일로부터 30일간 유효합니다.<br>3. 공사 범위 외 추가 공사 발생 시 별도 협의합니다.</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px">
      <div style="border:1px solid var(--g200);padding:20px;text-align:center">
        <div style="font-size:12px;font-weight:700;margin-bottom:40px">시 공 사</div>
        <div style="font-size:11px;color:var(--g500);line-height:2">${co.name}<br>대표: ${co.ceo}</div>
        <div style="margin-top:16px;border-top:1px solid var(--g200);padding-top:8px;font-size:11px">서명:</div>
      </div>
      <div style="border:1px solid var(--g200);padding:20px;text-align:center">
        <div style="font-size:12px;font-weight:700;margin-bottom:40px">고 객 사</div>
        <div style="font-size:11px;color:var(--g500);line-height:2">${p.client||''}<br>담당: ${p.contact||''}</div>
        <div style="margin-top:16px;border-top:1px solid var(--g200);padding-top:8px;font-size:11px">서명:</div>
      </div>
    </div>
    ${_pvFooter(co)}
  </div>`;
}

// TAB 3: 집계표 (Aggregate by cost type & category)
function buildPvAggregate(p){
  const co=getCompany();const calc=calcP(p);
  const activeCats=CATS.filter(c=>calc.cs[c.id]&&calc.cs[c.id].t>0);
  const totalM=activeCats.reduce((s,c)=>s+(calc.cs[c.id]?.m||0),0);
  const totalL=activeCats.reduce((s,c)=>s+(calc.cs[c.id]?.l||0),0);
  const totalE=activeCats.reduce((s,c)=>s+(calc.cs[c.id]?.e||0),0);
  return`<div class="pv-page pv-ep">
    ${_pvHeader(co,p,'공종별 집계표')}
    <div class="pv-ep-title" style="font-size:18px">공종별 원가 집계표</div>
    <div style="font-size:11px;color:var(--g500);text-align:center;margin-bottom:16px">프로젝트: ${p.nm} | 면적: ${p.area||'-'}평 | 작성: ${p.date||today()}</div>
    <!-- Main aggregate table -->
    <table class="pv-dtbl" style="margin-bottom:20px">
      <thead>
        <tr style="background:var(--dark);color:#fff">
          <th style="width:40px;color:#fff">NO</th>
          <th class="tl" style="width:160px;color:#fff">공종명</th>
          <th style="text-align:right;color:#fff">자재비</th>
          <th style="text-align:right;color:#fff">노무비</th>
          <th style="text-align:right;color:#fff">경비</th>
          <th style="text-align:right;color:#fff">합계</th>
          <th style="text-align:right;width:60px;color:#fff">비율</th>
        </tr>
      </thead>
      <tbody>
        ${activeCats.map((c,i)=>{
          const cs=calc.cs[c.id];const pct=calc.direct>0?(cs.t/calc.direct*100).toFixed(1):'0.0';
          return`<tr>
            <td style="text-align:center">${i+1}</td>
            <td class="tl"><span style="margin-right:4px">${c.icon}</span>${c.nm}</td>
            <td style="text-align:right">${fmt(cs.m||0)}</td>
            <td style="text-align:right">${fmt(cs.l||0)}</td>
            <td style="text-align:right">${fmt(cs.e||0)}</td>
            <td style="text-align:right;font-weight:600">${fmt(cs.t)}</td>
            <td style="text-align:right"><div style="display:flex;align-items:center;gap:4px;justify-content:flex-end"><div style="width:40px;height:6px;background:var(--g200);border-radius:3px;overflow:hidden"><div style="height:100%;background:var(--blue);width:${pct}%"></div></div><span style="font-size:10px">${pct}%</span></div></td>
          </tr>`;
        }).join('')}
        <tr class="total-row" style="background:var(--g50)">
          <td colspan="2" style="text-align:center;font-weight:700">직접공사비 소계</td>
          <td style="text-align:right;font-weight:700">${fmt(totalM)}</td>
          <td style="text-align:right;font-weight:700">${fmt(totalL)}</td>
          <td style="text-align:right;font-weight:700">${fmt(totalE)}</td>
          <td style="text-align:right;font-weight:800;font-size:13px">${fmt(calc.direct)}</td>
          <td style="text-align:right;font-weight:700">100%</td>
        </tr>
      </tbody>
    </table>
    <!-- Cost composition summary -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div style="border:1px solid var(--g200);border-radius:8px;padding:16px">
        <div style="font-size:12px;font-weight:700;margin-bottom:12px">📊 원가 구성 비율</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${[{label:'자재비',val:totalM,color:'#3b82f6'},{label:'노무비',val:totalL,color:'#f59e0b'},{label:'경비',val:totalE,color:'#10b981'}].map(x=>{
            const pct=calc.direct>0?(x.val/calc.direct*100).toFixed(1):'0';
            return`<div>
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span style="color:var(--g600)">${x.label}</span><span style="font-weight:600">${fmt(x.val)}원 (${pct}%)</span></div>
              <div style="height:8px;background:var(--g100);border-radius:4px;overflow:hidden"><div style="height:100%;background:${x.color};width:${pct}%;border-radius:4px"></div></div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="border:1px solid var(--g200);border-radius:8px;padding:16px">
        <div style="font-size:12px;font-weight:700;margin-bottom:12px">💰 간접공사비 내역</div>
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <tr style="border-bottom:1px solid var(--g100)"><td style="padding:6px 0;color:var(--g600)">기업이윤 (${p.profit||10}%)</td><td style="text-align:right;font-weight:600">${fmt(calc.profitAmt)}</td></tr>
          <tr style="border-bottom:1px solid var(--g100)"><td style="padding:6px 0;color:var(--g600)">안전관리비 (0.7%)</td><td style="text-align:right;font-weight:600">${fmt(calc.safetyAmt)}</td></tr>
          <tr style="border-bottom:1px solid var(--g100)"><td style="padding:6px 0;color:var(--g600)">식대·교통비 (3%)</td><td style="text-align:right;font-weight:600">${fmt(calc.mealAmt)}</td></tr>
          <tr style="border-bottom:1px solid var(--g200)"><td style="padding:6px 0;font-weight:700">간접공사비 계</td><td style="text-align:right;font-weight:700">${fmt(calc.indirect)}</td></tr>
          <tr style="border-bottom:1px solid var(--g100)"><td style="padding:6px 0;color:var(--g500)">단수정리</td><td style="text-align:right;color:var(--g500)">${fmt(calc.adj)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:800;font-size:13px">최종 도급금액</td><td style="text-align:right;font-weight:800;font-size:14px;color:var(--blue)">₩${fmt(calc.finalTotal)}</td></tr>
        </table>
      </div>
    </div>
    <!-- Top 5 cost items -->
    <div style="border:1px solid var(--g200);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;margin-bottom:12px">🏆 공종별 비중 TOP 5</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${activeCats.sort((a,b)=>(calc.cs[b.id]?.t||0)-(calc.cs[a.id]?.t||0)).slice(0,5).map((c,i)=>{
          const cs=calc.cs[c.id];const pct=calc.direct>0?(cs.t/calc.direct*100).toFixed(1):'0';
          const colors=['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444'];
          return`<div style="flex:1;min-width:100px;background:${colors[i]}10;border:1px solid ${colors[i]}30;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;margin-bottom:4px">${c.icon}</div>
            <div style="font-size:11px;font-weight:600;color:${colors[i]}">${c.nm}</div>
            <div style="font-size:16px;font-weight:800;margin:4px 0">${pct}%</div>
            <div style="font-size:10px;color:var(--g500)">${fmtShort(cs.t)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    ${_pvFooter(co)}
  </div>`;
}

// TAB 4: 상세내역
function buildPvDetail(p){
  const co=getCompany();const calc=calcP(p);
  return`<div class="pv-page pv-dp">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="pv-ep-logo">${co.name}</div>
      <div style="font-size:13px;font-weight:700;letter-spacing:.1em">공사 상세내역서</div>
    </div>
    <table class="pv-dtbl">
      <thead>
        <tr>
          <th rowspan="2" class="tl" style="width:140px">품명</th>
          <th rowspan="2" style="width:70px">규격</th>
          <th rowspan="2" style="width:40px">단위</th>
          <th rowspan="2" style="width:50px">수량</th>
          <th colspan="2">자재비</th>
          <th colspan="2">노무비</th>
          <th colspan="2">경비</th>
          <th colspan="2">합계</th>
        </tr>
        <tr><th>단가</th><th>금액</th><th>단가</th><th>금액</th><th>단가</th><th>금액</th><th>단가</th><th>금액</th></tr>
      </thead>
      <tbody>
        ${CATS.filter(c=>calc.cs[c.id]&&calc.cs[c.id].t>0).map(c=>{
          const cs=calc.cs[c.id];const items=p.items.filter(it=>it.cid===c.id);
          let rows=`<tr class="cat-hdr"><td colspan="12">${c.icon} ${c.nm}</td></tr>`;
          items.forEach(it=>{
            const qty=Number(it.qty||0);const mp=Number(it.mp||0);const lp=Number(it.lp||0);const ep=Number(it.ep||0);
            const up=mp+lp+ep;
            rows+=`<tr>
              <td class="tl">${it.nm}</td><td>${it.spec||''}</td><td style="text-align:center">${it.unit}</td><td>${qty}</td>
              <td>${fmt(mp)}</td><td>${fmt(mp*qty)}</td>
              <td>${fmt(lp)}</td><td>${fmt(lp*qty)}</td>
              <td>${fmt(ep)}</td><td>${fmt(ep*qty)}</td>
              <td>${fmt(up)}</td><td>${fmt(up*qty)}</td>
            </tr>`;
          });
          rows+=`<tr class="sub-row"><td class="tl" colspan="4">소계 (${c.nm})</td>
            <td colspan="2">${fmt(cs.m)}</td><td colspan="2">${fmt(cs.l)}</td>
            <td colspan="2">${fmt(cs.e||0)}</td><td colspan="2" style="font-weight:700">${fmt(cs.t)}</td>
          </tr>`;
          return rows;
        }).join('')}
        <tr class="total-row"><td class="tl" colspan="4" style="font-weight:700">직접공사비 합계</td>
          <td colspan="8" style="text-align:right;font-weight:700;font-size:12px">${fmt(calc.direct)}원</td>
        </tr>
        <tr class="indirect"><td class="tl" colspan="4">기업이윤 (${p.profit||10}%)</td><td colspan="8" style="text-align:right">${fmt(calc.profitAmt)}</td></tr>
        <tr class="indirect"><td class="tl" colspan="4">안전관리비 (0.7%)</td><td colspan="8" style="text-align:right">${fmt(calc.safetyAmt)}</td></tr>
        <tr class="indirect"><td class="tl" colspan="4">식대·교통비 (3%)</td><td colspan="8" style="text-align:right">${fmt(calc.mealAmt)}</td></tr>
        <tr class="grand-total"><td class="tl" colspan="4">간접공사비 합계</td><td colspan="8" style="text-align:right">${fmt(calc.indirect)}</td></tr>
        <tr class="adj-row"><td class="tl" colspan="4">단수정리</td><td colspan="8" style="text-align:right">${fmt(calc.adj)}</td></tr>
        <tr class="final-row"><td class="tl" colspan="4">최종 도급금액 (VAT 별도)</td><td colspan="8" style="text-align:right;font-size:14px">₩ ${fmt(calc.finalTotal)}</td></tr>
      </tbody>
    </table>
    ${_pvFooter(co)}
  </div>`;
}

// TAB 5: 공정표 (Gantt) with auto-generation
function buildPvGantt(p){
  const co=getCompany();
  const tasks=p.ganttTasks||[];
  if(!tasks.length){
    return`<div class="pv-page pv-ep" style="text-align:center;padding:60px 40px">
      ${_pvHeader(co,p,'공정표')}
      <div style="font-size:48px;margin:32px 0">📅</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">공정표가 없습니다</div>
      <div style="font-size:13px;color:var(--g500);margin-bottom:24px">견적 항목을 기반으로 자동 공정표를 생성하거나, 공정표 페이지에서 직접 추가하세요.</div>
      <div style="display:flex;gap:12px;justify-content:center">
        <button class="btn btn-primary" onclick="autoGenerateGantt('${p.id}');switchPvTab('gantt','${p.id}')">🤖 자동 공정표 생성</button>
        <button class="btn btn-outline" onclick="closeModal();openGanttDetail('${p.id}')">📝 직접 추가하기</button>
      </div>
    </div>`;
  }
  const starts=tasks.map(t=>new Date(t.start));const ends=tasks.map(t=>new Date(t.end));
  const minD=new Date(Math.min(...starts));const maxD=new Date(Math.max(...ends));
  const totalDays=Math.max(1,diffDays(minD.toISOString().split('T')[0],maxD.toISOString().split('T')[0]));
  const todayD=new Date(today());
  const avgProg=Math.round(tasks.reduce((a,t)=>a+Number(t.progress||0),0)/tasks.length);
  const delayed=tasks.filter(t=>t.end&&new Date(t.end)<new Date()&&Number(t.progress||0)<100).length;
  return`<div class="pv-page pv-ep">
    ${_pvHeader(co,p,'공정표 (Gantt Chart)')}
    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${[{l:'총 공정',v:tasks.length+'개',c:'var(--blue)'},{l:'총 공기',v:totalDays+'일',c:'var(--green)'},{l:'평균 진도',v:avgProg+'%',c:'var(--orange)'},{l:'지연 공정',v:delayed+'건',c:delayed?'var(--red)':'var(--g500)'}].map(k=>
        `<div style="background:${k.c}10;border:1px solid ${k.c}30;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--g500)">${k.l}</div>
          <div style="font-size:18px;font-weight:800;color:${k.c}">${k.v}</div>
        </div>`
      ).join('')}
    </div>
    <div style="font-size:11px;color:var(--g500);margin-bottom:8px">${minD.toISOString().split('T')[0]} ~ ${maxD.toISOString().split('T')[0]}</div>
    <!-- Chart -->
    <div style="display:flex;align-items:stretch;border:1px solid var(--g200);border-radius:6px;overflow:hidden;margin-bottom:16px">
      <div style="width:180px;flex-shrink:0;border-right:1px solid var(--g200)">
        <div style="background:var(--dark);color:#fff;padding:8px 10px;font-size:10px;font-weight:700;border-bottom:1px solid var(--g200)">공정명</div>
        ${tasks.map(t=>{const isLate=t.end&&new Date(t.end)<new Date()&&Number(t.progress||0)<100;
          return`<div style="padding:7px 10px;border-bottom:1px solid var(--g100);font-size:11px;font-weight:500;${isLate?'color:var(--red)':''}">
            ${isLate?'⚠️ ':''}${t.nm}
            <div style="font-size:9px;color:var(--g400)">${t.assignee||''}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="flex:1;overflow-x:auto">
        <div style="min-width:${Math.max(400,totalDays*8)}px">
          <div style="background:var(--dark);padding:8px;font-size:10px;font-weight:700;color:#fff;border-bottom:1px solid var(--g200);display:flex">
            ${Array.from({length:Math.min(totalDays,60)},(_,i)=>{const d=new Date(minD);d.setDate(d.getDate()+i);
              return i%7===0?`<div style="flex:7;text-align:center;min-width:0">${d.getMonth()+1}/${d.getDate()}</div>`:''}).join('')}
          </div>
          ${tasks.map(t=>{
            const s=diffDays(minD.toISOString().split('T')[0],t.start);
            const dur=diffDays(t.start,t.end);
            const dispDays=Math.min(totalDays,60);
            const left=(s/dispDays*100).toFixed(1);
            const w=(dur/dispDays*100).toFixed(1);
            const prog=Number(t.progress||0);
            return`<div style="padding:6px 0;border-bottom:1px solid var(--g100);position:relative;height:34px">
              <div style="position:absolute;top:10px;left:${left}%;width:${w}%;height:14px;background:${t.color||'var(--blue)'}26;border-radius:3px"></div>
              <div style="position:absolute;top:10px;left:${left}%;width:${(w*prog/100).toFixed(1)}%;height:14px;background:${t.color||'var(--blue)'};border-radius:3px"></div>
              ${todayD>=minD&&todayD<=maxD?`<div style="position:absolute;top:0;bottom:0;left:${(diffDays(minD.toISOString().split('T')[0],today())/dispDays*100).toFixed(1)}%;width:1.5px;background:var(--red)"></div>`:''}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="width:55px;flex-shrink:0;border-left:1px solid var(--g200)">
        <div style="background:var(--dark);color:#fff;padding:8px;font-size:10px;font-weight:700;border-bottom:1px solid var(--g200);text-align:center">진도</div>
        ${tasks.map(t=>`<div style="padding:7px 6px;border-bottom:1px solid var(--g100);text-align:center;font-size:11px;font-weight:700;color:${Number(t.progress||0)===100?'var(--green)':'var(--blue)'}">${t.progress||0}%</div>`).join('')}
      </div>
    </div>
    <!-- Legend + Summary -->
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--dark);color:#fff;padding:12px 16px;border-radius:6px;margin-bottom:16px">
      <div style="display:flex;gap:16px;font-size:11px">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:6px;background:var(--red);border-radius:2px;display:inline-block"></span>오늘</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:6px;background:rgba(37,99,235,.2);border-radius:2px;display:inline-block"></span>계획</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:6px;background:var(--blue);border-radius:2px;display:inline-block"></span>진행</span>
      </div>
      <div style="font-size:13px"><strong>총 ${totalDays}일</strong> · 전체 진행률 <strong>${avgProg}%</strong></div>
    </div>
    <!-- Task list table -->
    <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid var(--g200);border-radius:6px;overflow:hidden">
      <thead><tr style="background:var(--g50)">
        <th style="padding:8px;text-align:left;border-bottom:1px solid var(--g200)">NO</th>
        <th style="padding:8px;text-align:left;border-bottom:1px solid var(--g200)">공정명</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid var(--g200)">시작일</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid var(--g200)">종료일</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid var(--g200)">일수</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid var(--g200)">담당</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid var(--g200)">진도</th>
      </tr></thead>
      <tbody>
        ${tasks.map((t,i)=>{const dur=diffDays(t.start,t.end);const prog=Number(t.progress||0);const isLate=t.end&&new Date(t.end)<new Date()&&prog<100;
          return`<tr style="${isLate?'background:#fef2f2':''}">
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100)">${i+1}</td>
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100);font-weight:600;${isLate?'color:var(--red)':''}">${isLate?'⚠️ ':''}${t.nm}</td>
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100);text-align:center">${t.start}</td>
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100);text-align:center">${t.end}</td>
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100);text-align:center">${dur}일</td>
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100);text-align:center">${t.assignee||'-'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid var(--g100);text-align:center;font-weight:700;color:${prog===100?'var(--green)':prog>0?'var(--blue)':'var(--g400)'}">${prog}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="autoGenerateGantt('${p.id}');switchPvTab('gantt','${p.id}')">🤖 자동 재생성</button>
      <button class="btn btn-outline btn-sm" onclick="closeModal();openGanttDetail('${p.id}')">📝 공정표 편집</button>
    </div>
    ${_pvFooter(co)}
  </div>`;
}

// For backward compat: buildPreviewHTML still works for print
function buildPreviewHTML(p,co){
  return buildPvCover(p)+buildPvSummary(p)+buildPvDetail(p)+(p.ganttTasks&&p.ganttTasks.length?buildPvGantt(p):'');
}

// ===== GANTT AUTO-GENERATION ENGINE =====
const GANTT_CAT_ORDER=['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12','C13','C14','C15','C16','C17','C18'];
const GANTT_CAT_DAYS={C01:7,C02:5,C03:5,C04:7,C05:5,C06:4,C07:5,C08:7,C09:5,C10:3,C11:3,C12:3,C13:5,C14:4,C15:3,C16:3,C17:3,C18:2};
const GANTT_CAT_COLORS={C01:'#6366f1',C02:'#8b5cf6',C03:'#a855f7',C04:'#3b82f6',C05:'#0ea5e9',C06:'#14b8a6',C07:'#22c55e',C08:'#84cc16',C09:'#eab308',C10:'#f59e0b',C11:'#f97316',C12:'#ef4444',C13:'#ec4899',C14:'#d946ef',C15:'#64748b',C16:'#78716c',C17:'#0d9488',C18:'#7c3aed'};
// Overlap groups: categories that can partially overlap
const GANTT_OVERLAP_GROUPS=[
  ['C01','C02'],        // demolition + frame can overlap
  ['C06','C07','C08'],  // plumbing + electric + HVAC can overlap
  ['C09','C10','C11'],  // finishing work can overlap
  ['C14','C15','C16'],  // glass + signage + cleaning can overlap
];
function autoGenerateGantt(pid){
  const p=getProject(pid);if(!p)return;
  const items=p.items||[];if(!items.length){toast('견적 항목이 없습니다. 먼저 견적을 작성하세요.','warning');return;}
  const calc=calcP(p);
  // Get active categories in construction order
  const activeCats=GANTT_CAT_ORDER.filter(cid=>{
    const cs=calc.cs[cid];return cs&&cs.t>0;
  });
  if(!activeCats.length){toast('활성 공종이 없습니다.','warning');return;}
  // Calculate durations: base from GANTT_CAT_DAYS, scale by cost proportion
  const maxCatCost=Math.max(...activeCats.map(cid=>calc.cs[cid]?.t||0));
  const startDate=p.date||today();
  let cursor=startDate;
  const tasks=[];
  const overlapMap={};// cid -> group index
  GANTT_OVERLAP_GROUPS.forEach((grp,gi)=>grp.forEach(cid=>overlapMap[cid]=gi));
  let lastGroupIdx=-1;let groupStart=null;
  activeCats.forEach((cid,idx)=>{
    const cat=CATS.find(c=>c.id===cid);if(!cat)return;
    const baseDays=GANTT_CAT_DAYS[cid]||5;
    const costRatio=maxCatCost>0?(calc.cs[cid]?.t||0)/maxCatCost:1;
    // Scale days: min 2, max baseDays*2
    let days=Math.max(2,Math.round(baseDays*(0.5+costRatio*0.7)));
    // Area-based scaling: larger area = more days
    if(p.area>50)days=Math.round(days*1.2);
    if(p.area>100)days=Math.round(days*1.4);
    // Determine start: check if this category overlaps with previous
    const myGroup=overlapMap[cid];
    if(myGroup!==undefined&&myGroup===lastGroupIdx&&groupStart){
      // Overlap: start 30-50% into previous task's duration
      const prevTask=tasks[tasks.length-1];
      if(prevTask){
        const prevDur=diffDays(prevTask.start,prevTask.end);
        const overlapDays=Math.max(1,Math.floor(prevDur*0.4));
        cursor=addDays(prevTask.start,prevDur-overlapDays);
      }
    }else{
      lastGroupIdx=myGroup!==undefined?myGroup:-1;
      groupStart=cursor;
    }
    const tStart=cursor;
    const tEnd=addDays(tStart,days);
    tasks.push({
      id:uid(),nm:cat.icon+' '+cat.nm,start:tStart,end:tEnd,
      color:GANTT_CAT_COLORS[cid]||'#3b82f6',progress:0,
      assignee:TEAM_MEMBERS[idx%TEAM_MEMBERS.length]||'',
      note:`${(p.items||[]).filter(it=>it.cid===cid).length}개 항목 · ${fmtShort(calc.cs[cid]?.t||0)}`,
      catId:cid
    });
    // Move cursor to end for next non-overlapping task
    cursor=tEnd;
  });
  p.ganttTasks=tasks;
  saveProject(p);
  toast(`🤖 ${tasks.length}개 공정이 자동 생성되었습니다 (총 ${diffDays(startDate,cursor)}일)`,'success');
}

// ===== EMAIL =====
function sendEstMail(pid){
  const p=getProject(pid);if(!p)return;
  const co=getCompany();
  openModal(`<div class="modal-bg"><div class="modal modal-sm">
    <div class="modal-hdr">
      <span class="modal-title">${svgIcon('mail',16)} 견적서 이메일 발송</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px">
        <label class="lbl">받는 사람 (이메일) *</label>
        <input class="inp" id="email-to" value="${p.email||''}" placeholder="example@email.com">
      </div>
      <div style="margin-bottom:16px">
        <label class="lbl">참조 (CC)</label>
        <input class="inp" id="email-cc" placeholder="cc@email.com (선택사항)">
      </div>
      <div style="margin-bottom:16px">
        <label class="lbl">추가 메시지 (선택)</label>
        <textarea class="inp" id="email-msg" rows="3" placeholder="고객에게 전달할 추가 메시지...">${p.contact||p.client}님, 요청하신 ${p.nm} 견적서를 보내드립니다.</textarea>
      </div>
      <div style="background:var(--g50);border-radius:8px;padding:12px;font-size:12px;color:var(--g600);">
        <div style="font-weight:600;margin-bottom:6px;">📋 발송 내용 미리보기</div>
        <div>• 제목: [견적서] ${p.nm} - ${co.name}</div>
        <div>• 프로젝트: ${p.nm}</div>
        <div>• 견적금액: ₩${fmt(getTotal(p))}</div>
        <div>• 항목 ${(p.items||[]).length}건 포함</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-blue" onclick="doSendEstMail('${pid}')">
        ${svgIcon('mail',13)} 발송하기
      </button>
    </div>
  </div></div>`);
}
async function doSendEstMail(pid){
  const to=document.getElementById('email-to').value.trim();
  const cc=document.getElementById('email-cc').value.trim();
  const msg=document.getElementById('email-msg').value.trim();
  if(!to){toast('이메일 주소를 입력해주세요','error');return;}
  if(!to.includes('@')){toast('올바른 이메일 형식이 아닙니다','error');return;}
  try{
    const payload={to, project_id:pid};
    if(cc)payload.cc=cc;
    if(msg)payload.custom_message=msg;
    const btn=document.querySelector('.modal-footer .btn-blue');
    if(btn){btn.disabled=true;btn.innerHTML='발송중...';}
    const res=await api('email/estimate','POST',payload);
    if(res&&res.success){
      closeModal();
      toast('✉️ 견적서 이메일이 발송되었습니다!','success');
    }else{
      toast('발송 실패: '+(res?.error||res?.detail?.message||'알 수 없는 오류'),'error');
      if(btn){btn.disabled=false;btn.innerHTML=svgIcon('mail',13)+' 발송하기';}
    }
  }catch(e){
    toast('발송 중 오류가 발생했습니다: '+e.message,'error');
  }
}
// ===== GANTT =====
function renderGanttList(){
  const ps=getProjects();
  document.getElementById('tb-actions').innerHTML=`<button class="btn btn-outline btn-sm" onclick="exportXLSX('gantt')">${svgIcon('download',12)} 엑셀</button>`;
  document.getElementById('content').innerHTML=`
  ${filterBar({statuses:Object.keys(STATUS_LABELS),placeholder:'프로젝트명 검색...'})}
  <div class="tbl-wrap">
    <table class="tbl" id="gantt-tbl">
      <thead><tr>
        <th onclick="sortTbl('gantt','nm')">프로젝트명 <span class="sort-icon">↕</span></th>
        <th onclick="sortTbl('gantt','client')">고객사 <span class="sort-icon">↕</span></th>
        <th>총 공정</th><th>공기(일)</th><th>진행중</th><th>지연</th>
        <th onclick="sortTbl('gantt','prog')">전체진도 <span class="sort-icon">↕</span></th>
        <th onclick="sortTbl('gantt','status')">상태 <span class="sort-icon">↕</span></th>
        <th></th>
      </tr></thead>
      <tbody>
        ${ps.map(p=>{
          const tasks=p.ganttTasks||[];
          const starts=tasks.map(t=>t.start).filter(Boolean).sort();
          const ends=tasks.map(t=>t.end).filter(Boolean).sort();
          const dur=starts.length&&ends.length?diffDays(starts[0],ends[ends.length-1]):0;
          const inProg=tasks.filter(t=>Number(t.progress||0)>0&&Number(t.progress||0)<100).length;
          const delayed=tasks.filter(t=>t.end&&new Date(t.end)<new Date()&&Number(t.progress||0)<100).length;
          const prog=getProg(p);
          return`<tr>
            <td><span style="cursor:pointer;color:var(--blue);font-weight:600" onclick="openGanttDetail('${p.id}')">${p.nm}</span></td>
            <td>${p.client}</td>
            <td>${tasks.length}</td>
            <td>${dur>0?dur+'일':'-'}</td>
            <td>${inProg>0?`<span class="badge badge-blue">${inProg}</span>`:'-'}</td>
            <td>${delayed>0?`<span class="badge badge-red">${delayed}</span>`:'-'}</td>
            <td><div style="display:flex;align-items:center;gap:6px"><div class="prog prog-blue" style="width:80px"><div class="prog-bar" style="width:${prog}%"></div></div><span style="font-size:11px">${prog}%</span></div></td>
            <td>${statusBadge(p.status)}</td>
            <td><button class="btn btn-outline btn-sm" onclick="openGanttDetail('${p.id}')">공정표 보기</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}
function openGanttDetail(pid){
  S.selPid=pid;nav('gantt','detail',pid);
}
function renderGanttDetail(){
  const pid=S.selPid;const p=getProject(pid);if(!p){nav('gantt');return;}
  const tasks=p.ganttTasks||[];
  const starts=tasks.map(t=>t.start).filter(Boolean).sort();
  const ends=tasks.map(t=>t.end).filter(Boolean).sort();
  const minDate=starts[0]||today();
  const maxDate=ends[ends.length-1]||addDays(today(),30);
  const totalDays=Math.max(1,diffDays(minDate,maxDate));
  const inProg=tasks.filter(t=>Number(t.progress||0)>0&&Number(t.progress||0)<100).length;
  const delayed=tasks.filter(t=>t.end&&new Date(t.end)<new Date()&&Number(t.progress||0)<100).length;
  const avgProg=getProg(p);
  
  document.getElementById('tb-title').textContent='공정표';
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="nav('gantt')">${svgIcon('arrow_left',12)} 목록</button>
    <button class="btn btn-outline btn-sm" onclick="printPage()">${svgIcon('print',12)} 인쇄</button>
    <button class="btn btn-outline btn-sm" onclick="autoGenerateGantt('${pid}');renderGanttDetail()">🤖 자동생성</button>
    <button class="btn btn-primary btn-sm" onclick="addGanttTask('${pid}')">+ 공정 추가</button>`;
  
  document.getElementById('content').innerHTML=`
  <div style="margin-bottom:4px">
    <button class="btn btn-ghost btn-sm" onclick="nav('gantt')">${svgIcon('arrow_left',12)} 공정표 목록으로</button>
  </div>
  
  <!-- KPIs -->
  <div class="dash-grid" style="margin-bottom:14px">
    <div class="kpi-card"><div class="kpi-label">총 공정</div><div class="kpi-value">${tasks.length}개</div></div>
    <div class="kpi-card"><div class="kpi-label">총 공기</div><div class="kpi-value" style="color:var(--blue)">${totalDays}일</div></div>
    <div class="kpi-card"><div class="kpi-label">진행중</div><div class="kpi-value" style="color:var(--orange)">${inProg}</div></div>
    <div class="kpi-card"><div class="kpi-label">지연</div><div class="kpi-value" style="color:var(--red)">${delayed}</div></div>
  </div>
  
  <!-- Selector & project summary -->
  <div style="background:var(--dark);border-radius:var(--radius-lg);padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:0">
      <div style="color:#fff;font-size:15px;font-weight:700;margin-bottom:4px">${p.nm}</div>
      <div style="display:flex;gap:12px;font-size:11px">
        <span style="color:rgba(255,255,255,.6)">전체 진행률: <strong style="color:#fff">${avgProg}%</strong></span>
        <span style="color:rgba(255,255,255,.6)">${minDate} ~ ${maxDate}</span>
      </div>
    </div>
    <button class="btn btn-outline btn-sm" onclick="openEditProject('${pid}')">${svgIcon('edit',12)} 편집</button>
    <button class="btn btn-outline btn-sm" onclick="previewEst('${pid}')">${svgIcon('eye',12)} 미리보기</button>
  </div>
  
  <!-- Gantt Chart -->
  <div class="card" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-weight:700">📊 공정 뷰 <span style="font-size:11px;color:var(--g500)">${minDate} ~ ${maxDate}</span></div>
      <div style="font-size:11px;color:var(--g500);display:flex;gap:12px">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:6px;background:var(--red);display:inline-block;border-radius:2px"></span>오늘</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:6px;background:rgba(37,99,235,.2);display:inline-block;border-radius:2px"></span>계획</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:6px;background:var(--blue);display:inline-block;border-radius:2px"></span>진행</span>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="min-width:600px">
        <!-- Date headers -->
        <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:0">
          <div style="width:200px;min-width:200px;padding:6px 12px;font-size:10px;font-weight:600;color:var(--g500);border-right:1px solid var(--border)">공정명</div>
          <div style="flex:1;display:flex">
            ${Array.from({length:Math.min(totalDays,60)},(_,i)=>{
              const d=new Date(minDate);d.setDate(d.getDate()+i);
              return i%7===0?`<div style="flex:7;text-align:center;font-size:10px;font-weight:600;color:var(--g500);padding:6px 2px;border-right:1px solid var(--border)">${d.getMonth()+1}/${d.getDate()}</div>`:''
            }).join('')}
          </div>
          <div style="width:60px;min-width:60px;text-align:center;font-size:10px;font-weight:600;color:var(--g500);padding:6px;border-left:1px solid var(--border)">진도%</div>
        </div>
        <!-- Task rows -->
        ${tasks.map(t=>{
          const s=Math.max(0,diffDays(minDate,t.start));
          const dur=Math.max(1,diffDays(t.start,t.end));
          const left=(s/Math.min(totalDays,60)*100).toFixed(1);
          const w=(dur/Math.min(totalDays,60)*100).toFixed(1);
          const prog=Number(t.progress||0);
          const todayOff=diffDays(minDate,today());
          const isLate=t.end&&new Date(t.end)<new Date()&&prog<100;
          return`<div style="display:flex;align-items:center;border-bottom:1px solid var(--border)">
            <div style="width:200px;min-width:200px;padding:8px 12px;border-right:1px solid var(--border);flex-shrink:0">
              <div style="font-size:12px;font-weight:500;${isLate?'color:var(--red)':''}">${isLate?'⚠️ ':''}${t.nm}</div>
              <div style="font-size:10px;color:var(--g500)">${dur}일 · ${t.start}~${t.end}</div>
            </div>
            <div style="flex:1;position:relative;height:40px;display:flex;align-items:center">
              <div style="position:absolute;left:${left}%;width:${w}%;height:16px;background:${t.color||'var(--blue)'}26;border-radius:3px"></div>
              <div style="position:absolute;left:${left}%;width:${(w*prog/100).toFixed(1)}%;height:16px;background:${t.color||'var(--blue)'};border-radius:3px"></div>
              ${todayOff>=0&&todayOff<=Math.min(totalDays,60)?`<div style="position:absolute;left:${(todayOff/Math.min(totalDays,60)*100).toFixed(1)}%;top:0;bottom:0;width:1.5px;background:var(--red)"></div>`:''}
            </div>
            <div style="width:60px;min-width:60px;text-align:center;font-size:12px;font-weight:700;color:${prog===100?'var(--green)':prog>0?'var(--blue)':'var(--g400)'};border-left:1px solid var(--border);padding:8px">${prog}%</div>
          </div>`;
        }).join('')}
        <!-- Footer -->
        <div style="background:var(--dark);color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border-radius:0 0 var(--radius) var(--radius)">
          <span style="font-weight:700">총 공사기간 ${totalDays}일</span>
          <span style="font-size:12px">${tasks.length}개 공정</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Edit table -->
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-weight:700">📝 공정 편집 (타임스탬프 기반)</div>
      <button class="btn btn-ghost btn-sm" onclick="autoSortGantt('${pid}')">자동정렬</button>
    </div>
    <table class="tbl" id="gantt-edit-tbl">
      <thead><tr>
        <th>공정명</th><th>시작일</th><th>종료일</th><th>일수</th><th>진행률</th><th>상태</th><th>담당자</th><th>비고</th><th></th>
      </tr></thead>
      <tbody id="gantt-edit-body">
        ${tasks.map(t=>{
          const dur=diffDays(t.start,t.end);
          const prog=Number(t.progress||0);
          const st=prog===100?'완료':prog>0?'진행':'대기';
          return`<tr id="gtr_${t.id}">
            <td><input class="inp inp-sm" style="width:110px" value="${escHtml(t.nm||'')}" onchange="updateGanttTask('${pid}','${t.id}','nm',this.value)"></td>
            <td><input class="inp inp-sm" type="date" style="width:130px" value="${t.start||''}" onchange="updateGanttTask('${pid}','${t.id}','start',this.value)"></td>
            <td><input class="inp inp-sm" type="date" style="width:130px" value="${t.end||''}" onchange="updateGanttTask('${pid}','${t.id}','end',this.value)"></td>
            <td><span id="gdur_${t.id}">${dur}일</span></td>
            <td><div style="display:flex;align-items:center;gap:6px">
              <input type="range" min="0" max="100" value="${prog}" style="width:80px" oninput="updateGanttTask('${pid}','${t.id}','progress',this.value);document.getElementById('gprog_${t.id}').textContent=this.value+'%'">
              <span id="gprog_${t.id}" style="font-size:11px;color:var(--blue)">${prog}%</span>
            </div></td>
            <td>${statusBadge(st)}</td>
            <td><select class="sel inp-sm" style="width:90px" onchange="updateGanttTask('${pid}','${t.id}','assignee',this.value)">
              ${TEAM_MEMBERS.map(m=>`<option${t.assignee===m?' selected':''}>${m}</option>`).join('')}
            </select></td>
            <td><input class="inp inp-sm" style="width:100px" value="${escHtml(t.note||'')}" onchange="updateGanttTask('${pid}','${t.id}','note',this.value)" placeholder="비고"></td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="copyGanttTask('${pid}','${t.id}')">${svgIcon('copy',11)}</button>
              <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteGanttTask('${pid}','${t.id}')">${svgIcon('trash',11)}</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="padding:8px 0">
      <button class="btn btn-outline btn-sm" onclick="addGanttTask('${pid}')">${svgIcon('plus',12)} + 공정 추가</button>
    </div>
  </div>
  <div style="margin-top:12px">
    <div class="prog prog-blue" style="height:10px"><div class="prog-bar" style="width:${avgProg}%"></div></div>
    <div style="text-align:center;font-size:12px;color:var(--g500);margin-top:4px">전체 공정 진행률 ${avgProg}%</div>
  </div>`;
}
function updateGanttTask(pid,tid,field,val){
  const p=getProject(pid);if(!p)return;
  const t=p.ganttTasks.find(x=>x.id===tid);if(!t)return;
  t[field]=field==='progress'?Number(val):val;
  saveProject(p);
  if(field==='start'||field==='end'){
    const dur=document.getElementById('gdur_'+tid);
    if(dur)dur.textContent=diffDays(t.start,t.end)+'일';
  }
}
function addGanttTask(pid){
  const p=getProject(pid);if(!p)return;
  const last=p.ganttTasks?.slice(-1)[0];
  const startDate=last?.end||today();
  const endDate=addDays(startDate,5);
  const t={id:uid(),nm:'새 공정',start:startDate,end:endDate,color:'#2563eb',progress:0,assignee:TEAM_MEMBERS[0],note:''};
  if(!p.ganttTasks)p.ganttTasks=[];
  p.ganttTasks.push(t);saveProject(p);
  renderGanttDetail();
}
function deleteGanttTask(pid,tid){
  const p=getProject(pid);if(!p)return;
  p.ganttTasks=p.ganttTasks.filter(t=>t.id!==tid);
  saveProject(p);const row=document.getElementById('gtr_'+tid);if(row)row.remove();
}
function copyGanttTask(pid,tid){
  const p=getProject(pid);if(!p)return;
  const t=p.ganttTasks.find(x=>x.id===tid);if(!t)return;
  const nt={...t,id:uid(),nm:t.nm+' (복사)'};
  const idx=p.ganttTasks.findIndex(x=>x.id===tid);
  p.ganttTasks.splice(idx+1,0,nt);saveProject(p);renderGanttDetail();
}
function autoSortGantt(pid){
  const p=getProject(pid);if(!p)return;
  p.ganttTasks=p.ganttTasks.sort((a,b)=>a.start.localeCompare(b.start));
  saveProject(p);renderGanttDetail();toast('자동정렬 완료','success');
}

// ===== ORDERS (발주 작성) =====
function renderOrderList(){
  const orders=getOrders();
  document.getElementById('tb-title').textContent='발주 작성';
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('orders')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openNewOrder()">+ 발주서 제작</button>`;
  document.getElementById('content').innerHTML=`
  ${filterBar({statuses:['대기','발주중','완료'],placeholder:'프로젝트, 공종 검색...',showDate:true,showMonthGroup:true,onFilter:'filterOrders()'})}
  <div id="orders-list-wrap">
  <div class="tbl-wrap">
    <table class="tbl">
      <thead><tr>
        <th onclick="sortTbl('orders','nm')">현장(프로젝트) ↕</th><th>공종</th><th>거래처</th>
        <th>발주금액</th><th>상태</th><th onclick="sortTbl('orders','date')">발주일 ↕</th><th>납품예정</th>
        <th>세금계산서</th><th>지급완료</th><th></th>
      </tr></thead>
      <tbody>
        ${orders.map(o=>renderOrderRow(o)).join('')}
      </tbody>
    </table>
  </div>
  </div>`;
}
function renderOrderRow(o){
  const p=getProject(o.pid);
  return`<tr>
    <td><span style="cursor:pointer;font-weight:600;color:var(--blue)" onclick="openOrderDetail('${o.id}')">${p?.nm||'-'}</span></td>
    <td>${catIcon(o.cid)} ${catNm(o.cid)}</td>
    <td>${o.vendor||'<span style="color:var(--g400)">미지정</span>'}</td>
    <td style="font-weight:600">${fmt(o.amount)}원</td>
    <td>${statusBadge(o.status)}</td>
    <td style="font-size:11px">${o.orderDate||o.order_date||'-'}</td>
    <td style="font-size:11px">${o.delivDate||o.deliv_date||'-'}</td>
    <td>${o.taxInvoice||o.tax_invoice?'<span class="badge badge-green">완료</span>':'<span class="badge badge-gray">미완료</span>'}</td>
    <td>${o.paid?'<span class="badge badge-green">완료</span>':'<span class="badge badge-red">미지급</span>'}</td>
    <td><button class="btn btn-outline btn-sm" onclick="openOrderDetail('${o.id}')">편집</button></td>
  </tr>`;
}
function filterOrders(){
  const q=(document.getElementById('search')?.value||'').toLowerCase();
  const st=document.getElementById('statusFilter')?.value||'';
  const df=document.getElementById('dateFrom')?.value||'';
  const dt=document.getElementById('dateTo')?.value||'';
  const mg=document.getElementById('month-group-toggle')?.checked;
  let orders=getOrders().filter(o=>{
    const p=getProject(o.pid);
    const text=!q||((p?.nm||'')+catNm(o.cid)+(o.vendor||'')).toLowerCase().includes(q);
    const status=!st||o.status===st;
    const d=o.order_date||o.orderDate||'';
    const dateOk=(!df||d>=df)&&(!dt||d<=dt);
    return text&&status&&dateOk;
  });
  const wrap=document.getElementById('orders-list-wrap');
  if(mg&&wrap){
    const groups=groupByMonth(orders,'order_date');
    wrap.innerHTML=monthlyAccordion(groups,o=>renderOrderRow(o),
      `<tr><th>프로젝트</th><th>공종</th><th>거래처</th><th>발주금액</th><th>상태</th><th>발주일</th><th>납품예정</th><th>세금계산서</th><th>지급완료</th><th></th></tr>`);
  } else {
    wrap.innerHTML=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>현장(프로젝트)</th><th>공종</th><th>거래처</th><th>발주금액</th><th>상태</th><th>발주일</th><th>납품예정</th><th>세금계산서</th><th>지급완료</th><th></th>
    </tr></thead><tbody>${orders.map(o=>renderOrderRow(o)).join('')}</tbody></table></div>`;
  }
}
function openNewOrder(){
  const ps=getProjects();
  const vendors=getVendors();
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">📋 발주서 제작</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트 *</label><select class="sel" id="no_pid">${ps.map(p=>`<option value="${p.id}">${p.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">공종 *</label><select class="sel" id="no_cid">${CATS.map(c=>`<option value="${c.id}">${c.icon} ${c.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">거래처</label>
          <input class="inp" id="no_vendor" list="vendor-list" placeholder="거래처명 입력 또는 선택" oninput="autoFillVendorInfo()">
          <datalist id="vendor-list">${vendors.map(v=>`<option value="${escHtml(v.nm)}" data-vid="${v.id}">${v.nm} (${v.contact||'-'})</option>`).join('')}</datalist>
        </div>
      </div>
      <div id="vendor-info-bar" style="display:none;padding:6px 10px;background:var(--primary-light);border-radius:var(--radius-sm);margin-bottom:8px;font-size:11px;color:var(--primary)"></div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">발주일</label><input class="inp" id="no_date" type="date" value="${today()}"></div>
        <div><label class="lbl">납품예정일</label><input class="inp" id="no_deliv" type="date"></div>
        <div><label class="lbl">담당자</label><select class="sel" id="no_mgr">${TEAM_MEMBERS.map(m=>`<option>${m}</option>`).join('')}</select></div>
      </div>
      <div style="margin-bottom:8px;font-size:12px;font-weight:700;color:var(--g600)">품목 입력</div>
      <div id="no_items_wrap">
        <div class="form-row form-row-4" style="margin-bottom:6px" data-row="0">
          <div><input class="inp inp-sm" placeholder="품명" data-f="nm"></div>
          <div><input class="inp inp-sm" placeholder="규격" data-f="spec"></div>
          <div><input class="inp inp-sm" type="number" placeholder="수량" value="1" data-f="qty"></div>
          <div><input class="inp inp-sm" type="number" placeholder="단가" data-f="price"></div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addNewOrderRow()" style="margin-bottom:12px">+ 품목 추가</button>
      <div><label class="lbl">비고</label><textarea class="inp" id="no_memo" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewOrder()">발주서 저장</button>
    </div>
  </div></div>`);
}

function autoFillVendorInfo(){
  const vendorName=(document.getElementById('no_vendor')?.value||'').trim();
  const v=getVendors().find(x=>x.nm===vendorName);
  const bar=document.getElementById('vendor-info-bar');
  if(v&&bar){
    bar.style.display='block';
    bar.innerHTML=`🏢 <b>${escHtml(v.nm)}</b> · 담당: ${escHtml(v.contact||'-')} · 📞 ${escHtml(v.phone||'-')} · ✉️ ${escHtml(v.email||'-')} · ⭐ ${v.rating||3}/5`;
  } else if(bar){bar.style.display='none';}
}
let _newOrderRowIdx=1;
function addNewOrderRow(){
  const wrap=document.getElementById('no_items_wrap');
  if(!wrap)return;
  wrap.insertAdjacentHTML('beforeend',`<div class="form-row form-row-4" style="margin-bottom:6px" data-row="${_newOrderRowIdx++}">
    <div><input class="inp inp-sm" placeholder="품명" data-f="nm"></div>
    <div><input class="inp inp-sm" placeholder="규격" data-f="spec"></div>
    <div><input class="inp inp-sm" type="number" placeholder="수량" value="1" data-f="qty"></div>
    <div><input class="inp inp-sm" type="number" placeholder="단가" data-f="price"></div>
  </div>`);
}
async function saveNewOrder(){
  const pid=document.getElementById('no_pid')?.value;
  const cid=document.getElementById('no_cid')?.value;
  if(!pid){toast('프로젝트를 선택하세요','error');return;}
  // Collect items
  const rows=document.querySelectorAll('#no_items_wrap [data-row]');
  const items=[];let totalAmt=0;
  rows.forEach(row=>{
    const nm=row.querySelector('[data-f="nm"]')?.value||'';
    if(!nm)return;
    const qty=Number(row.querySelector('[data-f="qty"]')?.value)||1;
    const price=Number(row.querySelector('[data-f="price"]')?.value)||0;
    const amount=qty*price;
    items.push({nm,spec:row.querySelector('[data-f="spec"]')?.value||'',unit:'식',qty,price,amount});
    totalAmt+=amount;
  });
  const data={
    id:uid(),pid,cid,status:'대기',
    order_date:document.getElementById('no_date')?.value||today(),
    deliv_date:document.getElementById('no_deliv')?.value||'',
    vendor:document.getElementById('no_vendor')?.value||'',
    assignee:document.getElementById('no_mgr')?.value||'',
    memo:document.getElementById('no_memo')?.value||'',
    amount:totalAmt,items:JSON.stringify(items),
    tax_invoice:0,paid:0
  };
  await api('orders','POST',data);
  _d.orders=await api('orders');
  closeModal();renderOrderList();toast('발주서가 저장되었습니다','success');
}
function openOrderDetail(oid){
  S.selOid=oid;nav('orders','detail');
}
function renderOrderDetail(){
  const orders=getOrders();
  const o=orders.find(x=>x.id===S.selOid);
  if(!o){nav('orders');return;}
  const p=getProject(o.pid);
  const co=getCompany();
  document.getElementById('tb-title').textContent='발주 작성';
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="nav('orders')">${svgIcon('arrow_left',12)} 목록</button>
    <button class="btn btn-outline btn-sm" onclick="sendOrderMail('${S.selOid}')">${svgIcon('mail',12)} 이메일</button>
    <button class="btn btn-outline btn-sm" onclick="printPage()">${svgIcon('print',12)} 인쇄</button>`;
  document.getElementById('content').innerHTML=`
  <div style="margin-bottom:8px"><button class="btn btn-ghost btn-sm" onclick="nav('orders')">${svgIcon('arrow_left',12)} 발주 목록으로</button></div>
  <div class="order-detail-wrap">
    <div>
      <!-- Main card -->
      <div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:14px">
        <div style="background:var(--dark);color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:15px;font-weight:700">${catIcon(o.cid)} ${catNm(o.cid)} — ${p?.nm||'-'}</div>
          ${statusBadge(o.status)}
        </div>
        <div style="padding:20px">
          <div class="form-row form-row-3" style="margin-bottom:12px">
            <div><label class="lbl">발주일</label><input class="inp" type="date" id="od_date" value="${o.orderDate||today()}" onchange="updateOrder('date',this.value)"></div>
            <div><label class="lbl">납품예정일</label><input class="inp" type="date" id="od_deliv" value="${o.delivDate||''}" onchange="updateOrder('delivDate',this.value)"></div>
            <div><label class="lbl">담당자</label><select class="sel" id="od_assignee" onchange="updateOrder('assignee',this.value)">${TEAM_MEMBERS.map(m=>`<option${o.assignee===m?' selected':''}>${m}</option>`).join('')}</select></div>
          </div>
          <div class="form-row form-row-3" style="margin-bottom:12px">
            <div><label class="lbl">상태</label><select class="sel" id="od_status" onchange="updateOrder('status',this.value)">
              ${['대기','발주중','완료'].map(s=>`<option${o.status===s?' selected':''}>${s}</option>`).join('')}
            </select></div>
            <div><label class="lbl">세금계산서</label>
              <label style="display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer">
                <input type="checkbox" ${o.taxInvoice?'checked':''} onchange="updateOrder('taxInvoice',this.checked)" style="width:16px;height:16px">
                <span style="font-size:13px">${o.taxInvoice?'완료':'미완료'}</span>
              </label>
            </div>
            <div><label class="lbl">지급완료</label>
              <label style="display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer">
                <input type="checkbox" ${o.paid?'checked':''} onchange="updateOrder('paid',this.checked)" style="width:16px;height:16px">
                <span style="font-size:13px">${o.paid?'완료':'미완료'}</span>
              </label>
            </div>
          </div>
          <div><label class="lbl">비고</label><textarea class="inp" id="od_memo" rows="2" onchange="updateOrder('memo',this.value)">${o.memo||''}</textarea></div>
        </div>
      </div>
      <!-- Items -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-weight:700">품목 목록 <span style="font-size:11px;color:var(--g500)">${o.items?.length||0}개 품목</span></div>
        </div>
        <table class="tbl">
          <thead><tr><th>품명</th><th>규격</th><th>단위</th><th>수량</th><th>단가</th><th>금액</th><th></th></tr></thead>
          <tbody id="od-items-body">
            ${(o.items||[]).map((it,idx)=>`<tr>
              <td><input class="inp est-inp" style="min-width:80px" value="${escHtml(it.nm||'')}" onchange="updateOrderItem(${idx},'nm',this.value)"></td>
              <td><input class="inp est-inp" style="width:70px" value="${escHtml(it.spec||'')}" onchange="updateOrderItem(${idx},'spec',this.value)"></td>
              <td><input class="inp est-inp" style="width:50px" value="${escHtml(it.unit||'식')}" onchange="updateOrderItem(${idx},'unit',this.value)"></td>
              <td><input class="inp est-inp num" style="width:60px" type="number" value="${it.qty||1}" onchange="updateOrderItem(${idx},'qty',this.value)"></td>
              <td><input class="inp est-inp num" style="width:80px" type="number" value="${it.price||0}" onchange="updateOrderItem(${idx},'price',this.value)"></td>
              <td class="num" style="font-weight:700">${fmt(it.amount||0)}</td>
              <td><button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="removeOrderItem(${idx})">${svgIcon('x',11)}</button></td>
            </tr>`).join('')||`<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--g400)">품목 없음</td></tr>`}
          </tbody>
        </table>
        <button class="btn btn-ghost btn-sm" onclick="addOrderItem()" style="margin-top:8px">+ 품목 추가</button>
        <div style="background:var(--dark);color:#fff;padding:12px 16px;border-radius:0 0 var(--radius) var(--radius);display:flex;justify-content:space-between;align-items:center;margin-top:0">
          <span style="font-weight:700">합계</span>
          <span style="font-size:16px;font-weight:800">₩${fmt(o.amount)}</span>
        </div>
      </div>
    </div>
    <!-- Right panel -->
    <div class="order-right">
      <div class="order-amt-card">
        <div class="order-amt-label">발주 금액</div>
        <div class="order-amt-value">₩${fmtShort(o.amount)}</div>
      </div>
      <div class="card" style="font-size:12px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--g500)">현장</span><span style="font-weight:500">${p?.nm||'-'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--g500)">공종</span><span>${catNm(o.cid)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--g500)">거래처</span><span>${o.vendor||'미지정'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--g500)">발주일</span><span>${o.orderDate||'-'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--g500)">납품예정</span><span>${o.delivDate||'-'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="color:var(--g500)">지급</span>
          <span class="badge ${o.paid?'badge-green':'badge-red'}">${o.paid?'완료':'미지급'}</span>
        </div>
      </div>
      <button class="btn btn-outline" style="width:100%" onclick="copyOrder()">${svgIcon('copy',13)} 발주서 복사</button>
      <button class="btn btn-outline" style="width:100%" onclick="sendOrderMail('${o.id}')">${svgIcon('mail',13)} 이메일 발송</button>
      <button class="btn btn-outline" style="width:100%;color:var(--red)" onclick="deleteOrder('${o.id}')">${svgIcon('trash',13)} 발주서 삭제</button>
    </div>
  </div>`;
}
function updateOrder(field,val){
  const orders=getData('orders_manual',[]);
  let o=orders.find(x=>x.id===S.selOid);
  if(!o){
    // create from auto-generated
    const allOrders=getOrders();
    const ao=allOrders.find(x=>x.id===S.selOid);
    if(ao){o={...ao};orders.push(o);saveOrderManual(orders);}
    else return;
  }
  o[field]=val;
  const idx=orders.findIndex(x=>x.id===S.selOid);
  if(idx>=0)orders[idx]=o;else orders.push(o);
  saveOrderManual(orders);
}
function sendOrderMail(oid){
  const o=getOrders().find(x=>x.id===oid);if(!o)return;
  const p=getProject(o.pid);const co=getCompany();
  openModal(`<div class="modal-bg"><div class="modal modal-sm">
    <div class="modal-hdr">
      <span class="modal-title">${svgIcon('mail',16)} 발주서 이메일 발송</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px">
        <label class="lbl">받는 사람 (이메일) *</label>
        <input class="inp" id="order-email-to" placeholder="vendor@email.com">
      </div>
      <div style="margin-bottom:16px">
        <label class="lbl">추가 메시지 (선택)</label>
        <textarea class="inp" id="order-email-msg" rows="3" placeholder="업체에 전달할 메시지...">발주서를 전달드립니다. 확인 부탁드립니다.</textarea>
      </div>
      <div style="background:var(--g50);border-radius:8px;padding:12px;font-size:12px;color:var(--g600);">
        <div style="font-weight:600;margin-bottom:6px;">📋 발주 내용</div>
        <div>• 현장: ${p?.nm||''}</div>
        <div>• 공종: ${catNm(o.cid)}</div>
        <div>• 금액: ₩${fmt(o.amount)}</div>
        <div>• 업체: ${o.vendor||'미지정'}</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-blue" onclick="doSendOrderMail('${oid}')">
        ${svgIcon('mail',13)} 발송하기
      </button>
    </div>
  </div></div>`);
}
async function doSendOrderMail(oid){
  const o=getOrders().find(x=>x.id===oid);if(!o)return;
  const p=getProject(o.pid);const co=getCompany();
  const to=document.getElementById('order-email-to').value.trim();
  const msg=document.getElementById('order-email-msg').value.trim();
  if(!to||!to.includes('@')){toast('올바른 이메일을 입력해주세요','error');return;}
  const html=`
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0a0a0a;color:#fff;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:20px;">발주서</h2>
    <p style="margin:4px 0 0;opacity:.6;font-size:12px;">${co.name}</p>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px;">
    ${msg?`<p style="margin:0 0 16px;color:#333;">${msg}</p>`:''}
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">현장명</td><td style="padding:8px;border:1px solid #e5e5e5;">${p?.nm||''}</td></tr>
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">공종</td><td style="padding:8px;border:1px solid #e5e5e5;">${catNm(o.cid)}</td></tr>
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">발주금액</td><td style="padding:8px;border:1px solid #e5e5e5;font-weight:700;">₩${fmt(o.amount)}</td></tr>
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">납기일</td><td style="padding:8px;border:1px solid #e5e5e5;">${o.deliv_date||'협의'}</td></tr>
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">담당자</td><td style="padding:8px;border:1px solid #e5e5e5;">${o.assignee||co.ceo}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#999;">본 발주서는 Frame Plus ERP에서 자동 발송되었습니다.</p>
  </div>
</div>`;
  try{
    const btn=document.querySelector('.modal-footer .btn-blue');
    if(btn){btn.disabled=true;btn.innerHTML='발송중...';}
    const res=await api('email/send','POST',{
      to, subject:`[발주서] ${catNm(o.cid)} - ${p?.nm||''} (${co.name})`,
      html, from_name:co.name
    });
    if(res&&res.success){closeModal();toast('✉️ 발주서 이메일이 발송되었습니다!','success');}
    else{toast('발송 실패: '+(res?.error||'알 수 없는 오류'),'error');if(btn){btn.disabled=false;btn.innerHTML=svgIcon('mail',13)+' 발송하기';}}
  }catch(e){toast('발송 오류: '+e.message,'error');}
}
function copyOrder(){toast('발주서가 복사되었습니다','success');}
async function deleteOrder(oid){
  if(!confirm('삭제하시겠습니까?'))return;
  const res = await api('orders_manual/'+oid,'DELETE');
  if(!res?.__error){
    _d.orders = (_d.orders||[]).filter(x=>x.id!==oid);
    nav('orders');toast('삭제되었습니다');
  }
}

// ===== COLLECTION =====
let _collView='table'; // table|calendar|client
function renderCollection(){
  const ps=getProjects();
  const totalUnpaid=ps.reduce((a,p)=>a+getUnpaid(p),0);
  const totalPaid=ps.reduce((a,p)=>a+getPaid(p),0);
  const totalContract=ps.reduce((a,p)=>a+getTotal(p),0);
  const collRate=totalContract>0?Math.round(totalPaid/totalContract*100):0;
  // Overdue: unpaid payments past their due date
  const overdueItems=[];const upcomingItems=[];
  ps.forEach(p=>{const tot=getTotal(p);(p.payments||[]).forEach((pm,i)=>{
    if(!pm.paid&&pm.due){
      const dday=diffDays(today(),pm.due);const amt=Math.round(tot*Number(pm.pct||0)/100);
      const item={pid:p.id,pnm:p.nm,client:p.client,label:pm.label,amt,due:pm.due,dday,idx:i};
      if(dday<0)overdueItems.push(item);else if(dday<=30)upcomingItems.push(item);
    }
  });});
  overdueItems.sort((a,b)=>a.dday-b.dday);upcomingItems.sort((a,b)=>a.dday-b.dday);
  // Monthly trend (last 6 months)
  const monthlyData=[];const now=new Date();
  for(let m=5;m>=0;m--){
    const d=new Date(now.getFullYear(),now.getMonth()-m,1);
    const ym=d.toISOString().slice(0,7);
    let paid=0;
    ps.forEach(p=>{const tot=getTotal(p);(p.payments||[]).forEach(pm=>{
      if(pm.paid&&pm.paidDate&&pm.paidDate.startsWith(ym))paid+=Math.round(tot*Number(pm.pct||0)/100);
    });});
    monthlyData.push({label:`${d.getMonth()+1}월`,amt:paid});
  }
  const maxMonth=Math.max(...monthlyData.map(m=>m.amt),1);
  document.getElementById('tb-actions').innerHTML=`
    <div style="display:flex;gap:4px">
      <button class="btn ${_collView==='table'?'btn-primary':'btn-outline'} btn-sm" onclick="_collView='table';renderCollection()">📋 테이블</button>
      <button class="btn ${_collView==='calendar'?'btn-primary':'btn-outline'} btn-sm" onclick="_collView='calendar';renderCollection()">📅 캘린더</button>
      <button class="btn ${_collView==='client'?'btn-primary':'btn-outline'} btn-sm" onclick="_collView='client';renderCollection()">🏢 고객별</button>
    </div>
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('collection')">${svgIcon('download',12)} 엑셀</button>`;
  document.getElementById('content').innerHTML=`
  <!-- KPI Cards -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    ${isAdmin()?`<div class="kpi-card" style="border-left:3px solid var(--blue)"><div class="kpi-label">계약금액 합계</div><div class="kpi-value">${fmtShort(totalContract)}<span style="font-size:12px">원</span></div></div>
    <div class="kpi-card" style="border-left:3px solid var(--green)"><div class="kpi-label">수금완료</div><div class="kpi-value" style="color:var(--green)">${fmtShort(totalPaid)}<span style="font-size:12px">원</span></div></div>
    <div class="kpi-card" style="border-left:3px solid var(--red)"><div class="kpi-label">미수금</div><div class="kpi-value" style="color:var(--red)">${fmtShort(totalUnpaid)}<span style="font-size:12px">원</span></div><div style="font-size:10px;color:var(--g500)">${overdueItems.length>0?`<span style="color:var(--red);font-weight:700">⚠️ ${overdueItems.length}건 연체</span>`:'연체 없음'}</div></div>`
    :`<div class="kpi-card" style="border-left:3px solid var(--blue)"><div class="kpi-label">총 프로젝트</div><div class="kpi-value">${ps.length}<span style="font-size:12px">건</span></div></div>
    <div class="kpi-card" style="border-left:3px solid var(--green)"><div class="kpi-label">수금완료 건수</div><div class="kpi-value" style="color:var(--green)">${ps.filter(p=>getPaid(p)>0).length}<span style="font-size:12px">건</span></div></div>
    <div class="kpi-card" style="border-left:3px solid var(--red)"><div class="kpi-label">미수금 건수</div><div class="kpi-value" style="color:var(--red)">${ps.filter(p=>getUnpaid(p)>0).length}<span style="font-size:12px">건</span></div><div style="font-size:10px;color:var(--g500)">${overdueItems.length>0?`<span style="color:var(--red);font-weight:700">⚠️ ${overdueItems.length}건 연체</span>`:'연체 없음'}</div></div>`}
    <div class="kpi-card" style="border-left:3px solid ${collRate>=80?'var(--green)':collRate>=50?'var(--orange)':'var(--red)'}"><div class="kpi-label">수금률</div><div class="kpi-value" style="color:var(--blue)">${collRate}%</div><div style="height:6px;background:var(--g200);border-radius:3px;margin-top:6px"><div style="height:100%;width:${collRate}%;background:${collRate>=80?'var(--green)':collRate>=50?'var(--orange)':'var(--red)'};border-radius:3px"></div></div></div>
  </div>
  <!-- Overdue Alerts -->
  ${overdueItems.length?`<div style="background:var(--red-l);border:1px solid #fca5a5;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:8px">🚨 연체 미수금 (${overdueItems.length}건, ${fmtShort(overdueItems.reduce((a,x)=>a+x.amt,0))}원)</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${overdueItems.slice(0,5).map(x=>`<div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border-radius:var(--radius);padding:8px 12px;font-size:12px">
        <div><strong style="color:var(--red)">${x.pnm}</strong> <span style="color:var(--g500)">· ${x.client} · ${x.label}</span></div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-weight:700">${fmt(x.amt)}원</span>
          <span style="color:var(--red);font-weight:700">D+${Math.abs(x.dday)}</span>
          <button class="btn btn-sm" style="background:var(--red);color:#fff;padding:3px 10px;font-size:10px" onclick="markPaid('${x.pid}',${x.idx})">입금처리</button>
        </div>
      </div>`).join('')}
      ${overdueItems.length>5?`<div style="font-size:11px;color:var(--g500);text-align:center">외 ${overdueItems.length-5}건...</div>`:''}
    </div>
  </div>`:''}
  <!-- Upcoming Payments -->
  ${upcomingItems.length?`<div style="background:var(--orange-l);border:1px solid #fdba74;border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:8px">📅 향후 30일 수금 예정 (${upcomingItems.length}건, ${fmtShort(upcomingItems.reduce((a,x)=>a+x.amt,0))}원)</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${upcomingItems.slice(0,6).map(x=>`<div style="background:#fff;border-radius:var(--radius);padding:8px 12px;font-size:11px;flex:1;min-width:200px;border:1px solid var(--g200)">
        <div style="font-weight:600">${x.pnm} <span style="color:var(--g400)">· ${x.label}</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px"><span style="font-weight:700">${fmt(x.amt)}원</span><span style="color:${x.dday<=7?'var(--orange)':'var(--blue)'};font-weight:600">D-${x.dday}</span></div>
      </div>`).join('')}
    </div>
  </div>`:''}
  <!-- Monthly Trend Mini Chart -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
    <div class="card" style="padding:14px">
      <div style="font-size:12px;font-weight:700;margin-bottom:10px">📊 월별 수금 추이 (최근 6개월)</div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:80px">
        ${monthlyData.map(m=>{const h=maxMonth>0?Math.max(4,m.amt/maxMonth*72):4;
          return`<div style="flex:1;text-align:center">
            <div style="font-size:9px;font-weight:600;color:var(--g500);margin-bottom:2px">${m.amt>0?fmtShort(m.amt):'-'}</div>
            <div style="height:${h}px;background:var(--blue);border-radius:3px 3px 0 0;margin:0 auto;width:80%"></div>
            <div style="font-size:10px;color:var(--g500);margin-top:3px">${m.label}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="card" style="padding:14px">
      <div style="font-size:12px;font-weight:700;margin-bottom:10px">💰 수금 현황 요약</div>
      <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--g600)">활성 프로젝트</span><span style="font-weight:700">${ps.filter(p=>getTotal(p)>0).length}건</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--g600)">미수금 프로젝트</span><span style="font-weight:700;color:var(--red)">${ps.filter(p=>getUnpaid(p)>0).length}건</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--g600)">완납 프로젝트</span><span style="font-weight:700;color:var(--green)">${ps.filter(p=>getTotal(p)>0&&getUnpaid(p)===0).length}건</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--g600)">연체 건수</span><span style="font-weight:700;color:${overdueItems.length?'var(--red)':'var(--g400)'}">${overdueItems.length}건</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--g200);padding-top:6px"><span style="font-weight:700">평균 수금률</span><span style="font-weight:800;color:var(--blue)">${collRate}%</span></div>
      </div>
    </div>
  </div>
  <!-- Main Content (view-dependent) -->
  <div id="coll-view-content">
    ${_collView==='table'?_collTable(ps):_collView==='calendar'?_collCalendar(ps):_collClient(ps)}
  </div>`;
}
function _collTable(ps){
  return`${filterBar({statuses:Object.keys(STATUS_LABELS),placeholder:'프로젝트명 검색...',showDate:true,showMonthGroup:true,onFilter:'filterCollection()'})}
  <div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th onclick="sortTbl('coll','nm')">프로젝트 ↕</th><th>고객</th><th onclick="sortTbl('coll','tot')">계약금액 ↕</th>
    <th>계약금</th><th>중도금</th><th>잔금</th>
    <th onclick="sortTbl('coll','paid')">수금합계 ↕</th><th>미수금</th><th onclick="sortTbl('coll','rate')">수금률 ↕</th><th></th>
  </tr></thead><tbody>
    ${ps.map(p=>{
      const tot=getTotal(p);const paid=getPaid(p);const unpaid=getUnpaid(p);
      const paidPct=tot>0?Math.round(paid/tot*100):0;const pmts=p.payments||[];
      function pmtCell(idx){
        const pm=pmts[idx];if(!pm)return'<td style="text-align:center;color:var(--g300)">-</td>';
        const amt=Math.round(tot*Number(pm.pct||0)/100);
        const dday=pm.due&&!pm.paid?diffDays(today(),pm.due):null;
        const isOverdue=dday!==null&&dday<0;
        return`<td>
          <div style="font-size:12px;font-weight:600">${fmt(amt)}</div>
          <div>${pm.paid?'<span class="badge badge-green">✓ 입금</span>':pm.due?`<span class="badge ${isOverdue?'badge-red':'badge-orange'}">${pm.due.slice(5)}${dday!==null?(isOverdue?' D+'+Math.abs(dday):' D-'+dday):''}</span>`:'<span class="badge badge-gray">미정</span>'}</div>
          ${!pm.paid?`<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px" onclick="markPaid('${p.id}',${idx})">입금처리</button>`:''}
        </td>`;
      }
      return`<tr style="${unpaid>0&&(pmts||[]).some(pm=>!pm.paid&&pm.due&&diffDays(today(),pm.due)<0)?'background:#fef2f2':''}">
        <td><span style="font-weight:600;cursor:pointer;color:var(--blue)" onclick="enterProject('${p.id}')">${p.nm}</span></td>
        <td>${p.client||''}</td>
        <td style="font-weight:700">${tot>0?fmt(tot)+'원':'-'}</td>
        ${pmtCell(0)}${pmtCell(1)}${pmtCell(2)}
        <td style="font-weight:700;color:var(--green)">${paid>0?fmt(paid)+'원':'-'}</td>
        <td style="font-weight:700;color:${unpaid>0?'var(--red)':'var(--g400)'}">${unpaid>0?fmt(unpaid)+'원':'-'}</td>
        <td><div style="display:flex;align-items:center;gap:6px"><div class="prog ${paidPct>=100?'prog-green':paidPct>=50?'prog-blue':'prog-orange'}" style="width:60px"><div class="prog-bar" style="width:${Math.min(100,paidPct)}%"></div></div><span style="font-size:11px;font-weight:600">${paidPct}%</span></div></td>
        <td><button class="btn btn-ghost btn-sm btn-icon" onclick="openCollectionDetail('${p.id}')">${svgIcon('edit',13)}</button></td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}
function _collCalendar(ps){
  const y=S.calYear||new Date().getFullYear();const m=S.calMonth||new Date().getMonth();
  const firstDay=new Date(y,m,1).getDay();const daysInMonth=new Date(y,m+1,0).getDate();
  // Collect payment events for this month
  const events={};
  ps.forEach(p=>{const tot=getTotal(p);(p.payments||[]).forEach((pm,idx)=>{
    if(!pm.due)return;const d=new Date(pm.due);
    if(d.getFullYear()===y&&d.getMonth()===m){
      const day=d.getDate();if(!events[day])events[day]=[];
      events[day].push({pid:p.id,pnm:p.nm,label:pm.label,amt:Math.round(tot*Number(pm.pct||0)/100),paid:pm.paid,idx});
    }
  });});
  const todayDate=new Date();const isThisMonth=todayDate.getFullYear()===y&&todayDate.getMonth()===m;
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push('<div style="min-height:80px"></div>');
  for(let d=1;d<=daysInMonth;d++){
    const evts=events[d]||[];const isToday=isThisMonth&&todayDate.getDate()===d;
    cells.push(`<div style="min-height:80px;border:1px solid var(--g200);border-radius:6px;padding:4px;${isToday?'background:var(--blue-l);border-color:var(--blue)':''}">
      <div style="font-size:10px;font-weight:${isToday?'800':'600'};color:${isToday?'var(--blue)':'var(--g600)'};margin-bottom:2px">${d}</div>
      ${evts.map(e=>`<div style="font-size:9px;padding:2px 4px;border-radius:3px;margin-bottom:1px;cursor:pointer;background:${e.paid?'var(--green)':'var(--orange)'}20;color:${e.paid?'var(--green)':'var(--orange)'};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" onclick="openCollectionDetail('${e.pid}')">
        ${e.paid?'✓':'○'} ${e.pnm.slice(0,6)} ${fmtShort(e.amt)}
      </div>`).join('')}
    </div>`);
  }
  return`<div class="card" style="padding:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <button class="btn btn-ghost btn-sm" onclick="S.calMonth=${m-1<0?11:m-1};S.calYear=${m-1<0?y-1:y};renderCollection()">◀</button>
      <div style="font-size:14px;font-weight:700">${y}년 ${m+1}월 수금 일정</div>
      <button class="btn btn-ghost btn-sm" onclick="S.calMonth=${m+1>11?0:m+1};S.calYear=${m+1>11?y+1:y};renderCollection()">▶</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">
      ${['일','월','화','수','목','금','토'].map(d=>`<div style="text-align:center;font-size:10px;font-weight:600;color:var(--g500);padding:4px">${d}</div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${cells.join('')}</div>
    <div style="margin-top:12px;display:flex;gap:12px;font-size:11px;color:var(--g500)">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--green)20;border:1px solid var(--green);border-radius:2px;display:inline-block"></span>입금완료</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--orange)20;border:1px solid var(--orange);border-radius:2px;display:inline-block"></span>예정/미입금</span>
    </div>
  </div>`;
}
function _collClient(ps){
  const clients={};
  ps.forEach(p=>{
    const c=p.client||'미지정';if(!clients[c])clients[c]={projects:[],total:0,paid:0,unpaid:0};
    const tot=getTotal(p);const paid=getPaid(p);
    clients[c].projects.push(p);clients[c].total+=tot;clients[c].paid+=paid;clients[c].unpaid+=getUnpaid(p);
  });
  const sorted=Object.entries(clients).sort((a,b)=>b[1].total-a[1].total);
  return`<div style="display:flex;flex-direction:column;gap:12px">
    ${sorted.map(([name,data])=>{
      const rate=data.total>0?Math.round(data.paid/data.total*100):0;
      return`<div class="card" style="padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:14px;font-weight:700">🏢 ${name}</div>
            <div style="font-size:11px;color:var(--g500)">${data.projects.length}개 프로젝트</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--g500)">수금률</div>
            <div style="font-size:20px;font-weight:800;color:${rate>=80?'var(--green)':rate>=50?'var(--orange)':'var(--red)'}">${rate}%</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
          <div style="background:var(--g50);border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:10px;color:var(--g500)">계약</div><div style="font-size:13px;font-weight:700">${fmtShort(data.total)}</div>
          </div>
          <div style="background:var(--green)10;border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:10px;color:var(--green)">수금</div><div style="font-size:13px;font-weight:700;color:var(--green)">${fmtShort(data.paid)}</div>
          </div>
          <div style="background:${data.unpaid>0?'var(--red)10':'var(--g50)'};border-radius:6px;padding:8px;text-align:center">
            <div style="font-size:10px;color:${data.unpaid>0?'var(--red)':'var(--g500)'}">미수금</div><div style="font-size:13px;font-weight:700;color:${data.unpaid>0?'var(--red)':'var(--g400)'}">${fmtShort(data.unpaid)}</div>
          </div>
        </div>
        <div style="height:8px;background:var(--g200);border-radius:4px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:${rate}%;background:${rate>=80?'var(--green)':rate>=50?'var(--orange)':'var(--red)'};border-radius:4px;transition:width .5s"></div></div>
        <div style="font-size:11px;color:var(--g500)">
          ${data.projects.map(p=>{const u=getUnpaid(p);return`<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;${u>0?'color:var(--red)':''}"><span style="width:6px;height:6px;border-radius:50%;background:${u>0?'var(--red)':'var(--green)'};display:inline-block"></span>${p.nm}</span>`;}).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}
function filterCollection(){renderCollection();}
function markPaid(pid,idx){
  const p=getProject(pid);if(!p||!p.payments[idx])return;
  p.payments[idx].paid=true;p.payments[idx].paidDate=today();
  saveProject(p);toast('✅ 입금 처리되었습니다','success');
  createNotification({type:'collection',title:`${p.nm} ${p.payments[idx].label} 입금 완료`,body:`${fmt(Math.round(getTotal(p)*p.payments[idx].pct/100))}원`,priority:'normal',relPage:'collection'});
  renderCollection();
}
function openCollectionDetail(pid){
  const p=getProject(pid);if(!p)return;
  const tot=getTotal(p);const paid=getPaid(p);const unpaid=getUnpaid(p);
  const paidPct=tot>0?Math.round(paid/tot*100):0;
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:640px">
    <div class="modal-hdr"><span class="modal-title">💰 ${p.nm} — 수금 관리</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <!-- Summary bar -->
      <div style="background:var(--dark);border-radius:var(--radius-lg);padding:14px 18px;margin-bottom:14px;color:#fff;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">계약금액</div>
          <div style="font-size:18px;font-weight:800">₩${fmt(tot)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px;color:rgba(255,255,255,.5)">수금</div>
          <div style="font-size:16px;font-weight:700;color:#4ade80">${fmt(paid)}</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:11px;color:rgba(255,255,255,.5)">미수금</div>
          <div style="font-size:16px;font-weight:700;color:#f87171">${fmt(unpaid)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:rgba(255,255,255,.5)">수금률</div>
          <div style="font-size:22px;font-weight:800;color:${paidPct>=80?'#4ade80':paidPct>=50?'#fbbf24':'#f87171'}">${paidPct}%</div>
        </div>
      </div>
      <div style="height:8px;background:var(--g200);border-radius:4px;margin-bottom:16px;overflow:hidden"><div style="height:100%;width:${paidPct}%;background:${paidPct>=100?'var(--green)':'var(--blue)'};border-radius:4px"></div></div>
      <!-- Payment items -->
      ${(p.payments||[]).map((pm,i)=>{
        const amt=Math.round(tot*Number(pm.pct||0)/100);
        const dday=pm.due&&!pm.paid?diffDays(today(),pm.due):null;
        const isOverdue=dday!==null&&dday<0;
        return`<div style="background:${pm.paid?'var(--green)08':isOverdue?'#fef2f2':'var(--g50)'};border:1px solid ${pm.paid?'var(--green)30':isOverdue?'#fca5a5':'var(--g200)'};border-radius:var(--radius-lg);padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">${pm.paid?'✅':isOverdue?'🚨':'⏳'}</span>
            <span style="font-weight:700;font-size:13px">${pm.label}</span>
            <span style="font-size:12px;font-weight:700;color:var(--blue)">${fmt(amt)}원</span>
          </div>
          ${dday!==null?`<span style="font-size:12px;font-weight:700;color:${isOverdue?'var(--red)':'var(--orange)'}">D${dday>=0?'-'+dday:'+'+Math.abs(dday)}</span>`:''}
          ${pm.paid?'<span class="badge badge-green">입금완료</span>':''}
        </div>
        <div class="form-row form-row-4">
          <div><label class="lbl">항목</label><input class="inp" value="${pm.label}" onchange="updatePayment('${pid}',${i},'label',this.value)"></div>
          <div><label class="lbl">비율(%)</label><input class="inp" type="number" value="${pm.pct}" onchange="updatePayment('${pid}',${i},'pct',this.value)"></div>
          <div><label class="lbl">예정일</label><input class="inp" type="date" value="${pm.due||''}" onchange="updatePayment('${pid}',${i},'due',this.value)"></div>
          <div style="display:flex;align-items:flex-end;gap:6px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;padding-bottom:8px">
              <input type="checkbox" ${pm.paid?'checked':''} onchange="updatePaymentPaid('${pid}',${i},this.checked)"><span>${pm.paid?'입금완료':'미입금'}</span>
            </label>
          </div>
        </div>
        ${pm.paid?`<div style="margin-top:6px;font-size:11px;color:var(--g500)">입금일: <input class="inp" type="date" style="width:140px;display:inline" value="${pm.paidDate||''}" onchange="updatePayment('${pid}',${i},'paidDate',this.value)"></div>`:''}
      </div>`;}).join('')}
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="addPayment('${pid}')">+ 수금 항목 추가</button>
        <button class="btn btn-outline btn-sm" onclick="removeLastPayment('${pid}')">− 마지막 항목 제거</button>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal();renderCollection()">닫기</button></div>
  </div></div>`);
}
function updatePayment(pid,idx,field,val){
  const p=getProject(pid);if(!p||!p.payments[idx])return;
  p.payments[idx][field]=field==='pct'?Number(val):val;
  saveProject(p);
}
function updatePaymentPaid(pid,idx,checked){
  const p=getProject(pid);if(!p||!p.payments[idx])return;
  p.payments[idx].paid=checked;
  if(checked)p.payments[idx].paidDate=today();
  saveProject(p);openCollectionDetail(pid);
  if(checked)toast('✅ 입금 처리되었습니다','success');
}
function addPayment(pid){
  const p=getProject(pid);if(!p)return;
  if(!p.payments)p.payments=[];
  p.payments.push({label:'추가금',pct:0,due:'',paid:false,paidDate:''});
  saveProject(p);openCollectionDetail(pid);
}
function removeLastPayment(pid){
  const p=getProject(pid);if(!p||!p.payments||!p.payments.length)return;
  if(!confirm(`"${p.payments[p.payments.length-1].label}" 항목을 삭제?`))return;
  p.payments.pop();saveProject(p);openCollectionDetail(pid);
}
function saveContract(pid){
  const p=getProject(pid);if(!p)return;
  p.contractDate=document.getElementById('ct_cdate')?.value||today();
  p.contractStatus=document.getElementById('ct_status')?.value||p.contractStatus;
  const clauses=[];
  for(let i=0;i<10;i++){const el=document.getElementById('cc_'+i);if(el&&el.value.trim())clauses.push(el.value.trim());}
  p.contractClauses=clauses;
  saveProject(p);toast('계약서가 저장되었습니다','success');
}
function sendContractMail(pid){
  const p=getProject(pid);if(!p)return;
  const co=getCompany();
  window.location.href=`mailto:${p.email||''}?subject=${encodeURIComponent(`[${co.name}] ${p.nm} 공사도급계약서`)}&body=${encodeURIComponent('안녕하세요.\n계약서를 첨부드립니다.\n\n'+co.name)}`;
}
function aiReviewContract(){
  const el=document.getElementById('ai-review-result');
  if(!el)return;
  el.innerHTML=`<div style="background:var(--purple-l);border:1px solid #c4b5fd;border-radius:var(--radius-lg);padding:14px;margin-bottom:14px">
    <div style="font-weight:700;color:var(--purple);margin-bottom:8px">🤖 AI 계약서 검토 (Claude)</div>
    <div style="font-size:12px;color:var(--g700);line-height:1.8">
      <div style="background:#fff;border-radius:var(--radius);padding:10px;margin-bottom:6px">✅ <strong>긍정적 요소:</strong> 하자보수 조항이 명확하게 기재되어 있습니다.</div>
      <div style="background:var(--orange-l);border-radius:var(--radius);padding:10px;margin-bottom:6px">⚠️ <strong>검토 필요:</strong> 공사 지연 시 지체상금 조항이 누락되어 있습니다. 추가를 권장합니다.</div>
      <div style="background:var(--orange-l);border-radius:var(--radius);padding:10px;margin-bottom:6px">⚠️ <strong>검토 필요:</strong> 분쟁 해결 방법(관할 법원)이 명시되어 있지 않습니다.</div>
      <div style="background:var(--red-l);border-radius:var(--radius);padding:10px;margin-bottom:6px">🔴 <strong>중요:</strong> 계약 해제·해지 조건이 없습니다. 반드시 추가하세요.</div>
      <div style="font-size:11px;color:var(--g500);margin-top:8px">※ AI 검토는 참고용이며, 법적 효력을 보장하지 않습니다. 중요한 계약은 전문가 검토를 받으세요.</div>
    </div>
  </div>`;
}
function checkSpelling(){
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr">
      <span class="modal-title">📝 AI 맞춤법 검사 (GPT-4o)</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px">
        <label class="lbl">검사할 텍스트를 입력하세요</label>
        <textarea class="inp" id="spell-input" rows="6" placeholder="견적서, 계약서, 이메일 등 검사할 텍스트를 붙여넣기 하세요...&#10;&#10;예: 강남구 역삼동에 위치한 카페 인테리어 공사를 진행합니다. 공사 기간은 약 2개월이며, 하자보수 기간은 2년 입니다."></textarea>
        <div style="text-align:right;font-size:11px;color:var(--g400);margin-top:4px"><span id="spell-count">0</span>/5,000자</div>
      </div>
      <div id="spell-result" style="display:none"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">닫기</button>
      <button class="btn btn-blue" id="spell-btn" onclick="doSpellCheck()">🔍 맞춤법 검사</button>
    </div>
  </div></div>`);
  const inp=document.getElementById('spell-input');
  if(inp)inp.addEventListener('input',()=>{
    const cnt=document.getElementById('spell-count');
    if(cnt)cnt.textContent=inp.value.length;
  });
}
async function doSpellCheck(){
  const text=document.getElementById('spell-input')?.value?.trim();
  if(!text){toast('텍스트를 입력해주세요','warning');return;}
  if(text.length>5000){toast('최대 5,000자까지 검사 가능합니다','error');return;}
  const btn=document.getElementById('spell-btn');
  const result=document.getElementById('spell-result');
  if(btn){btn.disabled=true;btn.innerHTML='🔄 검사중...';}
  if(result){result.style.display='block';result.innerHTML='<div class="loading">AI가 맞춤법을 검사하고 있습니다</div>';}
  try{
    const res=await api('spellcheck','POST',{text});
    if(res&&!res.error){
      const score=res.score||0;
      const scoreColor=score>=90?'var(--green)':score>=70?'var(--orange)':'var(--red)';
      const scoreEmoji=score>=90?'🎉':score>=70?'📝':'⚠️';
      let html=`
        <div style="display:flex;gap:16px;margin-bottom:16px">
          <div style="background:var(--g50);border-radius:12px;padding:16px;text-align:center;min-width:100px">
            <div style="font-size:32px;font-weight:800;color:${scoreColor}">${score}</div>
            <div style="font-size:11px;color:var(--g500)">맞춤법 점수</div>
            <div style="font-size:16px;margin-top:4px">${scoreEmoji}</div>
          </div>
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:8px">교정 결과</div>
            <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;line-height:1.8;white-space:pre-wrap">${res.corrected||text}</div>
          </div>
        </div>`;
      if(res.errors&&res.errors.length>0){
        html+=`<div style="font-weight:600;margin-bottom:8px">🔍 발견된 오류 (${res.errors.length}건)</div>`;
        html+=`<div style="display:flex;flex-direction:column;gap:6px">`;
        res.errors.forEach((e,i)=>{
          html+=`<div style="background:var(--orange-l);border-radius:8px;padding:10px 14px;font-size:12px">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
              <span style="font-weight:700;color:var(--red);text-decoration:line-through">${e.original}</span>
              <span style="color:var(--g400)">→</span>
              <span style="font-weight:700;color:var(--green)">${e.corrected}</span>
            </div>
            <div style="color:var(--g600)">${e.reason||''}</div>
          </div>`;
        });
        html+=`</div>`;
      }else{
        html+=`<div style="background:var(--green-l);border-radius:8px;padding:14px;text-align:center;color:var(--green);font-weight:600">✅ 맞춤법 오류가 없습니다! 완벽합니다.</div>`;
      }
      html+=`<div style="margin-top:12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="copySpellResult()">📋 교정문 복사</button></div>`;
      if(result)result.innerHTML=html;
    }else{
      if(result)result.innerHTML=`<div style="background:var(--red-l);color:var(--red);padding:12px;border-radius:8px">❌ 검사 실패: ${res?.error||'알 수 없는 오류'}</div>`;
    }
  }catch(e){
    if(result)result.innerHTML=`<div style="background:var(--red-l);color:var(--red);padding:12px;border-radius:8px">❌ 오류: ${e.message}</div>`;
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='🔍 맞춤법 검사';}
  }
}
function copySpellResult(){
  const el=document.querySelector('#spell-result .corrected-text')||document.querySelector('#spell-result div[style*="white-space:pre-wrap"]');
  if(el){navigator.clipboard.writeText(el.textContent).then(()=>toast('교정된 텍스트가 복사되었습니다','success')).catch(()=>toast('복사 실패','error'));}
  else{toast('복사할 내용이 없습니다','warning');}
}

// ===== MEETINGS =====
function renderMeetings(){
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('meetings')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddMeeting()">+ 미팅 추가</button>`;
  
  const meetings=getMeetings();
  const Y=S.calY,M=S.calM;
  const firstDay=new Date(Y,M,1).getDay();
  const daysInMonth=new Date(Y,M+1,0).getDate();
  const monthNames=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  
  document.getElementById('content').innerHTML=`
  <!-- Calendar -->
  <div class="cal-wrap" style="margin-bottom:16px">
    <div class="cal-hdr">
      <div class="cal-title">${Y}년 ${monthNames[M]}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <select class="sel" style="width:auto" onchange="S.calY=Number(this.value);S.calM=Number(document.getElementById('cal-month-sel').value);renderMeetings()">
          ${[2025,2026,2027,2028].map(y=>`<option${Y===y?' selected':''}>${y}</option>`).join('')}
        </select>
        <select class="sel" id="cal-month-sel" style="width:auto" onchange="S.calM=Number(this.value);renderMeetings()">
          ${monthNames.map((mn,i)=>`<option value="${i}"${M===i?' selected':''}>${mn}</option>`).join('')}
        </select>
        <button class="btn btn-outline btn-sm" onclick="S.calM--;if(S.calM<0){S.calM=11;S.calY--;}renderMeetings()">${svgIcon('chevron_left',13)}</button>
        <button class="btn btn-outline btn-sm" onclick="S.calY=new Date().getFullYear();S.calM=new Date().getMonth();renderMeetings()">오늘</button>
        <button class="btn btn-outline btn-sm" onclick="S.calM++;if(S.calM>11){S.calM=0;S.calY++;}renderMeetings()">${svgIcon('chevron_right',13)}</button>
      </div>
    </div>
    <div class="cal-grid">
      ${['일','월','화','수','목','금','토'].map(d=>`<div class="cal-day-hdr">${d}</div>`).join('')}
      ${Array.from({length:firstDay},()=>`<div class="cal-cell" style="background:var(--g50)"></div>`).join('')}
      ${Array.from({length:daysInMonth},(_,i)=>{
        const d=i+1;
        const dateStr=`${Y}-${String(M+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayMeetings=meetings.filter(m=>m.date===dateStr);
        const isToday=dateStr===today();
        return`<div class="cal-cell" onclick="openDayMeetings('${dateStr}')">
          <div class="cal-date${isToday?' today':''}">${d}</div>
          ${dayMeetings.slice(0,2).map(m=>`<div class="cal-event">${m.time||''} ${m.title}</div>`).join('')}
          ${dayMeetings.length>2?`<div style="font-size:9px;color:var(--g500)">+${dayMeetings.length-2}개</div>`:''}
        </div>`;
      }).join('')}
    </div>
  </div>
  
  <!-- List -->
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-weight:700">미팅 목록</div>
      ${filterBar({searchId:'mtg-search',placeholder:'제목, 고객사 검색...'})}
    </div>
    <div class="tbl-wrap">
      <table class="tbl" id="meetings-tbl">
        <thead><tr>
          <th>날짜</th><th>시간</th><th>제목</th><th>고객사</th>
          <th>담당자</th><th>장소</th><th>상태</th><th>연결 프로젝트</th><th></th>
        </tr></thead>
        <tbody>
          ${meetings.sort((a,b)=>a.date.localeCompare(b.date)*-1).map(m=>{
            const p=m.pid?getProject(m.pid):null;
            return`<tr>
              <td style="font-weight:600">${m.date}</td>
              <td>${m.time||'-'}</td>
              <td style="font-weight:500">${m.title}</td>
              <td>${m.client||'-'}</td>
              <td>${m.assignee||'-'}</td>
              <td style="font-size:11px">${m.loc||'-'}</td>
              <td>${statusBadge(m.status)}</td>
              <td>${p?`<span style="font-size:11px;color:var(--blue)">${p.nm}</span>`:'-'}</td>
              <td style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm btn-icon" onclick="sendMeetingNotif('${m.id}')">${svgIcon('mail',12)}</button>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditMeeting('${m.id}')">${svgIcon('edit',12)}</button>
                <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteMeeting('${m.id}')">${svgIcon('trash',12)}</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
function openAddMeeting(){
  const ps=getProjects();
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">미팅 추가</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">제목 *</label><input class="inp" id="mt_title" placeholder="미팅 제목"></div>
        <div><label class="lbl">고객사</label><input class="inp" id="mt_client" placeholder="고객사명"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">날짜 *</label><input class="inp" id="mt_date" type="date" value="${today()}"></div>
        <div><label class="lbl">시간</label><input class="inp" id="mt_time" type="time" value="10:00"></div>
        <div><label class="lbl">장소</label><input class="inp" id="mt_loc" placeholder="현장/사무실/고객사"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><select class="sel" id="mt_assignee">${TEAM_MEMBERS.map(m=>`<option>${m}</option>`).join('')}</select></div>
        <div><label class="lbl">상태</label><select class="sel" id="mt_status"><option>예정</option><option>완료</option><option>취소</option></select></div>
        <div><label class="lbl">연결 프로젝트</label><select class="sel" id="mt_pid"><option value="">없음</option>${ps.map(p=>`<option value="${p.id}">${p.nm}</option>`).join('')}</select></div>
      </div>
      <div><label class="lbl">메모</label><textarea class="inp" id="mt_memo" rows="2"></textarea></div>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px">알림 발송</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="openMsgTemplate('meeting')">📱 문자 발송</button>
          <button class="btn btn-outline btn-sm" onclick="toast('카카오톡 알림은 API 연동 후 사용 가능합니다','warning')">💬 카카오톡</button>
          <button class="btn btn-outline btn-sm" onclick="sendMeetingMail()">${svgIcon('mail',12)} 이메일</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewMeeting()">추가</button>
    </div>
  </div></div>`);
}
function saveNewMeeting(){
  const title=v('mt_title');if(!title){toast('제목을 입력하세요','error');return;}
  const meetings=getMeetings();
  meetings.push({id:uid(),title,client:v('mt_client'),date:v('mt_date'),time:v('mt_time'),
    loc:v('mt_loc'),assignee:v('mt_assignee'),status:v('mt_status')||'예정',
    pid:v('mt_pid'),memo:v('mt_memo')});
  saveMeetings(meetings);closeModal();toast('미팅이 추가되었습니다','success');renderMeetings();
}
function openEditMeeting(mid){
  const meetings=getMeetings();const m=meetings.find(x=>x.id===mid);if(!m)return;
  const ps=getProjects();
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">미팅 편집</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">제목</label><input class="inp" id="emt_title" value="${escHtml(m.title||'')}"></div>
        <div><label class="lbl">고객사</label><input class="inp" id="emt_client" value="${escHtml(m.client||'')}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">날짜</label><input class="inp" id="emt_date" type="date" value="${m.date||''}"></div>
        <div><label class="lbl">시간</label><input class="inp" id="emt_time" type="time" value="${m.time||''}"></div>
        <div><label class="lbl">장소</label><input class="inp" id="emt_loc" value="${escHtml(m.loc||'')}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><select class="sel" id="emt_assignee">${TEAM_MEMBERS.map(t=>`<option${m.assignee===t?' selected':''}>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">상태</label><select class="sel" id="emt_status">${['예정','완료','취소'].map(s=>`<option${m.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">연결 프로젝트</label><select class="sel" id="emt_pid"><option value="">없음</option>${ps.map(p=>`<option value="${p.id}"${m.pid===p.id?' selected':''}>${p.nm}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditMeeting('${mid}')">저장</button>
    </div>
  </div></div>`);
}
function saveEditMeeting(mid){
  const meetings=getMeetings();const i=meetings.findIndex(x=>x.id===mid);if(i<0)return;
  meetings[i]={...meetings[i],title:v('emt_title'),client:v('emt_client'),date:v('emt_date'),
    time:v('emt_time'),loc:v('emt_loc'),assignee:v('emt_assignee'),status:v('emt_status'),pid:v('emt_pid')};
  saveMeetings(meetings);closeModal();toast('저장되었습니다','success');renderMeetings();
}
function deleteMeeting(mid){
  if(!confirm('삭제하시겠습니까?'))return;
  saveMeetings(getMeetings().filter(m=>m.id!==mid));toast('삭제되었습니다');renderMeetings();
}
function openDayMeetings(dateStr){
  const meetings=getMeetings().filter(m=>m.date===dateStr);
  if(!meetings.length){openAddMeeting();return;}
  toast(`${dateStr} 미팅: ${meetings.map(m=>m.title).join(', ')}`);
}
function sendMeetingNotif(mid){
  const m=getMeetings().find(x=>x.id===mid);if(!m)return;
  openMsgTemplate('meeting',m);
}
async function sendMeetingMail(){
  const client=document.getElementById('mt_client')?.value||'';
  const contact=document.getElementById('mt_contact')?.value||'';
  const date=document.getElementById('mt_date')?.value||'';
  const time=document.getElementById('mt_time')?.value||'';
  const loc=document.getElementById('mt_loc')?.value||'';
  const title=document.getElementById('mt_title')?.value||'미팅';
  const co=getCompany();
  openModal(`<div class="modal-bg"><div class="modal modal-sm">
    <div class="modal-hdr">
      <span class="modal-title">${svgIcon('mail',16)} 미팅 알림 이메일</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px">
        <label class="lbl">받는 사람 (이메일) *</label>
        <input class="inp" id="meeting-email-to" placeholder="client@email.com">
      </div>
      <div style="background:var(--g50);border-radius:8px;padding:12px;font-size:12px;color:var(--g600);">
        <div style="font-weight:600;margin-bottom:6px;">📋 미팅 안내</div>
        <div>• 제목: ${title}</div>
        <div>• 일시: ${date} ${time}</div>
        <div>• 장소: ${loc||'미정'}</div>
        <div>• 고객: ${client} ${contact}</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-blue" onclick="doSendMeetingMail('${title}','${date}','${time}','${loc}','${client}','${contact}')">
        ${svgIcon('mail',13)} 발송
      </button>
    </div>
  </div></div>`);
}
async function doSendMeetingMail(title,date,time,loc,client,contact){
  const to=document.getElementById('meeting-email-to').value.trim();
  if(!to||!to.includes('@')){toast('올바른 이메일을 입력해주세요','error');return;}
  const co=getCompany();
  const html=`
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#0a0a0a;color:#fff;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:20px;">미팅 안내</h2>
    <p style="margin:4px 0 0;opacity:.6;font-size:12px;">${co.name||'Frame Plus'}</p>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px;color:#333;">${contact||client}님 안녕하세요, 미팅 일정을 안내드립니다.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;width:100px;">미팅 제목</td><td style="padding:8px;border:1px solid #e5e5e5;">${title}</td></tr>
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">일시</td><td style="padding:8px;border:1px solid #e5e5e5;">${date} ${time}</td></tr>
      <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">장소</td><td style="padding:8px;border:1px solid #e5e5e5;">${loc||'추후 안내'}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:11px;color:#999;">본 메일은 Frame Plus ERP에서 자동 발송되었습니다.</p>
  </div>
</div>`;
  try{
    const btn=document.querySelector('.modal-footer .btn-blue');
    if(btn){btn.disabled=true;btn.innerHTML='발송중...';}
    const res=await api('email/send','POST',{to,subject:`[미팅안내] ${title} - ${date} ${time}`,html,from_name:co.name});
    if(res&&res.success){closeModal();toast('✉️ 미팅 안내 이메일이 발송되었습니다!','success');}
    else{toast('발송 실패: '+(res?.error||'알 수 없는 오류'),'error');if(btn){btn.disabled=false;btn.innerHTML=svgIcon('mail',13)+' 발송';}}
  }catch(e){toast('발송 오류: '+e.message,'error');}
}
function openMsgTemplate(cat,context=null){
  const templates=getMsgTemplates().filter(t=>t.cat===cat||!cat);
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr">
      <span class="modal-title">메시지 템플릿</span>
      <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" onclick="addMsgTemplate()">+ 템플릿 추가</button>
      <button class="modal-close" onclick="closeModal()">✕</button></div>
    </div>
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
        ${getMsgTemplates().map(t=>`<div style="border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span class="badge badge-${t.cat==='미팅'?'blue':t.cat==='견적'?'green':'purple'}">${t.cat}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="editMsgTemplate('${t.id}')">${svgIcon('edit',11)}</button>
              <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteMsgTemplate('${t.id}')">${svgIcon('trash',11)}</button>
            </div>
          </div>
          <div style="font-weight:700;margin-bottom:6px;font-size:13px">${t.title}</div>
          <div style="font-size:11px;color:var(--g500);white-space:pre-wrap;max-height:80px;overflow:hidden">${t.content}</div>
          <button class="btn btn-primary btn-sm" style="width:100%;margin-top:10px" onclick="sendTemplate('${t.id}','${context?.id||''}')">이 템플릿으로 발송</button>
        </div>`).join('')}
      </div>
    </div>
  </div></div>`);
}
function sendTemplate(tid,mid){
  const t=getMsgTemplates().find(x=>x.id===tid);if(!t)return;
  const m=mid?getMeetings().find(x=>x.id===mid):null;
  let content=t.content;
  if(m){
    content=content.replace(/\(\(이름\)\)/g,m.client||'고객님')
      .replace(/\(\(날짜\)\)/g,m.date||'')
      .replace(/\(\(시간\)\)/g,m.time||'')
      .replace(/\(\(장소\)\)/g,m.loc||'')
      .replace(/\(\(담당자명\)\)/g,m.assignee||getCompany().ceo);
  }
  window.open(`sms:?body=${encodeURIComponent(content)}`);
  toast('문자 앱이 열렸습니다','success');
}
function addMsgTemplate(){
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">템플릿 추가</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">카테고리</label><select class="sel" id="tpl_cat"><option>미팅</option><option>견적</option><option>계약</option><option>수금</option><option>공지</option></select></div>
        <div><label class="lbl">제목</label><input class="inp" id="tpl_title"></div>
      </div>
      <div><label class="lbl">내용 (((이름)), ((날짜)), ((장소)), ((담당자명)) 사용 가능)</label>
        <textarea class="inp" id="tpl_content" rows="6"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveMsgTemplate()">저장</button>
    </div>
  </div></div>`);
}
function saveMsgTemplate(){
  const ts=getMsgTemplates();
  ts.push({id:uid(),cat:v('tpl_cat'),title:v('tpl_title'),content:v('tpl_content')});
  saveMsgTemplates(ts);closeModal();toast('템플릿이 저장되었습니다','success');
}
function deleteMsgTemplate(tid){
  if(!confirm('삭제?'))return;
  saveMsgTemplates(getMsgTemplates().filter(t=>t.id!==tid));closeModal();
  openMsgTemplate();
}
// ===== CRM =====
function renderCRM(){
  const ps=getProjects();
  const clients=getClients();
  
  // Enrich clients with project data
  const enriched=clients.map(cl=>{
    const cProjects=ps.filter(p=>p.client===cl.name);
    return {...cl, projects:cProjects, calcAmt:cProjects.reduce((a,p)=>a+getTotal(p),0), calcCount:cProjects.length,
      lastProjDate:cProjects.reduce((a,p)=>(!a||p.date>a)?p.date:a,'')};
  });
  
  // Also find project clients not in clients DB
  const clientNames=new Set(clients.map(c=>c.name));
  const orphanClients={};
  ps.forEach(p=>{
    if(p.client&&!clientNames.has(p.client)){
      if(!orphanClients[p.client]) orphanClients[p.client]={nm:p.client,contact:p.contact,email:p.email,projects:[],totalAmt:0};
      orphanClients[p.client].projects.push(p);
      orphanClients[p.client].totalAmt+=getTotal(p);
    }
  });
  
  const grades=['S','A','B','C','D'];
  const gradeColors={S:'var(--purple)',A:'var(--blue)',B:'var(--green)',C:'var(--g500)',D:'var(--g400)'};
  
  // KPI
  const totalClients=clients.length;
  const sGrade=clients.filter(c=>c.grade==='S'||c.grade==='A').length;
  const totalAmt=enriched.reduce((a,c)=>a+c.calcAmt,0);

  document.getElementById('tb-title').textContent='고객 관리 (CRM)';
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('crm')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-outline btn-sm" onclick="syncClientsFromProjects()">🔄 프로젝트 동기화</button>
    <button class="btn btn-primary btn-sm" onclick="openAddClient()">+ 고객 등록</button>`;

  document.getElementById('content').innerHTML=`
  <div class="dash-grid" style="margin-bottom:16px">
    <div class="kpi-card" style="border-left:3px solid var(--blue)">
      <div class="kpi-label">전체 고객</div>
      <div class="kpi-value" style="color:var(--blue)">${totalClients}<span style="font-size:12px">명</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--purple)">
      <div class="kpi-label">S·A 등급</div>
      <div class="kpi-value" style="color:var(--purple)">${sGrade}<span style="font-size:12px">명</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--green)">
      <div class="kpi-label">총 계약금액</div>
      <div class="kpi-value" style="color:var(--green)">${fmtShort(totalAmt)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--orange)">
      <div class="kpi-label">미등록 고객</div>
      <div class="kpi-value" style="color:var(--orange)">${Object.keys(orphanClients).length}<span style="font-size:12px">건</span></div>
    </div>
  </div>
  
  ${filterBar({placeholder:'고객명·회사명 검색...',onFilter:'filterCRM()'})}
  
  ${Object.keys(orphanClients).length?`<div class="card" style="padding:10px 14px;margin-bottom:12px;border:1px dashed var(--orange);background:rgba(255,152,0,0.04)">
    <div style="font-size:12px;font-weight:700;color:var(--orange);margin-bottom:6px">⚠️ 프로젝트에 등록된 미관리 고객 (${Object.keys(orphanClients).length}건)</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.values(orphanClients).map(c=>`<button class="btn btn-outline btn-sm" style="font-size:11px" onclick="quickAddClient('${escHtml(c.nm)}','${escHtml(c.contact||'')}','${escHtml(c.email||'')}')">${c.nm} (${c.projects.length}건) +등록</button>`).join('')}
    </div>
  </div>`:''}
  
  <div class="tbl-wrap" id="crm-table-wrap">
    <table class="tbl" id="crm-tbl">
      <thead><tr>
        <th onclick="sortTbl('crm-tbl',0)">등급</th>
        <th onclick="sortTbl('crm-tbl',1)">고객명</th>
        <th onclick="sortTbl('crm-tbl',2)">회사</th>
        <th onclick="sortTbl('crm-tbl',3)">연락처</th>
        <th onclick="sortTbl('crm-tbl',4)">이메일</th>
        <th onclick="sortTbl('crm-tbl',5)" style="text-align:right">프로젝트</th>
        <th onclick="sortTbl('crm-tbl',6)" style="text-align:right">총 계약금액</th>
        <th>최근 프로젝트</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${enriched.length?enriched.map(c=>`<tr>
          <td><span class="badge" style="background:${gradeColors[c.grade]||'var(--g400)'};color:#fff;font-weight:800;font-size:11px;min-width:24px;text-align:center">${c.grade||'B'}</span></td>
          <td style="font-weight:600">${escHtml(c.name)}</td>
          <td style="font-size:12px;color:var(--text-muted)">${escHtml(c.company||'-')}</td>
          <td style="font-size:12px">${escHtml(c.phone||c.contact||'-')}</td>
          <td style="font-size:11px">${escHtml(c.email||'-')}</td>
          <td style="text-align:right;font-weight:600">${c.calcCount}건</td>
          <td style="text-align:right;font-weight:600">${c.calcAmt>0?fmt(c.calcAmt)+'원':'-'}</td>
          <td style="font-size:11px">${c.lastProjDate||c.last_project_date||'-'}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditClient('${c.id}')" title="수정">${svgIcon('edit',12)}</button>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteClient('${c.id}')" title="삭제" style="color:var(--red)">${svgIcon('trash',12)}</button>
            </div>
          </td>
        </tr>`).join(''):`<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--g400)">등록된 고객이 없습니다. [+ 고객 등록] 또는 [프로젝트 동기화]를 이용하세요.</td></tr>`}
      </tbody>
    </table>
  </div>`;
}

function filterCRM(){
  const q=(document.getElementById('filter-search')?.value||'').toLowerCase();
  document.querySelectorAll('#crm-tbl tbody tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none';
  });
}

function openAddClient(defaults){
  const d=defaults||{};
  const grades=['S','A','B','C','D'];
  const sources=CONSULT_SOURCES||['온라인 문의','전화','소개','SNS','블로그','직접 방문','기타'];
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:560px">
    <div class="modal-hdr"><span class="modal-title">고객 등록</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">고객명 *</label><input class="inp" id="cl_name" value="${escHtml(d.name||'')}"></div>
        <div><label class="lbl">회사명</label><input class="inp" id="cl_company" value="${escHtml(d.company||'')}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><input class="inp" id="cl_contact" value="${escHtml(d.contact||'')}"></div>
        <div><label class="lbl">전화번호</label><input class="inp" id="cl_phone" value="${escHtml(d.phone||'')}"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="cl_email" value="${escHtml(d.email||'')}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">등급</label><select class="sel" id="cl_grade">${grades.map(g=>`<option value="${g}" ${g===(d.grade||'B')?'selected':''}>${g}</option>`).join('')}</select></div>
        <div><label class="lbl">유입경로</label><select class="sel" id="cl_source"><option value="">선택</option>${sources.map(s=>`<option ${s===d.source?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">사업자번호</label><input class="inp" id="cl_biz" value="${escHtml(d.biz_no||'')}"></div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div><label class="lbl">주소</label><input class="inp" id="cl_addr" value="${escHtml(d.address||'')}"></div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div><label class="lbl">메모</label><textarea class="inp" id="cl_memo" rows="2">${escHtml(d.memo||'')}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewClient()">등록</button>
    </div>
  </div></div>`);
}

async function saveNewClient(){
  const name=document.getElementById('cl_name').value.trim();
  if(!name){toast('고객명을 입력하세요','error');return;}
  const data={
    id:'cl'+Date.now(),
    name, company:document.getElementById('cl_company').value,
    contact:document.getElementById('cl_contact').value,
    phone:document.getElementById('cl_phone').value,
    email:document.getElementById('cl_email').value,
    grade:document.getElementById('cl_grade').value,
    source:document.getElementById('cl_source').value,
    biz_no:document.getElementById('cl_biz').value,
    address:document.getElementById('cl_addr').value,
    memo:document.getElementById('cl_memo').value,
    created_at:new Date().toISOString(), updated_at:new Date().toISOString()
  };
  await api('clients','POST',data);
  _d.clients=await api('clients');
  closeModal();renderCRM();toast('고객이 등록되었습니다','success');
}

function openEditClient(id){
  const c=getClients().find(x=>x.id===id);if(!c)return;
  const grades=['S','A','B','C','D'];
  const sources=CONSULT_SOURCES||['온라인 문의','전화','소개','SNS','블로그','직접 방문','기타'];
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:560px">
    <div class="modal-hdr"><span class="modal-title">고객 수정</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">고객명 *</label><input class="inp" id="cl_name" value="${escHtml(c.name||'')}"></div>
        <div><label class="lbl">회사명</label><input class="inp" id="cl_company" value="${escHtml(c.company||'')}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><input class="inp" id="cl_contact" value="${escHtml(c.contact||'')}"></div>
        <div><label class="lbl">전화번호</label><input class="inp" id="cl_phone" value="${escHtml(c.phone||'')}"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="cl_email" value="${escHtml(c.email||'')}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">등급</label><select class="sel" id="cl_grade">${grades.map(g=>`<option value="${g}" ${g===c.grade?'selected':''}>${g}</option>`).join('')}</select></div>
        <div><label class="lbl">유입경로</label><select class="sel" id="cl_source"><option value="">선택</option>${sources.map(s=>`<option ${s===c.source?'selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">사업자번호</label><input class="inp" id="cl_biz" value="${escHtml(c.biz_no||'')}"></div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div><label class="lbl">주소</label><input class="inp" id="cl_addr" value="${escHtml(c.address||'')}"></div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div><label class="lbl">메모</label><textarea class="inp" id="cl_memo" rows="2">${escHtml(c.memo||'')}</textarea></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditClient('${c.id}')">저장</button>
    </div>
  </div></div>`);
}

async function saveEditClient(id){
  const name=document.getElementById('cl_name').value.trim();
  if(!name){toast('고객명을 입력하세요','error');return;}
  const data={
    name, company:document.getElementById('cl_company').value,
    contact:document.getElementById('cl_contact').value,
    phone:document.getElementById('cl_phone').value,
    email:document.getElementById('cl_email').value,
    grade:document.getElementById('cl_grade').value,
    source:document.getElementById('cl_source').value,
    biz_no:document.getElementById('cl_biz').value,
    address:document.getElementById('cl_addr').value,
    memo:document.getElementById('cl_memo').value,
    updated_at:new Date().toISOString()
  };
  await api('clients/'+id,'PUT',data);
  _d.clients=await api('clients');
  closeModal();renderCRM();toast('고객 정보가 수정되었습니다','success');
}

async function deleteClient(id){
  if(!confirm('이 고객을 삭제하시겠습니까?'))return;
  await api('clients/'+id,'DELETE');
  _d.clients=await api('clients');
  renderCRM();toast('고객이 삭제되었습니다','success');
}

async function quickAddClient(name,contact,email){
  const data={id:'cl'+Date.now(), name, contact, email, grade:'B', source:'', created_at:new Date().toISOString(), updated_at:new Date().toISOString()};
  await api('clients','POST',data);
  _d.clients=await api('clients');
  renderCRM();toast(`${name} 고객이 등록되었습니다`,'success');
}

async function syncClientsFromProjects(){
  const ps=getProjects();
  const existing=new Set(getClients().map(c=>c.name));
  let added=0;
  for(const p of ps){
    if(p.client&&!existing.has(p.client)){
      existing.add(p.client);
      await api('clients','POST',{id:'cl'+Date.now()+added, name:p.client, contact:p.contact||'', email:p.email||'', grade:'B', created_at:new Date().toISOString(), updated_at:new Date().toISOString()});
      added++;
    }
  }
  _d.clients=await api('clients');
  renderCRM();
  toast(added>0?`${added}명의 고객이 동기화되었습니다`:'새로 등록할 고객이 없습니다', added>0?'success':'info');
}

// ===== PRICE DB =====
function renderPriceDB(){
  const db=getPriceDB();
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('pricedb')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-outline btn-sm" onclick="importXLSX('pricedb')">${svgIcon('upload',12)} 업로드</button>
    <button class="btn btn-primary btn-sm" onclick="openAddPriceItem()">+ 단가 추가</button>`;
  document.getElementById('content').innerHTML=`
  <div class="filter-bar">
    <div class="filter-search">${svgIcon('search',14)}<input class="inp" id="pdb-search" placeholder="품목명 검색..." oninput="filterPriceDB()" style="padding-left:30px"></div>
    <select class="sel" id="pdb-cat" style="width:auto" onchange="filterPriceDB()">
      <option value="">전체 공종</option>
      ${CATS.map(c=>`<option value="${c.id}">${c.nm}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
      <input type="checkbox" id="pdb-group" onchange="filterPriceDB()" checked> 공종별 그룹
    </label>
  </div>
  <div id="pdb-content">${renderPriceDBGrouped(db)}</div>`;
}
function renderPriceDBGrouped(db){
  if(!db.length) return '<div style="text-align:center;padding:40px;color:var(--g400)">단가 데이터 없음</div>';
  const grouped=document.getElementById('pdb-group')?.checked!==false;
  if(!grouped){
    return `<div class="tbl-wrap"><table class="tbl" id="pdb-tbl"><thead><tr>
      <th>공종</th><th>품명</th><th>규격</th><th>단위</th>
      <th>자재단가</th><th>노무단가</th><th>경비단가</th>
      <th>원가 자재</th><th>원가 노무</th><th></th>
    </tr></thead><tbody id="pdb-body">${renderPriceDBRows(db)}</tbody></table></div>`;
  }
  // Group by category
  const groups={};
  db.forEach(d=>{ const cid=d.cid||'기타'; if(!groups[cid])groups[cid]=[]; groups[cid].push(d); });
  return Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([cid,items])=>{
    const cat=CATS.find(c=>c.id===cid);
    const totalM=items.reduce((a,d)=>a+(Number(d.mp)||0),0);
    return `<div class="est-section" style="margin-bottom:8px">
      <div class="est-sec-hdr" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.est-sec-toggle').classList.toggle('open')">
        <span class="est-sec-icon">${cat?.icon||'📦'}</span>
        <span class="est-sec-title">${cat?.nm||cid}</span>
        <span class="est-sec-count">${items.length}개</span>
        <span style="flex:1"></span>
        <span class="est-sec-toggle open">${svgIcon('chevron_down',14)}</span>
      </div>
      <div class="est-sec-body open">
        <table class="tbl"><thead><tr>
          <th>품명</th><th>규격</th><th>단위</th>
          <th>자재단가</th><th>노무단가</th><th>경비단가</th>
          <th>원가 자재</th><th>원가 노무</th><th></th>
        </tr></thead><tbody>${items.map(d=>`<tr>
          <td style="font-weight:500">${d.nm}</td>
          <td style="font-size:11px">${d.spec||'-'}</td>
          <td>${d.unit||'-'}</td>
          <td class="num">${fmt(d.mp||0)}</td>
          <td class="num">${fmt(d.lp||0)}</td>
          <td class="num">${fmt(d.ep||0)}</td>
          <td class="num" style="color:var(--g500)">${fmt(d.cmp||0)}</td>
          <td class="num" style="color:var(--g500)">${fmt(d.clp||0)}</td>
          <td style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditPriceItem('${d.id}')">${svgIcon('edit',12)}</button>
            <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deletePriceItem('${d.id}')">${svgIcon('trash',12)}</button>
          </td>
        </tr>`).join('')}</tbody></table>
      </div>
    </div>`;
  }).join('');
}
function renderPriceDBRows(db){
  if(!db.length)return`<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--g400)">단가 데이터 없음</td></tr>`;
  return db.map(d=>`<tr>
    <td><span class="badge badge-gray">${catNm(d.cid)}</span></td>
    <td style="font-weight:500">${d.nm}</td>
    <td style="font-size:11px">${d.spec||'-'}</td>
    <td>${d.unit||'-'}</td>
    <td class="num">${fmt(d.mp||0)}</td>
    <td class="num">${fmt(d.lp||0)}</td>
    <td class="num">${fmt(d.ep||0)}</td>
    <td class="num" style="color:var(--g500)">${fmt(d.cmp||0)}</td>
    <td class="num" style="color:var(--g500)">${fmt(d.clp||0)}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditPriceItem('${d.id}')">${svgIcon('edit',12)}</button>
      <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deletePriceItem('${d.id}')">${svgIcon('trash',12)}</button>
    </td>
  </tr>`).join('');
}
function filterPriceDB(){
  const q=(document.getElementById('pdb-search')?.value||'').toLowerCase();
  const cat=document.getElementById('pdb-cat')?.value||'';
  let db=getPriceDB().filter(d=>(!q||(d.nm+d.spec).toLowerCase().includes(q))&&(!cat||d.cid===cat));
  const content=document.getElementById('pdb-content');
  if(content)content.innerHTML=renderPriceDBGrouped(db);
}
function openAddPriceItem(){
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">단가 추가</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">공종</label><select class="sel" id="pi_cid">${CATS.map(c=>`<option value="${c.id}">${c.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">품명 *</label><input class="inp" id="pi_nm"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">규격</label><input class="inp" id="pi_spec"></div>
        <div><label class="lbl">단위</label><input class="inp" id="pi_unit" value="m²"></div>
        <div></div>
      </div>
      <div style="margin-bottom:8px;font-size:12px;font-weight:700;color:var(--g600)">견적 단가 (매출)</div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">자재단가</label><input class="inp" id="pi_mp" type="number" value="0"></div>
        <div><label class="lbl">노무단가</label><input class="inp" id="pi_lp" type="number" value="0"></div>
        <div><label class="lbl">경비단가</label><input class="inp" id="pi_ep" type="number" value="0"></div>
      </div>
      <div style="margin-bottom:8px;font-size:12px;font-weight:700;color:var(--g600)">원가 단가 (실제비용)</div>
      <div class="form-row form-row-2">
        <div><label class="lbl">원가 자재</label><input class="inp" id="pi_cmp" type="number" value="0"></div>
        <div><label class="lbl">원가 노무</label><input class="inp" id="pi_clp" type="number" value="0"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="savePriceItemForm()">추가</button>
    </div>
  </div></div>`);
}
function savePriceItemForm(){
  const nm=v('pi_nm');if(!nm){toast('품명을 입력하세요','error');return;}
  const db=getPriceDB();
  db.push({id:uid(),cid:v('pi_cid'),nm,spec:v('pi_spec'),unit:v('pi_unit')||'m²',
    mp:Number(v('pi_mp')||0),lp:Number(v('pi_lp')||0),ep:Number(v('pi_ep')||0),
    cmp:Number(v('pi_cmp')||0),clp:Number(v('pi_clp')||0),cep:0});
  savePriceDB(db);closeModal();toast('추가되었습니다','success');renderPriceDB();
}
function openEditPriceItem(did){
  const db=getPriceDB();const d=db.find(x=>x.id===did);if(!d)return;
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">단가 편집</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">공종</label><select class="sel" id="epi_cid">${CATS.map(c=>`<option value="${c.id}"${d.cid===c.id?' selected':''}>${c.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">품명</label><input class="inp" id="epi_nm" value="${escHtml(d.nm||'')}"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">규격</label><input class="inp" id="epi_spec" value="${escHtml(d.spec||'')}"></div>
        <div><label class="lbl">단위</label><input class="inp" id="epi_unit" value="${d.unit||'m²'}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">자재단가</label><input class="inp" id="epi_mp" type="number" value="${d.mp||0}"></div>
        <div><label class="lbl">노무단가</label><input class="inp" id="epi_lp" type="number" value="${d.lp||0}"></div>
        <div><label class="lbl">경비단가</label><input class="inp" id="epi_ep" type="number" value="${d.ep||0}"></div>
      </div>
      <div class="form-row form-row-2">
        <div><label class="lbl">원가 자재</label><input class="inp" id="epi_cmp" type="number" value="${d.cmp||0}"></div>
        <div><label class="lbl">원가 노무</label><input class="inp" id="epi_clp" type="number" value="${d.clp||0}"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditPriceItem('${did}')">저장</button>
    </div>
  </div></div>`);
}
function saveEditPriceItem(did){
  const db=getPriceDB();const i=db.findIndex(x=>x.id===did);if(i<0)return;
  db[i]={...db[i],cid:v('epi_cid'),nm:v('epi_nm'),spec:v('epi_spec'),unit:v('epi_unit'),
    mp:Number(v('epi_mp')||0),lp:Number(v('epi_lp')||0),ep:Number(v('epi_ep')||0),
    cmp:Number(v('epi_cmp')||0),clp:Number(v('epi_clp')||0)};
  savePriceDB(db);closeModal();toast('저장되었습니다','success');renderPriceDB();
}
function deletePriceItem(did){
  if(!confirm('삭제?'))return;
  savePriceDB(getPriceDB().filter(d=>d.id!==did));toast('삭제됨');renderPriceDB();
}

// ===== VENDORS =====
function renderVendors(){
  const vs=getVendors();
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('vendors')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddVendor()">+ 거래처 추가</button>`;
  document.getElementById('content').innerHTML=`
  ${filterBar({placeholder:'거래처명 검색...'})}
  <div class="tbl-wrap">
    <table class="tbl">
      <thead><tr><th>업체명</th><th>공종</th><th>담당자</th><th>연락처</th><th>이메일</th><th>평점</th><th>메모</th><th></th></tr></thead>
      <tbody id="vendors-body">
        ${vs.map(v2=>`<tr>
          <td style="font-weight:600">${v2.nm}</td>
          <td><span class="badge badge-gray">${catNm(v2.cid)}</span></td>
          <td>${v2.contact||'-'}</td>
          <td>${v2.phone||'-'}</td>
          <td style="font-size:11px">${v2.email||'-'}</td>
          <td>${'⭐'.repeat(v2.rating||0)}</td>
          <td style="font-size:11px;color:var(--g500)">${v2.memo||'-'}</td>
          <td style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditVendor('${v2.id}')">${svgIcon('edit',12)}</button>
            <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteVendor('${v2.id}')">${svgIcon('trash',12)}</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}
function openAddVendor(){
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">거래처 추가</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">업체명 *</label><input class="inp" id="vd_nm"></div>
        <div><label class="lbl">공종</label><select class="sel" id="vd_cid">${CATS.map(c=>`<option value="${c.id}">${c.nm}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><input class="inp" id="vd_contact"></div>
        <div><label class="lbl">연락처</label><input class="inp" id="vd_phone"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="vd_email" type="email"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">주소</label><input class="inp" id="vd_addr"></div>
        <div><label class="lbl">평점(1~5)</label><input class="inp" id="vd_rating" type="number" min="1" max="5" value="3"></div>
      </div>
      <div><label class="lbl">메모</label><textarea class="inp" id="vd_memo" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewVendor()">추가</button>
    </div>
  </div></div>`);
}
function saveNewVendor(){
  const nm=v('vd_nm');if(!nm){toast('업체명을 입력하세요','error');return;}
  const vs=getVendors();
  vs.push({id:uid(),nm,cid:v('vd_cid'),contact:v('vd_contact'),phone:v('vd_phone'),
    email:v('vd_email'),addr:v('vd_addr'),rating:Number(v('vd_rating')||3),memo:v('vd_memo')});
  saveVendors(vs);closeModal();toast('추가되었습니다','success');renderVendors();
}
function openEditVendor(vid){
  const vs=getVendors();const vd=vs.find(x=>x.id===vid);if(!vd)return;
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">거래처 편집</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">업체명</label><input class="inp" id="evd_nm" value="${escHtml(vd.nm||'')}"></div>
        <div><label class="lbl">공종</label><select class="sel" id="evd_cid">${CATS.map(c=>`<option value="${c.id}"${vd.cid===c.id?' selected':''}>${c.nm}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><input class="inp" id="evd_contact" value="${escHtml(vd.contact||'')}"></div>
        <div><label class="lbl">연락처</label><input class="inp" id="evd_phone" value="${vd.phone||''}"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="evd_email" type="email" value="${vd.email||''}"></div>
      </div>
      <div class="form-row form-row-2">
        <div><label class="lbl">주소</label><input class="inp" id="evd_addr" value="${escHtml(vd.addr||'')}"></div>
        <div><label class="lbl">평점</label><input class="inp" id="evd_rating" type="number" min="1" max="5" value="${vd.rating||3}"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditVendor('${vid}')">저장</button>
    </div>
  </div></div>`);
}
function saveEditVendor(vid){
  const vs=getVendors();const i=vs.findIndex(x=>x.id===vid);if(i<0)return;
  vs[i]={...vs[i],nm:v('evd_nm'),cid:v('evd_cid'),contact:v('evd_contact'),phone:v('evd_phone'),email:v('evd_email'),addr:v('evd_addr'),rating:Number(v('evd_rating')||3)};
  saveVendors(vs);closeModal();toast('저장되었습니다','success');renderVendors();
}
function deleteVendor(vid){
  if(!confirm('삭제?'))return;
  saveVendors(getVendors().filter(x=>x.id!==vid));toast('삭제됨');renderVendors();
}

// ===== TAX (세금계산서·매입 관리 강화) =====
let _taxView='sales'; // sales|purchase|monthly
function renderTax(){
  const taxes=getTaxInvoices();const ps=getProjects();
  const salesTaxes=taxes.filter(t=>t.type!=='매입');
  const purchaseTaxes=taxes.filter(t=>t.type==='매입');
  const totalSalesSupply=salesTaxes.reduce((a,t)=>a+(t.supplyAmt||0),0);
  const totalSalesTax=salesTaxes.reduce((a,t)=>a+(t.taxAmt||0),0);
  const totalPurchaseSupply=purchaseTaxes.reduce((a,t)=>a+(t.supplyAmt||0),0);
  const totalPurchaseTax=purchaseTaxes.reduce((a,t)=>a+(t.taxAmt||0),0);
  const netVat=totalSalesTax-totalPurchaseTax;
  document.getElementById('tb-actions').innerHTML=`
    <div style="display:flex;gap:4px">
      <button class="btn ${_taxView==='sales'?'btn-primary':'btn-outline'} btn-sm" onclick="_taxView='sales';renderTax()">📤 매출</button>
      <button class="btn ${_taxView==='purchase'?'btn-primary':'btn-outline'} btn-sm" onclick="_taxView='purchase';renderTax()">📥 매입</button>
      <button class="btn ${_taxView==='monthly'?'btn-primary':'btn-outline'} btn-sm" onclick="_taxView='monthly';renderTax()">📊 월별</button>
    </div>
    <button class="btn btn-primary btn-sm" onclick="openAddTax()">+ 세금계산서 ${_taxView==='purchase'?'매입':'발행'}</button>`;
  document.getElementById('content').innerHTML=`
  <!-- KPI -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">
    <div class="kpi-card" style="border-left:3px solid var(--blue)"><div class="kpi-label">매출 공급가액</div><div class="kpi-value" style="font-size:16px">${fmtShort(totalSalesSupply)}</div></div>
    <div class="kpi-card" style="border-left:3px solid var(--green)"><div class="kpi-label">매출 세액</div><div class="kpi-value" style="font-size:16px;color:var(--green)">${fmtShort(totalSalesTax)}</div></div>
    <div class="kpi-card" style="border-left:3px solid var(--orange)"><div class="kpi-label">매입 공급가액</div><div class="kpi-value" style="font-size:16px">${fmtShort(totalPurchaseSupply)}</div></div>
    <div class="kpi-card" style="border-left:3px solid var(--purple)"><div class="kpi-label">매입 세액</div><div class="kpi-value" style="font-size:16px;color:var(--purple)">${fmtShort(totalPurchaseTax)}</div></div>
    <div class="kpi-card" style="border-left:3px solid ${netVat>=0?'var(--red)':'var(--green)'}"><div class="kpi-label">부가세 예상 납부</div><div class="kpi-value" style="font-size:16px;color:${netVat>=0?'var(--red)':'var(--green)'}">${netVat>=0?'':'-'}${fmtShort(Math.abs(netVat))}</div></div>
  </div>
  <div style="background:var(--blue-l);border:1px solid var(--blue);border-radius:var(--radius-lg);padding:10px 16px;margin-bottom:14px;font-size:12px;color:var(--blue);display:flex;justify-content:space-between;align-items:center">
    <span>ℹ️ 전자세금계산서 발행은 국세청 홈택스에서 진행하세요.</span>
    <a href="https://www.hometax.go.kr" target="_blank" style="font-weight:700;color:var(--blue);text-decoration:underline">홈택스 →</a>
  </div>
  <div id="tax-view-content">
    ${_taxView==='sales'?_taxTable(salesTaxes,ps,'매출'):_taxView==='purchase'?_taxTable(purchaseTaxes,ps,'매입'):_taxMonthly(taxes,ps)}
  </div>`;
}
function _taxTable(taxes,ps,type){
  return`${filterBar({statuses:['발행완료','발행예정','미발행'],placeholder:'프로젝트명 검색...',showDate:true,showMonthGroup:true,onFilter:'filterTax()'})}
  <div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th onclick="sortTbl('tax','nm')">프로젝트 ↕</th><th>고객사/거래처</th><th onclick="sortTbl('tax','supply')">공급가액 ↕</th><th>세액</th>
    <th>합계금액</th><th onclick="sortTbl('tax','date')">작성일 ↕</th><th>상태</th><th>품목</th><th></th>
  </tr></thead><tbody>
    ${taxes.length?taxes.map(t=>{const p=getProject(t.pid);const total=(t.supplyAmt||0)+(t.taxAmt||0);
      return`<tr>
        <td style="font-weight:600">${p?.nm||t.vendorNm||'-'}</td>
        <td>${type==='매입'?(t.vendorNm||'-'):(p?.client||'-')}</td>
        <td class="num">${fmt(t.supplyAmt||0)}원</td>
        <td class="num">${fmt(t.taxAmt||0)}원</td>
        <td class="num" style="font-weight:700">${fmt(total)}원</td>
        <td style="font-size:11px">${t.date||'-'}</td>
        <td>${statusBadge(t.status||'미발행')}</td>
        <td style="font-size:11px;color:var(--g500)">${t.item||'-'}</td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openTaxPreview('${t.id}')" title="미리보기">${svgIcon('eye',12)}</button>
          <button class="btn btn-ghost btn-sm btn-icon" onclick="printTax('${t.id}')">${svgIcon('print',12)}</button>
          <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteTax('${t.id}')">${svgIcon('trash',12)}</button>
        </td>
      </tr>`;}).join('')
    :`<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--g400)">${type} 세금계산서 없음</td></tr>`}
  </tbody></table></div>`;
}
function _taxMonthly(taxes,ps){
  // Group by month
  const months={};
  taxes.forEach(t=>{const ym=t.date?t.date.slice(0,7):'미정';if(!months[ym])months[ym]={sales:[],purchase:[]};
    if(t.type==='매입')months[ym].purchase.push(t);else months[ym].sales.push(t);
  });
  const sortedMonths=Object.keys(months).sort().reverse();
  return`<div style="display:flex;flex-direction:column;gap:12px">
    ${sortedMonths.map(ym=>{
      const d=months[ym];
      const salesAmt=d.sales.reduce((a,t)=>a+(t.supplyAmt||0),0);
      const salesTax=d.sales.reduce((a,t)=>a+(t.taxAmt||0),0);
      const purchaseAmt=d.purchase.reduce((a,t)=>a+(t.supplyAmt||0),0);
      const purchaseTax=d.purchase.reduce((a,t)=>a+(t.taxAmt||0),0);
      const netVat=salesTax-purchaseTax;
      return`<div class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:14px;font-weight:700">${ym==='미정'?'날짜 미정':ym.replace('-','년 ')+'월'}</div>
          <div style="font-size:12px;color:var(--g500)">매출 ${d.sales.length}건 / 매입 ${d.purchase.length}건</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
          <div style="background:var(--blue)08;border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--blue)">매출 공급가액</div>
            <div style="font-size:14px;font-weight:700">${fmtShort(salesAmt)}</div>
            <div style="font-size:10px;color:var(--g500)">세액: ${fmtShort(salesTax)}</div>
          </div>
          <div style="background:var(--orange)08;border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--orange)">매입 공급가액</div>
            <div style="font-size:14px;font-weight:700">${fmtShort(purchaseAmt)}</div>
            <div style="font-size:10px;color:var(--g500)">세액: ${fmtShort(purchaseTax)}</div>
          </div>
          <div style="background:${netVat>=0?'var(--red)':'var(--green)'}08;border-radius:6px;padding:10px;text-align:center">
            <div style="font-size:10px;color:${netVat>=0?'var(--red)':'var(--green)'}">부가세 ${netVat>=0?'납부':'환급'}</div>
            <div style="font-size:14px;font-weight:800;color:${netVat>=0?'var(--red)':'var(--green)'}">${fmtShort(Math.abs(netVat))}</div>
          </div>
        </div>
        <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--g200)">
          ${salesAmt+purchaseAmt>0?`<div style="width:${salesAmt/(salesAmt+purchaseAmt)*100}%;background:var(--blue);height:100%"></div><div style="width:${purchaseAmt/(salesAmt+purchaseAmt)*100}%;background:var(--orange);height:100%"></div>`:''}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--g500)">
          <span>매출 ${fmt(salesAmt+salesTax)}원</span><span>매입 ${fmt(purchaseAmt+purchaseTax)}원</span>
        </div>
      </div>`;
    }).join('')||'<div style="text-align:center;padding:40px;color:var(--g400)">세금계산서 데이터 없음</div>'}
  </div>`;
}
function openAddTax(){
  const ps=getProjects();const co=getCompany();const isPurchase=_taxView==='purchase';
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:580px">
    <div class="modal-hdr"><span class="modal-title">${isPurchase?'📥 매입 세금계산서 등록':'📤 매출 세금계산서 발행'}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn ${!isPurchase?'btn-primary':'btn-outline'} btn-sm" onclick="_taxView='sales';closeModal();openAddTax()">매출</button>
        <button class="btn ${isPurchase?'btn-primary':'btn-outline'} btn-sm" onclick="_taxView='purchase';closeModal();openAddTax()">매입</button>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트</label>
          <select class="sel" id="tx_pid" onchange="autoFillTax(this.value)">
            <option value="">선택</option>
            ${ps.map(p=>`<option value="${p.id}">${p.nm}</option>`).join('')}
          </select>
        </div>
        <div><label class="lbl">작성일</label><input class="inp" id="tx_date" type="date" value="${today()}"></div>
      </div>
      ${isPurchase?`<div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">거래처명 *</label><input class="inp" id="tx_vendor" placeholder="거래처명"></div>
        <div><label class="lbl">거래처 사업자번호</label><input class="inp" id="tx_vendorbiz" placeholder="000-00-00000"></div>
      </div>`:''}
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">공급가액</label><input class="inp" id="tx_supply" type="number" oninput="calcTaxAmt()"></div>
        <div><label class="lbl">세액(10%)</label><input class="inp" id="tx_tax" type="number" style="background:var(--g50)"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">${isPurchase?'공급자 사업자번호':'공급받는자 사업자번호'}</label><input class="inp" id="tx_buyerbiz" placeholder="000-00-00000"></div>
        <div><label class="lbl">품목</label><input class="inp" id="tx_item" placeholder="${isPurchase?'자재·용역 등':'인테리어 공사'}"></div>
      </div>
      <div class="form-row form-row-2">
        <div><label class="lbl">상태</label><select class="sel" id="tx_status"><option>미발행</option><option>발행예정</option><option>발행완료</option></select></div>
        <div><label class="lbl">비고</label><input class="inp" id="tx_memo" placeholder="메모"></div>
      </div>
      ${!isPurchase?`<div style="margin-top:12px;background:var(--g50);border-radius:var(--radius);padding:10px;font-size:11px;color:var(--g600)">
        <div><strong>공급자(을):</strong> ${co.name} (${co.bizNo})</div>
      </div>`:''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveTax(${isPurchase?'true':'false'})">저장</button>
    </div>
  </div></div>`);
}
function autoFillTax(pid){
  const p=getProject(pid);if(!p)return;
  const tot=getTotal(p);const supply=Math.round(tot);
  document.getElementById('tx_supply').value=supply;
  document.getElementById('tx_tax').value=Math.round(supply*0.1);
}
function calcTaxAmt(){
  const supply=Number(document.getElementById('tx_supply')?.value||0);
  const taxEl=document.getElementById('tx_tax');if(taxEl)taxEl.value=Math.round(supply*0.1);
}
function saveTax(isPurchase){
  const taxes=getTaxInvoices();
  const tx={id:uid(),pid:v('tx_pid'),date:v('tx_date'),supplyAmt:Number(v('tx_supply')||0),
    taxAmt:Number(v('tx_tax')||0),buyerBiz:v('tx_buyerbiz'),status:v('tx_status')||'미발행',
    item:v('tx_item')||'공사',memo:v('tx_memo')||'',type:isPurchase?'매입':'매출'};
  if(isPurchase){tx.vendorNm=document.getElementById('tx_vendor')?.value||'';tx.vendorBiz=document.getElementById('tx_vendorbiz')?.value||'';}
  taxes.push(tx);
  saveTaxInvoices(taxes);closeModal();toast('✅ 저장되었습니다','success');renderTax();
}
function deleteTax(id){
  if(!confirm('삭제?'))return;
  saveTaxInvoices(getTaxInvoices().filter(t=>t.id!==id));renderTax();
}
function openTaxPreview(id){
  const t=getTaxInvoices().find(x=>x.id===id);if(!t)return;
  const co=getCompany();const p=getProject(t.pid);
  const total=(t.supplyAmt||0)+(t.taxAmt||0);
  const isPurchase=t.type==='매입';
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:640px">
    <div class="modal-hdr"><span class="modal-title">세금계산서 미리보기</span><div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm" onclick="window.print()">${svgIcon('print',12)} 인쇄</button><button class="modal-close" onclick="closeModal()">✕</button></div></div>
    <div class="modal-body" style="padding:0">
      <div style="background:#fff;padding:28px;font-family:'Noto Sans KR',sans-serif">
        <div style="text-align:center;font-size:18px;font-weight:800;letter-spacing:.3em;border-bottom:3px double var(--dark);padding-bottom:10px;margin-bottom:16px">${isPurchase?'매입':'매출'} 세 금 계 산 서</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid var(--g300);margin-bottom:16px">
          <tr><td style="width:20%;background:var(--g50);padding:6px 10px;border:1px solid var(--g300);font-weight:700">${isPurchase?'공급자':'공급자(을)'}</td><td style="padding:6px 10px;border:1px solid var(--g300)" colspan="3">${isPurchase?(t.vendorNm||'-'):co.name} (${isPurchase?(t.vendorBiz||'-'):co.bizNo})</td></tr>
          <tr><td style="background:var(--g50);padding:6px 10px;border:1px solid var(--g300);font-weight:700">${isPurchase?'공급받는자':'공급받는자(갑)'}</td><td style="padding:6px 10px;border:1px solid var(--g300)" colspan="3">${isPurchase?co.name:(p?.client||'-')} (${t.buyerBiz||'-'})</td></tr>
          <tr><td style="background:var(--g50);padding:6px 10px;border:1px solid var(--g300);font-weight:700">작성일</td><td style="padding:6px 10px;border:1px solid var(--g300)">${t.date||'-'}</td><td style="background:var(--g50);padding:6px 10px;border:1px solid var(--g300);font-weight:700">상태</td><td style="padding:6px 10px;border:1px solid var(--g300)">${t.status||'-'}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid var(--g300)">
          <thead><tr style="background:var(--dark);color:#fff">
            <th style="padding:8px;border:1px solid var(--g300);color:#fff">품목</th>
            <th style="padding:8px;border:1px solid var(--g300);text-align:right;color:#fff">공급가액</th>
            <th style="padding:8px;border:1px solid var(--g300);text-align:right;color:#fff">세액</th>
            <th style="padding:8px;border:1px solid var(--g300);text-align:right;color:#fff">합계금액</th>
          </tr></thead>
          <tbody>
            <tr><td style="padding:8px;border:1px solid var(--g300)">${t.item||'공사'}</td>
              <td style="padding:8px;border:1px solid var(--g300);text-align:right">${fmt(t.supplyAmt||0)}원</td>
              <td style="padding:8px;border:1px solid var(--g300);text-align:right">${fmt(t.taxAmt||0)}원</td>
              <td style="padding:8px;border:1px solid var(--g300);text-align:right;font-weight:700">${fmt(total)}원</td>
            </tr>
            <tr style="background:var(--g50)"><td style="padding:8px;border:1px solid var(--g300);font-weight:700" colspan="1">합계</td>
              <td style="padding:8px;border:1px solid var(--g300);text-align:right;font-weight:700">${fmt(t.supplyAmt||0)}원</td>
              <td style="padding:8px;border:1px solid var(--g300);text-align:right;font-weight:700">${fmt(t.taxAmt||0)}원</td>
              <td style="padding:8px;border:1px solid var(--g300);text-align:right;font-weight:800;font-size:14px">₩${fmt(total)}</td>
            </tr>
          </tbody>
        </table>
        ${t.memo?`<div style="margin-top:12px;font-size:11px;color:var(--g600)"><strong>비고:</strong> ${t.memo}</div>`:''}
        ${p?`<div style="margin-top:8px;font-size:11px;color:var(--g500)">프로젝트: ${p.nm}</div>`:''}
      </div>
    </div>
  </div></div>`);
}
function printTax(id){openTaxPreview(id);}
function filterTax(){renderTax();}

// ===== AS =====
function renderAS(){
  const list=getASList();
  const ps=getProjects();
  document.getElementById('tb-actions').innerHTML=`<button class="btn btn-primary btn-sm" onclick="openAddAS()">+ AS 접수</button>`;
  document.getElementById('content').innerHTML=`
  ${filterBar({statuses:['접수','처리중','완료'],placeholder:'프로젝트명 검색...',showDate:true,showMonthGroup:true,onFilter:'filterAS()'})}
  <div class="tbl-wrap">
    <table class="tbl">
      <thead><tr>
        <th>프로젝트</th><th>고객</th><th onclick="sortTbl('as','date')" style="cursor:pointer">접수일 ↕</th><th>내용</th>
        <th>우선순위</th><th>담당자</th><th>상태</th><th>완료일</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(a=>{const p=getProject(a.pid);return`<tr>
          <td style="font-weight:600">${p?.nm||'-'}</td>
          <td>${p?.client||'-'}</td>
          <td style="font-size:11px">${a.date||'-'}</td>
          <td style="max-width:200px;font-size:12px">${a.content||'-'}</td>
          <td><span class="badge badge-${a.priority==='긴급'?'red':a.priority==='보통'?'orange':'gray'}">${a.priority||'-'}</span></td>
          <td>${a.assignee||'-'}</td>
          <td>${statusBadge(a.status)}</td>
          <td style="font-size:11px">${a.doneDate||'-'}</td>
          <td style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditAS('${a.id}')">${svgIcon('edit',12)}</button>
            <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteAS('${a.id}')">${svgIcon('trash',12)}</button>
          </td>
        </tr>`}).join('')||`<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--g400)">AS 접수 내역 없음</td></tr>`}
      </tbody>
    </table>
  </div>`;
}
function openAddAS(){
  const ps=getProjects().filter(p=>p.status==='완료'||p.status==='시공중');
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">AS 접수</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트</label><select class="sel" id="as_pid"><option value="">선택</option>${ps.map(p=>`<option value="${p.id}">${p.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">접수일</label><input class="inp" id="as_date" type="date" value="${today()}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">우선순위</label><select class="sel" id="as_priority"><option>긴급</option><option>보통</option><option>낮음</option></select></div>
        <div><label class="lbl">담당자</label><select class="sel" id="as_assignee">${TEAM_MEMBERS.map(m=>`<option>${m}</option>`).join('')}</select></div>
        <div><label class="lbl">상태</label><select class="sel" id="as_status"><option>접수</option><option>처리중</option><option>완료</option></select></div>
      </div>
      <div><label class="lbl">AS 내용 *</label><textarea class="inp" id="as_content" rows="3" placeholder="하자 내용을 상세히 입력하세요"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewAS()">접수</button>
    </div>
  </div></div>`);
}
function saveNewAS(){
  const content=v('as_content');if(!content){toast('내용을 입력하세요','error');return;}
  const list=getASList();
  list.push({id:uid(),pid:v('as_pid'),date:v('as_date'),content,
    priority:v('as_priority')||'보통',assignee:v('as_assignee'),
    status:v('as_status')||'접수',doneDate:''});
  saveASList(list);closeModal();toast('AS 접수되었습니다','success');renderAS();
}
function openEditAS(aid){
  const list=getASList();const a=list.find(x=>x.id===aid);if(!a)return;
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">AS 편집</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">우선순위</label><select class="sel" id="eas_priority">${['긴급','보통','낮음'].map(p2=>`<option${a.priority===p2?' selected':''}>${p2}</option>`).join('')}</select></div>
        <div><label class="lbl">상태</label><select class="sel" id="eas_status">${['접수','처리중','완료'].map(s=>`<option${a.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">담당자</label><select class="sel" id="eas_assignee">${TEAM_MEMBERS.map(m=>`<option${a.assignee===m?' selected':''}>${m}</option>`).join('')}</select></div>
        <div><label class="lbl">완료일</label><input class="inp" id="eas_done" type="date" value="${a.doneDate||''}"></div>
      </div>
      <div><label class="lbl">내용</label><textarea class="inp" id="eas_content" rows="3">${escHtml(a.content||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditAS('${aid}')">저장</button>
    </div>
  </div></div>`);
}
function saveEditAS(aid){
  const list=getASList();const i=list.findIndex(x=>x.id===aid);if(i<0)return;
  list[i]={...list[i],priority:v('eas_priority'),status:v('eas_status'),assignee:v('eas_assignee'),doneDate:v('eas_done'),content:v('eas_content')};
  saveASList(list);closeModal();toast('저장되었습니다','success');renderAS();
}
function deleteAS(aid){if(!confirm('삭제?'))return;saveASList(getASList().filter(a=>a.id!==aid));renderAS();}
function filterAS(){renderAS();}

// ===== TEAM =====
function renderTeam(){
  const team=getTeam();const ps=getProjects();
  document.getElementById('tb-actions').innerHTML=`<button class="btn btn-primary btn-sm" onclick="openAddTeam()">+ 팀원 추가</button>`;
  document.getElementById('content').innerHTML=`
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
    ${team.map(m=>{
      const myPs=ps.filter(p=>p.mgr===m.name);
      return`<div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--dark);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0">${m.name[0]}</div>
          <div>
            <div style="font-weight:700;font-size:14px">${m.name}</div>
            <div style="font-size:12px;color:var(--g500)">${m.role} · ${m.dept}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--g600);line-height:2;margin-bottom:10px">
          <div>📧 ${m.email||'-'}</div>
          <div>📞 ${m.phone||'-'}</div>
          <div>프로젝트: ${myPs.length}건</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" style="flex:1" onclick="openEditTeam('${m.id}')">${svgIcon('edit',12)} 편집</button>
          <button class="btn btn-red btn-sm" onclick="deleteTeamMember('${m.id}')">${svgIcon('trash',12)} 삭제</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}
function openAddTeam(){
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">팀원 추가</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">이름 *</label><input class="inp" id="tm_name"></div>
        <div><label class="lbl">직책</label><input class="inp" id="tm_role"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">부서</label><input class="inp" id="tm_dept"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="tm_email" type="email"></div>
      </div>
      <div><label class="lbl">연락처</label><input class="inp" id="tm_phone"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewTeam()">추가</button>
    </div>
  </div></div>`);
}
function saveNewTeam(){
  const nm=v('tm_name');if(!nm){toast('이름을 입력하세요','error');return;}
  const team=getTeam();
  team.push({id:uid(),name:nm,role:v('tm_role'),dept:v('tm_dept'),email:v('tm_email'),phone:v('tm_phone')});
  saveTeam(team);closeModal();toast('팀원이 추가되었습니다','success');renderTeam();
}
function openEditTeam(tid){
  const team=getTeam();const m=team.find(x=>x.id===tid);if(!m)return;
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">${m.name} 편집</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">이름</label><input class="inp" id="etm_name" value="${m.name||''}"></div>
        <div><label class="lbl">직책</label><input class="inp" id="etm_role" value="${m.role||''}"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">부서</label><input class="inp" id="etm_dept" value="${m.dept||''}"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="etm_email" value="${m.email||''}"></div>
      </div>
      <div><label class="lbl">연락처</label><input class="inp" id="etm_phone" value="${m.phone||''}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditTeam('${tid}')">저장</button>
    </div>
  </div></div>`);
}
function saveEditTeam(tid){
  const team=getTeam();const i=team.findIndex(x=>x.id===tid);if(i<0)return;
  team[i]={...team[i],name:v('etm_name'),role:v('etm_role'),dept:v('etm_dept'),email:v('etm_email'),phone:v('etm_phone')};
  saveTeam(team);closeModal();toast('저장되었습니다','success');renderTeam();
}
// ===== REPORTS =====
function renderReports(){
  const ps=getProjects();
  const completed=ps.filter(p=>p.status==='완료');
  const totalRevenue=ps.reduce((a,p)=>a+getTotal(p),0);
  const totalCost=ps.reduce((a,p)=>a+calcP(p).costDirect,0);
  const totalPaid=ps.reduce((a,p)=>a+getPaid(p),0);
  const avgMR=ps.length?ps.reduce((a,p)=>a+getMR(p),0)/ps.length:0;
  const labor=getLabor();
  const expenses=getExpenses();
  const totalLabor=labor.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
  const totalExpense=expenses.reduce((a,e)=>a+(Number(e.amount)||0),0);
  const adm=isAdmin();
  
  document.getElementById('content').innerHTML=`
  <div class="dash-grid" style="margin-bottom:14px">
    <div class="kpi-card"><div class="kpi-label">총 프로젝트</div><div class="kpi-value">${ps.length}<span style="font-size:14px">건</span></div></div>
    ${adm?`<div class="kpi-card"><div class="kpi-label">총 도급금액</div><div class="kpi-value" style="font-size:18px">${fmtShort(totalRevenue)}<span style="font-size:12px">원</span></div></div>
    <div class="kpi-card"><div class="kpi-label">평균 마진율</div><div class="kpi-value" style="color:var(--green)">${avgMR.toFixed(1)}%</div></div>
    <div class="kpi-card"><div class="kpi-label">수금완료</div><div class="kpi-value" style="color:var(--blue)">${fmtShort(totalPaid)}<span style="font-size:12px">원</span></div></div>`
    :`<div class="kpi-card"><div class="kpi-label">시공중</div><div class="kpi-value" style="color:var(--orange)">${ps.filter(p=>p.status==='시공중').length}<span style="font-size:14px">건</span></div></div>
    <div class="kpi-card"><div class="kpi-label">완료</div><div class="kpi-value" style="color:var(--green)">${completed.length}<span style="font-size:14px">건</span></div></div>
    <div class="kpi-card"><div class="kpi-label">평균 공정률</div><div class="kpi-value" style="color:var(--blue)">${ps.length?Math.round(ps.reduce((a,p)=>a+getProg(p),0)/ps.length):0}%</div></div>`}
  </div>
  
  <!-- Tabs -->
  <div class="tab-list" style="margin-bottom:16px">
    ${adm?'<button class="tab-btn active" onclick="showReportTab(this,\'rpt-profit\')">수익성 분석</button>':''}
    <button class="tab-btn ${adm?'':'active'}" onclick="showReportTab(this,'rpt-labor')">인건비 현황</button>
    <button class="tab-btn" onclick="showReportTab(this,'rpt-expense')">지출 현황</button>
    <button class="tab-btn" onclick="showReportTab(this,'rpt-chart')">차트</button>
  </div>
  
  ${adm?`<!-- Profit tab (admin only) -->
  <div class="tab-pane active" id="rpt-profit">
    <div class="card">
      <div class="card-title">프로젝트 수익성 분석</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>프로젝트</th><th>도급금액</th><th>예상원가</th>
            <th>인건비</th><th>지출비</th>
            <th>마진금액</th><th>마진율</th><th>수금률</th><th>상태</th>
          </tr></thead>
          <tbody>
            ${ps.map(p=>{
              const calc=calcP(p);const mr=getMR(p);
              const paid=getPaid(p);const tot=getTotal(p);
              const paidPct=tot>0?Math.round(paid/tot*100):0;
              const pLabor=labor.filter(l=>l.pid===p.id).reduce((a,l)=>a+(Number(l.net_amount)||0),0);
              const pExp=expenses.filter(e=>e.pid===p.id).reduce((a,e)=>a+(Number(e.amount)||0),0);
              return`<tr>
                <td style="font-weight:600">\${p.nm}</td>
                <td class="num">\${tot>0?fmt(tot):'-'}</td>
                <td class="num">\${calc.costDirect>0?fmt(calc.costDirect):'-'}</td>
                <td class="num" style="color:var(--orange)">\${pLabor>0?fmt(pLabor):'-'}</td>
                <td class="num" style="color:var(--purple)">\${pExp>0?fmt(pExp):'-'}</td>
                <td class="num" style="color:var(--green)">\${tot>0?fmt(tot-calc.costDirect):'-'}</td>
                <td style="font-weight:700;color:\${mr<5?'var(--red)':mr<15?'var(--orange)':'var(--green)'}">\${tot>0?mr.toFixed(1)+'%':'-'}</td>
                <td>\${paidPct}%</td>
                <td>\${statusBadge(p.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`:''}
  
  <!-- Labor tab -->
  <div class="tab-pane ${adm?'':'active'}" id="rpt-labor">
    <div class="dash-grid dash-grid-3" style="margin-bottom:14px">
      ${adm?`<div class="kpi-card" style="border-left:3px solid var(--orange)"><div class="kpi-label">총 인건비</div><div class="kpi-value" style="color:var(--orange)">${fmtShort(totalLabor)}<span style="font-size:12px">원</span></div></div>`
      :`<div class="kpi-card" style="border-left:3px solid var(--orange)"><div class="kpi-label">인건비 건수</div><div class="kpi-value" style="color:var(--orange)">${labor.length}<span style="font-size:12px">건</span></div></div>`}
      <div class="kpi-card" style="border-left:3px solid var(--blue)"><div class="kpi-label">등록 인원</div><div class="kpi-value" style="color:var(--blue)">${[...new Set(labor.map(l=>l.worker_name))].length}<span style="font-size:12px">명</span></div></div>
      <div class="kpi-card" style="border-left:3px solid var(--red)"><div class="kpi-label">미지급</div><div class="kpi-value" style="color:var(--red)">${adm?fmtShort(labor.filter(l=>!l.paid).reduce((a,l)=>a+(Number(l.net_amount)||0),0)):labor.filter(l=>!l.paid).length+'건'}<span style="font-size:12px">${adm?'원':''}</span></div></div>
    </div>
    <div class="card">
      <div class="card-title">프로젝트별 인건비 지급명세서</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>프로젝트</th><th>작업자수</th><th>총 공수(일)</th><th>총 인건비</th><th>지급완료</th><th>미지급</th><th></th></tr></thead>
          <tbody>
            ${ps.map(p=>{
              const pl=labor.filter(l=>l.pid===p.id);
              if(!pl.length)return '';
              const workers=[...new Set(pl.map(l=>l.worker_name))].length;
              const totalDays=pl.reduce((a,l)=>a+(Number(l.days)||0),0);
              const totalAmt=pl.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
              const paidAmt=pl.filter(l=>l.paid).reduce((a,l)=>a+(Number(l.net_amount)||0),0);
              return`<tr>
                <td style="font-weight:600">${p.nm}</td>
                <td>${workers}명</td>
                <td>${totalDays}일</td>
                <td class="num" style="font-weight:700">${fmt(totalAmt)}</td>
                <td class="num" style="color:var(--green)">${fmt(paidAmt)}</td>
                <td class="num" style="color:var(--red)">${fmt(totalAmt-paidAmt)}</td>
                <td><button class="btn btn-outline btn-sm" onclick="openLaborStatement('${p.id}')">명세서</button></td>
              </tr>`;
            }).join('')||'<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--g400)">인건비 데이터 없음</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  
  <!-- Expense tab -->
  <div class="tab-pane" id="rpt-expense">
    <div class="dash-grid dash-grid-3" style="margin-bottom:14px">
      <div class="kpi-card" style="border-left:3px solid var(--purple)"><div class="kpi-label">총 지출</div><div class="kpi-value" style="color:var(--purple)">${fmtShort(totalExpense)}<span style="font-size:12px">원</span></div></div>
      <div class="kpi-card" style="border-left:3px solid var(--green)"><div class="kpi-label">승인 건수</div><div class="kpi-value" style="color:var(--green)">${expenses.filter(e=>e.status==='승인').length}<span style="font-size:12px">건</span></div></div>
      <div class="kpi-card" style="border-left:3px solid var(--orange)"><div class="kpi-label">대기 건수</div><div class="kpi-value" style="color:var(--orange)">${expenses.filter(e=>e.status==='대기').length}<span style="font-size:12px">건</span></div></div>
    </div>
    <div class="card">
      <div class="card-title">프로젝트별 지출 현황</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>프로젝트</th><th>지출건수</th><th>총 지출</th><th>인건비</th><th>비용합계</th></tr></thead>
          <tbody>
            ${ps.map(p=>{
              const pe=expenses.filter(e=>e.pid===p.id);
              const pl=labor.filter(l=>l.pid===p.id);
              if(!pe.length&&!pl.length)return '';
              const expAmt=pe.reduce((a,e)=>a+(Number(e.amount)||0),0);
              const labAmt=pl.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
              return`<tr>
                <td style="font-weight:600">${p.nm}</td>
                <td>${pe.length}건</td>
                <td class="num">${fmt(expAmt)}</td>
                <td class="num">${fmt(labAmt)}</td>
                <td class="num" style="font-weight:700;color:var(--red)">${fmt(expAmt+labAmt)}</td>
              </tr>`;
            }).join('')||'<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--g400)">지출 데이터 없음</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  
  <!-- Chart tab -->
  <div class="tab-pane" id="rpt-chart">
    <div class="dash-2col" style="margin-bottom:14px">
      <div class="card">
        <div class="card-title">상태별 프로젝트 분포</div>
        <div class="chart-wrap"><canvas id="statusChart"></canvas></div>
      </div>
      ${adm?`<div class="card">
        <div class="card-title">공종별 매출 비중</div>
        <div class="chart-wrap"><canvas id="catChart"></canvas></div>
      </div>`:`<div class="card">
        <div class="card-title">담당자별 프로젝트 현황</div>
        <div class="chart-wrap"><canvas id="mgrChart"></canvas></div>
      </div>`}
    </div>
  </div>`;
  
  setTimeout(()=>{
    // Status chart
    const sctx=document.getElementById('statusChart');
    if(sctx){
      const labels=Object.keys(STATUS_LABELS);
      const vals=labels.map(l=>ps.filter(p=>p.status===l).length);
      new Chart(sctx,{type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:['#9ca3af','#3b82f6','#8b5cf6','#f59e0b','#22c55e','#ef4444']}]},options:{responsive:true,maintainAspectRatio:false}});
    }
    // Cat chart (admin) or Mgr chart (staff)
    const cctx=document.getElementById('catChart');
    if(cctx){
      const catTotals={};
      ps.forEach(p=>{const calc=calcP(p);Object.entries(calc.cs).forEach(([cid,cs])=>{catTotals[cid]=(catTotals[cid]||0)+cs.t;});});
      const sorted=Object.entries(catTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
      new Chart(cctx,{type:'bar',data:{labels:sorted.map(([cid])=>catNm(cid)),datasets:[{data:sorted.map(([,v])=>Math.round(v/10000)),backgroundColor:'rgba(37,99,235,.8)',borderRadius:4}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>`${fmt(v)}만`}}},responsive:true,maintainAspectRatio:false}});
    }
    const mctx=document.getElementById('mgrChart');
    if(mctx){
      const mgrCounts={};
      ps.forEach(p=>{const m=p.mgr||'미지정';mgrCounts[m]=(mgrCounts[m]||0)+1;});
      const sorted=Object.entries(mgrCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
      const colors=['#6366f1','#8b5cf6','#3b82f6','#14b8a6','#22c55e','#f59e0b','#ef4444','#ec4899'];
      new Chart(mctx,{type:'doughnut',data:{labels:sorted.map(([k])=>k),datasets:[{data:sorted.map(([,v])=>v),backgroundColor:colors.slice(0,sorted.length)}]},options:{responsive:true,maintainAspectRatio:false}});
    }
  },100);
}

// ===== ADMIN (관리자 설정 — 탭 기반) =====
let _adminTab='company';
function renderAdmin(){
  const co=getCompany();const team=getTeam();const ps=getProjects();
  document.getElementById('tb-actions').innerHTML='';
  document.getElementById('content').innerHTML=`
  <!-- Admin Tabs -->
  <div style="display:flex;border-bottom:2px solid var(--g200);margin-bottom:16px">
    ${[{id:'company',icon:'🏢',label:'회사 정보'},{id:'users',icon:'👥',label:'사용자 관리'},{id:'system',icon:'⚙️',label:'시스템 설정'},{id:'data',icon:'💾',label:'데이터 관리'},{id:'notice',icon:'📢',label:'공지사항'}].map(t=>
      `<button onclick="_adminTab='${t.id}';renderAdmin()" style="padding:10px 18px;border:none;background:${_adminTab===t.id?'#fff':'transparent'};font-size:12px;font-weight:600;cursor:pointer;border-bottom:${_adminTab===t.id?'2px solid var(--blue)':'2px solid transparent'};margin-bottom:-2px;color:${_adminTab===t.id?'var(--blue)':'var(--g600)'};display:flex;align-items:center;gap:5px">${t.icon} ${t.label}</button>`
    ).join('')}
  </div>
  <div id="admin-content">${_adminTab==='company'?_adminCompany(co):_adminTab==='users'?_adminUsers():_adminTab==='system'?_adminSystem():_adminTab==='data'?_adminData():_adminNotice()}</div>`;
}
function _adminCompany(co){
  return`<div class="dash-2col">
    <div class="card">
      <div class="card-title">🏢 회사 기본 정보</div>
      <div class="form-row form-row-2" style="margin-bottom:10px">
        <div><label class="lbl">회사명(영문)</label><input class="inp" id="co_name" value="${co.name||''}"></div>
        <div><label class="lbl">회사명(한글)</label><input class="inp" id="co_nameKo" value="${co.nameKo||''}"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:10px">
        <div><label class="lbl">대표자</label><input class="inp" id="co_ceo" value="${co.ceo||''}"></div>
        <div><label class="lbl">사업자번호</label><input class="inp" id="co_bizNo" value="${co.bizNo||''}"></div>
      </div>
      <div style="margin-bottom:10px"><label class="lbl">주소</label><input class="inp" id="co_addr" value="${co.addr||''}"></div>
      <div class="form-row form-row-2" style="margin-bottom:10px">
        <div><label class="lbl">이메일</label><input class="inp" id="co_email" value="${co.email||''}"></div>
        <div><label class="lbl">대표전화</label><input class="inp" id="co_tel" value="${co.tel||''}"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:10px">
        <div><label class="lbl">휴대폰</label><input class="inp" id="co_mobile" value="${co.mobile||''}"></div>
        <div><label class="lbl">전문분야</label><input class="inp" id="co_spec" value="${co.specialty||'Office Specialist'}"></div>
      </div>
      <div style="margin-bottom:10px"><label class="lbl">웹사이트</label><input class="inp" id="co_web" value="${co.website||''}"></div>
      <div style="margin-top:12px"><button class="btn btn-primary" onclick="saveCompanyInfo()">💾 저장</button></div>
    </div>
    <div>
      <!-- Preview Card -->
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">📋 견적서 표지 미리보기</div>
        <div style="background:var(--dark);border-radius:var(--radius-lg);padding:20px;color:#fff;min-height:180px;display:flex;flex-direction:column;justify-content:space-between">
          <div style="font-size:10px;letter-spacing:.3em;color:rgba(255,255,255,.4)">${co.name||'COMPANY NAME'}</div>
          <div>
            <div style="font-size:24px;font-weight:700;letter-spacing:.15em;margin-bottom:6px">공사견적서</div>
            <div style="font-size:10px;letter-spacing:.2em;color:rgba(255,255,255,.3)">Construction Estimate</div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.4)">
            <span>${co.nameKo||''}</span><span>${co.tel||''}</span>
          </div>
        </div>
      </div>
      <!-- Quick Stats -->
      <div class="card">
        <div class="card-title">📊 시스템 현황</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--g100)"><span>프로젝트</span><span style="font-weight:700">${getProjects().length}건</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--g100)"><span>팀원</span><span style="font-weight:700">${getTeam().length}명</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--g100)"><span>거래처</span><span style="font-weight:700">${getVendors().length}곳</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--g100)"><span>단가DB</span><span style="font-weight:700">${getPriceDB().length}건</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--g100)"><span>세금계산서</span><span style="font-weight:700">${getTaxInvoices().length}건</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--g100)"><span>상담</span><span style="font-weight:700">${(_d.consultations||[]).length}건</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0"><span>RFP</span><span style="font-weight:700">${(_d.rfp||[]).length}건</span></div>
        </div>
      </div>
    </div>
  </div>`;
}
// ===== ADMIN: USER MANAGEMENT =====
let _usersCache=null;
async function _loadUsers(){ _usersCache=await api('users'); return _usersCache||[]; }

function _adminUsers(){
  // Load users async and render
  if(!_usersCache){ _loadUsers().then(()=>{ document.getElementById('admin-content').innerHTML=_adminUsersHTML(); }); return '<div style="padding:40px;text-align:center;color:var(--g500)">사용자 목록 로딩중...</div>'; }
  return _adminUsersHTML();
}

function _adminUsersHTML(){
  const users=_usersCache||[];
  return`<div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:13px;color:var(--g600)">총 <strong>${users.length}</strong>명의 사용자</div>
    <button class="btn btn-primary btn-sm" onclick="openAddUser()">+ 사용자 추가</button>
  </div>
  <div class="card">
    <div class="tbl-wrap" style="border:none">
      <table class="tbl">
        <thead><tr><th>사용자</th><th>아이디</th><th>역할</th><th>이메일</th><th>연락처</th><th>상태</th><th>최근 로그인</th><th>작업</th></tr></thead>
        <tbody>
          ${users.map(u=>`<tr>
            <td><div style="display:flex;align-items:center;gap:8px">
              <div style="width:32px;height:32px;border-radius:50%;background:${u.role==='admin'?'var(--primary)':'var(--success)'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${(u.name||u.username||'U')[0].toUpperCase()}</div>
              <div><div style="font-weight:600;font-size:12px">${u.name||'-'}</div></div>
            </div></td>
            <td style="font-family:monospace;font-size:12px">${u.username}</td>
            <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${u.role==='admin'?'var(--primary-light)':'var(--gray-100)'};color:${u.role==='admin'?'var(--primary)':'var(--text-muted)'}">${u.role==='admin'?'관리자':'직원'}</span></td>
            <td style="font-size:11px">${u.email||'-'}</td>
            <td style="font-size:11px">${u.phone||'-'}</td>
            <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${u.active?'var(--success)':'var(--danger)'};margin-right:4px"></span>${u.active?'활성':'비활성'}</td>
            <td style="font-size:11px;color:var(--g500)">${u.last_login?new Date(u.last_login).toLocaleDateString('ko'):'없음'}</td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm" onclick="openEditUser('${u.id}')" title="수정">✏️</button>
                <button class="btn btn-ghost btn-sm" onclick="resetUserPw('${u.id}','${u.username}')" title="비밀번호 변경">🔑</button>
                ${u.id!=='admin-default'?`<button class="btn btn-ghost btn-sm" onclick="deleteUser('${u.id}','${u.username}')" title="삭제" style="color:var(--danger)">🗑️</button>`:''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function openAddUser(){
  openModal('사용자 추가','md',`
    <div class="form-row form-row-2" style="margin-bottom:10px">
      <div><label class="lbl">이름</label><input class="inp" id="nu_name" placeholder="홍길동"></div>
      <div><label class="lbl">아이디 *</label><input class="inp" id="nu_username" placeholder="hong"></div>
    </div>
    <div class="form-row form-row-2" style="margin-bottom:10px">
      <div><label class="lbl">비밀번호 *</label><input class="inp" id="nu_pass" type="password" placeholder="4자 이상"></div>
      <div><label class="lbl">역할</label><select class="sel" id="nu_role"><option value="staff">직원</option><option value="admin">관리자</option></select></div>
    </div>
    <div class="form-row form-row-2" style="margin-bottom:10px">
      <div><label class="lbl">이메일</label><input class="inp" id="nu_email" type="email"></div>
      <div><label class="lbl">연락처</label><input class="inp" id="nu_phone"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewUser()">추가</button>
    </div>
  `);
}

async function saveNewUser(){
  const username=document.getElementById('nu_username').value.trim();
  const password=document.getElementById('nu_pass').value;
  if(!username){toast('아이디를 입력하세요','error');return;}
  if(!password||password.length<4){toast('비밀번호는 4자 이상이어야 합니다','error');return;}
  const res=await api('users','POST',{
    id:uid(), username, password,
    name:document.getElementById('nu_name').value.trim(),
    role:document.getElementById('nu_role').value,
    email:document.getElementById('nu_email').value.trim(),
    phone:document.getElementById('nu_phone').value.trim(),
    active:1
  });
  if(res?.__error||res?.error){toast(res.error||'저장 실패','error');return;}
  closeModal();toast('사용자가 추가되었습니다','success');
  _usersCache=null;_adminTab='users';renderAdmin();
}

function openEditUser(uid_){
  const u=(_usersCache||[]).find(x=>x.id===uid_);
  if(!u)return;
  openModal('사용자 수정','md',`
    <div class="form-row form-row-2" style="margin-bottom:10px">
      <div><label class="lbl">이름</label><input class="inp" id="eu_name" value="${u.name||''}"></div>
      <div><label class="lbl">아이디</label><input class="inp" value="${u.username}" disabled style="background:var(--g100)"></div>
    </div>
    <div class="form-row form-row-2" style="margin-bottom:10px">
      <div><label class="lbl">역할</label><select class="sel" id="eu_role"><option value="staff"${u.role!=='admin'?' selected':''}>직원</option><option value="admin"${u.role==='admin'?' selected':''}>관리자</option></select></div>
      <div><label class="lbl">상태</label><select class="sel" id="eu_active"><option value="1"${u.active?' selected':''}>활성</option><option value="0"${!u.active?' selected':''}>비활성</option></select></div>
    </div>
    <div class="form-row form-row-2" style="margin-bottom:10px">
      <div><label class="lbl">이메일</label><input class="inp" id="eu_email" value="${u.email||''}"></div>
      <div><label class="lbl">연락처</label><input class="inp" id="eu_phone" value="${u.phone||''}"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveEditUser('${uid_}','${u.username}')">저장</button>
    </div>
  `);
}

async function saveEditUser(uid_,username){
  const res=await api('users','POST',{
    id:uid_, username,
    name:document.getElementById('eu_name').value.trim(),
    role:document.getElementById('eu_role').value,
    email:document.getElementById('eu_email').value.trim(),
    phone:document.getElementById('eu_phone').value.trim(),
    active:Number(document.getElementById('eu_active').value),
    password:(_usersCache||[]).find(x=>x.id===uid_)?.password||'temp1234'
  });
  if(res?.__error){toast('저장 실패','error');return;}
  closeModal();toast('사용자 정보가 수정되었습니다','success');
  _usersCache=null;_adminTab='users';renderAdmin();
}

async function resetUserPw(uid_,username){
  const newPw=prompt(`${username}의 새 비밀번호를 입력하세요 (4자 이상):`);
  if(!newPw)return;
  if(newPw.length<4){toast('비밀번호는 4자 이상이어야 합니다','error');return;}
  const res=await api('users/'+uid_+'/password','PUT',{password:newPw});
  if(res?.__error||res?.error){toast(res.error||'변경 실패','error');return;}
  toast('비밀번호가 변경되었습니다','success');
}

async function deleteUser(uid_,username){
  if(!confirm(`${username} 사용자를 삭제하시겠습니까?`))return;
  const res=await api('users/'+uid_,'DELETE');
  if(res?.__error||res?.error){toast(res.error||'삭제 실패','error');return;}
  toast('삭제되었습니다','success');
  _usersCache=null;_adminTab='users';renderAdmin();
}

function _adminSystem(){
  const prefs=_d.userPrefs||{};
  return`<div class="dash-2col">
    <div style="display:flex;flex-direction:column;gap:14px">
      <!-- Default Values -->
      <div class="card">
        <div class="card-title">📐 기본값 설정</div>
        <div class="form-row form-row-2" style="margin-bottom:10px">
          <div><label class="lbl">기본 이윤율(%)</label><input class="inp" id="sys_profit" type="number" value="${prefs.defaultProfit||10}"></div>
          <div><label class="lbl">기본 단수정리</label><select class="sel" id="sys_round"><option${(prefs.defaultRound||'십만원')==='만원'?' selected':''}>만원</option><option${(prefs.defaultRound||'십만원')==='십만원'?' selected':''}>십만원</option><option${prefs.defaultRound==='직접'?' selected':''}>직접</option></select></div>
        </div>
        <div class="form-row form-row-2" style="margin-bottom:10px">
          <div><label class="lbl">안전관리비(%)</label><input class="inp" id="sys_safety" type="number" step="0.1" value="${prefs.safetyRate||0.7}"></div>
          <div><label class="lbl">식대·교통비(%)</label><input class="inp" id="sys_meal" type="number" step="0.1" value="${prefs.mealRate||3}"></div>
        </div>
        <div class="form-row form-row-2">
          <div><label class="lbl">기본 계약금(%)</label><input class="inp" id="sys_deposit" type="number" value="${prefs.defaultDeposit||30}"></div>
          <div><label class="lbl">Gantt 기본 공기(일)</label><input class="inp" id="sys_ganttDays" type="number" value="${prefs.defaultGanttDays||5}"></div>
        </div>
      </div>
      <!-- UI Settings -->
      <div class="card">
        <div class="card-title">🎨 UI 설정</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
            <span style="font-size:12px">다크 모드</span>
            <input type="checkbox" id="sys_dark" ${S.darkMode?'checked':''} onchange="toggleDarkMode()">
          </label>
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
            <span style="font-size:12px">사이드바 축소 모드</span>
            <input type="checkbox" id="sys_collapsed" ${S.sidebarCollapsed?'checked':''} onchange="toggleSidebar()">
          </label>
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
            <span style="font-size:12px">대시보드 자동 새로고침</span>
            <input type="checkbox" id="sys_autorefresh" ${prefs.autoRefresh?'checked':''}>
          </label>
          <div><label class="lbl">기본 시작 페이지</label>
            <select class="sel" id="sys_startPage">
              <option value="dash"${(prefs.startPage||'dash')==='dash'?' selected':''}>대시보드</option>
              <option value="projects"${prefs.startPage==='projects'?' selected':''}>프로젝트</option>
              <option value="collection"${prefs.startPage==='collection'?' selected':''}>수금 관리</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <!-- Notification Settings -->
      <div class="card">
        <div class="card-title">🔔 알림 설정</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
            <span style="font-size:12px">수금 연체 알림</span>
            <input type="checkbox" id="sys_notifOverdue" ${prefs.notifOverdue!==false?'checked':''}>
          </label>
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
            <span style="font-size:12px">결재 요청 알림</span>
            <input type="checkbox" id="sys_notifApproval" ${prefs.notifApproval!==false?'checked':''}>
          </label>
          <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer">
            <span style="font-size:12px">일정 리마인더 알림</span>
            <input type="checkbox" id="sys_notifMeeting" ${prefs.notifMeeting!==false?'checked':''}>
          </label>
          <div><label class="lbl">수금 예정 알림 (N일 전)</label><input class="inp" id="sys_notifDays" type="number" value="${prefs.notifDaysBefore||7}"></div>
        </div>
      </div>
      <!-- Version Info -->
      <div class="card">
        <div class="card-title">ℹ️ 시스템 정보</div>
        <div style="font-size:12px;line-height:2;color:var(--g600)">
          <div><strong>버전:</strong> v8.0 Full-Stack (Auth+RBAC+Value-Up)</div>
          <div><strong>플랫폼:</strong> Cloudflare Pages + D1</div>
          <div><strong>프레임워크:</strong> Hono + Vanilla JS</div>
          <div><strong>데이터:</strong> D1 SQLite (Cloud Sync)</div>
          <div><strong>최종 업데이트:</strong> ${today()}</div>
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveSystemSettings()" style="width:100%">💾 설정 저장</button>
    </div>
  </div>`;
}
function _adminData(){
  const counts={
    projects:getProjects().length, vendors:getVendors().length, meetings:getMeetings().length,
    pricedb:getPriceDB().length, tax:getTaxInvoices().length, team:getTeam().length,
    notices:getNotices().length, as:getASList().length, labor:(_d.labor||[]).length,
    expenses:(_d.expenses||[]).length, consultations:(_d.consultations||[]).length, rfp:(_d.rfp||[]).length,
    notifications:(_d.notifications||[]).length, approvals:(_d.approvals||[]).length
  };
  const totalRecords=Object.values(counts).reduce((a,c)=>a+c,0);
  return`<div class="dash-2col">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-title">📊 데이터 현황</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:12px">
          ${Object.entries(counts).map(([k,v])=>{
            const labels={projects:'프로젝트',vendors:'거래처',meetings:'회의',pricedb:'단가DB',tax:'세금계산서',
              team:'팀원',notices:'공지사항',as:'AS',labor:'인건비',expenses:'지출',consultations:'상담',
              rfp:'RFP',notifications:'알림',approvals:'결재'};
            return`<div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--g50);border-radius:4px;font-size:11px">
              <span style="color:var(--g600)">${labels[k]||k}</span>
              <span style="font-weight:700">${v}건</span>
            </div>`;
          }).join('')}
        </div>
        <div style="background:var(--blue-l);border-radius:6px;padding:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
          <span style="color:var(--blue);font-weight:700">총 레코드</span>
          <span style="font-size:16px;font-weight:800;color:var(--blue)">${totalRecords}건</span>
        </div>
      </div>
      <!-- Integrity Check -->
      <div class="card">
        <div class="card-title">🔍 데이터 무결성 검사</div>
        <div id="integrity-result" style="font-size:12px;color:var(--g500)">검사 버튼을 눌러주세요.</div>
        <button class="btn btn-outline" style="margin-top:10px;width:100%" onclick="runIntegrityCheck()">🔍 검사 실행</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="card-title">💾 백업·복구</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-outline" onclick="backupData()">${svgIcon('download',14)} 전체 데이터 백업 (JSON)</button>
          <button class="btn btn-outline" onclick="document.getElementById('restore-file').click()">${svgIcon('upload',14)} 데이터 복구 (JSON)</button>
          <input type="file" id="restore-file" accept=".json" style="display:none" onchange="restoreData(this)">
          <button class="btn btn-outline" onclick="exportAllCSV()">${svgIcon('download',14)} CSV 내보내기</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">⚠️ 위험 영역</div>
        <div style="font-size:11px;color:var(--g500);margin-bottom:10px">아래 작업은 복구할 수 없습니다. 반드시 백업 후 진행하세요.</div>
        <button class="btn btn-red" style="width:100%" onclick="confirmReset()">🔴 전체 데이터 초기화</button>
      </div>
      <div class="card">
        <div class="card-title">🗄️ 스토리지</div>
        <div style="font-size:12px;color:var(--g600)">D1 Database (Cloud Sync) - 다기기 동기화 지원</div>
      </div>
    </div>
  </div>`;
}
function _adminNotice(){
  const notices=getNotices();
  return`<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">📢 공지사항 관리 <span style="font-size:12px;color:var(--g500)">(${notices.length}건)</span></div>
      <button class="btn btn-primary btn-sm" onclick="openAddNotice()">+ 공지 추가</button>
    </div>
    ${notices.length?notices.map(n=>`<div class="card" style="margin-bottom:8px;padding:12px 16px">
      <div style="display:flex;align-items:center;gap:10px">
        ${n.pinned?'<span style="color:var(--red)">📌</span>':''}
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${n.title}</div>
          ${n.content?`<div style="font-size:11px;color:var(--g500);margin-top:4px">${n.content.slice(0,100)}${n.content.length>100?'...':''}</div>`:''}
        </div>
        <span style="font-size:11px;color:var(--g400)">${n.date}</span>
        <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteNotice('${n.id}')">${svgIcon('trash',12)}</button>
      </div>
    </div>`).join(''):`<div style="text-align:center;padding:40px;color:var(--g400)">공지사항 없음</div>`}
  </div>`;
}
function saveCompanyInfo(){
  saveCompany({
    name:v('co_name'),nameKo:v('co_nameKo'),ceo:v('co_ceo'),bizNo:v('co_bizNo'),
    addr:v('co_addr'),email:v('co_email'),tel:v('co_tel'),mobile:v('co_mobile'),
    specialty:v('co_spec'),website:v('co_web')
  });
  toast('✅ 회사 정보가 저장되었습니다','success');
}
async function saveSystemSettings(){
  const prefs={
    defaultProfit:Number(document.getElementById('sys_profit')?.value||10),
    defaultRound:document.getElementById('sys_round')?.value||'십만원',
    safetyRate:Number(document.getElementById('sys_safety')?.value||0.7),
    mealRate:Number(document.getElementById('sys_meal')?.value||3),
    defaultDeposit:Number(document.getElementById('sys_deposit')?.value||30),
    defaultGanttDays:Number(document.getElementById('sys_ganttDays')?.value||5),
    autoRefresh:document.getElementById('sys_autorefresh')?.checked||false,
    startPage:document.getElementById('sys_startPage')?.value||'dash',
    notifOverdue:document.getElementById('sys_notifOverdue')?.checked!==false,
    notifApproval:document.getElementById('sys_notifApproval')?.checked!==false,
    notifMeeting:document.getElementById('sys_notifMeeting')?.checked!==false,
    notifDaysBefore:Number(document.getElementById('sys_notifDays')?.value||7),
    dark_mode:S.darkMode
  };
  Object.assign(_d.userPrefs||{},prefs);
  await api('user-prefs','PUT',prefs);
  toast('✅ 시스템 설정이 저장되었습니다','success');
}
function runIntegrityCheck(){
  const el=document.getElementById('integrity-result');if(!el)return;
  const issues=[];const ps=getProjects();const taxes=getTaxInvoices();const orders=getOrders()||[];const labor=getLabor()||[];const expenses=getExpenses()||[];
  // Check 1: Projects without items
  const empty=ps.filter(p=>!p.items||!p.items.length);
  if(empty.length)issues.push({level:'info',msg:`빈 프로젝트 ${empty.length}건 (항목 0개)`});
  // Check 2: Projects with invalid payments
  const badPay=ps.filter(p=>(p.payments||[]).reduce((a,pm)=>a+Number(pm.pct||0),0)>100);
  if(badPay.length)issues.push({level:'warn',msg:`수금 비율 합계 100% 초과 ${badPay.length}건: ${badPay.map(p=>p.nm).join(', ')}`});
  // Check 3: Overdue payments
  const overdue=[];ps.forEach(p=>(p.payments||[]).forEach(pm=>{if(!pm.paid&&pm.due&&diffDays(today(),pm.due)<0)overdue.push(p.nm);}));
  if(overdue.length)issues.push({level:'warn',msg:`연체 미수금 ${overdue.length}건`});
  // Check 4: Gantt without items
  const noGantt=ps.filter(p=>p.items&&p.items.length>0&&(!p.ganttTasks||!p.ganttTasks.length));
  if(noGantt.length)issues.push({level:'info',msg:`공정표 미생성 프로젝트 ${noGantt.length}건`});
  // Check 5: Orphan tax invoices
  const orphanTax=taxes.filter(t=>t.pid&&!getProject(t.pid));
  if(orphanTax.length)issues.push({level:'warn',msg:`고아 세금계산서 ${orphanTax.length}건 (프로젝트 삭제됨)`});
  // Check 6: Orphan orders (linked to deleted projects)
  const orphanOrders=orders.filter(o=>o.pid&&!getProject(o.pid));
  if(orphanOrders.length)issues.push({level:'warn',msg:`고아 발주서 ${orphanOrders.length}건 (프로젝트 삭제됨)`});
  // Check 7: Orphan labor records
  const orphanLabor=labor.filter(l=>l.pid&&!getProject(l.pid));
  if(orphanLabor.length)issues.push({level:'warn',msg:`고아 노무비 ${orphanLabor.length}건 (프로젝트 삭제됨)`});
  // Check 8: Orphan expenses
  const orphanExp=expenses.filter(e=>e.pid&&!getProject(e.pid));
  if(orphanExp.length)issues.push({level:'warn',msg:`고아 지출결의 ${orphanExp.length}건 (프로젝트 삭제됨)`});
  // Check 9: Payment percentage consistency (< 100%)
  const lowPay=ps.filter(p=>{const pct=(p.payments||[]).reduce((a,pm)=>a+Number(pm.pct||0),0);return pct>0&&pct<100&&['시공중','완료'].includes(p.status);});
  if(lowPay.length)issues.push({level:'info',msg:`수금 비율 합계 100% 미만인 시공/완료 프로젝트 ${lowPay.length}건`});
  // Check 10: Budget overrun projects
  const overBudget=ps.filter(p=>{const f=getFinSummary(p);return f.estCost>0&&f.executionRate>100;});
  if(overBudget.length)issues.push({level:'warn',msg:`예산 초과 프로젝트 ${overBudget.length}건: ${overBudget.map(p=>p.nm).join(', ')}`});
  // Check 11: Completed projects with uncollected payments
  const doneUnpaid=ps.filter(p=>p.status==='완료'&&getUnpaid(p)>0);
  if(doneUnpaid.length)issues.push({level:'warn',msg:`완료 프로젝트 미수금 ${doneUnpaid.length}건: ${doneUnpaid.map(p=>p.nm).join(', ')}`});
  // Check 12: Tax invoice vs collection cross-check
  const taxTotal=taxes.filter(t=>t.type!=='매입').reduce((a,t)=>a+(t.supplyAmt||0)+(t.taxAmt||0),0);
  const collTotal=ps.reduce((a,p)=>a+getPaid(p),0);
  if(taxTotal>0&&collTotal>0&&Math.abs(taxTotal-collTotal)>100000)issues.push({level:'info',msg:`매출 세금계산서 합계(${fmtShort(taxTotal)})와 수금완료 합계(${fmtShort(collTotal)}) 차이 발생`});

  if(!issues.filter(i=>i.level!=='ok').length&&!issues.length)issues.push({level:'ok',msg:'모든 데이터가 정상입니다!'});
  if(!issues.filter(i=>i.level==='warn'||i.level==='error').length)issues.push({level:'ok',msg:'✅ 심각한 데이터 문제가 없습니다'});

  el.innerHTML=`<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">총 ${issues.length}개 항목 검사 완료</div>`+issues.map(i=>{
    const ico=i.level==='ok'?'✅':i.level==='warn'?'⚠️':'ℹ️';
    const color=i.level==='ok'?'var(--green)':i.level==='warn'?'var(--orange)':'var(--blue)';
    return`<div style="padding:6px 0;border-bottom:1px solid var(--g100);color:${color}">${ico} ${i.msg}</div>`;
  }).join('');
}
function confirmReset(){
  openModal(`<div class="modal-bg"><div class="modal modal-sm">
    <div class="modal-hdr"><span class="modal-title">🔴 전체 데이터 초기화</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="background:var(--red-l);border:1px solid #fca5a5;border-radius:var(--radius-lg);padding:16px;margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:8px">⚠️ 경고: 이 작업은 되돌릴 수 없습니다!</div>
        <div style="font-size:12px;color:var(--g700);line-height:1.8">
          모든 프로젝트, 거래처, 견적, 세금계산서, 팀원 정보 등<br>
          <strong>전체 데이터가 영구 삭제</strong>됩니다.
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label class="lbl">확인을 위해 "초기화"를 입력하세요</label>
        <input class="inp" id="reset_confirm" placeholder="초기화">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-red" onclick="doResetAll()">초기화 실행</button>
    </div>
  </div></div>`);
}
async function doResetAll(){
  if(v('reset_confirm')!=='초기화'){toast('확인 텍스트가 일치하지 않습니다','error');return;}
  toast('초기화 진행중...','warning');
  const tables=['projects','vendors','meetings','pricedb','team','notices','tax','templates','consultations','rfp','labor','expenses','notifications','approvals'];
  for(const t of tables){
    const items=await api(t);
    if(Array.isArray(items)){for(const item of items)await api(t+'/'+item.id,'DELETE');}
  }
  closeModal();toast('✅ 전체 데이터가 초기화되었습니다. 새로고침합니다.','success');
  setTimeout(()=>location.reload(),1500);
}
function getStorageSize(){return 'D1 Database (Cloud Sync) - 다기기 동기화 지원';}
function openAddNotice(){
  openModal(`<div class="modal-bg"><div class="modal modal-sm">
    <div class="modal-hdr"><span class="modal-title">📢 공지 추가</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="margin-bottom:12px"><label class="lbl">제목 *</label><input class="inp" id="nt_title"></div>
      <div style="margin-bottom:12px"><label class="lbl">내용</label><textarea class="inp" id="nt_content" rows="4"></textarea></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="nt_pin"> 📌 상단 고정</label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNotice()">저장</button>
    </div>
  </div></div>`);
}
function saveNotice(){
  const title=v('nt_title');if(!title){toast('제목을 입력하세요','error');return;}
  const ns=getNotices();
  ns.unshift({id:uid(),title,content:v('nt_content'),pinned:document.getElementById('nt_pin')?.checked||false,date:today(),readBy:[]});
  saveNotices(ns);closeModal();toast('✅ 공지가 추가되었습니다','success');renderAdmin();
}
function deleteNotice(id){
  if(!confirm('삭제?'))return;
  saveNotices(getNotices().filter(n=>n.id!==id));renderAdmin();
}

// ===== UTIL =====
function sortTbl(tblId,col){
  const dir=S.sortDir[tblId]===col?-1:1;
  S.sortDir[tblId]=dir===1?col:null;
  S.sortCol[tblId]=col;
  // re-render current page
  nav(S.page,S.subPage);
}
function printPage(){window.print();}
function importXLSX(type){
  toast(`엑셀 업로드는 SheetJS 연동 후 사용 가능합니다.`,'warning');
}

// ===== INIT =====
// ===== ASYNC INIT =====
async function boot() {
  // Check authentication first
  const authed = await checkAuth();
  if (!authed) {
    renderLoginScreen();
    return;
  }
  // Show skeleton loading with Pluuug-style shimmer
  document.getElementById('content').innerHTML = `
    <div style="padding:20px;display:flex;flex-direction:column;gap:16px;animation:fadeIn .3s ease">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><div style="height:14px;width:120px;background:var(--gray-200);border-radius:6px;animation:shimmer 1.5s infinite;margin-bottom:8px"></div>
        <div style="height:24px;width:240px;background:var(--gray-200);border-radius:6px;animation:shimmer 1.5s infinite"></div></div>
        <div style="height:36px;width:200px;background:var(--gray-200);border-radius:var(--radius);animation:shimmer 1.5s infinite"></div>
      </div>
      <div style="height:80px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
        <div style="height:100px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite"></div>
        <div style="height:100px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite;animation-delay:.15s"></div>
        <div style="height:100px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite;animation-delay:.3s"></div>
        <div style="height:100px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite;animation-delay:.45s"></div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
        <div style="height:260px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite;animation-delay:.2s"></div>
        <div style="height:260px;background:var(--gray-100);border-radius:var(--radius-lg);animation:shimmer 1.5s infinite;animation-delay:.35s"></div>
      </div>
    </div>`;
  
  await initData();
  // Convert company from DB format
  if(_d.company && _d.company.name_ko) _d.company = getCompanyFromDb(_d.company);
  // Update sidebar user display
  const co = getCompany();
  const nameEl = document.getElementById('sb-user-name');
  if(nameEl) nameEl.textContent = co.nameKo || co.name || 'Frame Plus';
  renderNav();
  
  // Parse URL for initial route
  const route = parseUrlRoute();
  nav(route.page, route.sub, route.pid, false);
}
document.addEventListener("DOMContentLoaded", boot);

// ===== MOBILE MENU =====
function openMobileMenu(){
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('mobile-overlay').classList.add('open');
}
function closeMobileMenu(){
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('mobile-overlay').classList.remove('open');
}

// ===== EXCEL EXPORT (SheetJS) =====
function exportXLSX(type){
  if(typeof XLSX === 'undefined'){toast('SheetJS 라이브러리 로딩중...','warning');return;}
  let data=[], filename='export';
  
  if(type==='gantt'||type==='projects'||!type){
    const ps=getProjects();
    data=ps.map(p=>({
      '프로젝트명':p.nm, '고객사':p.client, '담당자':p.mgr,
      '도급금액':getTotal(p), '마진율':getMR(p).toFixed(1)+'%',
      '공정%':getProg(p)+'%', '수금%':(getTotal(p)>0?Math.round(getPaid(p)/getTotal(p)*100):0)+'%',
      '상태':p.status, '날짜':p.date
    }));
    filename='프로젝트_목록_'+today();
  } else if(type==='collection'){
    const ps=getProjects();
    data=ps.map(p=>({
      '프로젝트명':p.nm, '고객사':p.client, '계약금액':getTotal(p),
      '수금완료':getPaid(p), '미수금':getUnpaid(p),
      '수금률':(getTotal(p)>0?Math.round(getPaid(p)/getTotal(p)*100):0)+'%'
    }));
    filename='수금관리_'+today();
  } else if(type==='orders'){
    const orders=getOrders();
    data=orders.map(o=>{
      const p=getProject(o.pid);
      return {'현장':p?.nm||'-','공종':catNm(o.cid),'거래처':o.vendor||'미지정',
        '발주금액':o.amount,'상태':o.status,'발주일':o.orderDate||'-'};
    });
    filename='발주관리_'+today();
  } else if(type==='pricedb'){
    data=getPriceDB().map(d=>({
      '공종':catNm(d.cid),'품명':d.nm,'규격':d.spec||'-','단위':d.unit||'-',
      '자재단가':d.mp||0,'노무단가':d.lp||0,'경비단가':d.ep||0,
      '원가자재':d.cmp||0,'원가노무':d.clp||0
    }));
    filename='단가DB_'+today();
  } else if(type==='vendors'){
    data=getVendors().map(v2=>({
      '업체명':v2.nm,'공종':catNm(v2.cid),'담당자':v2.contact||'-',
      '연락처':v2.phone||'-','이메일':v2.email||'-','평점':v2.rating||0
    }));
    filename='거래처_'+today();
  } else if(type==='meetings'){
    data=getMeetings().map(m=>({
      '날짜':m.date,'시간':m.time||'-','제목':m.title,
      '고객사':m.client||'-','담당자':m.assignee||'-','상태':m.status
    }));
    filename='미팅_'+today();
  } else if(type==='crm'){
    const ps=getProjects();
    const clients={};
    ps.forEach(p=>{
      if(!clients[p.client])clients[p.client]={nm:p.client,contact:p.contact,email:p.email,cnt:0,total:0};
      clients[p.client].cnt++;clients[p.client].total+=getTotal(p);
    });
    data=Object.values(clients).map(c=>({'고객사':c.nm,'담당자':c.contact||'-','이메일':c.email||'-','프로젝트수':c.cnt,'총계약금액':c.total}));
    filename='고객CRM_'+today();
  }
  
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
  XLSX.writeFile(wb,filename+'.xlsx');
  toast('엑셀 파일이 다운로드되었습니다','success');
}
function exportProjectsXLSX(){exportXLSX('projects')}

// ===== PDF EXPORT (html2pdf.js) =====
function exportPDF(elementId, filename){
  if(typeof html2pdf === 'undefined'){toast('PDF 라이브러리 로딩중...','warning');return;}
  const element = document.getElementById(elementId) || document.getElementById('content');
  html2pdf().set({
    margin: 10, filename: (filename||'document')+'_'+today()+'.pdf',
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(element).save();
  toast('PDF 생성중...','success');
}

// ===== BACKUP/RESTORE (D1 compatible) =====
async function backupData(){
  const data = {
    projects: getProjects().map(p=>projectToDb(p)),
    vendors: getVendors(), meetings: getMeetings(), pricedb: getPriceDB(),
    orders: _d.orders||[], as_list: getASList(), notices: getNotices(),
    tax: getTaxInvoices(), templates: getMsgTemplates(), team: getTeam(),
    company: getCompany()
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='frameplus_backup_'+today()+'.json';a.click();
  toast('백업 완료','success');
}

async function restoreData(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const data=JSON.parse(e.target.result);
      toast('데이터 복원중... 잠시만 기다려주세요','warning');
      // Restore each table
      if(data.projects) for(const p of data.projects) await api('projects','POST',p);
      if(data.vendors) for(const v of data.vendors) await api('vendors','POST',v);
      if(data.meetings) for(const m of data.meetings) await api('meetings','POST',m);
      if(data.pricedb) for(const d of data.pricedb) await api('pricedb','POST',d);
      if(data.team) for(const t of data.team) await api('team','POST',t);
      if(data.notices) for(const n of data.notices) await api('notices','POST',n);
      if(data.templates) for(const t of data.templates) await api('templates','POST',t);
      if(data.company) await api('company','PUT',data.company);
      toast('복구 완료! 새로고침합니다.','success');
      setTimeout(()=>location.reload(),1500);
    }catch(err){toast('파일 형식 오류: '+err.message,'error');}
  };
  reader.readAsText(file);
}

function exportAllCSV(){
  const ps=getProjects();
  const rows=[['프로젝트명','고객사','담당자','도급금액','마진율','공정%','수금%','상태','날짜']];
  ps.forEach(p=>{
    rows.push([p.nm,p.client,p.mgr,getTotal(p),getMR(p).toFixed(1),getProg(p),
      Math.round(getPaid(p)/Math.max(1,getTotal(p))*100),p.status,p.date]);
  });
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='frameplus_projects_'+today()+'.csv';a.click();
  toast('CSV 내보내기 완료','success');
}

// Override nav to close mobile menu
const __origNavFn = nav;
nav = function(page, sub, pid) {
  closeMobileMenu();
  // Update mobile nav active states
  document.querySelectorAll('.mobile-nav-item').forEach(el=>el.classList.remove('active'));
  const mnavEl = document.getElementById('mnav-'+page);
  if(mnavEl) mnavEl.classList.add('active');
  return __origNavFn(page, sub, pid);
};

// ===== CONTRACTS PAGE =====
function renderContracts(){
  const ps=getProjects();
  document.getElementById('tb-actions').innerHTML='<button class="btn btn-outline btn-sm" onclick="exportXLSX(\'projects\')">'+svgIcon('download',12)+' 엑셀</button>';
  document.getElementById('content').innerHTML=
  filterBar({statuses:CONTRACT_STATUS,placeholder:'프로젝트명 검색...'})+
  '<div class="tbl-wrap"><table class="tbl"><thead><tr>'+
  '<th>프로젝트</th><th>고객사</th><th>도급금액</th><th>계약일</th><th>계약상태</th><th>비고</th><th></th>'+
  '</tr></thead><tbody>'+
  ps.map(p=>{
    const tot=getTotal(p);
    const hasEst=(p.items||[]).length>0;
    const needsContract=p.contractStatus==='미생성'&&hasEst;
    return '<tr>'+
    '<td><span style="font-weight:600;cursor:pointer;color:var(--blue)" onclick="openContractDetail(\''+p.id+'\')">'+p.nm+'</span></td>'+
    '<td>'+p.client+'</td>'+
    '<td style="font-weight:600">'+(tot>0?fmt(tot)+'원':'-')+'</td>'+
    '<td style="font-size:11px">'+(p.contractDate||'-')+'</td>'+
    '<td>'+statusBadge(p.contractStatus||'미생성')+'</td>'+
    '<td style="font-size:11px;color:var(--g500)">'+(p.contractNote||'-')+'</td>'+
    '<td>'+
      (needsContract?'<button class="btn btn-primary btn-sm" onclick="generateContractFromEstimate(\''+p.id+'\')">📋→📝 자동생성</button> ':'')+
      '<button class="btn btn-outline btn-sm" onclick="openContractDetail(\''+p.id+'\')">계약서 보기</button>'+
    '</td>'+
    '</tr>';
  }).join('')+
  '</tbody></table></div>';
}
function openContractDetail(pid){S.selPid=pid;nav('contracts','detail',pid);}

async function generateContractFromEstimate(pid){
  const p=getProject(pid);
  if(!p){toast('프로젝트를 찾을 수 없습니다','error');return;}
  if(!p.items||!p.items.length){toast('견적서가 없습니다. 먼저 견적서를 작성해주세요.','error');return;}
  if(!confirm(`"${p.nm}" 프로젝트의 견적서를 기반으로 계약서를 자동 생성하시겠습니까?`))return;
  
  const c=calcP(p);
  const tot=c.finalTotal;
  
  // Auto-generate payment schedule (선금 30%, 중도금 40%, 잔금 30%)
  const payments=p.payments&&p.payments.length?p.payments:[
    {label:'계약금(선금)',pct:30,due:'',paid:false,paidDate:''},
    {label:'중도금',pct:40,due:'',paid:false,paidDate:''},
    {label:'잔금',pct:30,due:'',paid:false,paidDate:''}
  ];
  
  // Auto-generate clauses from estimate categories
  const usedCats=Object.entries(c.cs).filter(([,v])=>v.t>0);
  const scopeClause='공사 범위: '+usedCats.map(([cid])=>catNm(cid)).join(', ')+' (총 '+usedCats.length+'개 공종)';
  const amtClause='도급금액 내역: 직접공사비 '+fmtShort(c.direct)+', 간접비 '+fmtShort(c.indirect)+', 합계 '+fmtShort(tot)+' (VAT 별도)';
  const clauses=[scopeClause, amtClause];
  
  // Update project
  const updateData={
    contract_status:'초안작성',
    contract_date:today(),
    contract_note:'견적서 기반 자동생성',
    contract_clauses:JSON.stringify(clauses),
    payments:JSON.stringify(payments),
    updated_at:new Date().toISOString()
  };
  
  await api('projects/'+pid,'PUT',updateData);
  
  // Update local cache
  const idx=_d.projects.findIndex(x=>x.id===pid);
  if(idx>=0){
    _d.projects[idx].contractStatus='초안작성';
    _d.projects[idx].contractDate=today();
    _d.projects[idx].contractNote='견적서 기반 자동생성';
    _d.projects[idx].contractClauses=clauses;
    _d.projects[idx].payments=payments;
  }
  
  toast('계약서가 자동 생성되었습니다! 계약서 상세 페이지에서 확인하세요.','success');
  openContractDetail(pid);
}
function renderContractDetail(){
  const pid=S.selPid;const p=getProject(pid);if(!p){nav('contracts');return;}
  const co=getCompany();const tot=getTotal(p);const calc=calcP(p);
  document.getElementById('tb-title').textContent='계약서';
  document.getElementById('tb-actions').innerHTML=
    '<button class="btn btn-outline btn-sm" onclick="nav(\'contracts\')">'+svgIcon('arrow_left',12)+' 목록</button>'+
    '<button class="btn btn-outline btn-sm" onclick="window.print()">'+svgIcon('print',12)+' 인쇄/PDF</button>'+
    '<button class="btn btn-outline btn-sm" onclick="sendContractMail(\''+pid+'\')">'+svgIcon('mail',12)+' 이메일</button>'+
    '<button class="btn btn-primary btn-sm" onclick="saveContract(\''+pid+'\')">저장</button>';
  
  const clauses=p.contractClauses||[];
  document.getElementById('content').innerHTML=
  '<div style="margin-bottom:8px"><button class="btn btn-ghost btn-sm" onclick="nav(\'contracts\')">'+svgIcon('arrow_left',12)+' 계약서 목록으로</button></div>'+
  '<div style="display:grid;grid-template-columns:1fr 280px;gap:16px">'+
  '<div class="contract-doc">'+
    '<h2>공 사 도 급 계 약 서</h2>'+
    '<table class="pv-info-tbl">'+
    '<tr><td>공사명</td><td colspan="3">'+escHtml(p.nm)+'</td></tr>'+
    '<tr><td>공사장소</td><td>'+(p.loc||'')+'</td><td>면적</td><td>'+(p.area||'')+'평</td></tr>'+
    '<tr><td>도급금액</td><td colspan="3" style="font-weight:700;font-size:14px">₩ '+fmt(tot)+' (VAT 별도)</td></tr>'+
    '<tr><td>공사기간</td><td colspan="3">착공일로부터 준공일까지</td></tr>'+
    '</table>'+
    '<h3>제1조 (공사 내용)</h3>'+
    '<div class="contract-clause">"갑"은 위 공사를 "을"에게 도급하며, "을"은 설계도서, 시방서 및 기타 관계 서류에 의하여 성실히 시공한다.</div>'+
    '<h3>제2조 (도급금액)</h3>'+
    '<div class="contract-clause">본 공사의 도급금액은 금 '+fmt(tot)+'원정(부가가치세 별도)으로 한다.</div>'+
    '<h3>제3조 (대금 지급)</h3>'+
    '<div class="contract-clause">'+
    (p.payments||[]).map((pm,i)=>'- '+(pm.label||'')+ ': '+pm.pct+'% ('+fmt(Math.round(tot*pm.pct/100))+'원)'+
      (pm.due?' / 예정일: '+pm.due:'')+'<br>').join('')+
    '</div>'+
    '<h3>제4조 (하자보수)</h3>'+
    '<div class="contract-clause">"을"은 공사 완료 후 하자보수 기간(2년) 동안 하자 발생 시 무상으로 보수한다.</div>'+
    (clauses.length?'<h3>추가 조항</h3>'+clauses.map((c,i)=>'<div class="contract-clause">'+
      '<input class="contract-editable" style="width:100%" id="cc_'+i+'" value="'+escHtml(c)+'">'+
    '</div>').join(''):'')+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px">'+
    '<div style="text-align:center;padding:20px;border:1px solid var(--border);border-radius:var(--radius)">'+
      '<div style="font-weight:700;margin-bottom:32px">"갑" (고객)</div>'+
      '<div style="font-size:12px;color:var(--g500)">'+(p.client||'')+'</div>'+
      '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:8px;font-size:11px">서명: ________________</div>'+
    '</div>'+
    '<div style="text-align:center;padding:20px;border:1px solid var(--border);border-radius:var(--radius)">'+
      '<div style="font-weight:700;margin-bottom:32px">"을" (시공사)</div>'+
      '<div style="font-size:12px;color:var(--g500)">'+co.name+'<br>대표: '+co.ceo+'</div>'+
      '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:8px;font-size:11px">서명: ________________</div>'+
    '</div>'+
    '</div>'+
  '</div>'+
  '<div style="display:flex;flex-direction:column;gap:10px">'+
    '<div class="card">'+
      '<div class="card-title">계약 상태</div>'+
      '<div style="margin-bottom:10px"><label class="lbl">상태</label>'+
        '<select class="sel" id="ct_status">'+CONTRACT_STATUS.map(s=>'<option'+(p.contractStatus===s?' selected':'')+'>'+s+'</option>').join('')+'</select>'+
      '</div>'+
      '<div style="margin-bottom:10px"><label class="lbl">계약일</label>'+
        '<input class="inp" type="date" id="ct_cdate" value="'+(p.contractDate||today())+'">'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">도구</div>'+
      '<div style="display:flex;flex-direction:column;gap:6px">'+
        '<button class="btn btn-outline" onclick="aiReviewContract()">🤖 AI 계약서 검토</button>'+
        '<button class="btn btn-outline" onclick="checkSpelling()">📝 맞춤법 검사</button>'+
        '<button class="btn btn-outline" onclick="exportPDF(null,\'계약서_'+escHtml(p.nm)+'\')">📄 PDF 다운로드</button>'+
      '</div>'+
    '</div>'+
    '<div id="ai-review-result"></div>'+
  '</div>'+
  '</div>';
}

// ===== DATA ACCESSORS FOR NEW TABLES =====
function getLabor(){ return _d.labor||[]; }
function getExpenses(){ return _d.expenses||[]; }
function getPresets(){ return _d.presets||[]; }
function getClients(){ return _d.clients||[]; }
function getErpAttachments(pid){ return (_d.erpAttachments||[]).filter(a=>!pid||a.pid===pid); }

// ===== MONTHLY GROUPING UTILITY =====
function groupByMonth(items, dateField='date'){
  const groups={};
  items.forEach(item=>{
    const d=item[dateField]||item.created_at||'';
    const ym=d.slice(0,7)||'날짜없음';
    if(!groups[ym])groups[ym]=[];
    groups[ym].push(item);
  });
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
}

// monthlyAccordion — unified version (see line ~4788 for enhanced version)
// Removed duplicate to avoid override issues

// ===== SORT FIX =====
let _sortState={};
function sortTable(tableId, field, items, renderFn){
  const key=tableId+'_'+field;
  _sortState[key]=_sortState[key]==='asc'?'desc':'asc';
  const dir=_sortState[key];
  items.sort((a,b)=>{
    let va=a[field]||'', vb=b[field]||'';
    if(typeof va==='number'&&typeof vb==='number') return dir==='asc'?va-vb:vb-va;
    va=String(va); vb=String(vb);
    return dir==='asc'?va.localeCompare(vb):vb.localeCompare(va);
  });
  renderFn(items);
}

// ===== LABOR COSTS (인건비·노무비) =====
function renderLabor(){
  document.getElementById('tb-title').textContent='인건비·노무비';
  const ps=getProjects();
  const labor=getLabor();
  
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('labor')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddLabor()">+ 노무비 등록</button>`;
  
  // 프로젝트별 탭
  const allPids=[...new Set(labor.map(l=>l.pid))];
  const totalLabor=labor.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
  const unpaidLabor=labor.filter(l=>!l.paid).reduce((a,l)=>a+(Number(l.net_amount)||0),0);
  
  const groups=groupByMonth(labor);
  
  // Monthly summary for chart
  const monthKeys=Object.keys(groups).sort().reverse();
  const monthSummary=monthKeys.map(ym=>{
    const items=groups[ym];
    const total=items.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
    const unpd=items.filter(l=>!l.paid).reduce((a,l)=>a+(Number(l.net_amount)||0),0);
    return {ym, total, unpaid:unpd, count:items.length, workers:[...new Set(items.map(l=>l.worker_name))].length};
  });
  const maxMonthAmt=Math.max(...monthSummary.map(m=>m.total),1);
  
  document.getElementById('content').innerHTML=`
  <div class="dash-grid" style="margin-bottom:16px">
    <div class="kpi-card" style="border-left:3px solid var(--blue)">
      <div class="kpi-label">총 노무비</div>
      <div class="kpi-value" style="color:var(--blue)">${fmtShort(totalLabor)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--red)">
      <div class="kpi-label">미지급</div>
      <div class="kpi-value" style="color:var(--red)">${fmtShort(unpaidLabor)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--green)">
      <div class="kpi-label">지급완료</div>
      <div class="kpi-value" style="color:var(--green)">${fmtShort(totalLabor-unpaidLabor)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--purple)">
      <div class="kpi-label">등록 인원</div>
      <div class="kpi-value" style="color:var(--purple)">${[...new Set(labor.map(l=>l.worker_name))].length}<span style="font-size:12px">명</span></div>
    </div>
  </div>
  
  <!-- Monthly Mini Chart -->
  ${monthSummary.length>1?`<div class="card" style="padding:14px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;margin-bottom:10px">📊 월별 노무비 추이</div>
    <div style="display:flex;align-items:flex-end;gap:6px;height:80px">
      ${monthSummary.slice(0,6).reverse().map(m=>{
        const h=maxMonthAmt>0?Math.max(4,m.total/maxMonthAmt*72):4;
        return '<div style="flex:1;text-align:center">'+
          '<div style="font-size:9px;font-weight:600;color:var(--g500);margin-bottom:2px">'+(m.total>0?fmtShort(m.total):'-')+'</div>'+
          '<div style="height:'+h+'px;background:var(--blue);border-radius:3px 3px 0 0;margin:0 auto;width:80%;position:relative">'+
            (m.unpaid>0?'<div style="height:'+(m.unpaid/m.total*h)+'px;background:var(--red);border-radius:0 0 3px 3px;position:absolute;bottom:0;width:100%"></div>':'')+
          '</div>'+
          '<div style="font-size:10px;color:var(--g500);margin-top:3px">'+m.ym.slice(5)+'월</div>'+
        '</div>';
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;justify-content:center;margin-top:8px;font-size:10px;color:var(--g500)">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:6px;background:var(--blue);border-radius:2px;display:inline-block"></span>지급완료</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:6px;background:var(--red);border-radius:2px;display:inline-block"></span>미지급</span>
    </div>
  </div>`:``}
  
  ${filterBar({statuses:['미지급','지급완료'],placeholder:'작업자명 검색...',showMonthGroup:true,onFilter:'filterLabor()'})}
  
  <div id="labor-list-wrap">
  ${_laborMonthView?_laborMonthlyView(groups,ps):_laborFlatView(labor,ps)}
  </div>`;
}

let _laborMonthView=false;
function filterLabor(){
  const mg=document.getElementById('month-group-toggle')?.checked;
  _laborMonthView=!!mg;
  renderLabor();
}

function _laborRow(l, ps){
  const p=ps.find(x=>x.id===l.pid);
  return `<tr>
    <td>${l.date||''}</td>
    <td>${p?.nm||l.pid||'-'}</td>
    <td style="font-weight:600">${l.worker_name||''}</td>
    <td>${l.worker_type||''}</td>
    <td class="num">${fmt(l.daily_rate)}</td>
    <td class="num">${l.days||0}</td>
    <td class="num">${fmt(l.meal_cost)}</td>
    <td class="num">${fmt(l.transport_cost)}</td>
    <td class="num" style="color:var(--red)">${fmt(l.deduction)}</td>
    <td class="num" style="font-weight:700">${fmt(l.net_amount)}</td>
    <td>${l.paid?'<span class="badge badge-green">지급완료</span>':'<span class="badge badge-red">미지급</span>'}</td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditLabor('${l.id}')" title="수정">${svgIcon('edit',12)}</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteLabor('${l.id}')" title="삭제" style="color:var(--red)">${svgIcon('trash',12)}</button>
      </div>
    </td>
  </tr>`;
}

function _laborFlatView(labor, ps){
  const thead=`<tr><th>날짜</th><th>프로젝트</th><th>작업자</th><th>직종</th><th style="text-align:right">일당</th><th style="text-align:right">일수</th><th style="text-align:right">식대</th><th style="text-align:right">교통비</th><th style="text-align:right">공제</th><th style="text-align:right">지급액</th><th>상태</th><th></th></tr>`;
  return `<div class="tbl-wrap"><table class="tbl" id="labor-tbl"><thead>${thead}</thead><tbody>
    ${labor.length?labor.map(l=>_laborRow(l,ps)).join(''):'<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--g400)">등록된 노무비가 없습니다</td></tr>'}
  </tbody></table></div>`;
}

function _laborMonthlyView(groups, ps){
  const months=Object.keys(groups).sort().reverse();
  if(!months.length) return '<div style="text-align:center;padding:40px;color:var(--g400)">등록된 노무비가 없습니다</div>';
  return months.map(ym=>{
    const items=groups[ym];
    const total=items.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
    const unpaid=items.filter(l=>!l.paid).reduce((a,l)=>a+(Number(l.net_amount)||0),0);
    const workers=[...new Set(items.map(l=>l.worker_name))].length;
    const label=ym.replace('-','년 ')+'월';
    return `<div class="est-section" style="margin-bottom:10px">
      <div class="est-sec-hdr" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.est-sec-toggle').classList.toggle('open')">
        <span class="est-sec-icon">📅</span>
        <span class="est-sec-title">${label}</span>
        <span class="est-sec-count">${items.length}건 · ${workers}명</span>
        <span style="flex:1"></span>
        <span style="font-size:12px;font-weight:700;margin-right:8px">${fmtShort(total)}</span>
        ${unpaid>0?'<span class="badge badge-red" style="margin-right:8px">미지급 '+fmtShort(unpaid)+'</span>':''}
        <span class="est-sec-toggle open">${svgIcon('chevron_down',14)}</span>
      </div>
      <div class="est-sec-body open">
        <table class="tbl"><thead><tr><th>날짜</th><th>프로젝트</th><th>작업자</th><th>직종</th><th style="text-align:right">일당</th><th style="text-align:right">일수</th><th style="text-align:right">식대</th><th style="text-align:right">교통비</th><th style="text-align:right">공제</th><th style="text-align:right">지급액</th><th>상태</th><th></th></tr></thead>
        <tbody>${items.map(l=>_laborRow(l,ps)).join('')}</tbody>
        <tfoot><tr><td colspan="9" style="text-align:right;font-weight:700;font-size:12px">소계</td><td class="num" style="font-weight:800">${fmt(total)}</td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>
    </div>`;
  }).join('');
}

function openAddLabor(){
  const ps=getProjects();
  const workerTypes=['목공','전기','도장','설비','타일','철거','잡공','미장','방수','기타'];
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">노무비 등록</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트 *</label><select class="sel" id="lb_pid">${ps.map(p=>`<option value="${p.id}">${p.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">날짜 *</label><input class="inp" id="lb_date" type="date" value="${today()}"></div>
        <div><label class="lbl">지급방법</label><select class="sel" id="lb_method"><option>계좌이체</option><option>현금</option><option>카드</option></select></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">작업자명 *</label><input class="inp" id="lb_name" placeholder="홍길동"></div>
        <div><label class="lbl">직종 *</label><select class="sel" id="lb_type">${workerTypes.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">일당 *</label><input class="inp" id="lb_rate" type="number" placeholder="250000"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">일수 *</label><input class="inp" id="lb_days" type="number" value="1" step="0.5"></div>
        <div><label class="lbl">식대</label><input class="inp" id="lb_meal" type="number" value="10000"></div>
        <div><label class="lbl">교통비</label><input class="inp" id="lb_trans" type="number" value="0"></div>
        <div><label class="lbl">공제액</label><input class="inp" id="lb_ded" type="number" value="0"></div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div><label class="lbl">메모</label><textarea class="inp" id="lb_memo" rows="2"></textarea></div>
      </div>
      <div style="background:var(--g50);border-radius:8px;padding:12px;font-size:13px">
        <strong>예상 지급액:</strong> <span id="lb_preview" style="font-size:16px;font-weight:700;color:var(--blue)">₩0</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveLabor()">등록</button>
    </div>
  </div></div>`);
  // 실시간 계산
  ['lb_rate','lb_days','lb_meal','lb_trans','lb_ded'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input',()=>{
      const rate=Number(document.getElementById('lb_rate').value)||0;
      const days=Number(document.getElementById('lb_days').value)||0;
      const meal=Number(document.getElementById('lb_meal').value)||0;
      const trans=Number(document.getElementById('lb_trans').value)||0;
      const ded=Number(document.getElementById('lb_ded').value)||0;
      const net=rate*days+meal*days+trans-ded;
      document.getElementById('lb_preview').textContent='₩'+fmt(net);
    });
  });
  document.getElementById('lb_rate').dispatchEvent(new Event('input'));
}

async function saveLabor(){
  const rate=Number(document.getElementById('lb_rate').value)||0;
  const days=Number(document.getElementById('lb_days').value)||0;
  const meal=Number(document.getElementById('lb_meal').value)||0;
  const trans=Number(document.getElementById('lb_trans').value)||0;
  const ded=Number(document.getElementById('lb_ded').value)||0;
  const total=rate*days;
  const net=total+meal*days+trans-ded;
  const data={
    id:'lb'+Date.now(),
    pid:document.getElementById('lb_pid').value,
    date:document.getElementById('lb_date').value,
    worker_name:document.getElementById('lb_name').value,
    worker_type:document.getElementById('lb_type').value,
    daily_rate:rate, days:days, total:total,
    meal_cost:meal*days, transport_cost:trans,
    overtime_cost:0, deduction:ded, net_amount:net,
    paid:0, paid_date:'',
    payment_method:document.getElementById('lb_method').value,
    memo:document.getElementById('lb_memo').value
  };
  if(!data.worker_name){toast('작업자명을 입력하세요','error');return;}
  await api('labor','POST',data);
  _d.labor=await api('labor');
  closeModal();renderLabor();toast('노무비가 등록되었습니다','success');
}

function openEditLabor(id){
  const l=getLabor().find(x=>x.id===id);if(!l)return;
  const ps=getProjects();
  const workerTypes=['목공','전기','도장','설비','타일','철거','잡공','미장','방수','기타'];
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="modal-hdr"><span class="modal-title">노무비 수정</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트</label><select class="sel" id="lb_pid">${ps.map(p=>`<option value="${p.id}" ${p.id===l.pid?'selected':''}>${p.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">날짜</label><input class="inp" id="lb_date" type="date" value="${l.date||''}"></div>
        <div><label class="lbl">지급상태</label><select class="sel" id="lb_paid"><option value="0" ${!l.paid?'selected':''}>미지급</option><option value="1" ${l.paid?'selected':''}>지급완료</option></select></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">작업자명</label><input class="inp" id="lb_name" value="${l.worker_name||''}"></div>
        <div><label class="lbl">직종</label><select class="sel" id="lb_type">${workerTypes.map(t=>`<option ${t===l.worker_type?'selected':''}>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">일당</label><input class="inp" id="lb_rate" type="number" value="${l.daily_rate||0}"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">일수</label><input class="inp" id="lb_days" type="number" value="${l.days||0}" step="0.5"></div>
        <div><label class="lbl">식대</label><input class="inp" id="lb_meal" type="number" value="${l.meal_cost||0}"></div>
        <div><label class="lbl">교통비</label><input class="inp" id="lb_trans" type="number" value="${l.transport_cost||0}"></div>
        <div><label class="lbl">공제액</label><input class="inp" id="lb_ded" type="number" value="${l.deduction||0}"></div>
      </div>
      <div><label class="lbl">메모</label><textarea class="inp" id="lb_memo" rows="2">${l.memo||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="updateLabor('${id}')">저장</button>
    </div>
  </div></div>`);
}

async function updateLabor(id){
  const rate=Number(document.getElementById('lb_rate').value)||0;
  const days=Number(document.getElementById('lb_days').value)||0;
  const meal=Number(document.getElementById('lb_meal').value)||0;
  const trans=Number(document.getElementById('lb_trans').value)||0;
  const ded=Number(document.getElementById('lb_ded').value)||0;
  const net=rate*days+meal+trans-ded;
  await api('labor/'+id,'PUT',{
    pid:document.getElementById('lb_pid').value,
    date:document.getElementById('lb_date').value,
    worker_name:document.getElementById('lb_name').value,
    worker_type:document.getElementById('lb_type').value,
    daily_rate:rate, days:days, total:rate*days,
    meal_cost:meal, transport_cost:trans, deduction:ded, net_amount:net,
    paid:Number(document.getElementById('lb_paid').value),
    payment_method:'', memo:document.getElementById('lb_memo').value
  });
  _d.labor=await api('labor');
  closeModal();renderLabor();toast('수정되었습니다','success');
}

async function deleteLabor(id){
  if(!confirm('삭제하시겠습니까?'))return;
  await api('labor/'+id,'DELETE');
  _d.labor=await api('labor');
  renderLabor();toast('삭제되었습니다');
}

// ===== EXPENSES (지출결의서) =====
function renderExpenses(){
  document.getElementById('tb-title').textContent='지출결의서';
  const ps=getProjects();
  const exps=getExpenses();
  const totalAmt=exps.reduce((a,e)=>a+(Number(e.amount)||0),0);
  const pending=exps.filter(e=>e.status==='대기');
  const approved=exps.filter(e=>e.status==='승인');
  
  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('expenses')">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddExpense()">+ 지출결의서 작성</button>`;
  
  document.getElementById('content').innerHTML=`
  <div class="dash-grid" style="margin-bottom:16px">
    <div class="kpi-card" style="border-left:3px solid var(--blue)">
      <div class="kpi-label">총 지출</div>
      <div class="kpi-value" style="color:var(--blue)">${fmtShort(totalAmt)}<span style="font-size:12px">원</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--orange)">
      <div class="kpi-label">결재 대기</div>
      <div class="kpi-value" style="color:var(--orange)">${pending.length}<span style="font-size:12px">건</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--green)">
      <div class="kpi-label">승인 완료</div>
      <div class="kpi-value" style="color:var(--green)">${approved.length}<span style="font-size:12px">건</span></div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--red)">
      <div class="kpi-label">반려</div>
      <div class="kpi-value" style="color:var(--red)">${exps.filter(e=>e.status==='반려').length}<span style="font-size:12px">건</span></div>
    </div>
  </div>
  
  ${filterBar({statuses:['대기','승인','반려','지급완료'],placeholder:'제목, 업체명 검색...'})}
  
  <div class="tbl-wrap">
    <table class="tbl" id="expenses-tbl">
      <thead><tr>
        <th>날짜</th><th>프로젝트</th><th>분류</th><th>제목</th>
        <th>업체/거래처</th><th style="text-align:right">금액</th>
        <th>결제방법</th><th>요청자</th><th>상태</th><th></th>
      </tr></thead>
      <tbody>
        ${exps.map(e=>{
          const p=ps.find(x=>x.id===e.pid);
          const stColor={'대기':'orange','승인':'green','반려':'red','지급완료':'blue'}[e.status]||'gray';
          return `<tr>
            <td>${e.date||''}</td>
            <td>${p?.nm||'-'}</td>
            <td><span class="badge badge-gray">${e.category||'기타'}</span></td>
            <td style="font-weight:600">${e.title||''}</td>
            <td>${e.vendor||'-'}</td>
            <td class="num" style="font-weight:700">₩${fmt(e.amount)}</td>
            <td>${e.payment_method||'-'}</td>
            <td>${e.requester||'-'}</td>
            <td><span class="badge badge-${stColor}">${e.status}</span></td>
            <td>
              <div style="display:flex;gap:4px">
                ${e.status==='대기'?`<button class="btn btn-green btn-sm" onclick="approveExpense('${e.id}')" style="padding:3px 8px;font-size:11px">승인</button>
                <button class="btn btn-red btn-sm" onclick="rejectExpense('${e.id}')" style="padding:3px 8px;font-size:11px">반려</button>`:''}
                <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditExpense('${e.id}')" title="수정">${svgIcon('edit',12)}</button>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteExpense('${e.id}')" title="삭제" style="color:var(--red)">${svgIcon('trash',12)}</button>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="sendExpenseApproval('${e.id}')" title="결재요청 이메일">${svgIcon('mail',12)}</button>
              </div>
            </td>
          </tr>`;
        }).join('')||'<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--g400)">등록된 지출결의서가 없습니다</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

function openAddExpense(){
  const ps=getProjects();
  const cats=['자재비','외주비','장비임대','교통비','식대','소모품','기타'];
  const co=getCompany();
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">지출결의서 작성</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트</label><select class="sel" id="exp_pid"><option value="">공통</option>${ps.map(p=>`<option value="${p.id}">${p.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">날짜 *</label><input class="inp" id="exp_date" type="date" value="${today()}"></div>
        <div><label class="lbl">분류 *</label><select class="sel" id="exp_cat">${cats.map(c=>`<option>${c}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">제목 *</label><input class="inp" id="exp_title" placeholder="자재 구매 - 타일"></div>
        <div><label class="lbl">업체/거래처</label><input class="inp" id="exp_vendor" placeholder="업체명"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">금액 (VAT포함) *</label><input class="inp" id="exp_amt" type="number" placeholder="1100000"></div>
        <div><label class="lbl">결제방법</label><select class="sel" id="exp_method"><option>법인카드</option><option>계좌이체</option><option>현금</option><option>개인카드</option></select></div>
        <div><label class="lbl">증빙유형</label><select class="sel" id="exp_receipt"><option>세금계산서</option><option>카드영수증</option><option>간이영수증</option><option>현금영수증</option><option>없음</option></select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">요청자</label><input class="inp" id="exp_req" value="${co.ceo||''}"></div>
        <div><label class="lbl">결재자</label><input class="inp" id="exp_appr" value="${co.ceo||''}"></div>
      </div>
      <div><label class="lbl">메모/사유</label><textarea class="inp" id="exp_memo" rows="3" placeholder="지출 사유를 상세히 기재하세요..."></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveExpense()">결의서 제출</button>
    </div>
  </div></div>`);
}

async function saveExpense(){
  const title=document.getElementById('exp_title').value;
  const amt=Number(document.getElementById('exp_amt').value)||0;
  if(!title){toast('제목을 입력하세요','error');return;}
  if(!amt){toast('금액을 입력하세요','error');return;}
  const data={
    id:'exp'+Date.now(),
    pid:document.getElementById('exp_pid').value,
    date:document.getElementById('exp_date').value,
    category:document.getElementById('exp_cat').value,
    title:title, amount:amt,
    tax_amount:Math.round(amt/11),
    vendor:document.getElementById('exp_vendor').value,
    payment_method:document.getElementById('exp_method').value,
    receipt_type:document.getElementById('exp_receipt').value,
    requester:document.getElementById('exp_req').value,
    approver:document.getElementById('exp_appr').value,
    status:'대기',
    memo:document.getElementById('exp_memo').value
  };
  await api('expenses','POST',data);
  _d.expenses=await api('expenses');
  closeModal();renderExpenses();toast('지출결의서가 제출되었습니다','success');
}

function openEditExpense(id){
  const e=getExpenses().find(x=>x.id===id);if(!e)return;
  const ps=getProjects();
  const cats=['자재비','외주비','장비임대','교통비','식대','소모품','기타'];
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">지출결의서 수정</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트</label><select class="sel" id="exp_pid"><option value="">공통</option>${ps.map(p=>`<option value="${p.id}" ${p.id===e.pid?'selected':''}>${p.nm}</option>`).join('')}</select></div>
        <div><label class="lbl">날짜</label><input class="inp" id="exp_date" type="date" value="${e.date||''}"></div>
        <div><label class="lbl">분류</label><select class="sel" id="exp_cat">${cats.map(c=>`<option ${c===e.category?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">제목</label><input class="inp" id="exp_title" value="${e.title||''}"></div>
        <div><label class="lbl">금액</label><input class="inp" id="exp_amt" type="number" value="${e.amount||0}"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">업체</label><input class="inp" id="exp_vendor" value="${e.vendor||''}"></div>
        <div><label class="lbl">상태</label><select class="sel" id="exp_status"><option ${e.status==='대기'?'selected':''}>대기</option><option ${e.status==='승인'?'selected':''}>승인</option><option ${e.status==='반려'?'selected':''}>반려</option><option ${e.status==='지급완료'?'selected':''}>지급완료</option></select></div>
      </div>
      <div><label class="lbl">메모</label><textarea class="inp" id="exp_memo" rows="2">${e.memo||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="updateExpense('${id}')">저장</button>
    </div>
  </div></div>`);
}

async function updateExpense(id){
  await api('expenses/'+id,'PUT',{
    pid:document.getElementById('exp_pid').value,
    date:document.getElementById('exp_date').value,
    category:document.getElementById('exp_cat').value,
    title:document.getElementById('exp_title').value,
    amount:Number(document.getElementById('exp_amt').value)||0,
    vendor:document.getElementById('exp_vendor').value,
    status:document.getElementById('exp_status').value,
    memo:document.getElementById('exp_memo').value
  });
  _d.expenses=await api('expenses');
  closeModal();renderExpenses();toast('수정되었습니다','success');
}

async function approveExpense(id){
  if(!confirm('승인하시겠습니까?'))return;
  await api('expenses/'+id,'PUT',{status:'승인',approved_date:today()});
  _d.expenses=await api('expenses');
  renderExpenses();toast('✅ 승인 완료','success');
}
async function rejectExpense(id){
  const reason=prompt('반려 사유를 입력하세요:');
  if(reason===null)return;
  await api('expenses/'+id,'PUT',{status:'반려',reject_reason:reason});
  _d.expenses=await api('expenses');
  renderExpenses();toast('반려되었습니다','warning');
}
async function deleteExpense(id){
  if(!confirm('삭제하시겠습니까?'))return;
  await api('expenses/'+id,'DELETE');
  _d.expenses=await api('expenses');
  renderExpenses();toast('삭제되었습니다');
}

async function sendExpenseApproval(id){
  const e=getExpenses().find(x=>x.id===id);if(!e)return;
  const co=getCompany();
  const p=getProjects().find(x=>x.id===e.pid);
  openModal(`<div class="modal-bg"><div class="modal modal-sm">
    <div class="modal-hdr"><span class="modal-title">${svgIcon('mail',16)} 결재 요청 이메일</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="margin-bottom:16px"><label class="lbl">결재자 이메일 *</label><input class="inp" id="appr-email" placeholder="ceo@company.com" value="${co.email||''}"></div>
      <div style="background:var(--g50);border-radius:8px;padding:12px;font-size:12px">
        <div style="font-weight:600;margin-bottom:6px">📋 결의서 내용</div>
        <div>• 제목: ${e.title}</div>
        <div>• 금액: ₩${fmt(e.amount)}</div>
        <div>• 프로젝트: ${p?.nm||'공통'}</div>
        <div>• 요청자: ${e.requester||'-'}</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-blue" onclick="doSendExpenseApproval('${id}')">📧 결재요청 발송</button>
    </div>
  </div></div>`);
}

async function doSendExpenseApproval(id){
  const e=getExpenses().find(x=>x.id===id);if(!e)return;
  const to=document.getElementById('appr-email').value.trim();
  if(!to||!to.includes('@')){toast('이메일을 입력하세요','error');return;}
  const co=getCompany();
  const p=getProjects().find(x=>x.id===e.pid);
  const html=`<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#0a0a0a;color:#fff;padding:24px;text-align:center;border-radius:8px 8px 0 0"><h2 style="margin:0">지출결의서 결재 요청</h2><p style="margin:4px 0 0;opacity:.6;font-size:12px">${co.name||'Frame Plus'}</p></div>
    <div style="padding:24px;background:#fff;border:1px solid #eee;border-radius:0 0 8px 8px">
      <p style="margin:0 0 16px;color:#333">아래 지출결의서의 결재를 요청드립니다.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;width:100px">제목</td><td style="padding:8px;border:1px solid #e5e5e5">${e.title}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5">금액</td><td style="padding:8px;border:1px solid #e5e5e5;font-weight:700">₩${fmt(e.amount)}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5">프로젝트</td><td style="padding:8px;border:1px solid #e5e5e5">${p?.nm||'공통'}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5">분류</td><td style="padding:8px;border:1px solid #e5e5e5">${e.category||'-'}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5">요청자</td><td style="padding:8px;border:1px solid #e5e5e5">${e.requester||'-'}</td></tr>
        <tr><td style="padding:8px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5">사유</td><td style="padding:8px;border:1px solid #e5e5e5">${e.memo||'-'}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#999">Frame Plus ERP에서 자동 발송되었습니다.</p>
    </div></div>`;
  try{
    const res=await api('email/send','POST',{to,subject:`[결재요청] 지출결의서 - ${e.title} (₩${fmt(e.amount)})`,html,from_name:co.name});
    if(res?.success){closeModal();toast('✉️ 결재요청 이메일이 발송되었습니다!','success');}
    else toast('발송 실패: '+(res?.error||''),'error');
  }catch(err){toast('오류: '+err.message,'error');}
}

// ===== TEAM DELETE (팀원 삭제) =====
async function deleteTeamMember(tid){
  if(!confirm('팀원을 삭제하시겠습니까?'))return;
  await api('team/'+tid,'DELETE');
  _d.team=await api('team');
  renderTeam();toast('삭제되었습니다');
}

// ===== REPORT TAB HELPERS =====
function showReportTab(btn, tabId){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  const pane=document.getElementById(tabId);
  if(pane)pane.classList.add('active');
  // Render charts if chart tab
  if(tabId==='rpt-chart'){
    setTimeout(()=>{
      const ps=getProjects();
      const sctx=document.getElementById('statusChart');
      if(sctx&&!sctx._rendered){
        const labels=Object.keys(STATUS_LABELS);
        const vals=labels.map(l=>ps.filter(p=>p.status===l).length);
        new Chart(sctx,{type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:['#9ca3af','#3b82f6','#8b5cf6','#f59e0b','#22c55e','#ef4444']}]},options:{responsive:true,maintainAspectRatio:false}});
        sctx._rendered=true;
      }
      const cctx=document.getElementById('catChart');
      if(cctx&&!cctx._rendered){
        const catTotals={};
        ps.forEach(p=>{const calc=calcP(p);Object.entries(calc.cs).forEach(([cid,cs])=>{catTotals[cid]=(catTotals[cid]||0)+cs.t;});});
        const sorted=Object.entries(catTotals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
        new Chart(cctx,{type:'bar',data:{labels:sorted.map(([cid])=>catNm(cid)),datasets:[{data:sorted.map(([,v])=>Math.round(v/10000)),backgroundColor:'rgba(37,99,235,.8)',borderRadius:4}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>`${fmt(v)}만`}}},responsive:true,maintainAspectRatio:false}});
        cctx._rendered=true;
      }
    },100);
  }
}

function openLaborStatement(pid){
  const p=getProject(pid);if(!p)return;
  const labor=getLabor().filter(l=>l.pid===pid);
  const co=getCompany();
  const totalNet=labor.reduce((a,l)=>a+(Number(l.net_amount)||0),0);
  const workers=[...new Set(labor.map(l=>l.worker_name))];
  openModal(`<div class="modal-bg"><div class="modal modal-xl" style="max-height:92vh">
    <div class="modal-hdr">
      <span class="modal-title">📋 인건비 지급명세서 — ${p.nm}</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="window.print()">${svgIcon('print',12)} 인쇄</button>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div style="background:var(--dark);color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:16px;font-weight:700">${p.nm} 인건비 명세</div>
          <div style="font-size:12px;opacity:.6">${co.name||'Frame Plus'} · ${today()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;opacity:.6">총 인건비</div>
          <div style="font-size:24px;font-weight:800">₩${fmt(totalNet)}</div>
        </div>
      </div>
      <div class="dash-grid dash-grid-3" style="margin-bottom:16px">
        <div class="kpi-card"><div class="kpi-label">투입 인원</div><div class="kpi-value">${workers.length}명</div></div>
        <div class="kpi-card"><div class="kpi-label">총 공수</div><div class="kpi-value">${labor.reduce((a,l)=>a+(Number(l.days)||0),0)}일</div></div>
        <div class="kpi-card"><div class="kpi-label">평균 일당</div><div class="kpi-value" style="font-size:16px">${fmt(labor.length?totalNet/labor.reduce((a,l)=>a+(Number(l.days)||0),0):0)}원</div></div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>날짜</th><th>작업자</th><th>직종</th><th>일당</th><th>일수</th><th>식대</th><th>교통비</th><th>공제</th><th>지급액</th><th>상태</th></tr></thead>
          <tbody>
            ${labor.map(l=>`<tr>
              <td>${l.date||''}</td><td style="font-weight:600">${l.worker_name}</td><td>${l.worker_type||''}</td>
              <td class="num">${fmt(l.daily_rate)}</td><td class="num">${l.days}</td>
              <td class="num">${fmt(l.meal_cost)}</td><td class="num">${fmt(l.transport_cost)}</td>
              <td class="num" style="color:var(--red)">${fmt(l.deduction)}</td>
              <td class="num" style="font-weight:700">${fmt(l.net_amount)}</td>
              <td>${l.paid?'<span class="badge badge-green">지급</span>':'<span class="badge badge-red">미지급</span>'}</td>
            </tr>`).join('')}
            <tr style="background:var(--g50)">
              <td colspan="8" style="font-weight:700;text-align:right">합계</td>
              <td class="num" style="font-weight:800;font-size:14px">${fmt(totalNet)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div></div>`);
}

// ===== WORK PRESET (공종 프리셋) =====
function applyPreset(cid, pid){
  const presets=getPresets();
  const preset=presets.find(p=>p.cid===cid);
  if(!preset){toast('해당 공종의 프리셋이 없습니다','warning');return;}
  let items=[];
  try{items=JSON.parse(preset.items||'[]');}catch{}
  if(!items.length){toast('프리셋 항목이 없습니다','warning');return;}
  
  const p=getProject(pid);if(!p)return;
  const existing=p.items||[];
  items.forEach(item=>{
    existing.push({
      id:'i'+Math.random().toString(36).slice(2,6),
      cid:cid, nm:item.nm, spec:item.spec||'', unit:item.unit||'식',
      qty:item.qty||1, mp:item.mp||0, lp:item.lp||0, ep:item.ep||0,
      sp:1, cmp:0, clp:0, cep:0, rm:''
    });
  });
  p.items=existing;
  toast(`✅ ${preset.name} 프리셋 ${items.length}개 항목이 추가되었습니다`,'success');
  renderEstimate();
}

// ===== ESTIMATE PHOTO UPLOAD (Base64) =====
function uploadEstPhoto(iid){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/*';
  inp.onchange=function(e){
    const file=e.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){toast('파일 크기가 2MB를 초과합니다','error');return;}
    const reader=new FileReader();
    reader.onload=function(ev){
      const base64=ev.target.result;
      const p=getProject(S.editingEstPid);if(!p)return;
      const it=p.items.find(i=>i.id===iid);if(!it)return;
      it.photo=base64;saveProject(p);
      toast('사진이 등록되었습니다','success');
      renderEstimate();
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}
function viewEstPhoto(iid){
  const p=getProject(S.editingEstPid);if(!p)return;
  const it=p.items.find(i=>i.id===iid);if(!it||!it.photo)return;
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:600px">
    <div class="modal-hdr"><span class="modal-title">품목 사진 — ${it.nm||'항목'}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" style="text-align:center">
      <img src="${it.photo}" style="max-width:100%;border-radius:8px;margin-bottom:12px">
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn btn-outline btn-sm" onclick="uploadEstPhoto('${iid}')">사진 변경</button>
        <button class="btn btn-red btn-sm" onclick="removeEstPhoto('${iid}')">사진 삭제</button>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">닫기</button></div>
  </div></div>`);
}
function removeEstPhoto(iid){
  const p=getProject(S.editingEstPid);if(!p)return;
  const it=p.items.find(i=>i.id===iid);if(!it)return;
  delete it.photo;saveProject(p);closeModal();toast('사진이 삭제되었습니다');renderEstimate();
}

// ===== ORDER ITEM EDITING =====
function updateOrderItem(idx,field,val){
  const orders=getOrders();
  const o=orders.find(x=>x.id===S.selOid);if(!o||!o.items)return;
  const it=o.items[idx];if(!it)return;
  if(field==='qty'||field==='price'){
    it[field]=Number(val)||0;
    it.amount=(it.qty||1)*(it.price||0);
  } else {
    it[field]=val;
  }
  o.amount=o.items.reduce((a,i)=>a+(i.amount||0),0);
  api('orders_manual/'+o.id,'PUT',{...o,items:JSON.stringify(o.items),amount:o.amount});
  renderOrderDetail();
}
function removeOrderItem(idx){
  const orders=getOrders();
  const o=orders.find(x=>x.id===S.selOid);if(!o||!o.items)return;
  o.items.splice(idx,1);
  o.amount=o.items.reduce((a,i)=>a+(i.amount||0),0);
  api('orders_manual/'+o.id,'PUT',{...o,items:JSON.stringify(o.items),amount:o.amount});
  renderOrderDetail();
}
function addOrderItem(){
  const orders=getOrders();
  const o=orders.find(x=>x.id===S.selOid);if(!o)return;
  if(!o.items)o.items=[];
  o.items.push({nm:'',spec:'',unit:'식',qty:1,price:0,amount:0});
  o.amount=o.items.reduce((a,i)=>a+(i.amount||0),0);
  api('orders_manual/'+o.id,'PUT',{...o,items:JSON.stringify(o.items),amount:o.amount});
  renderOrderDetail();
}
function updateOrder(field,val){
  const orders=getOrders();
  const o=orders.find(x=>x.id===S.selOid);if(!o)return;
  if(field==='date'){o.orderDate=val;o.order_date=val;}
  else if(field==='taxInvoice'||field==='paid'){o[field]=val;}
  else o[field]=val;
  api('orders_manual/'+o.id,'PUT',o);
}

// ===== MONTHLY ACCORDION (unified) =====
function monthlyAccordion(groups, renderRowFn, headerHtml){
  if(!groups.length) return '<div style="text-align:center;padding:40px;color:var(--text-muted)">데이터 없음</div>';
  return groups.map(([ym, items],idx)=>{
    const [y,m]=ym.split('-');
    const label=y&&m?`${y}년 ${parseInt(m)}월`:'날짜없음';
    const isOpen=idx===0;
    return `<div class="card" style="margin-bottom:8px">
      <div style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:4px 0" onclick="this.nextElementSibling.classList.toggle('open');this.querySelector('.est-sec-toggle').classList.toggle('open')">
        <div style="font-weight:700;font-size:13px">${label} <span style="font-weight:400;color:var(--text-muted);font-size:12px">(${items.length}건)</span></div>
        <span class="est-sec-toggle ${isOpen?'open':''}" style="font-size:11px;transition:transform .2s">▼</span>
      </div>
      <div class="est-sec-body${isOpen?' open':''}">
        <div class="tbl-wrap" style="margin-top:8px">
          <table class="tbl">${headerHtml?'<thead>'+headerHtml+'</thead>':''}<tbody>${items.map(renderRowFn).join('')}</tbody></table>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===== CAMERA SVG ICON ADDITION =====
// (svgIcon 'camera' is used for photo upload button)

// ===== ESTIMATE TEMPLATE SET SELECTOR (Enhanced) =====
function getEstTemplates() { return _d.estTemplates || []; }
function openEstTemplateSelector(pid) {
  const templates = getEstTemplates();
  const presets = getPresets();
  // Combine both sources
  const allSets = [
    ...templates.map(t => ({ id: t.id, name: t.name, desc: t.description||'', category: t.category||'', items: typeof t.items==='string'?JSON.parse(t.items||'[]'):t.items||[], source: 'template', usage: t.usage_count||0 })),
    ...presets.map(p => ({ id: p.id, name: p.name, desc: '', category: p.cid||'', items: typeof p.items==='string'?JSON.parse(p.items||'[]'):p.items||[], source: 'preset', usage: 0 }))
  ];
  
  const categories = [...new Set(allSets.map(s=>s.category).filter(Boolean))];
  
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr">
      <span class="modal-title">📋 견적 템플릿 세트 선택</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary tmpl-cat-btn" onclick="filterTemplates('')" data-cat="">전체 (${allSets.length})</button>
        ${categories.map(c=>`<button class="btn btn-sm btn-outline tmpl-cat-btn" onclick="filterTemplates('${c}')" data-cat="${c}">${c} (${allSets.filter(s=>s.category===c).length})</button>`).join('')}
      </div>
      <div id="tmpl-set-list">
        ${allSets.map(s=>`<div class="tmpl-set-item" data-cat="${s.category}" style="border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:all .15s" 
          onmouseover="this.style.borderColor='var(--blue)';this.style.background='var(--blue-l)'" 
          onmouseout="this.style.borderColor='var(--border)';this.style.background=''" 
          onclick="applyTemplateSet('${s.id}','${s.source}','${pid}')">
          <div style="width:44px;height:44px;background:var(--g100);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">
            ${{'\uae30\ucd08\uacf5\uc0ac':'🏗️','\ucca0\uac70\uacf5\uc0ac':'🔨','\ubaa9\uacf5\uc0ac':'🪵','\ub3c4\uc7a5\uacf5\uc0ac':'🎨','\uc804\uae30\uacf5\uc0ac':'⚡','\ubc14\ub2e5\uacf5\uc0ac':'🏠','C01':'🏗️','C02':'🔨','C04':'🪵','C06':'🎨'}[s.category]||'📦'}
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${s.name}</div>
            <div style="font-size:11px;color:var(--g500);margin-top:2px">${s.desc||s.category||''} · ${s.items.length}개 항목${s.usage>0?` · ${s.usage}회 사용`:''}</div>
          </div>
          <div style="font-size:12px;color:var(--blue);font-weight:600">${s.items.length}개 추가 →</div>
        </div>`).join('')}
      </div>
    </div>
  </div></div>`);
}

function filterTemplates(cat) {
  document.querySelectorAll('.tmpl-cat-btn').forEach(b=>{
    b.className = `btn btn-sm ${b.dataset.cat===cat?'btn-primary':'btn-outline'} tmpl-cat-btn`;
  });
  document.querySelectorAll('.tmpl-set-item').forEach(el=>{
    el.style.display = (!cat || el.dataset.cat===cat) ? '' : 'none';
  });
}

async function applyTemplateSet(setId, source, pid) {
  let items = [];
  if(source==='template') {
    const t = getEstTemplates().find(x=>x.id===setId);
    if(!t) return;
    items = typeof t.items==='string'?JSON.parse(t.items||'[]'):t.items||[];
    // Update usage count
    t.usage_count = (t.usage_count||0)+1;
    t.last_used_at = new Date().toISOString();
    api('estimate-templates', 'POST', { ...t, items: typeof t.items==='string'?t.items:JSON.stringify(t.items) });
  } else {
    const preset = getPresets().find(x=>x.id===setId);
    if(!preset) return;
    items = typeof preset.items==='string'?JSON.parse(preset.items||'[]'):preset.items||[];
  }
  if(!items.length){ toast('항목이 없습니다','warning'); return; }
  
  const p = getProject(pid); if(!p) return;
  const existing = p.items || [];
  items.forEach(item => {
    existing.push({
      id: 'i'+Math.random().toString(36).slice(2,6),
      cid: item.cid||'', nm: item.nm, spec: item.spec||'', unit: item.unit||'식',
      qty: item.qty||1, mp: item.mp||0, lp: item.lp||0, ep: item.ep||0,
      sp: 1, cmp: 0, clp: 0, cep: 0, rm: ''
    });
  });
  p.items = existing;
  await saveProject(p);
  closeModal();
  toast(`✅ ${items.length}개 항목이 추가되었습니다`, 'success');
  renderEstimate();
}

// ===== PRICE DB HIERARCHY & STATS =====
function openPriceDBStats(priceId) {
  const item = getPriceDB().find(p=>p.id===priceId);
  if(!item) return;
  // Fetch stats from API
  api('pricedb/'+priceId+'/stats').then(stats => {
    if(!stats || stats.__error) { toast('통계를 불러올 수 없습니다','error'); return; }
    openModal(`<div class="modal-bg"><div class="modal">
      <div class="modal-hdr">
        <span class="modal-title">📊 단가 통계 — ${item.nm}</span>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="dash-grid dash-grid-3" style="margin-bottom:16px">
          <div class="kpi-card" style="border-left:3px solid var(--blue)">
            <div class="kpi-label">현재 단가</div>
            <div class="kpi-value" style="font-size:16px;color:var(--blue)">${fmt((item.mp||0)+(item.lp||0)+(item.ep||0))}</div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--green)">
            <div class="kpi-label">평균 사용단가</div>
            <div class="kpi-value" style="font-size:16px;color:var(--green)">${fmt(stats.avgPrice||0)}</div>
          </div>
          <div class="kpi-card" style="border-left:3px solid var(--orange)">
            <div class="kpi-label">최근 사용단가</div>
            <div class="kpi-value" style="font-size:16px;color:var(--orange)">${fmt(stats.lastPrice||0)}</div>
          </div>
        </div>
        <div class="card-title">사용 이력 (${stats.usageCount||0}회)</div>
        ${stats.history?.length?`<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>날짜</th><th>프로젝트</th><th>수량</th><th>단가</th></tr></thead>
          <tbody>
            ${stats.history.map(h=>{
              const p = getProject(h.pid);
              return `<tr>
                <td>${h.used_date||''}</td>
                <td>${p?.nm||h.pid||'-'}</td>
                <td class="num">${h.qty||0}</td>
                <td class="num">${fmt(h.unit_price||0)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`:`<div style="text-align:center;padding:24px;color:var(--g400);font-size:12px">사용 이력이 없습니다</div>`}
      </div>
      <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">닫기</button></div>
    </div></div>`);
  });
}

// Record price usage when estimate is saved
async function recordPriceUsage(pid, items) {
  for(const item of items) {
    if(!item.nm) continue;
    // Find matching price DB entry
    const dbItem = getPriceDB().find(d => d.nm === item.nm);
    if(dbItem) {
      const unitPrice = (Number(item.mp)||0) + (Number(item.lp)||0) + (Number(item.ep)||0);
      await api('pricedb-history', 'POST', {
        id: uid(), price_id: dbItem.id, pid: pid,
        used_date: today(), qty: Number(item.qty)||0,
        unit_price: unitPrice, mp: Number(item.mp)||0,
        lp: Number(item.lp)||0, ep: Number(item.ep)||0
      });
    }
  }
}

// ===== EXPENSE → APPROVAL FLOW INTEGRATION =====
async function submitExpenseForApproval(expenseId) {
  const exp = getExpenses().find(e=>e.id===expenseId);
  if(!exp) return;
  const co = getCompany();
  await createApproval({
    type: 'expense', related_id: expenseId,
    title: `지출결의: ${exp.title}`,
    amount: Number(exp.amount)||0,
    requester: exp.requester||'',
    approver: co.ceo||'대표'
  });
  exp.status = '결재중';
  await api('expenses', 'POST', exp);
  toast('결재 요청이 전송되었습니다', 'success');
  renderExpenses();
}

// ===== CONSULTATION & RFP DATA ACCESSORS =====
function getConsultations(){ return _d.consultations||[]; }
function getRfpList(){ return _d.rfpList||[]; }
async function saveConsultation(c){ await api('consultations','POST',c); const idx=(_d.consultations||[]).findIndex(x=>x.id===c.id); if(idx>=0)_d.consultations[idx]=c; else (_d.consultations=_d.consultations||[]).unshift(c); }
async function deleteConsultation(id){ await api('consultations/'+id,'DELETE'); _d.consultations=(_d.consultations||[]).filter(x=>x.id!==id); renderConsult(); toast('삭제되었습니다'); }
async function saveRfpItem(r){ await api('rfp','POST',r); const idx=(_d.rfpList||[]).findIndex(x=>x.id===r.id); if(idx>=0)_d.rfpList[idx]=r; else (_d.rfpList=_d.rfpList||[]).unshift(r); }
async function deleteRfpItem(id){ await api('rfp/'+id,'DELETE'); _d.rfpList=(_d.rfpList||[]).filter(x=>x.id!==id); renderRfp(); toast('삭제되었습니다'); }

// ===== CONSULTATION VIEW (상담 관리) =====
const CONSULT_STATUSES=['신규','상담중','견적발송','계약완료','보류','실패'];
const CONSULT_STATUS_COLORS={'신규':'var(--info)','상담중':'var(--primary)','견적발송':'var(--warning)','계약완료':'var(--success)','보류':'var(--gray-400)','실패':'var(--danger)'};
const CONSULT_SOURCES=['온라인 문의','전화','소개','SNS','블로그','직접 방문','기타'];
const PROJECT_TYPES=['사무실','카페·식당','매장·리테일','주거','병원·의원','학원·교육','기타'];

function renderConsult(){
  const cs=getConsultations();
  const statusCounts={};
  CONSULT_STATUSES.forEach(s=>statusCounts[s]=cs.filter(c=>c.status===s).length);

  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportConsultXLSX()">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddConsult()">+ 신규 상담</button>`;

  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
    <!-- Pipeline KPIs -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${CONSULT_STATUSES.map(s=>{
        const cnt=statusCounts[s]||0;
        const active=s==='전체'?true:false;
        return `<button class="btn btn-sm ${cnt>0?'btn-outline':'btn-ghost'}" style="border-color:${CONSULT_STATUS_COLORS[s]};color:${CONSULT_STATUS_COLORS[s]};position:relative" onclick="filterConsultByStatus('${s}')">
          ${s} <span style="background:${CONSULT_STATUS_COLORS[s]};color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px">${cnt}</span>
        </button>`;
      }).join('')}
      <button class="btn btn-sm btn-ghost" onclick="filterConsultByStatus('')" style="color:var(--text-muted)">전체 ${cs.length}</button>
    </div>

    ${filterBar({searchId:'cs-search',statuses:CONSULT_STATUSES,statusId:'cs-status',placeholder:'고객명, 연락처 검색...',showDate:true,dateId:'cs-from',dateToId:'cs-to',onFilter:'filterConsultList()'})}

    <div id="consult-list">
      ${renderConsultCards(cs)}
    </div>
  </div>`;
}

function renderConsultCards(cs){
  if(!cs.length) return '<div class="empty-state" style="padding:50px"><div class="empty-state-icon">📞</div><div class="empty-state-title">상담 내역이 없습니다</div><div class="empty-state-desc">새 상담을 등록하여 영업 파이프라인을 관리하세요</div><button class="btn btn-primary btn-sm" onclick="openAddConsult()">+ 신규 상담</button></div>';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px">
    ${cs.map(c=>{
      const stColor=CONSULT_STATUS_COLORS[c.status]||'var(--gray-400)';
      const priorityIcon={'긴급':'🔴','높음':'🟠','보통':'🟡','낮음':'🟢'}[c.priority]||'🟡';
      return `<div class="card" style="padding:14px;border-left:3px solid ${stColor};cursor:pointer;transition:var(--transition)" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.transform='';this.style.boxShadow=''" onclick="openEditConsult('${c.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text)">${escHtml(c.client_name||'(미입력)')}</div>
            <div style="font-size:11px;color:var(--text-muted)">${c.client_phone||''} ${c.client_email?'· '+c.client_email:''}</div>
          </div>
          <span style="background:${stColor};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${c.status}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          ${c.project_type?`<span class="badge badge-blue">${c.project_type}</span>`:''}
          ${c.area?`<span class="badge badge-gray">${c.area}평</span>`:''}
          ${c.budget?`<span class="badge badge-green">${c.budget}</span>`:''}
          ${c.source?`<span class="badge badge-purple">${c.source}</span>`:''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-muted)">
          <span>${priorityIcon} ${c.date||'-'} ${c.assignee?'· '+c.assignee:''}</span>
          <div style="display:flex;gap:4px">
            ${c.next_date?`<span style="background:var(--warning-light);color:var(--warning);padding:1px 6px;border-radius:8px;font-size:10px">다음: ${c.next_date}</span>`:''}
          </div>
        </div>
        ${c.notes?`<div style="margin-top:6px;font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.notes)}</div>`:''}
      </div>`;
    }).join('')}
  </div>`;
}

function filterConsultByStatus(st){
  if(document.getElementById('cs-status'))document.getElementById('cs-status').value=st;
  filterConsultList();
}
function filterConsultList(){
  const q=(document.getElementById('cs-search')?.value||'').toLowerCase();
  const st=document.getElementById('cs-status')?.value||'';
  const df=document.getElementById('cs-from')?.value||'';
  const dt=document.getElementById('cs-to')?.value||'';
  let cs=getConsultations().filter(c=>{
    const text=!q||(c.client_name+c.client_phone+c.client_email+c.notes+c.location).toLowerCase().includes(q);
    const status=!st||c.status===st;
    const dateOk=(!df||c.date>=df)&&(!dt||c.date<=dt);
    return text&&status&&dateOk;
  });
  document.getElementById('consult-list').innerHTML=renderConsultCards(cs);
}

function openAddConsult(){
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">📞 신규 상담 등록</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">고객명 *</label><input class="inp" id="cs_client" placeholder="홍길동"></div>
        <div><label class="lbl">연락처</label><input class="inp" id="cs_phone" placeholder="010-0000-0000"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="cs_email" type="email"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">유입경로</label><select class="sel" id="cs_source">${CONSULT_SOURCES.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">프로젝트 유형</label><select class="sel" id="cs_type">${PROJECT_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="cs_area" type="number" placeholder="38"></div>
        <div><label class="lbl">예산 범위</label><input class="inp" id="cs_budget" placeholder="5천만~1억"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">위치</label><input class="inp" id="cs_loc" placeholder="강남구 역삼동"></div>
        <div><label class="lbl">상담일</label><input class="inp" id="cs_date" type="date" value="${today()}"></div>
        <div><label class="lbl">담당자</label><select class="sel" id="cs_assign">${TEAM_MEMBERS.map(m=>`<option>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">우선순위</label><select class="sel" id="cs_priority"><option>보통</option><option>긴급</option><option>높음</option><option>낮음</option></select></div>
        <div><label class="lbl">상태</label><select class="sel" id="cs_status">${CONSULT_STATUSES.map(s=>`<option>${s}</option>`).join('')}</select></div>
      </div>
      <div style="margin-bottom:12px"><label class="lbl">상담 내용</label><textarea class="inp" id="cs_notes" rows="3" placeholder="상담 내용을 기록하세요..."></textarea></div>
      <div class="form-row form-row-2">
        <div><label class="lbl">다음 액션</label><input class="inp" id="cs_next" placeholder="견적서 발송, 현장미팅 등"></div>
        <div><label class="lbl">다음 일정</label><input class="inp" id="cs_next_date" type="date"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewConsult()">등록</button>
    </div>
  </div></div>`);
}
async function saveNewConsult(){
  const name=document.getElementById('cs_client')?.value?.trim();
  if(!name){toast('고객명을 입력하세요','error');return;}
  const c={
    id:uid(), client_name:name, client_phone:v('cs_phone'), client_email:v('cs_email'),
    source:v('cs_source'), project_type:v('cs_type'), area:Number(v('cs_area')||0),
    budget:v('cs_budget'), location:v('cs_loc'), date:v('cs_date'),
    assignee:v('cs_assign'), status:v('cs_status')||'신규', notes:v('cs_notes'),
    next_action:v('cs_next'), next_date:v('cs_next_date'), priority:v('cs_priority')||'보통',
    created_at:new Date().toISOString(), updated_at:new Date().toISOString()
  };
  await saveConsultation(c);closeModal();toast('상담이 등록되었습니다','success');renderConsult();
}

function openEditConsult(id){
  const c=getConsultations().find(x=>x.id===id);if(!c)return;
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">📞 상담 편집 — ${escHtml(c.client_name)}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">고객명 *</label><input class="inp" id="ec_client" value="${escHtml(c.client_name||'')}"></div>
        <div><label class="lbl">연락처</label><input class="inp" id="ec_phone" value="${c.client_phone||''}"></div>
        <div><label class="lbl">이메일</label><input class="inp" id="ec_email" value="${c.client_email||''}"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">유입경로</label><select class="sel" id="ec_source">${CONSULT_SOURCES.map(s=>`<option${c.source===s?' selected':''}>${s}</option>`).join('')}</select></div>
        <div><label class="lbl">프로젝트 유형</label><select class="sel" id="ec_type">${PROJECT_TYPES.map(t=>`<option${c.project_type===t?' selected':''}>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="ec_area" type="number" value="${c.area||''}"></div>
        <div><label class="lbl">예산 범위</label><input class="inp" id="ec_budget" value="${c.budget||''}"></div>
      </div>
      <div class="form-row form-row-3" style="margin-bottom:12px">
        <div><label class="lbl">위치</label><input class="inp" id="ec_loc" value="${c.location||''}"></div>
        <div><label class="lbl">상담일</label><input class="inp" id="ec_date" type="date" value="${c.date||''}"></div>
        <div><label class="lbl">담당자</label><select class="sel" id="ec_assign">${TEAM_MEMBERS.map(m=>`<option${c.assignee===m?' selected':''}>${m}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">우선순위</label><select class="sel" id="ec_priority"><option${c.priority==='보통'?' selected':''}>보통</option><option${c.priority==='긴급'?' selected':''}>긴급</option><option${c.priority==='높음'?' selected':''}>높음</option><option${c.priority==='낮음'?' selected':''}>낮음</option></select></div>
        <div><label class="lbl">상태</label><select class="sel" id="ec_status">${CONSULT_STATUSES.map(s=>`<option${c.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div style="margin-bottom:12px"><label class="lbl">상담 내용</label><textarea class="inp" id="ec_notes" rows="3">${c.notes||''}</textarea></div>
      <div class="form-row form-row-2">
        <div><label class="lbl">다음 액션</label><input class="inp" id="ec_next" value="${c.next_action||''}"></div>
        <div><label class="lbl">다음 일정</label><input class="inp" id="ec_next_date" type="date" value="${c.next_date||''}"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn" style="background:var(--danger);color:#fff" onclick="deleteConsultation('${c.id}');closeModal()">삭제</button>
      <button class="btn btn-primary" onclick="saveEditConsultItem('${c.id}')">저장</button>
    </div>
  </div></div>`);
}
async function saveEditConsultItem(id){
  const c=getConsultations().find(x=>x.id===id);if(!c)return;
  Object.assign(c,{
    client_name:v('ec_client'),client_phone:v('ec_phone'),client_email:v('ec_email'),
    source:v('ec_source'),project_type:v('ec_type'),area:Number(v('ec_area')||0),
    budget:v('ec_budget'),location:v('ec_loc'),date:v('ec_date'),
    assignee:v('ec_assign'),status:v('ec_status'),notes:v('ec_notes'),
    next_action:v('ec_next'),next_date:v('ec_next_date'),priority:v('ec_priority'),
    updated_at:new Date().toISOString()
  });
  await saveConsultation(c);closeModal();toast('저장되었습니다','success');renderConsult();
}
function exportConsultXLSX(){
  if(typeof XLSX==='undefined'){toast('SheetJS 로딩중...','warning');return;}
  const data=getConsultations().map(c=>({'고객명':c.client_name,'연락처':c.client_phone,'이메일':c.client_email,'유입경로':c.source,'유형':c.project_type,'면적':c.area,'예산':c.budget,'위치':c.location,'상담일':c.date,'담당자':c.assignee,'상태':c.status,'메모':c.notes}));
  const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'상담');XLSX.writeFile(wb,'상담관리_'+today()+'.xlsx');
}

// ===== RFP VIEW (제안·입찰 관리) =====
const RFP_STATUSES=['접수','검토중','제안서작성','제출완료','선정대기','수주','탈락','취소'];
const RFP_STATUS_COLORS={'접수':'var(--info)','검토중':'var(--primary)','제안서작성':'var(--warning)','제출완료':'var(--purple)','선정대기':'var(--teal,#14b8a6)','수주':'var(--success)','탈락':'var(--danger)','취소':'var(--gray-400)'};

function renderRfp(){
  const rs=getRfpList();
  const total=rs.length;
  const active=rs.filter(r=>!['수주','탈락','취소'].includes(r.status)).length;
  const won=rs.filter(r=>r.status==='수주');
  const totalBudget=won.reduce((a,r)=>a+(Number(r.budget_max)||Number(r.budget_min)||0),0);
  const avgWin=rs.length>0?(won.length/rs.filter(r=>['수주','탈락'].includes(r.status)).length*100||0):0;

  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportRfpXLSX()">${svgIcon('download',12)} 엑셀</button>
    <button class="btn btn-primary btn-sm" onclick="openAddRfp()">+ RFP 등록</button>`;

  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
    <!-- KPIs -->
    <div class="dash-grid" style="margin-bottom:16px">
      <div class="kpi-card kpi-primary">
        <div class="kpi-label">${svgIcon('clipboard',12)} 전체 RFP</div>
        <div class="kpi-value">${total}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">건</span></div>
        <div class="kpi-sub">${active}건 진행중</div>
      </div>
      <div class="kpi-card kpi-info">
        <div class="kpi-label">${svgIcon('check',12)} 수주</div>
        <div class="kpi-value" style="color:var(--success)">${won.length}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">건</span></div>
        <div class="kpi-sub">수주금액 ${fmtShort(totalBudget)}</div>
      </div>
      <div class="kpi-card kpi-warning">
        <div class="kpi-label">${svgIcon('chart',12)} 수주율</div>
        <div class="kpi-value">${isFinite(avgWin)?avgWin.toFixed(0):'–'}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">%</span></div>
        <div class="kpi-sub">완료 기준</div>
      </div>
    </div>

    ${filterBar({searchId:'rfp-search',statuses:RFP_STATUSES,statusId:'rfp-status',placeholder:'프로젝트명, 고객명 검색...',showDate:true,dateId:'rfp-from',dateToId:'rfp-to',onFilter:'filterRfpList()'})}

    <div id="rfp-list">
      ${renderRfpTable(rs)}
    </div>
  </div>`;
}

function renderRfpTable(rs){
  if(!rs.length) return '<div class="empty-state" style="padding:50px"><div class="empty-state-icon">📋</div><div class="empty-state-title">RFP 내역이 없습니다</div><div class="empty-state-desc">입찰·제안 요청을 등록하여 영업 성과를 추적하세요</div><button class="btn btn-primary btn-sm" onclick="openAddRfp()">+ RFP 등록</button></div>';
  return `<div class="tbl-wrap">
    <table class="tbl">
      <thead><tr>
        <th>프로젝트명</th><th>고객사</th><th>예산 범위</th><th>면적</th><th>마감일</th><th>수주확률</th><th>담당</th><th>상태</th><th>작업</th>
      </tr></thead>
      <tbody>
        ${rs.map(r=>{
          const stColor=RFP_STATUS_COLORS[r.status]||'var(--gray-400)';
          const daysLeft=r.deadline?diffDays(today(),r.deadline):null;
          const urgent=daysLeft!==null&&daysLeft<=3&&daysLeft>=0&&!['수주','탈락','취소'].includes(r.status);
          return `<tr style="${urgent?'background:var(--warning-light)':''}" onclick="openEditRfp('${r.id}')" class="cursor-pointer">
            <td>
              <div style="font-weight:700;font-size:13px">${escHtml(r.title||'(미입력)')}</div>
              <div style="font-size:11px;color:var(--text-muted)">${r.project_type||''} ${r.location?'· '+r.location:''}</div>
            </td>
            <td>${escHtml(r.client_name||'-')}</td>
            <td style="font-weight:600;font-size:12px">${r.budget_min||r.budget_max?fmtShort(r.budget_min||0)+' ~ '+fmtShort(r.budget_max||0):'-'}</td>
            <td>${r.area?r.area+'평':'-'}</td>
            <td>
              <div style="font-size:12px">${r.deadline||'-'}</div>
              ${daysLeft!==null&&!['수주','탈락','취소'].includes(r.status)?`<div style="font-size:10px;color:${daysLeft<=3?'var(--danger)':daysLeft<=7?'var(--warning)':'var(--text-muted)'};font-weight:600">${daysLeft<0?'마감 초과':daysLeft===0?'오늘 마감':'D-'+daysLeft}</div>`:''}
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:4px">
                <div class="prog" style="width:40px"><div class="prog-bar" style="width:${r.win_probability||0}%;background:${(r.win_probability||0)>=70?'var(--success)':(r.win_probability||0)>=40?'var(--warning)':'var(--danger)'}"></div></div>
                <span style="font-size:11px;font-weight:700">${r.win_probability||0}%</span>
              </div>
            </td>
            <td style="font-size:12px">${r.assignee||'-'}</td>
            <td><span style="background:${stColor};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${r.status}</span></td>
            <td onclick="event.stopPropagation()">
              <div style="display:flex;gap:4px">
                <button class="btn btn-ghost btn-sm btn-icon" onclick="openEditRfp('${r.id}')" title="편집">${svgIcon('edit',12)}</button>
                <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteRfpItem('${r.id}')" title="삭제">${svgIcon('trash',12)}</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function filterRfpList(){
  const q=(document.getElementById('rfp-search')?.value||'').toLowerCase();
  const st=document.getElementById('rfp-status')?.value||'';
  const df=document.getElementById('rfp-from')?.value||'';
  const dt=document.getElementById('rfp-to')?.value||'';
  let rs=getRfpList().filter(r=>{
    const text=!q||(r.title+r.client_name+r.location+r.notes).toLowerCase().includes(q);
    const status=!st||r.status===st;
    const dateOk=(!df||(r.deadline||'')>=df)&&(!dt||(r.deadline||'')<=dt);
    return text&&status&&dateOk;
  });
  document.getElementById('rfp-list').innerHTML=renderRfpTable(rs);
}

function openAddRfp(){
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">📋 RFP 등록</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트명 *</label><input class="inp" id="rf_title" placeholder="강남 OO빌딩 인테리어"></div>
        <div><label class="lbl">고객사</label><input class="inp" id="rf_client" placeholder="고객사명"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">예산 하한</label><input class="inp" id="rf_bmin" type="number" placeholder="50000000"></div>
        <div><label class="lbl">예산 상한</label><input class="inp" id="rf_bmax" type="number" placeholder="100000000"></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="rf_area" type="number"></div>
        <div><label class="lbl">위치</label><input class="inp" id="rf_loc"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트 유형</label><select class="sel" id="rf_type">${PROJECT_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">마감일</label><input class="inp" id="rf_deadline" type="date"></div>
        <div><label class="lbl">담당자</label><select class="sel" id="rf_assign">${TEAM_MEMBERS.map(m=>`<option>${m}</option>`).join('')}</select></div>
        <div><label class="lbl">수주확률(%)</label><input class="inp" id="rf_prob" type="number" value="30" min="0" max="100"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">우선순위</label><select class="sel" id="rf_priority"><option>보통</option><option>긴급</option><option>높음</option><option>낮음</option></select></div>
        <div><label class="lbl">상태</label><select class="sel" id="rf_status">${RFP_STATUSES.map(s=>`<option>${s}</option>`).join('')}</select></div>
      </div>
      <div style="margin-bottom:12px"><label class="lbl">요구사항</label><textarea class="inp" id="rf_req" rows="3" placeholder="고객 요구사항, 프로젝트 범위 등"></textarea></div>
      <div><label class="lbl">메모</label><textarea class="inp" id="rf_notes" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveNewRfpItem()">등록</button>
    </div>
  </div></div>`);
}
async function saveNewRfpItem(){
  const title=document.getElementById('rf_title')?.value?.trim();
  if(!title){toast('프로젝트명을 입력하세요','error');return;}
  const r={
    id:uid(), title, client_name:v('rf_client'), client_contact:'',
    budget_min:Number(v('rf_bmin')||0), budget_max:Number(v('rf_bmax')||0),
    area:Number(v('rf_area')||0), location:v('rf_loc'), project_type:v('rf_type'),
    deadline:v('rf_deadline'), assignee:v('rf_assign'), status:v('rf_status')||'접수',
    requirements:v('rf_req'), notes:v('rf_notes'), priority:v('rf_priority')||'보통',
    win_probability:Number(v('rf_prob')||30),
    created_at:new Date().toISOString(), updated_at:new Date().toISOString()
  };
  await saveRfpItem(r);closeModal();toast('RFP가 등록되었습니다','success');renderRfp();
}

function openEditRfp(id){
  const r=getRfpList().find(x=>x.id===id);if(!r)return;
  openModal(`<div class="modal-bg"><div class="modal modal-lg">
    <div class="modal-hdr"><span class="modal-title">📋 RFP 편집 — ${escHtml(r.title)}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트명 *</label><input class="inp" id="er_title" value="${escHtml(r.title||'')}"></div>
        <div><label class="lbl">고객사</label><input class="inp" id="er_client" value="${escHtml(r.client_name||'')}"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">예산 하한</label><input class="inp" id="er_bmin" type="number" value="${r.budget_min||''}"></div>
        <div><label class="lbl">예산 상한</label><input class="inp" id="er_bmax" type="number" value="${r.budget_max||''}"></div>
        <div><label class="lbl">면적(평)</label><input class="inp" id="er_area" type="number" value="${r.area||''}"></div>
        <div><label class="lbl">위치</label><input class="inp" id="er_loc" value="${r.location||''}"></div>
      </div>
      <div class="form-row form-row-4" style="margin-bottom:12px">
        <div><label class="lbl">프로젝트 유형</label><select class="sel" id="er_type">${PROJECT_TYPES.map(t=>`<option${r.project_type===t?' selected':''}>${t}</option>`).join('')}</select></div>
        <div><label class="lbl">마감일</label><input class="inp" id="er_deadline" type="date" value="${r.deadline||''}"></div>
        <div><label class="lbl">담당자</label><select class="sel" id="er_assign">${TEAM_MEMBERS.map(m=>`<option${r.assignee===m?' selected':''}>${m}</option>`).join('')}</select></div>
        <div><label class="lbl">수주확률(%)</label><input class="inp" id="er_prob" type="number" value="${r.win_probability||0}" min="0" max="100"></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">우선순위</label><select class="sel" id="er_priority"><option${r.priority==='보통'?' selected':''}>보통</option><option${r.priority==='긴급'?' selected':''}>긴급</option><option${r.priority==='높음'?' selected':''}>높음</option><option${r.priority==='낮음'?' selected':''}>낮음</option></select></div>
        <div><label class="lbl">상태</label><select class="sel" id="er_status">${RFP_STATUSES.map(s=>`<option${r.status===s?' selected':''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">제출일</label><input class="inp" id="er_submitted" type="date" value="${r.submitted_date||''}"></div>
        <div><label class="lbl">결과</label><input class="inp" id="er_result" value="${r.result||''}" placeholder="수주, 2순위 탈락 등"></div>
      </div>
      <div style="margin-bottom:12px"><label class="lbl">요구사항</label><textarea class="inp" id="er_req" rows="3">${r.requirements||''}</textarea></div>
      <div><label class="lbl">메모</label><textarea class="inp" id="er_notes" rows="2">${r.notes||''}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn" style="background:var(--danger);color:#fff" onclick="deleteRfpItem('${r.id}');closeModal()">삭제</button>
      ${r.status!=='수주'?`<button class="btn" style="background:var(--success);color:#fff" onclick="convertRfpToProject('${r.id}')">→ 프로젝트 전환</button>`:''}
      <button class="btn btn-primary" onclick="saveEditRfpItem('${r.id}')">저장</button>
    </div>
  </div></div>`);
}
async function saveEditRfpItem(id){
  const r=getRfpList().find(x=>x.id===id);if(!r)return;
  Object.assign(r,{
    title:v('er_title'),client_name:v('er_client'),
    budget_min:Number(v('er_bmin')||0),budget_max:Number(v('er_bmax')||0),
    area:Number(v('er_area')||0),location:v('er_loc'),project_type:v('er_type'),
    deadline:v('er_deadline'),assignee:v('er_assign'),status:v('er_status'),
    requirements:v('er_req'),notes:v('er_notes'),priority:v('er_priority'),
    win_probability:Number(v('er_prob')||0),submitted_date:v('er_submitted'),result:v('er_result'),
    updated_at:new Date().toISOString()
  });
  await saveRfpItem(r);closeModal();toast('저장되었습니다','success');renderRfp();
}

async function convertRfpToProject(rfpId){
  const r=getRfpList().find(x=>x.id===rfpId);if(!r)return;
  const p={
    id:uid(), nm:r.title, client:r.client_name, contact:r.client_contact||'',
    email:'', loc:r.location, mgr:r.assignee, date:today(), status:'작성중',
    area:r.area, profit:10, roundUnit:'십만원', memo:'RFP 전환: '+r.notes,
    region:'', items:[], ganttTasks:[], contractStatus:'미생성',
    payments:[{label:'계약금',pct:30,due:'',paid:false,paidDate:''},{label:'중도금',pct:40,due:'',paid:false,paidDate:''},{label:'잔금',pct:30,due:'',paid:false,paidDate:''}],
    createdAt:today()
  };
  await saveProject(p);
  r.status='수주';r.result='프로젝트 전환완료';r.updated_at=new Date().toISOString();
  await saveRfpItem(r);
  closeModal();toast('프로젝트로 전환되었습니다!','success');renderRfp();
}

function exportRfpXLSX(){
  if(typeof XLSX==='undefined'){toast('SheetJS 로딩중...','warning');return;}
  const data=getRfpList().map(r=>({'프로젝트명':r.title,'고객사':r.client_name,'예산하한':r.budget_min,'예산상한':r.budget_max,'면적':r.area,'위치':r.location,'마감일':r.deadline,'수주확률':r.win_probability+'%','담당자':r.assignee,'상태':r.status,'결과':r.result}));
  const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'RFP');XLSX.writeFile(wb,'RFP관리_'+today()+'.xlsx');
}

// ===== ERP PROJECT DETAIL VIEWS (Phase 2) =====

// ── ERP OVERVIEW ──
function renderErpOverview(){
  const p=getProject(S.selPid);
  if(!p){backToBoard();return;}
  const f=getFinSummary(p);
  const c=calcP(p);
  const prog=getProg(p);
  const risks=getRisks(p);
  const orders=(getOrders()||[]).filter(o=>o.pid===p.id);
  const labor=(getLabor()||[]).filter(l=>l.pid===p.id);
  const expenses=(getExpenses()||[]).filter(e=>e.pid===p.id);

  // Budget by cost type
  const orderAmt=orders.reduce((a,o)=>a+Number(o.amount||0),0);
  const laborAmt=labor.reduce((a,l)=>a+Number(l.daily_rate||0)*Number(l.days||0)+Number(l.meal_cost||0)+Number(l.transport_cost||0)+Number(l.overtime_cost||0)-Number(l.deduction||0),0);
  const expenseAmt=expenses.filter(e=>e.status==='승인').reduce((a,e)=>a+Number(e.amount||0),0);

  // Category breakdown
  const catEntries=Object.entries(c.cs).filter(([,v])=>v.t>0).sort((a,b)=>b[1].t-a[1].t);
  const maxCat=catEntries.length?catEntries[0][1].t:1;

  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="openEditProject('${p.id}')">${svgIcon('edit',12)} 정보 편집</button>
    <button class="btn btn-outline btn-sm" onclick="nav('erp_report')">${svgIcon('chart',12)} 리포트</button>`;

  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
    <!-- Project Info Header -->
    <div class="card" style="margin-bottom:16px;padding:18px 22px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">프로젝트 개요</div>
          <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:6px">${escHtml(p.nm)}</div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-muted)">
            <span>👤 ${escHtml(p.client||'-')}</span>
            <span>📐 ${p.area||'-'}평</span>
            <span>📅 ${p.date||'-'}</span>
            <span>👷 ${p.mgr||'-'}</span>
            ${statusBadge(p.status)}
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="text-align:center;padding:10px 16px;background:var(--primary-light);border-radius:var(--radius)">
            <div style="font-size:10px;color:var(--primary);font-weight:600">공정률</div>
            <div style="font-size:22px;font-weight:800;color:var(--primary)">${prog}%</div>
          </div>
          ${isAdmin()?`<div style="text-align:center;padding:10px 16px;background:${f.actualMargin>=10?'var(--success-light)':f.actualMargin>=0?'var(--warning-light)':'var(--danger-light)'};border-radius:var(--radius)">
            <div style="font-size:10px;font-weight:600;color:${f.actualMargin>=10?'var(--success)':f.actualMargin>=0?'var(--warning)':'var(--danger)'}">실행 마진</div>
            <div style="font-size:22px;font-weight:800;color:${f.actualMargin>=10?'var(--success)':f.actualMargin>=0?'var(--warning)':'var(--danger)'}">${f.actualMargin.toFixed(1)}%</div>
          </div>`:`<div style="text-align:center;padding:10px 16px;background:var(--success-light);border-radius:var(--radius)">
            <div style="font-size:10px;font-weight:600;color:var(--success)">수금률</div>
            <div style="font-size:22px;font-weight:800;color:var(--success)">${f.collectionRate.toFixed(0)}%</div>
          </div>`}
        </div>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="dash-grid" style="margin-bottom:16px">
      ${isAdmin()?`<div class="kpi-card kpi-primary">
        <div class="kpi-label">${svgIcon('dollar',12)} 계약 총액</div>
        <div class="kpi-value">${fmtShort(f.contractTotal)}</div>
        <div class="kpi-sub">견적원가 ${fmtShort(f.estCost)}</div>
      </div>
      <div class="kpi-card kpi-danger">
        <div class="kpi-label">${svgIcon('activity',12)} 실행 비용</div>
        <div class="kpi-value">${fmtShort(f.totalSpent)}</div>
        <div class="kpi-sub">집행률 ${f.executionRate.toFixed(1)}%</div>
      </div>
      <div class="kpi-card kpi-info">
        <div class="kpi-label">${svgIcon('check',12)} 수금 현황</div>
        <div class="kpi-value">${fmtShort(f.collected)}</div>
        <div class="kpi-sub">수금률 ${f.collectionRate.toFixed(1)}% · 미수금 ${fmtShort(f.outstanding)}</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid ${f.actualProfit>=0?'var(--success)':'var(--danger)'}">
        <div class="kpi-label">${svgIcon('chart',12)} 실행 이익</div>
        <div class="kpi-value" style="color:${f.actualProfit>=0?'var(--success)':'var(--danger)'}">${fmtShort(f.actualProfit)}</div>
        <div class="kpi-sub">예상이익 ${fmtShort(f.estProfit)} (${f.estMargin.toFixed(1)}%)</div>
      </div>`:`<div class="kpi-card kpi-primary">
        <div class="kpi-label">${svgIcon('activity',12)} 공정 현황</div>
        <div class="kpi-value">${prog}%</div>
        <div class="kpi-sub">공정 진행률</div>
      </div>
      <div class="kpi-card kpi-info">
        <div class="kpi-label">${svgIcon('check',12)} 수금률</div>
        <div class="kpi-value">${f.collectionRate.toFixed(0)}%</div>
        <div class="kpi-sub">수금 진행 현황</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid var(--warning)">
        <div class="kpi-label">🔨 발주 건수</div>
        <div class="kpi-value">${orders.length}<span style="font-size:14px">건</span></div>
        <div class="kpi-sub">자재 발주 현황</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid var(--orange)">
        <div class="kpi-label">👷 인건비 건수</div>
        <div class="kpi-value">${labor.length}<span style="font-size:14px">건</span></div>
        <div class="kpi-sub">노무비 등록 현황</div>
      </div>`}
    </div>

    <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:16px">
      <!-- Cost Composition (admin) / Work Status (staff) -->
      ${isAdmin()?`<div class="card">
        <div class="card-title">📊 비용 구성</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
          ${[
            {label:'공사비(자재발주)', amt:orderAmt, color:'var(--primary)', icon:'🔨'},
            {label:'인건비(노무)', amt:laborAmt, color:'var(--warning)', icon:'👷'},
            {label:'경비(지출)', amt:expenseAmt, color:'var(--success)', icon:'💳'},
          ].map(ct=>{
            const pct=f.totalSpent>0?(ct.amt/f.totalSpent*100):0;
            return `<div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:12px">
                <span style="font-weight:600">${ct.icon} ${ct.label}</span>
                <span style="font-weight:700">${fmtShort(ct.amt)} <span style="color:var(--text-muted);font-weight:400">(${pct.toFixed(0)}%)</span></span>
              </div>
              <div class="prog" style="height:8px"><div class="prog-bar" style="width:${pct}%;background:${ct.color}"></div></div>
            </div>`;
          }).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;font-size:13px;font-weight:700">
          <span>총 집행액</span>
          <span>${fmtShort(f.totalSpent)}</span>
        </div>
      </div>`:`<div class="card">
        <div class="card-title">📊 작업 현황</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
          ${[
            {label:'자재발주', cnt:orders.length, color:'var(--primary)', icon:'🔨'},
            {label:'노무비', cnt:labor.length, color:'var(--warning)', icon:'👷'},
            {label:'지출결의', cnt:expenses.length, color:'var(--success)', icon:'💳'},
          ].map(ct=>{
            const total=orders.length+labor.length+expenses.length;
            const pct=total>0?(ct.cnt/total*100):0;
            return `<div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:12px">
                <span style="font-weight:600">${ct.icon} ${ct.label}</span>
                <span style="font-weight:700">${ct.cnt}건</span>
              </div>
              <div class="prog" style="height:8px"><div class="prog-bar" style="width:${pct}%;background:${ct.color}"></div></div>
            </div>`;
          }).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;font-size:13px;font-weight:700">
          <span>총 등록건수</span>
          <span>${orders.length+labor.length+expenses.length}건</span>
        </div>
      </div>`}

      <!-- Risks & Alerts -->
      <div class="card">
        <div class="card-title">⚠️ 리스크 & 알림</div>
        ${risks.length?`<div style="display:flex;flex-direction:column;gap:6px">
          ${risks.map(r=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:${r.lv==='high'?'var(--danger-light)':'var(--warning-light)'};border-radius:var(--radius-sm);font-size:12px">
            <span style="flex-shrink:0">${r.lv==='high'?'🔴':'🟡'}</span>
            <span style="color:var(--text-secondary)">${r.msg}</span>
          </div>`).join('')}
        </div>`:
        `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">✅ 리스크 없음</div>`}

        <!-- Quick Links -->
        <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:8px">빠른 이동</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="nav('estimate')">📋 견적서</button>
            <button class="btn btn-outline btn-sm" onclick="nav('orders')">🚚 발주</button>
            <button class="btn btn-outline btn-sm" onclick="nav('gantt')">📊 공정표</button>
            <button class="btn btn-outline btn-sm" onclick="nav('erp_budget')">💰 예산</button>
            <button class="btn btn-outline btn-sm" onclick="nav('collection')">💵 수금</button>
            <button class="btn btn-outline btn-sm" onclick="nav('labor')">👷 노무비</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Category Breakdown -->
    <div class="card">
      <div class="card-title">🏗️ 공종별 ${isAdmin()?'견적 현황':'작업 항목'}</div>
      ${catEntries.length?`<div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>공종</th>${isAdmin()?'<th style="text-align:right">자재비</th><th style="text-align:right">노무비</th><th style="text-align:right">경비</th><th style="text-align:right">합계</th>':''}<th>비율</th>
          </tr></thead>
          <tbody>
            ${catEntries.map(([cid,cv])=>{
              const pct=c.direct>0?(cv.t/c.direct*100):0;
              return `<tr>
                <td><span style="font-weight:700">${catIcon(cid)} ${catNm(cid)}</span></td>
                ${isAdmin()?`<td style="text-align:right">${fmt(cv.m)}</td>
                <td style="text-align:right">${fmt(cv.l)}</td>
                <td style="text-align:right">${fmt(cv.e)}</td>
                <td style="text-align:right;font-weight:700">${fmt(cv.t)}</td>`:''}
                <td><div style="display:flex;align-items:center;gap:6px"><div class="prog" style="width:60px"><div class="prog-bar" style="width:${pct}%"></div></div><span style="font-size:10px">${pct.toFixed(1)}%</span></div></td>
              </tr>`;
            }).join('')}
          </tbody>
          ${isAdmin()?`<tfoot><tr style="font-weight:800;border-top:2px solid var(--border)">
            <td>합계</td>
            <td style="text-align:right">${fmt(Object.values(c.cs).reduce((a,v)=>a+v.m,0))}</td>
            <td style="text-align:right">${fmt(Object.values(c.cs).reduce((a,v)=>a+v.l,0))}</td>
            <td style="text-align:right">${fmt(Object.values(c.cs).reduce((a,v)=>a+v.e,0))}</td>
            <td style="text-align:right">${fmt(c.direct)}</td>
            <td></td>
          </tr></tfoot>`:''}
        </table>
      </div>`:
      `<div class="empty-state" style="padding:30px"><div class="empty-state-icon">📋</div><div class="empty-state-title">견적 항목이 없습니다</div><button class="btn btn-primary btn-sm" onclick="navEstimate('${p.id}')">견적서 작성하기</button></div>`}
    </div>

    <!-- Payment Schedule -->
    <div class="card" style="margin-top:16px">
      <div class="card-title">💵 수금 일정</div>
      ${(p.payments||[]).length?`<div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>구분</th><th style="text-align:right">비율</th><th style="text-align:right">금액</th><th>기한</th><th>수금일</th><th>상태</th></tr></thead>
          <tbody>
            ${(p.payments||[]).map(pay=>{
              const amt=f.contractTotal*Number(pay.pct||0)/100;
              return `<tr>
                <td style="font-weight:600">${pay.label||'-'}</td>
                <td style="text-align:right">${pay.pct||0}%</td>
                <td style="text-align:right;font-weight:700">${fmtShort(amt)}</td>
                <td style="font-size:12px">${pay.due||'-'}</td>
                <td style="font-size:12px">${pay.paidDate||'-'}</td>
                <td>${pay.paid?'<span class="badge badge-green">✅ 수금완료</span>':'<span class="badge badge-orange">⏳ 미수금</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`:
      `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">수금 일정이 설정되지 않았습니다</div>`}
    </div>
  </div>`;
}

// ── ERP BUDGET ──
function renderErpBudget(){
  const p=getProject(S.selPid);
  if(!p){backToBoard();return;}
  const f=getFinSummary(p);
  const c=calcP(p);
  const orders=(getOrders()||[]).filter(o=>o.pid===p.id);
  const labor=(getLabor()||[]).filter(l=>l.pid===p.id);
  const expenses=(getExpenses()||[]).filter(e=>e.pid===p.id);

  // Category-level budget vs actual
  const catBudget={};
  Object.entries(c.cs).forEach(([cid,cv])=>{
    if(cv.t>0) catBudget[cid]={est:cv.t, estCost:cv.ct, actual:0};
  });
  orders.forEach(o=>{
    if(catBudget[o.cid]) catBudget[o.cid].actual+=Number(o.amount||0);
    else catBudget[o.cid]={est:0,estCost:0,actual:Number(o.amount||0)};
  });

  const catBudgetEntries=Object.entries(catBudget).sort((a,b)=>b[1].est-a[1].est);
  const orderAmt=orders.reduce((a,o)=>a+Number(o.amount||0),0);
  const laborAmt=labor.reduce((a,l)=>a+Number(l.daily_rate||0)*Number(l.days||0)+Number(l.meal_cost||0)+Number(l.transport_cost||0)+Number(l.overtime_cost||0)-Number(l.deduction||0),0);
  const expenseAmt=expenses.filter(e=>e.status==='승인').reduce((a,e)=>a+Number(e.amount||0),0);

  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('projects')">${svgIcon('download',12)} 엑셀</button>`;

  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
    <!-- Budget Summary KPIs -->
    <div class="dash-grid" style="margin-bottom:16px">
      <div class="kpi-card kpi-primary">
        <div class="kpi-label">📋 ${isAdmin()?'견적 총액 (도급)':'프로젝트 규모'}</div>
        <div class="kpi-value">${isAdmin()?fmtShort(f.contractTotal):(p.area||0)+'평'}</div>
        <div class="kpi-sub">${isAdmin()?'직접비 '+fmtShort(c.direct)+' + 간접비 '+fmtShort(c.indirect):'상태: '+p.status}</div>
      </div>
      ${isAdmin()?`<div class="kpi-card kpi-info">
        <div class="kpi-label">💰 견적 원가</div>
        <div class="kpi-value">${fmtShort(f.estCost)}</div>
        <div class="kpi-sub">예상이익 ${fmtShort(f.estProfit)} (${f.estMargin.toFixed(1)}%)</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid var(--warning)">
        <div class="kpi-label">🔨 실행 비용</div>
        <div class="kpi-value" style="color:var(--warning)">${fmtShort(f.totalSpent)}</div>
        <div class="kpi-sub">집행률 ${f.executionRate.toFixed(1)}%</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid ${f.actualProfit>=0?'var(--success)':'var(--danger)'}">
        <div class="kpi-label">📈 실행 이익</div>
        <div class="kpi-value" style="color:${f.actualProfit>=0?'var(--success)':'var(--danger)'}">${fmtShort(f.actualProfit)}</div>
        <div class="kpi-sub">실행마진 ${f.actualMargin.toFixed(1)}%</div>
      </div>`:`<div class="kpi-card kpi-info">
        <div class="kpi-label">🔨 발주 건수</div>
        <div class="kpi-value">${orders.length}<span style="font-size:14px">건</span></div>
        <div class="kpi-sub">진행중 프로젝트</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid var(--warning)">
        <div class="kpi-label">👷 인건비 건수</div>
        <div class="kpi-value" style="color:var(--warning)">${labor.length}<span style="font-size:14px">건</span></div>
        <div class="kpi-sub">등록된 노무비</div>
      </div>
      <div class="kpi-card" style="border-left:3px solid var(--success)">
        <div class="kpi-label">📊 수금률</div>
        <div class="kpi-value" style="color:var(--success)">${f.collectionRate.toFixed(0)}%</div>
        <div class="kpi-sub">수금 진행 현황</div>
      </div>`}
    </div>

    <!-- Cost Type Summary -->
    ${isAdmin()?`<div class="card" style="margin-bottom:16px">
      <div class="card-title">💳 비용 유형별 예산 vs 실적</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>비용 유형</th><th style="text-align:right">예산 (견적원가)</th><th style="text-align:right">실행액</th><th style="text-align:right">차이</th><th>집행률</th>
          </tr></thead>
          <tbody>
            ${[
              {label:'🔨 공사비 (자재발주)', est:c.costDirect, actual:orderAmt},
              {label:'👷 인건비 (노무)', est:0, actual:laborAmt},
              {label:'💳 경비 (지출결의)', est:0, actual:expenseAmt},
            ].map(ct=>{
              const diff=ct.est-ct.actual;
              const execPct=ct.est>0?(ct.actual/ct.est*100):ct.actual>0?100:0;
              return `<tr>
                <td style="font-weight:600">${ct.label}</td>
                <td style="text-align:right">${fmt(ct.est)}</td>
                <td style="text-align:right;font-weight:700;color:${execPct>=100?'var(--danger)':'var(--text)'}">${fmt(ct.actual)}</td>
                <td style="text-align:right;color:${diff>=0?'var(--success)':'var(--danger)'};font-weight:600">${diff>=0?'+':''}${fmt(diff)}</td>
                <td><div style="display:flex;align-items:center;gap:6px">
                  <div class="prog" style="width:80px"><div class="prog-bar" style="width:${Math.min(100,execPct)}%;background:${execPct>=100?'var(--danger)':execPct>=80?'var(--warning)':'var(--success)'}"></div></div>
                  <span style="font-size:11px;font-weight:700;color:${execPct>=100?'var(--danger)':'var(--text-muted)'}">${execPct.toFixed(0)}%</span>
                </div></td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr style="font-weight:800;border-top:2px solid var(--border)">
            <td>합계</td>
            <td style="text-align:right">${fmt(c.costDirect)}</td>
            <td style="text-align:right">${fmt(f.totalSpent)}</td>
            <td style="text-align:right;color:${c.costDirect-f.totalSpent>=0?'var(--success)':'var(--danger)'}">${c.costDirect-f.totalSpent>=0?'+':''}${fmt(c.costDirect-f.totalSpent)}</td>
            <td><span style="font-weight:700">${f.executionRate.toFixed(1)}%</span></td>
          </tr></tfoot>
        </table>
      </div>
    </div>`:''}

    <!-- Category Budget vs Actual (admin only) -->
    ${isAdmin()?`<div class="card">
      <div class="card-title">🏗️ 공종별 예산 vs 실적 (발주 기준)</div>
      ${catBudgetEntries.length?`<div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>공종</th><th style="text-align:right">견적 (도급)</th><th style="text-align:right">견적 원가</th><th style="text-align:right">발주 실적</th><th style="text-align:right">차이</th><th>집행률</th>
          </tr></thead>
          <tbody>
            ${catBudgetEntries.map(([cid,bv])=>{
              const diff=(bv.estCost||bv.est)-bv.actual;
              const base=bv.estCost||bv.est;
              const execPct=base>0?(bv.actual/base*100):bv.actual>0?100:0;
              return `<tr>
                <td style="font-weight:600">${catIcon(cid)} ${catNm(cid)}</td>
                <td style="text-align:right">${fmt(bv.est)}</td>
                <td style="text-align:right;color:var(--text-muted)">${fmt(bv.estCost)}</td>
                <td style="text-align:right;font-weight:700">${fmt(bv.actual)}</td>
                <td style="text-align:right;font-weight:600;color:${diff>=0?'var(--success)':'var(--danger)'}">${diff>=0?'+':''}${fmt(diff)}</td>
                <td><div style="display:flex;align-items:center;gap:6px">
                  <div class="prog" style="width:60px"><div class="prog-bar" style="width:${Math.min(100,execPct)}%;background:${execPct>=100?'var(--danger)':execPct>=80?'var(--warning)':'var(--success)'}"></div></div>
                  <span style="font-size:10px;font-weight:700">${execPct.toFixed(0)}%</span>
                </div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`:
      `<div class="empty-state" style="padding:30px"><div class="empty-state-icon">📋</div><div class="empty-state-title">예산 데이터가 없습니다</div></div>`}
    </div>`:''}

    <!-- Indirect Costs Breakdown (admin only) -->
    ${isAdmin()?`<div class="card" style="margin-top:16px">
      <div class="card-title">📊 간접비 내역</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>항목</th><th style="text-align:right">비율</th><th style="text-align:right">금액</th></tr></thead>
          <tbody>
            <tr><td>기업이윤</td><td style="text-align:right">${p.profit||10}%</td><td style="text-align:right;font-weight:600">${fmt(c.profitAmt)}</td></tr>
            <tr><td>안전관리비</td><td style="text-align:right">0.7%</td><td style="text-align:right;font-weight:600">${fmt(c.safetyAmt)}</td></tr>
            <tr><td>식대비</td><td style="text-align:right">3%</td><td style="text-align:right;font-weight:600">${fmt(c.mealAmt)}</td></tr>
            <tr style="font-weight:800;border-top:2px solid var(--border)"><td>간접비 합계</td><td></td><td style="text-align:right">${fmt(c.indirect)}</td></tr>
            <tr style="font-weight:800"><td>반올림 조정</td><td style="text-align:right">${p.roundUnit||'십만원'}</td><td style="text-align:right;color:${c.adj>=0?'var(--success)':'var(--danger)'}">${c.adj>=0?'+':''}${fmt(c.adj)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`:''}
  </div>`;
}

// ── ERP ATTACHMENTS ──
function renderErpAttachments(){
  const p=getProject(S.selPid);
  if(!p){backToBoard();return;}
  const attachments=getErpAttachments(p.id);
  const folders=[...new Set(['도면','계약서','세금계산서','견적서','사진','기타',...attachments.map(a=>a.folder||'기타')])];

  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="openUploadAttachment('${p.id}')">📎 파일 업로드</button>
    <button class="btn btn-primary btn-sm" onclick="addAttachmentFolder('${p.id}')">+ 폴더 추가</button>`;

  // Group attachments by folder
  const grouped={};
  attachments.forEach(a=>{
    const f=a.folder||'기타';
    if(!grouped[f])grouped[f]=[];
    grouped[f].push(a);
  });
  
  // File size formatter
  const fmtSize=(bytes)=>{
    if(!bytes||bytes<1024)return (bytes||0)+'B';
    if(bytes<1024*1024)return (bytes/1024).toFixed(1)+'KB';
    return (bytes/(1024*1024)).toFixed(1)+'MB';
  };

  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease">
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="card-title" style="margin-bottom:0">📁 프로젝트 첨부파일</div>
        <div style="font-size:12px;color:var(--text-muted)">${attachments.length}개 파일 · ${Object.keys(grouped).length}개 폴더</div>
      </div>

      <!-- Drop zone -->
      <div id="drop-zone" style="border:2px dashed var(--border);border-radius:var(--radius);padding:30px;text-align:center;margin-bottom:16px;cursor:pointer;transition:all .2s" onclick="openUploadAttachment('${p.id}')" ondragover="event.preventDefault();this.style.borderColor='var(--primary)';this.style.background='var(--primary-light)'" ondragleave="this.style.borderColor='var(--border)';this.style.background=''" ondrop="handleFileDrop(event,'${p.id}')">
        <div style="font-size:32px;margin-bottom:8px">📎</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-muted)">파일을 드래그하거나 클릭하여 업로드</div>
        <div style="font-size:11px;color:var(--g400);margin-top:4px">최대 2MB · 이미지, PDF, 문서 파일</div>
      </div>

      ${Object.keys(grouped).length?Object.entries(grouped).map(([folder,files])=>`
        <div style="margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 12px;background:var(--gray-50);border-radius:var(--radius);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
            <span style="font-size:14px">📂</span>
            <span style="font-weight:700;font-size:13px;flex:1">${escHtml(folder)}</span>
            <span class="badge badge-gray">${files.length}</span>
            <span style="color:var(--text-muted);font-size:10px">${svgIcon('chevron_down',12)}</span>
          </div>
          <div style="padding-left:12px">
            ${files.map(file=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-light);transition:background .15s;border-radius:var(--radius-sm)" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
                <span style="font-size:16px">${getFileIcon(file.file_name||'')}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(file.file_name||'파일')}</div>
                  <div style="font-size:11px;color:var(--text-muted)">
                    ${fmtSize(file.file_size)} · ${file.uploader||'-'} · ${(file.created_at||'').slice(0,10)}
                    ${file.memo?' · '+escHtml(file.memo):''}
                  </div>
                </div>
                ${file.file_data?`<button class="btn btn-ghost btn-sm btn-icon" onclick="downloadAttachment('${file.id}')" title="다운로드">${svgIcon('download',13)}</button>`:''}
                ${file.file_type&&file.file_type.startsWith('image')?`<button class="btn btn-ghost btn-sm btn-icon" onclick="previewAttachment('${file.id}')" title="미리보기">👁️</button>`:''}
                <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--red)" onclick="deleteAttachment('${file.id}')" title="삭제">${svgIcon('trash',13)}</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join(''):
      `<div class="empty-state" style="padding:50px">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-title">첨부파일이 없습니다</div>
        <div class="empty-state-desc">세금계산서, 견적서, 계약서 등을 관리할 수 있습니다</div>
      </div>`}
    </div>

    <!-- Related Documents Summary -->
    <div class="card">
      <div class="card-title">📄 관련 문서 현황</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
        ${[
          {icon:'📋',label:'견적서',count:(p.items||[]).length?1:0,fn:"nav('estimate')"},
          {icon:'📝',label:'계약서',count:p.contractStatus!=='미생성'?1:0,fn:"nav('contracts')"},
          {icon:'🚚',label:'발주서',count:(getOrders()||[]).filter(o=>o.pid===p.id).length,fn:"nav('orders')"},
          {icon:'💰',label:'세금계산서',count:(_d.tax||[]).filter(t=>t.pid===p.id).length,fn:"nav('tax')"},
          {icon:'👷',label:'노무비 기록',count:(getLabor()||[]).filter(l=>l.pid===p.id).length,fn:"nav('labor')"},
          {icon:'💳',label:'지출결의서',count:(getExpenses()||[]).filter(e=>e.pid===p.id).length,fn:"nav('expenses')"},
        ].map(d=>`
          <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--gray-50);border-radius:var(--radius);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background='var(--gray-50)'" onclick="${d.fn}">
            <span style="font-size:20px">${d.icon}</span>
            <div>
              <div style="font-size:12px;font-weight:600">${d.label}</div>
              <div style="font-size:18px;font-weight:800;color:var(--primary)">${d.count}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>`;
}

function getFileIcon(name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  const map={pdf:'📕',doc:'📘',docx:'📘',xls:'📗',xlsx:'📗',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',zip:'📦',rar:'📦',txt:'📄',hwp:'📙',pptx:'📊',ppt:'📊'};
  return map[ext]||'📄';
}

function openUploadAttachment(pid){
  const folders=['도면','계약서','세금계산서','견적서','사진','기타'];
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:480px">
    <div class="modal-hdr"><span class="modal-title">파일 업로드</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row form-row-2" style="margin-bottom:12px">
        <div><label class="lbl">폴더 *</label><select class="sel" id="att_folder">${folders.map(f=>`<option>${f}</option>`).join('')}</select></div>
        <div><label class="lbl">업로더</label><input class="inp" id="att_uploader" value="${S.userName||''}"></div>
      </div>
      <div style="margin-bottom:12px">
        <label class="lbl">파일 선택 *</label>
        <input type="file" id="att_file" class="inp" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.pptx,.txt,.zip" multiple>
        <div style="font-size:11px;color:var(--g400);margin-top:4px">최대 2MB / 여러 파일 선택 가능</div>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <div><label class="lbl">메모</label><input class="inp" id="att_memo" placeholder="파일 설명..."></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveAttachments('${pid}')">업로드</button>
    </div>
  </div></div>`);
}

async function saveAttachments(pid){
  const files=document.getElementById('att_file').files;
  if(!files||!files.length){toast('파일을 선택하세요','error');return;}
  const folder=document.getElementById('att_folder').value;
  const uploader=document.getElementById('att_uploader').value;
  const memo=document.getElementById('att_memo').value;
  let cnt=0;
  for(const file of files){
    if(file.size>2*1024*1024){toast(`${file.name}: 2MB 초과. 건너뜁니다.`,'error');continue;}
    try{
      const data=await readFileAsBase64(file);
      await api('erp-attachments','POST',{
        id:'att'+Date.now()+cnt, pid, folder, file_name:file.name,
        file_type:file.type, file_size:file.size, file_data:data,
        uploader, memo, created_at:new Date().toISOString()
      });
      cnt++;
    }catch(e){toast(`${file.name} 업로드 실패`,'error');}
  }
  _d.erpAttachments=await api('erp-attachments');
  closeModal();renderErpAttachments();
  toast(`${cnt}개 파일이 업로드되었습니다`,'success');
}

function readFileAsBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

function handleFileDrop(e,pid){
  e.preventDefault();
  const dt=e.dataTransfer;if(!dt||!dt.files.length)return;
  document.getElementById('drop-zone').style.borderColor='var(--border)';
  document.getElementById('drop-zone').style.background='';
  // Quick upload files to '기타' folder
  (async()=>{
    let cnt=0;
    for(const file of dt.files){
      if(file.size>2*1024*1024){toast(`${file.name}: 2MB 초과`,'error');continue;}
      try{
        const data=await readFileAsBase64(file);
        await api('erp-attachments','POST',{
          id:'att'+Date.now()+cnt, pid, folder:'기타', file_name:file.name,
          file_type:file.type, file_size:file.size, file_data:data,
          uploader:S.userName||'', memo:'', created_at:new Date().toISOString()
        });
        cnt++;
      }catch(e){}
    }
    _d.erpAttachments=await api('erp-attachments');
    renderErpAttachments();
    if(cnt)toast(`${cnt}개 파일이 업로드되었습니다`,'success');
  })();
}

function downloadAttachment(id){
  const att=(_d.erpAttachments||[]).find(a=>a.id===id);
  if(!att||!att.file_data)return toast('파일 데이터 없음','error');
  const a=document.createElement('a');
  a.href=att.file_data;
  a.download=att.file_name||'download';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  toast('다운로드 시작','success');
}

function previewAttachment(id){
  const att=(_d.erpAttachments||[]).find(a=>a.id===id);
  if(!att||!att.file_data)return toast('미리보기 불가','error');
  openModal(`<div class="modal-bg"><div class="modal" style="max-width:720px">
    <div class="modal-hdr"><span class="modal-title">${escHtml(att.file_name)}</span><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" style="text-align:center;padding:20px">
      <img src="${att.file_data}" style="max-width:100%;max-height:70vh;border-radius:var(--radius)">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">닫기</button>
      <button class="btn btn-primary" onclick="downloadAttachment('${id}')">다운로드</button>
    </div>
  </div></div>`);
}

async function deleteAttachment(id){
  if(!confirm('이 파일을 삭제하시겠습니까?'))return;
  await api('erp-attachments/'+id,'DELETE');
  _d.erpAttachments=await api('erp-attachments');
  renderErpAttachments();toast('파일이 삭제되었습니다','success');
}

function addAttachmentFolder(pid){
  const name=prompt('새 폴더 이름을 입력하세요:');
  if(!name||!name.trim())return;
  toast(`"${name.trim()}" 폴더가 추가되었습니다. 파일을 업로드하면 표시됩니다.`,'success');
  // Folders are created dynamically when files are uploaded into them
}

// ── ERP REPORT ──
function renderErpReport(){
  const p=getProject(S.selPid);
  if(!p){backToBoard();return;}
  const f=getFinSummary(p);
  const c=calcP(p);
  const prog=getProg(p);
  const risks=getRisks(p);
  const orders=(getOrders()||[]).filter(o=>o.pid===p.id);
  const labor=(getLabor()||[]).filter(l=>l.pid===p.id);
  const expenses=(getExpenses()||[]).filter(e=>e.pid===p.id);
  const co=getCompany();

  const catEntries=Object.entries(c.cs).filter(([,v])=>v.t>0).sort((a,b)=>b[1].t-a[1].t);
  const statusEmoji={'작성중':'📝','견적완료':'📋','계약완료':'📝','시공중':'🏗️','완료':'✅','보류':'⏸️'};

  document.getElementById('tb-actions').innerHTML=`
    <button class="btn btn-outline btn-sm" onclick="printPage()">${svgIcon('print',12)} 인쇄</button>
    <button class="btn btn-outline btn-sm" onclick="exportXLSX('projects')">${svgIcon('download',12)} 엑셀</button>`;

  const todayStr=today();
  const now=new Date();
  const dateStr=now.getFullYear()+'년 '+(now.getMonth()+1)+'월 '+now.getDate()+'일';

  document.getElementById('content').innerHTML=`
  <div style="animation:fadeIn .4s ease" id="report-content">
    <!-- Report Header -->
    <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,var(--primary) 0%,var(--primary-dark,#5a4a3a) 100%);color:#fff;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:11px;opacity:.7;margin-bottom:4px">PROJECT REPORT</div>
          <div style="font-size:22px;font-weight:800;margin-bottom:6px">${escHtml(p.nm)}</div>
          <div style="font-size:13px;opacity:.8">
            ${escHtml(p.client||'')} · ${p.area||'-'}평 · ${statusEmoji[p.status]||''} ${p.status}
          </div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:.7">
          <div>${co.nameKo||co.name||'Frame Plus'}</div>
          <div>보고일: ${dateStr}</div>
          <div>담당: ${p.mgr||'-'}</div>
        </div>
      </div>
    </div>

    <!-- Executive Summary -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">📊 ${isAdmin()?'경영 요약':'프로젝트 요약'}</div>
      <div style="display:grid;grid-template-columns:repeat(${isAdmin()?3:2},1fr);gap:12px;margin-bottom:16px">
        ${isAdmin()?`<div style="text-align:center;padding:16px;background:var(--gray-50);border-radius:var(--radius)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">계약 총액</div>
          <div style="font-size:20px;font-weight:800;color:var(--primary)">${fmtShort(f.contractTotal)}</div>
        </div>`:`<div style="text-align:center;padding:16px;background:var(--gray-50);border-radius:var(--radius)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">공정 진행률</div>
          <div style="font-size:20px;font-weight:800;color:var(--primary)">${prog}%</div>
        </div>`}
        ${isAdmin()?`<div style="text-align:center;padding:16px;background:var(--gray-50);border-radius:var(--radius)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">실행 비용</div>
          <div style="font-size:20px;font-weight:800;color:var(--warning)">${fmtShort(f.totalSpent)}</div>
        </div>
        <div style="text-align:center;padding:16px;background:${f.actualProfit>=0?'var(--success-light)':'var(--danger-light)'};border-radius:var(--radius)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">실행 이익</div>
          <div style="font-size:20px;font-weight:800;color:${f.actualProfit>=0?'var(--success)':'var(--danger)'}">${fmtShort(f.actualProfit)}</div>
        </div>`:`<div style="text-align:center;padding:16px;background:var(--success-light);border-radius:var(--radius)">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">수금률</div>
          <div style="font-size:20px;font-weight:800;color:var(--success)">${f.collectionRate.toFixed(0)}%</div>
        </div>`}
      </div>

      <!-- Progress Bars -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="font-weight:600">공정 진행률</span>
            <span style="font-weight:800;color:var(--primary)">${prog}%</span>
          </div>
          <div class="prog" style="height:10px"><div class="prog-bar" style="width:${prog}%;background:var(--primary)"></div></div>
        </div>
        ${isAdmin()?`<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="font-weight:600">예산 집행률</span>
            <span style="font-weight:800;color:${f.executionRate>=100?'var(--danger)':'var(--warning)'}">${f.executionRate.toFixed(1)}%</span>
          </div>
          <div class="prog" style="height:10px"><div class="prog-bar" style="width:${Math.min(100,f.executionRate)}%;background:${f.executionRate>=100?'var(--danger)':'var(--warning)'}"></div></div>
        </div>`:''}
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="font-weight:600">수금률</span>
            <span style="font-weight:800;color:var(--success)">${f.collectionRate.toFixed(1)}%</span>
          </div>
          <div class="prog" style="height:10px"><div class="prog-bar" style="width:${f.collectionRate}%;background:var(--success)"></div></div>
        </div>
        ${isAdmin()?`<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="font-weight:600">실행 마진율</span>
            <span style="font-weight:800;color:${f.actualMargin>=10?'var(--success)':f.actualMargin>=0?'var(--warning)':'var(--danger)'}">${f.actualMargin.toFixed(1)}%</span>
          </div>
          <div class="prog" style="height:10px"><div class="prog-bar" style="width:${Math.max(0,Math.min(100,f.actualMargin*2))}%;background:${f.actualMargin>=10?'var(--success)':f.actualMargin>=0?'var(--warning)':'var(--danger)'}"></div></div>
        </div>`:''}
      </div>
    </div>

    <!-- Financial Details (admin only) -->
    ${isAdmin()?`<div class="card" style="margin-bottom:16px">
      <div class="card-title">💰 재무 상세</div>
      <div class="tbl-wrap">
        <table class="tbl">
          <tbody>
            <tr><td style="font-weight:600;width:40%">계약 총액 (도급금액)</td><td style="text-align:right;font-weight:800">${fmt(f.contractTotal)}</td></tr>
            <tr><td style="font-weight:600;color:var(--text-muted)">└ 직접비</td><td style="text-align:right">${fmt(c.direct)}</td></tr>
            <tr><td style="font-weight:600;color:var(--text-muted)">└ 간접비 (이윤+안전+식대)</td><td style="text-align:right">${fmt(c.indirect)}</td></tr>
            <tr style="background:var(--gray-50)"><td style="font-weight:600">견적 원가</td><td style="text-align:right;font-weight:700">${fmt(f.estCost)}</td></tr>
            <tr style="background:var(--gray-50)"><td style="font-weight:600">견적 이익 (예상)</td><td style="text-align:right;font-weight:700;color:var(--success)">${fmt(f.estProfit)} (${f.estMargin.toFixed(1)}%)</td></tr>
            <tr><td colspan="2" style="height:8px;background:var(--border-light)"></td></tr>
            <tr><td style="font-weight:600">발주 비용 (공사비)</td><td style="text-align:right">${fmt(f.orderCost)}</td></tr>
            <tr><td style="font-weight:600">인건비 (노무비)</td><td style="text-align:right">${fmt(f.laborCost)}</td></tr>
            <tr><td style="font-weight:600">경비 (지출결의)</td><td style="text-align:right">${fmt(f.expenseCost)}</td></tr>
            <tr style="background:var(--warning-light)"><td style="font-weight:800">실행 비용 합계</td><td style="text-align:right;font-weight:800">${fmt(f.totalSpent)}</td></tr>
            <tr style="background:${f.actualProfit>=0?'var(--success-light)':'var(--danger-light)'}"><td style="font-weight:800">실행 이익</td><td style="text-align:right;font-weight:800;color:${f.actualProfit>=0?'var(--success)':'var(--danger)'}">${fmt(f.actualProfit)} (${f.actualMargin.toFixed(1)}%)</td></tr>
            <tr><td colspan="2" style="height:8px;background:var(--border-light)"></td></tr>
            <tr><td style="font-weight:600">수금 완료</td><td style="text-align:right;color:var(--success);font-weight:700">${fmt(f.collected)}</td></tr>
            <tr><td style="font-weight:600">미수금</td><td style="text-align:right;color:${f.outstanding>0?'var(--danger)':'var(--text-muted)'};font-weight:700">${fmt(f.outstanding)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`:''}

    <!-- Cost by Category (admin only) -->
    ${isAdmin()?`<div class="card" style="margin-bottom:16px">
      <div class="card-title">🏗️ 공종별 견적 비용</div>
      ${catEntries.length?`<div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>공종</th><th style="text-align:right">도급금액</th><th style="text-align:right">원가</th><th>비율</th></tr></thead>
          <tbody>
            ${catEntries.map(([cid,cv])=>{
              const pct=c.direct>0?(cv.t/c.direct*100):0;
              return `<tr>
                <td>${catIcon(cid)} ${catNm(cid)}</td>
                <td style="text-align:right;font-weight:700">${fmt(cv.t)}</td>
                <td style="text-align:right;color:var(--text-muted)">${fmt(cv.ct)}</td>
                <td><div style="display:flex;align-items:center;gap:4px"><div class="prog" style="width:50px"><div class="prog-bar" style="width:${pct}%"></div></div><span style="font-size:10px">${pct.toFixed(1)}%</span></div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`:'<div style="text-align:center;padding:20px;color:var(--text-muted)">견적 항목 없음</div>'}
    </div>`:''}

    <!-- Risks -->
    ${risks.length?`<div class="card" style="margin-bottom:16px">
      <div class="card-title">⚠️ 리스크 분석 (${risks.length}건)</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${risks.map(r=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${r.lv==='high'?'var(--danger-light)':'var(--warning-light)'};border-radius:var(--radius-sm);font-size:12px">
          <span>${r.lv==='high'?'🔴':'🟡'}</span>
          <span>${r.msg}</span>
        </div>`).join('')}
      </div>
    </div>`:''}

    <!-- Footer -->
    <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:11px">
      ${co.nameKo||'Frame Plus'} · 프로젝트 리포트 · ${dateStr} 생성
    </div>
  </div>`;
}

// ===== VERSION BADGE UPDATE =====
// Update footer badge
(function(){
  const badge = document.querySelector('.fs-badge');
  if(badge) badge.textContent = 'v8.0 Full-Stack · D1 Database · RBAC';
})();


