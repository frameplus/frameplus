import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = { DB: D1Database }
type App = { Bindings: Bindings }

const app = new Hono<App>()
app.use('/api/*', cors())

// ===== DB INIT =====
async function ensureTables(db: D1Database) {
  // Auto-create tables if not exists (for first run)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS company (id INTEGER PRIMARY KEY DEFAULT 1, name TEXT DEFAULT 'Frame Plus', name_ko TEXT DEFAULT '프레임플러스', addr TEXT DEFAULT '', email TEXT DEFAULT '', tel TEXT DEFAULT '', mobile TEXT DEFAULT '', biz_no TEXT DEFAULT '', ceo TEXT DEFAULT '김승환', specialty TEXT DEFAULT 'Office Specialist', website TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS team (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT '', dept TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, nm TEXT NOT NULL, client TEXT DEFAULT '', contact TEXT DEFAULT '', email TEXT DEFAULT '', loc TEXT DEFAULT '', mgr TEXT DEFAULT '', date TEXT DEFAULT '', status TEXT DEFAULT '작성중', area REAL DEFAULT 0, profit REAL DEFAULT 10, round_unit TEXT DEFAULT '십만원', manual_total REAL DEFAULT 0, target_amt REAL DEFAULT 0, memo TEXT DEFAULT '', region TEXT DEFAULT '', contract_status TEXT DEFAULT '미생성', contract_date TEXT DEFAULT '', contract_note TEXT DEFAULT '', contract_clauses TEXT DEFAULT '[]', payments TEXT DEFAULT '[]', gantt_tasks TEXT DEFAULT '[]', items TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS vendors (id TEXT PRIMARY KEY, nm TEXT NOT NULL, cid TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', addr TEXT DEFAULT '', memo TEXT DEFAULT '', rating INTEGER DEFAULT 3, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT DEFAULT '', time TEXT DEFAULT '', client TEXT DEFAULT '', contact TEXT DEFAULT '', loc TEXT DEFAULT '', status TEXT DEFAULT '예정', pid TEXT DEFAULT '', assignee TEXT DEFAULT '', memo TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS pricedb (id TEXT PRIMARY KEY, cid TEXT DEFAULT '', nm TEXT NOT NULL, spec TEXT DEFAULT '', unit TEXT DEFAULT 'm²', mp REAL DEFAULT 0, lp REAL DEFAULT 0, ep REAL DEFAULT 0, cmp REAL DEFAULT 0, clp REAL DEFAULT 0, cep REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS orders_manual (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', cid TEXT DEFAULT '', status TEXT DEFAULT '대기', order_date TEXT DEFAULT '', deliv_date TEXT DEFAULT '', vendor TEXT DEFAULT '', tax_invoice INTEGER DEFAULT 0, paid INTEGER DEFAULT 0, memo TEXT DEFAULT '', amount REAL DEFAULT 0, items TEXT DEFAULT '[]', assignee TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS as_list (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', date TEXT DEFAULT '', content TEXT DEFAULT '', priority TEXT DEFAULT '보통', assignee TEXT DEFAULT '', status TEXT DEFAULT '접수', done_date TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT DEFAULT '', pinned INTEGER DEFAULT 0, date TEXT DEFAULT '', read_by TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tax_invoices (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', date TEXT DEFAULT '', supply_amt REAL DEFAULT 0, tax_amt REAL DEFAULT 0, buyer_biz TEXT DEFAULT '', status TEXT DEFAULT '미발행', item TEXT DEFAULT '공사', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS msg_templates (id TEXT PRIMARY KEY, cat TEXT DEFAULT '', title TEXT NOT NULL, content TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `)
}

// ===== GENERIC CRUD HELPER =====
function crud<T>(tableName: string, idField = 'id') {
  const router = new Hono<App>()

  // GET all
  router.get('/', async (c) => {
    const db = c.env.DB
    const { results } = await db.prepare(`SELECT * FROM ${tableName} ORDER BY created_at DESC`).all()
    return c.json(results || [])
  })

  // GET by id
  router.get('/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const row = await db.prepare(`SELECT * FROM ${tableName} WHERE ${idField} = ?`).bind(id).first()
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })

  // POST create
  router.post('/', async (c) => {
    const db = c.env.DB
    const body = await c.req.json()
    const keys = Object.keys(body)
    const placeholders = keys.map(() => '?').join(',')
    const cols = keys.join(',')
    const vals = keys.map(k => body[k])
    await db.prepare(`INSERT OR REPLACE INTO ${tableName} (${cols}) VALUES (${placeholders})`).bind(...vals).run()
    return c.json({ success: true, id: body[idField] })
  })

  // PUT update
  router.put('/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json()
    const keys = Object.keys(body).filter(k => k !== idField)
    if (!keys.length) return c.json({ error: 'No fields to update' }, 400)
    const sets = keys.map(k => `${k} = ?`).join(', ')
    const vals = keys.map(k => body[k])
    vals.push(id)
    await db.prepare(`UPDATE ${tableName} SET ${sets} WHERE ${idField} = ?`).bind(...vals).run()
    return c.json({ success: true })
  })

  // DELETE
  router.delete('/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    await db.prepare(`DELETE FROM ${tableName} WHERE ${idField} = ?`).bind(id).run()
    return c.json({ success: true })
  })

  return router
}

// ===== MOUNT API ROUTES =====
app.route('/api/projects', crud('projects'))
app.route('/api/vendors', crud('vendors'))
app.route('/api/meetings', crud('meetings'))
app.route('/api/pricedb', crud('pricedb'))
app.route('/api/orders', crud('orders_manual'))
app.route('/api/as', crud('as_list'))
app.route('/api/notices', crud('notices'))
app.route('/api/tax', crud('tax_invoices'))
app.route('/api/templates', crud('msg_templates'))
app.route('/api/team', crud('team'))

// Company (singleton)
app.get('/api/company', async (c) => {
  const db = c.env.DB
  await ensureTables(db)
  let row = await db.prepare('SELECT * FROM company WHERE id = 1').first()
  if (!row) {
    await db.prepare(`INSERT INTO company (id) VALUES (1)`).run()
    row = await db.prepare('SELECT * FROM company WHERE id = 1').first()
  }
  return c.json(row)
})
app.put('/api/company', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const keys = Object.keys(body).filter(k => k !== 'id')
  if (!keys.length) return c.json({ error: 'No fields' }, 400)
  const sets = keys.map(k => `${k} = ?`).join(', ')
  const vals = keys.map(k => body[k])
  await db.prepare(`UPDATE company SET ${sets} WHERE id = 1`).bind(...vals).run()
  return c.json({ success: true })
})

// Bulk seed endpoint (for first-time init from frontend)
app.post('/api/init', async (c) => {
  const db = c.env.DB
  await ensureTables(db)
  // Check if already seeded
  const count = await db.prepare('SELECT COUNT(*) as cnt FROM projects').first<{ cnt: number }>()
  if (count && count.cnt > 0) return c.json({ status: 'already_initialized' })
  return c.json({ status: 'tables_ready' })
})

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', version: 'v5.0' }))

// ===== SERVE FRONTEND =====
app.get('/*', async (c) => {
  // For Cloudflare Pages, static files are served automatically from dist/
  // This catches all non-API routes and serves the SPA
  return c.html(getIndexHTML())
})

function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Frame Plus ERP v5</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@200;300;400;500;600;700;900&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏗️</text></svg>">
<style>
:root{
  --black:#0a0a0a;--dark:#1a1a1a;--charcoal:#2d2d2d;
  --g800:#333;--g700:#444;--g600:#555;--g500:#777;--g400:#999;--g300:#bbb;--g200:#ddd;--g150:#e8e8e8;--g100:#f0f0f0;--g50:#f7f8fa;
  --white:#fff;--bg:#f2f3f6;--card:#fff;--border:#e2e4e9;--border2:#d1d5db;
  --blue:#2563eb;--blue-l:#eff6ff;--green:#16a34a;--green-l:#f0fdf4;
  --red:#dc2626;--red-l:#fef2f2;--orange:#d97706;--orange-l:#fffbeb;
  --purple:#7c3aed;--purple-l:#f5f3ff;--teal:#0d9488;--teal-l:#f0fdfa;
  --serif:'Noto Serif KR',serif;--sans:'Noto Sans KR',sans-serif;
  --sw:240px;--swc:52px;--hdr:52px;
  --radius:8px;--radius-lg:12px;--shadow:0 1px 4px rgba(0,0,0,.08);--shadow-md:0 4px 16px rgba(0,0,0,.12);
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--sans);background:var(--bg);color:var(--dark);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
button{cursor:pointer;font-family:var(--sans)}
input,select,textarea{font-family:var(--sans);font-size:13px}
a{text-decoration:none;color:inherit}
#app{display:flex;height:100vh;overflow:hidden}
#sidebar{width:var(--sw);min-width:var(--sw);background:var(--black);display:flex;flex-direction:column;transition:width .25s,min-width .25s;overflow:hidden;position:relative;z-index:100}
#sidebar.collapsed{width:var(--swc);min-width:var(--swc)}
.sb-header{height:var(--hdr);display:flex;align-items:center;padding:0 14px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}
.sb-logo{color:#fff;font-family:var(--serif);font-size:15px;font-weight:700;letter-spacing:.05em;white-space:nowrap;opacity:1;transition:opacity .2s}
.collapsed .sb-logo{opacity:0;width:0}
.sb-toggle{margin-left:auto;width:24px;height:24px;border:none;background:none;color:rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;border-radius:4px;transition:color .2s;flex-shrink:0}
.sb-toggle:hover{color:#fff}
.collapsed .sb-toggle{margin-left:0}
.sb-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0}
.sb-nav::-webkit-scrollbar{width:3px}
.sb-nav::-webkit-scrollbar-track{background:transparent}
.sb-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}
.sb-section{padding:16px 0 4px}
.sb-section-label{font-size:9px;font-weight:600;letter-spacing:.12em;color:rgba(255,255,255,.25);text-transform:uppercase;padding:0 16px 6px;white-space:nowrap;overflow:hidden;transition:opacity .2s}
.collapsed .sb-section-label{opacity:0}
.sb-item{display:flex;align-items:center;gap:10px;padding:7px 14px;cursor:pointer;border-left:2px solid transparent;transition:all .15s;color:rgba(255,255,255,.55);font-size:12.5px;white-space:nowrap;position:relative}
.sb-item:hover{background:rgba(255,255,255,.05);color:rgba(255,255,255,.85)}
.sb-item.active{background:rgba(255,255,255,.08);color:#fff;border-left-color:#fff}
.sb-icon{width:16px;height:16px;flex-shrink:0;opacity:.7;transition:opacity .2s}
.sb-item.active .sb-icon,.sb-item:hover .sb-icon{opacity:1}
.sb-label{flex:1;overflow:hidden;transition:opacity .2s,width .2s;font-size:12.5px}
.collapsed .sb-label{opacity:0;width:0}
.sb-badge{background:var(--red);color:#fff;font-size:9px;font-weight:700;border-radius:10px;padding:1px 5px;line-height:1.4;flex-shrink:0}
.collapsed .sb-badge{display:none}
#main{flex:1;display:flex;flex-direction:column;overflow:hidden}
#topbar{height:var(--hdr);background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0}
.topbar-title{font-family:var(--serif);font-size:15px;font-weight:600;color:var(--dark)}
.topbar-sub{font-size:11px;color:var(--g500);margin-left:4px}
.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
#content{flex:1;overflow-y:auto;overflow-x:hidden;padding:20px}
#content::-webkit-scrollbar{width:6px}
#content::-webkit-scrollbar-track{background:transparent}
#content::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--radius);border:none;font-size:12.5px;font-weight:500;transition:all .15s;cursor:pointer;white-space:nowrap}
.btn-sm{padding:5px 10px;font-size:11.5px}
.btn-lg{padding:9px 18px;font-size:13.5px}
.btn-primary{background:var(--dark);color:#fff}.btn-primary:hover{background:var(--charcoal)}
.btn-blue{background:var(--blue);color:#fff}.btn-blue:hover{background:#1d4ed8}
.btn-green{background:var(--green);color:#fff}.btn-green:hover{background:#15803d}
.btn-red{background:var(--red);color:#fff}.btn-red:hover{background:#b91c1c}
.btn-outline{background:#fff;border:1px solid var(--border2);color:var(--g700)}.btn-outline:hover{border-color:var(--g400);background:var(--g50)}
.btn-ghost{background:transparent;color:var(--g600)}.btn-ghost:hover{background:var(--g100)}
.btn-icon{width:30px;height:30px;padding:0;justify-content:center;border-radius:6px}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px}
.card-title{font-size:13px;font-weight:600;color:var(--dark);margin-bottom:12px}
.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;display:flex;flex-direction:column;gap:4px}
.kpi-label{font-size:11px;color:var(--g500);font-weight:500}
.kpi-value{font-size:22px;font-weight:700;line-height:1.2}
.kpi-sub{font-size:11px;color:var(--g500)}
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.tbl th{background:var(--g50);color:var(--g600);font-weight:600;font-size:11px;padding:9px 12px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap;cursor:pointer;user-select:none}
.tbl th:hover{color:var(--dark)}
.tbl td{padding:9px 12px;border-bottom:1px solid var(--border);color:var(--dark);vertical-align:middle}
.tbl tr:hover td{background:#fafbfc}
.tbl tr:last-child td{border-bottom:none}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
.badge-blue{background:var(--blue-l);color:var(--blue)}
.badge-green{background:var(--green-l);color:var(--green)}
.badge-red{background:var(--red-l);color:var(--red)}
.badge-orange{background:var(--orange-l);color:var(--orange)}
.badge-purple{background:var(--purple-l);color:var(--purple)}
.badge-gray{background:var(--g100);color:var(--g600)}
.inp{width:100%;padding:8px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;color:var(--dark);background:#fff;transition:border-color .15s}
.inp:focus{outline:none;border-color:var(--blue)}
.inp-sm{padding:5px 8px;font-size:12px}
.sel{width:100%;padding:8px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;color:var(--dark);background:#fff;cursor:pointer}
.sel:focus{outline:none;border-color:var(--blue)}
.lbl{display:block;font-size:11.5px;font-weight:600;color:var(--g600);margin-bottom:4px}
.form-row{display:grid;gap:12px}
.form-row-2{grid-template-columns:1fr 1fr}
.form-row-3{grid-template-columns:1fr 1fr 1fr}
.form-row-4{grid-template-columns:1fr 1fr 1fr 1fr}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:none;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:#fff;border-radius:var(--radius-lg);width:min(700px,92vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden}
.modal-lg{width:min(900px,92vw)}
.modal-xl{width:min(1100px,95vw)}
.modal-sm{width:min(460px,92vw)}
.modal-hdr{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.modal-title{font-size:15px;font-weight:700;color:var(--dark)}
.modal-close{width:28px;height:28px;border:none;background:none;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--g500);cursor:pointer}
.modal-close:hover{background:var(--g100);color:var(--dark)}
.modal-body{padding:20px;overflow-y:auto;flex:1}
.modal-footer{padding:14px 20px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0}
#toast-area{position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{background:var(--dark);color:#fff;padding:10px 16px;border-radius:var(--radius);font-size:12.5px;font-weight:500;box-shadow:var(--shadow-md);max-width:320px;animation:slideIn .3s ease}
.toast-success{background:var(--green)}
.toast-error{background:var(--red)}
.toast-warning{background:var(--orange)}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
.prog{height:6px;background:var(--g100);border-radius:3px;overflow:hidden}
.prog-bar{height:100%;border-radius:3px;transition:width .3s}
.prog-blue .prog-bar{background:var(--blue)}
.prog-green .prog-bar{background:var(--green)}
.prog-orange .prog-bar{background:var(--orange)}
.prog-red .prog-bar{background:var(--red)}
.tab-list{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:16px}
.tab-btn{padding:9px 16px;border:none;background:none;font-size:12.5px;font-weight:500;color:var(--g500);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.tab-btn.active{color:var(--dark);border-bottom-color:var(--dark)}
.tab-btn:hover:not(.active){color:var(--dark);background:var(--g50)}
.tab-pane{display:none}.tab-pane.active{display:block}
.filter-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.filter-search{position:relative;flex:1;min-width:180px;max-width:280px}
.filter-search input{padding-left:30px}
.filter-search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--g400)}
.dash-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.dash-grid-3{grid-template-columns:repeat(3,1fr)}
.dash-grid-2{grid-template-columns:repeat(2,1fr)}
.dash-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.dash-3col{display:grid;grid-template-columns:2fr 1fr;gap:14px}
.est-section{background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:10px;overflow:hidden}
.est-sec-hdr{padding:12px 16px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;background:#fff}
.est-sec-hdr:hover{background:var(--g50)}
.est-sec-icon{font-size:16px}
.est-sec-title{font-size:13px;font-weight:600;flex:1}
.est-sec-count{font-size:11px;color:var(--g500);background:var(--g100);padding:1px 7px;border-radius:10px}
.est-sec-total{font-size:13px;font-weight:700;color:var(--dark);min-width:90px;text-align:right}
.est-sec-toggle{color:var(--g400);transition:transform .2s}
.est-sec-toggle.open{transform:rotate(180deg)}
.est-sec-body{display:none;border-top:1px solid var(--border)}
.est-sec-body.open{display:block}
.est-tbl{width:100%;border-collapse:collapse;font-size:12px}
.est-tbl th{background:var(--g50);color:var(--g500);font-size:10.5px;font-weight:600;padding:7px 10px;border-bottom:1px solid var(--border);text-align:right}
.est-tbl th:first-child,.est-tbl th:nth-child(2),.est-tbl th:nth-child(3),.est-tbl th:nth-child(4){text-align:left}
.est-tbl td{padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
.est-tbl tr:last-child td{border-bottom:none}
.est-tbl .inp{padding:4px 7px;font-size:12px}
.est-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.est-add-btn{display:flex;align-items:center;gap:6px;padding:8px 16px;color:var(--g500);font-size:12px;cursor:pointer;border:none;background:none;width:100%}
.est-add-btn:hover{color:var(--blue);background:var(--blue-l)}
.est-summary{background:var(--dark);border-radius:var(--radius-lg);overflow:hidden;margin-top:8px}
.est-sum-row{display:flex;align-items:center;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,.08)}
.est-sum-row:last-child{border-bottom:none}
.est-sum-label{color:rgba(255,255,255,.6);font-size:13px;flex:1}
.est-sum-value{color:#fff;font-size:13px;font-weight:600;min-width:120px;text-align:right}
.est-sum-total{background:rgba(255,255,255,.05)}
.est-sum-total .est-sum-label{color:#fff;font-weight:700;font-size:14px}
.est-sum-total .est-sum-value{font-size:16px;font-weight:800}
.gantt-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-lg)}
.order-detail-wrap{display:grid;grid-template-columns:1fr 260px;gap:16px}
.order-right{display:flex;flex-direction:column;gap:10px}
.order-amt-card{background:var(--dark);color:#fff;border-radius:var(--radius-lg);padding:20px;text-align:center}
.order-amt-label{font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px}
.order-amt-value{font-size:28px;font-weight:800}
.contract-doc{background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);padding:32px;font-family:var(--serif);line-height:2;position:relative}
.contract-doc h2{font-size:20px;font-weight:700;text-align:center;margin-bottom:24px;letter-spacing:.1em}
.contract-doc h3{font-size:14px;font-weight:700;margin:20px 0 8px;border-bottom:1px solid var(--border);padding-bottom:6px}
.contract-clause{margin-bottom:12px;font-size:13px}
.contract-editable{border:none;background:transparent;border-bottom:1px solid transparent;padding:2px 4px;cursor:text;min-width:60px;font-family:inherit;font-size:inherit;color:inherit}
.contract-editable:hover{border-bottom-color:var(--border2)}
.contract-editable:focus{outline:none;border-bottom-color:var(--blue);background:var(--blue-l)}
.cal-wrap{background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
.cal-hdr{padding:16px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
.cal-title{font-size:16px;font-weight:700;flex:1}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.cal-day-hdr{padding:8px;text-align:center;font-size:11px;font-weight:600;color:var(--g500);background:var(--g50);border-bottom:1px solid var(--border)}
.cal-day-hdr:first-child{color:var(--red)}
.cal-day-hdr:last-child{color:var(--blue)}
.cal-cell{min-height:80px;padding:6px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);vertical-align:top;cursor:pointer}
.cal-cell:hover{background:var(--g50)}
.cal-cell:nth-child(7n){border-right:none}
.cal-date{font-size:12px;font-weight:600;color:var(--g700);margin-bottom:4px}
.cal-date.today{background:var(--dark);color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.cal-event{background:var(--blue-l);color:var(--blue);font-size:10px;padding:2px 5px;border-radius:3px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-page{background:#fff;max-width:860px;margin:0 auto 32px;box-shadow:var(--shadow-md);font-family:var(--serif)}
.pv-cover{min-height:100vh;background:var(--black);color:#fff;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.pv-cover::before{content:'';position:absolute;top:0;right:80px;width:1px;height:100%;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.06) 20%,rgba(255,255,255,.06) 80%,transparent)}
.pv-end{min-height:100vh;background:var(--black);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
.pv-end-circle{width:160px;height:160px;border-radius:50%;border:1px solid rgba(255,255,255,.25);display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:32px}
.pv-ep{padding:48px 60px;font-family:var(--serif)}
.pv-ep-logo{font-size:13px;font-weight:300;letter-spacing:.3em;color:var(--g500);text-transform:uppercase}
.pv-ep-title{font-size:22px;font-weight:700;letter-spacing:.12em;text-align:center;margin:24px 0 20px;padding:14px;border-top:2px solid var(--black);border-bottom:1px solid var(--g300)}
.pv-info-tbl{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}
.pv-info-tbl td{padding:7px 10px;border:1px solid var(--g200)}
.pv-info-tbl td:first-child{background:var(--g50);font-weight:600;width:100px}
.pv-stbl{width:100%;border-collapse:collapse;font-size:12px}
.pv-stbl th{background:var(--black);color:#fff;padding:9px 10px;border:1px solid var(--g800);font-size:11px;font-weight:600;text-align:right}
.pv-stbl th:first-child,.pv-stbl th:nth-child(2){text-align:left}
.pv-stbl td{padding:7px 10px;border:1px solid var(--g200);text-align:right}
.pv-stbl td:first-child,.pv-stbl td:nth-child(2){text-align:left}
.pv-stbl tr.zero td{color:var(--g300)}
.pv-stbl tr.subtotal td{background:var(--g50);font-weight:600}
.pv-stbl tr.total td{background:var(--g100);font-weight:700;font-size:13px}
.pv-dtbl{width:100%;border-collapse:collapse;font-size:11.5px}
.pv-dtbl th{background:var(--black);color:#fff;padding:7px 8px;border:1px solid var(--g800);font-size:10.5px;font-weight:600;text-align:center}
.pv-dtbl td{padding:6px 8px;border:1px solid var(--g200);vertical-align:middle;text-align:right}
.pv-dtbl td.tl{text-align:left}
.pv-dtbl tr.cat-hdr td{background:var(--dark);color:#fff;font-weight:700;font-size:12px;padding:9px 10px;text-align:left}
.pv-dtbl tr.sub-row td{background:var(--g50);font-weight:600;font-size:11px}
.pv-dtbl tr.total-row td{background:var(--g100);font-weight:700}
.pv-dtbl tr.indirect td{background:var(--g50)}
.pv-dtbl tr.grand-total td{background:var(--dark);color:#fff;font-weight:700;font-size:12px}
.pv-dtbl tr.adj-row td{background:var(--g50);color:var(--g600)}
.pv-dtbl tr.final-row td{background:var(--black);color:#fff;font-weight:800;font-size:13px}
.chart-wrap{position:relative;height:240px}
/* ===== MOBILE BOTTOM NAV ===== */
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--card);border-top:1px solid var(--border);z-index:200;padding:4px 0 env(safe-area-inset-bottom,0)}
.mobile-nav-inner{display:flex;justify-content:space-around;align-items:center}
.mobile-nav-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--g500);font-size:10px;transition:color .15s}
.mobile-nav-item.active{color:var(--blue)}
.mobile-nav-item svg{width:20px;height:20px}
/* ===== MOBILE OVERLAY ===== */
.mobile-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99}
.mobile-overlay.open{display:block}
/* ===== PRINT ===== */
@media print{
  #sidebar,#topbar,.topbar-actions,.btn,#toast-area,.modal-bg,.filter-bar,.tab-list,.mobile-nav{display:none!important}
  #main{height:auto;overflow:visible}
  #content{overflow:visible;padding:0}
  .pv-page{box-shadow:none;margin:0}
  .pv-cover,.pv-end{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pv-ep{page-break-before:always}
}
/* ===== RESPONSIVE ===== */
@media(max-width:1024px){
  .dash-grid{grid-template-columns:repeat(2,1fr)}
  .dash-3col,.dash-2col{grid-template-columns:1fr}
  .form-row-4{grid-template-columns:1fr 1fr}
  .form-row-3{grid-template-columns:1fr 1fr}
  .order-detail-wrap{grid-template-columns:1fr}
}
@media(max-width:768px){
  #sidebar{position:fixed;left:-260px;top:0;bottom:0;width:260px;min-width:260px;transition:left .3s;z-index:200}
  #sidebar.mobile-open{left:0}
  #sidebar.collapsed{width:260px;min-width:260px;left:-260px}
  #sidebar.collapsed.mobile-open{left:0}
  .collapsed .sb-logo,.collapsed .sb-label,.collapsed .sb-section-label,.collapsed .sb-badge{opacity:1;width:auto}
  #topbar{padding:0 12px}
  .topbar-title{font-size:13px}
  .topbar-actions .btn-sm{padding:4px 8px;font-size:10px}
  .topbar-actions .btn-sm svg{display:none}
  #content{padding:12px;padding-bottom:70px}
  .mobile-nav{display:block}
  .dash-grid{grid-template-columns:1fr 1fr}
  .dash-3col,.dash-2col{grid-template-columns:1fr}
  .form-row-2,.form-row-3,.form-row-4{grid-template-columns:1fr}
  .cal-cell{min-height:50px;padding:3px}
  .cal-event{font-size:8px;padding:1px 3px}
  .modal{width:96vw;max-height:92vh}
  .modal-lg,.modal-xl{width:96vw}
  .kpi-value{font-size:18px}
  .btn-hamburger{display:flex!important}
  .order-detail-wrap{grid-template-columns:1fr}
}
@media(max-width:480px){
  .dash-grid{grid-template-columns:1fr}
  .cal-cell{min-height:40px}
}
.btn-hamburger{display:none;width:32px;height:32px;border:none;background:none;color:var(--dark);align-items:center;justify-content:center;border-radius:6px;cursor:pointer;flex-shrink:0;margin-right:4px}
.btn-hamburger:hover{background:var(--g100)}
/* Loading spinner */
.loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--g400)}
.loading::after{content:'';width:24px;height:24px;border:2px solid var(--g200);border-top-color:var(--blue);border-radius:50%;animation:spin .6s linear infinite;margin-left:8px}
@keyframes spin{to{transform:rotate(360deg)}}
/* Fullstack badge */
.fs-badge{position:fixed;bottom:70px;right:16px;background:var(--dark);color:#fff;font-size:10px;padding:4px 10px;border-radius:20px;z-index:50;opacity:.6}
@media(min-width:769px){.fs-badge{bottom:16px}}
</style>
</head>
<body>
<div id="app">
<div class="mobile-overlay" id="mobile-overlay" onclick="closeMobileMenu()"></div>
<nav id="sidebar">
  <div class="sb-header">
    <span class="sb-logo">Frame Plus</span>
    <button class="sb-toggle" onclick="toggleSidebar()" title="메뉴 접기">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
  </div>
  <div class="sb-nav" id="sb-nav"></div>
</nav>
<div id="main">
  <div id="topbar">
    <button class="btn-hamburger" onclick="openMobileMenu()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="topbar-title" id="tb-title">대시보드</div>
    <span class="topbar-sub" id="tb-sub"></span>
    <div class="topbar-actions" id="tb-actions"></div>
  </div>
  <div id="content"><div class="loading">로딩중</div></div>
</div>
</div>
<div id="toast-area"></div>
<div id="modal-area"></div>
<!-- Mobile Bottom Nav -->
<div class="mobile-nav">
  <div class="mobile-nav-inner">
    <button class="mobile-nav-item" onclick="nav('dash')" id="mnav-dash">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      홈
    </button>
    <button class="mobile-nav-item" onclick="nav('projects')" id="mnav-projects">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
      프로젝트
    </button>
    <button class="mobile-nav-item" onclick="nav('estimate')" id="mnav-estimate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      견적
    </button>
    <button class="mobile-nav-item" onclick="nav('meetings')" id="mnav-meetings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      미팅
    </button>
    <button class="mobile-nav-item" onclick="openMobileMenu()" id="mnav-more">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      더보기
    </button>
  </div>
</div>
<div class="fs-badge">v5 Full-Stack · D1 Database</div>
<script src="/static/app.js"></script>
</body>
</html>`
}

export default app
