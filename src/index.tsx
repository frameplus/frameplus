import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = { DB: D1Database; RESEND_API_KEY: string; OPENWEATHER_API_KEY: string; OPENAI_API_KEY: string; NOTION_TOKEN: string; SOLAPI_API_KEY: string; SOLAPI_API_SECRET: string; SOLAPI_SENDER_PHONE: string; KAKAO_PF_ID: string }
type App = { Bindings: Bindings }

const app = new Hono<App>()
app.use('/api/*', cors())

// Ensure all tables exist on every API request (auto-migrate)
let _tablesReady = false
app.use('/api/*', async (c, next) => {
  if (!_tablesReady) {
    await ensureTables(c.env.DB)
    _tablesReady = true
  }
  await next()
})

// ===== AUTH MIDDLEWARE — protect all API routes except auth endpoints =====
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/logout', '/api/health', '/api/init', '/api/inquiry']
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (PUBLIC_PATHS.some(p => path === p)) return next()
  const sid = c.req.header('X-Session-Id') || ''
  if (!sid) return c.json({ error: 'Unauthorized' }, 401)
  const sess = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').bind(sid, new Date().toISOString()).first()
  if (!sess) return c.json({ error: 'Session expired' }, 401)
  await next()
})

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
    CREATE TABLE IF NOT EXISTS tax_invoices (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', date TEXT DEFAULT '', supply_amt REAL DEFAULT 0, tax_amt REAL DEFAULT 0, buyer_biz TEXT DEFAULT '', status TEXT DEFAULT '미발행', item TEXT DEFAULT '공사', type TEXT DEFAULT '매출', memo TEXT DEFAULT '', vendor_nm TEXT DEFAULT '', vendor_biz TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS msg_templates (id TEXT PRIMARY KEY, cat TEXT DEFAULT '', title TEXT NOT NULL, content TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS labor_costs (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', date TEXT DEFAULT '', worker_name TEXT DEFAULT '', worker_type TEXT DEFAULT '', daily_rate REAL DEFAULT 0, days REAL DEFAULT 0, total REAL DEFAULT 0, meal_cost REAL DEFAULT 0, transport_cost REAL DEFAULT 0, overtime_cost REAL DEFAULT 0, deduction REAL DEFAULT 0, net_amount REAL DEFAULT 0, paid INTEGER DEFAULT 0, paid_date TEXT DEFAULT '', payment_method TEXT DEFAULT '', memo TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', date TEXT DEFAULT '', category TEXT DEFAULT '', title TEXT NOT NULL, amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, vendor TEXT DEFAULT '', payment_method TEXT DEFAULT '', receipt_type TEXT DEFAULT '', receipt_no TEXT DEFAULT '', receipt_image TEXT DEFAULT '', requester TEXT DEFAULT '', approver TEXT DEFAULT '', status TEXT DEFAULT '대기', approved_date TEXT DEFAULT '', reject_reason TEXT DEFAULT '', memo TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS item_images (id TEXT PRIMARY KEY, item_id TEXT DEFAULT '', pid TEXT DEFAULT '', image_data TEXT DEFAULT '', file_name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS work_presets (id TEXT PRIMARY KEY, cid TEXT DEFAULT '', name TEXT NOT NULL, items TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, type TEXT DEFAULT 'info', title TEXT NOT NULL, message TEXT DEFAULT '', from_user TEXT DEFAULT '', to_user TEXT DEFAULT '', related_type TEXT DEFAULT '', related_id TEXT DEFAULT '', status TEXT DEFAULT 'unread', priority TEXT DEFAULT 'normal', action_url TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, read_at DATETIME DEFAULT NULL);
    CREATE TABLE IF NOT EXISTS pricedb_history (id TEXT PRIMARY KEY, price_id TEXT DEFAULT '', pid TEXT DEFAULT '', used_date TEXT DEFAULT '', qty REAL DEFAULT 0, unit_price REAL DEFAULT 0, mp REAL DEFAULT 0, lp REAL DEFAULT 0, ep REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS estimate_template_sets (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT '', tags TEXT DEFAULT '[]', items TEXT DEFAULT '[]', usage_count INTEGER DEFAULT 0, last_used_at DATETIME DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, type TEXT DEFAULT '', related_id TEXT DEFAULT '', title TEXT DEFAULT '', amount REAL DEFAULT 0, requester TEXT DEFAULT '', approver TEXT DEFAULT '', status TEXT DEFAULT '대기', request_date TEXT DEFAULT '', approve_date TEXT DEFAULT '', reject_reason TEXT DEFAULT '', memo TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS user_prefs (id TEXT PRIMARY KEY, dark_mode INTEGER DEFAULT 0, sidebar_collapsed INTEGER DEFAULT 0, default_view TEXT DEFAULT 'dash', notification_enabled INTEGER DEFAULT 1, language TEXT DEFAULT 'ko', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS consultations (id TEXT PRIMARY KEY, client_name TEXT DEFAULT '', client_contact TEXT DEFAULT '', client_email TEXT DEFAULT '', client_phone TEXT DEFAULT '', source TEXT DEFAULT '', project_type TEXT DEFAULT '', area REAL DEFAULT 0, budget TEXT DEFAULT '', location TEXT DEFAULT '', date TEXT DEFAULT '', time TEXT DEFAULT '', assignee TEXT DEFAULT '', status TEXT DEFAULT '신규', notes TEXT DEFAULT '', next_action TEXT DEFAULT '', next_date TEXT DEFAULT '', priority TEXT DEFAULT '보통', tags TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS rfp (id TEXT PRIMARY KEY, title TEXT NOT NULL, client_name TEXT DEFAULT '', client_contact TEXT DEFAULT '', deadline TEXT DEFAULT '', budget_min REAL DEFAULT 0, budget_max REAL DEFAULT 0, area REAL DEFAULT 0, location TEXT DEFAULT '', project_type TEXT DEFAULT '', requirements TEXT DEFAULT '', status TEXT DEFAULT '접수', assignee TEXT DEFAULT '', submitted_date TEXT DEFAULT '', result TEXT DEFAULT '', notes TEXT DEFAULT '', attachments TEXT DEFAULT '[]', priority TEXT DEFAULT '보통', win_probability REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT DEFAULT '', role TEXT DEFAULT 'staff', email TEXT DEFAULT '', phone TEXT DEFAULT '', active INTEGER DEFAULT 1, last_login DATETIME DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT DEFAULT 'staff', expires_at DATETIME NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', company TEXT DEFAULT '', address TEXT DEFAULT '', biz_no TEXT DEFAULT '', source TEXT DEFAULT '', grade TEXT DEFAULT 'B', tags TEXT DEFAULT '[]', memo TEXT DEFAULT '', total_amount REAL DEFAULT 0, project_count INTEGER DEFAULT 0, last_project_date TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS erp_attachments (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', folder TEXT DEFAULT '기타', file_name TEXT NOT NULL, file_type TEXT DEFAULT '', file_size INTEGER DEFAULT 0, file_data TEXT DEFAULT '', uploader TEXT DEFAULT '', memo TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT DEFAULT '', manager TEXT DEFAULT '', contract_date TEXT DEFAULT '', end_date TEXT DEFAULT '', settlement_date TEXT DEFAULT '', supplier_name TEXT DEFAULT '프레임플러스', supplier_reg TEXT DEFAULT '', supplier_ceo TEXT DEFAULT '', contract_amt REAL DEFAULT 0, year_month TEXT DEFAULT '', status TEXT DEFAULT 'estimate', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_labor_costs (id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', date TEXT DEFAULT '', work_type TEXT DEFAULT '', job TEXT DEFAULT '', days REAL DEFAULT 1, daily_rate REAL DEFAULT 0, workers REAL DEFAULT 1, surcharge REAL DEFAULT 0, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_material_costs (id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', date TEXT DEFAULT '', category TEXT DEFAULT '', name TEXT DEFAULT '', vendor TEXT DEFAULT '', qty REAL DEFAULT 1, unit TEXT DEFAULT '식', price REAL DEFAULT 0, vat_override REAL DEFAULT -1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_sub_costs (id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', date TEXT DEFAULT '', work_type TEXT DEFAULT '', content TEXT DEFAULT '', contractor TEXT DEFAULT '', contract_no TEXT DEFAULT '', amount REAL DEFAULT 0, vat_override REAL DEFAULT -1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_expense_costs (id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', date TEXT DEFAULT '', category TEXT DEFAULT '', name TEXT DEFAULT '', qty REAL DEFAULT 1, unit TEXT DEFAULT '식', price REAL DEFAULT 0, vat_override REAL DEFAULT -1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_transport_costs (id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', date TEXT DEFAULT '', origin TEXT DEFAULT '', destination TEXT DEFAULT '', item TEXT DEFAULT '', qty REAL DEFAULT 1, unit TEXT DEFAULT '회', price REAL DEFAULT 0, vat_override REAL DEFAULT -1, vehicle TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS stl_payments (id TEXT PRIMARY KEY, project_id TEXT DEFAULT '', date TEXT DEFAULT '', description TEXT DEFAULT '', amount REAL DEFAULT 0, method TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS leave_requests (id TEXT PRIMARY KEY, user_id TEXT DEFAULT '', user_name TEXT DEFAULT '', leave_type TEXT DEFAULT '연차', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', days REAL DEFAULT 1, reason TEXT DEFAULT '', status TEXT DEFAULT '작성중', reviewer TEXT DEFAULT '', reviewer_name TEXT DEFAULT '', reviewed_at TEXT DEFAULT '', reviewer_memo TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS leave_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '일반휴가', default_days REAL DEFAULT 1, consumes_annual INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS design_items (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', view_type TEXT DEFAULT 'concept', title TEXT NOT NULL, category TEXT DEFAULT '', description TEXT DEFAULT '', image_data TEXT DEFAULT '', file_name TEXT DEFAULT '', status TEXT DEFAULT '진행중', tags TEXT DEFAULT '[]', assignee TEXT DEFAULT '', due_date TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, meta TEXT DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS site_photos (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', category TEXT DEFAULT '일반', title TEXT DEFAULT '', description TEXT DEFAULT '', image_data TEXT DEFAULT '', file_name TEXT DEFAULT '', taken_date TEXT DEFAULT '', taken_by TEXT DEFAULT '', location TEXT DEFAULT '', tags TEXT DEFAULT '[]', phase TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS site_daily_logs (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', log_date TEXT DEFAULT '', weather TEXT DEFAULT '맑음', temperature TEXT DEFAULT '', summary TEXT DEFAULT '', work_details TEXT DEFAULT '[]', workers_count INTEGER DEFAULT 0, workers_detail TEXT DEFAULT '[]', equipment TEXT DEFAULT '[]', issues TEXT DEFAULT '', safety_check INTEGER DEFAULT 1, inspector TEXT DEFAULT '', progress_pct REAL DEFAULT 0, notes TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS site_issues (id TEXT PRIMARY KEY, pid TEXT DEFAULT '', title TEXT NOT NULL, category TEXT DEFAULT '품질', severity TEXT DEFAULT '보통', status TEXT DEFAULT '발생', description TEXT DEFAULT '', location TEXT DEFAULT '', reported_by TEXT DEFAULT '', reported_date TEXT DEFAULT '', assigned_to TEXT DEFAULT '', due_date TEXT DEFAULT '', resolved_date TEXT DEFAULT '', resolution TEXT DEFAULT '', photos TEXT DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `)
  // Auto-migrate: add missing columns to existing tables
  const alterStmts = [
    "ALTER TABLE tax_invoices ADD COLUMN type TEXT DEFAULT '매출'",
    "ALTER TABLE tax_invoices ADD COLUMN memo TEXT DEFAULT ''",
    "ALTER TABLE tax_invoices ADD COLUMN vendor_nm TEXT DEFAULT ''",
    "ALTER TABLE tax_invoices ADD COLUMN vendor_biz TEXT DEFAULT ''",
    // Notion-aligned: projects 보강
    "ALTER TABLE projects ADD COLUMN scope_tags TEXT DEFAULT '[]'",
    "ALTER TABLE projects ADD COLUMN project_type TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN construction_status TEXT DEFAULT ''",
    // Notion-aligned: vendors 보강
    "ALTER TABLE vendors ADD COLUMN category TEXT DEFAULT ''",
    "ALTER TABLE vendors ADD COLUMN bank_info TEXT DEFAULT ''",
    "ALTER TABLE vendors ADD COLUMN trade_amount REAL DEFAULT 0",
    // Notion-aligned: users 보강
    "ALTER TABLE users ADD COLUMN position TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN hire_date TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN dept TEXT DEFAULT ''",
    // Notion-aligned: expenses 보강
    "ALTER TABLE expenses ADD COLUMN payment_due TEXT DEFAULT ''",
    "ALTER TABLE expenses ADD COLUMN vendor_id TEXT DEFAULT ''",
    "ALTER TABLE expenses ADD COLUMN amount_vat REAL DEFAULT 0",
    "ALTER TABLE expenses ADD COLUMN has_invoice INTEGER DEFAULT 0",
    // Notion-aligned: consultations 보강
    "ALTER TABLE consultations ADD COLUMN privacy_agreed INTEGER DEFAULT 0",
    "ALTER TABLE consultations ADD COLUMN marketing_agreed INTEGER DEFAULT 0",
    "ALTER TABLE consultations ADD COLUMN area_text TEXT DEFAULT ''",
    // P2: consultations 파이프라인 단계
    "ALTER TABLE consultations ADD COLUMN pipeline_stage TEXT DEFAULT '초기상담'",
    "ALTER TABLE consultations ADD COLUMN expected_amount REAL DEFAULT 0",
    "ALTER TABLE consultations ADD COLUMN expected_close_date TEXT DEFAULT ''",
    "ALTER TABLE consultations ADD COLUMN lost_reason TEXT DEFAULT ''",
    // P2: RFP 강화 — 평가점수·팀배정·경쟁사
    "ALTER TABLE rfp ADD COLUMN evaluation_score REAL DEFAULT 0",
    "ALTER TABLE rfp ADD COLUMN team_members TEXT DEFAULT '[]'",
    "ALTER TABLE rfp ADD COLUMN competitors TEXT DEFAULT '[]'",
    "ALTER TABLE rfp ADD COLUMN presentation_date TEXT DEFAULT ''",
    "ALTER TABLE rfp ADD COLUMN go_nogo TEXT DEFAULT ''",
    // v8.6 P5 단계1: 정산관리 → ERP 본체 통합용 컬럼 확장
    "ALTER TABLE labor_costs ADD COLUMN work_type TEXT DEFAULT ''",
    "ALTER TABLE labor_costs ADD COLUMN job TEXT DEFAULT ''",
    "ALTER TABLE labor_costs ADD COLUMN surcharge REAL DEFAULT 0",
    "ALTER TABLE orders_manual ADD COLUMN cost_type TEXT DEFAULT 'order'",
    "ALTER TABLE expenses ADD COLUMN is_transport INTEGER DEFAULT 0",
    "ALTER TABLE expenses ADD COLUMN origin TEXT DEFAULT ''",
    "ALTER TABLE expenses ADD COLUMN destination TEXT DEFAULT ''",
    "ALTER TABLE expenses ADD COLUMN vehicle TEXT DEFAULT ''",
    "ALTER TABLE projects ADD COLUMN settlement_meta TEXT DEFAULT '{}'",
  ]
  for (const stmt of alterStmts) {
    try { await db.prepare(stmt).run() } catch(e) { /* column already exists */ }
  }
  // Seed default admin if no users
  try {
    const cnt = await db.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>()
    if (!cnt || cnt.cnt === 0) {
      await db.prepare('INSERT OR IGNORE INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)').bind('admin-default', 'admin', 'admin1234', '관리자', 'admin').run()
    }
  } catch(e) { /* ignore first-run */ }
}

// ===== GENERIC CRUD HELPER =====
function crud<T>(tableName: string, idField = 'id') {
  const router = new Hono<App>()

  // GET all (supports ?limit=&offset=&q=&order_by=&order_dir=)
  router.get('/', async (c) => {
    const db = c.env.DB
    const url = new URL(c.req.url)
    const limit = Math.min(5000, Math.max(0, parseInt(url.searchParams.get('limit') || '0', 10) || 0))
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)
    const q = (url.searchParams.get('q') || '').trim()
    const orderByRaw = url.searchParams.get('order_by') || 'created_at'
    const orderDirRaw = (url.searchParams.get('order_dir') || 'DESC').toUpperCase()
    // Whitelist columns from PRAGMA
    const colInfo = await db.prepare(`PRAGMA table_info(${tableName})`).all<any>()
    const cols = colInfo.results || []
    const validCols = new Set(cols.map((r: any) => r.name))
    const orderBy = validCols.has(orderByRaw) ? orderByRaw : (validCols.has('created_at') ? 'created_at' : idField)
    const orderDir = orderDirRaw === 'ASC' ? 'ASC' : 'DESC'
    let where = ''
    const binds: any[] = []
    if (q) {
      const textCols = cols.filter((r: any) => !r.type || /text/i.test(r.type)).map((r: any) => r.name).filter((n: string) => n !== idField)
      if (textCols.length) {
        where = 'WHERE (' + textCols.map((cn: string) => `${cn} LIKE ?`).join(' OR ') + ')'
        for (let i = 0; i < textCols.length; i++) binds.push(`%${q}%`)
      }
    }
    let sql = `SELECT * FROM ${tableName} ${where} ORDER BY ${orderBy} ${orderDir}`
    if (limit > 0) sql += ` LIMIT ${limit} OFFSET ${offset}`
    const { results } = await db.prepare(sql).bind(...binds).all()
    // Total count for pagination UI
    try {
      const cnt = await db.prepare(`SELECT COUNT(*) AS cnt FROM ${tableName} ${where}`).bind(...binds).first<any>()
      c.header('X-Total-Count', String(cnt?.cnt || 0))
    } catch (_) {}
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
    // Get actual table columns to filter out non-existent fields
    const tableInfo = await db.prepare(`PRAGMA table_info(${tableName})`).all()
    const validCols = new Set((tableInfo.results || []).map((r: any) => r.name))
    const keys = Object.keys(body).filter(k => validCols.has(k))
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
    // Get actual table columns to filter out non-existent fields
    const tableInfo = await db.prepare(`PRAGMA table_info(${tableName})`).all()
    const validCols = new Set((tableInfo.results || []).map((r: any) => r.name))
    const keys = Object.keys(body).filter(k => k !== idField && validCols.has(k))
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
app.route('/api/labor', crud('labor_costs'))
app.route('/api/expenses', crud('expenses'))
app.route('/api/item-images', crud('item_images'))
app.route('/api/presets', crud('work_presets'))
app.route('/api/notifications', crud('notifications'))
app.route('/api/pricedb-history', crud('pricedb_history'))
app.route('/api/estimate-templates', crud('estimate_template_sets'))
app.route('/api/approvals', crud('approvals'))
app.route('/api/user-prefs', crud('user_prefs'))
app.route('/api/consultations', crud('consultations'))
app.route('/api/rfp', crud('rfp'))
app.route('/api/clients', crud('clients'))
app.route('/api/erp-attachments', crud('erp_attachments'))
// Leave management (연차 관리)
app.route('/api/leave-requests', crud('leave_requests'))
app.route('/api/leave-types', crud('leave_types'))

// Leave workflow (approve / reject / balance)
app.post('/api/leave-requests/:id/approve', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>().catch(() => ({}))
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE leave_requests SET status='승인', reviewer=?, reviewer_name=?, reviewed_at=?, reviewer_memo=?, updated_at=? WHERE id=?`
  ).bind(body.reviewer || '', body.reviewer_name || '', now, body.memo || '', now, id).run()
  c.executionCtx.waitUntil(notifyLeaveDecision(c.env, id, '승인', body.memo || ''))
  return c.json({ ok: true })
})
app.post('/api/leave-requests/:id/reject', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<any>().catch(() => ({}))
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE leave_requests SET status='반려', reviewer=?, reviewer_name=?, reviewed_at=?, reviewer_memo=?, updated_at=? WHERE id=?`
  ).bind(body.reviewer || '', body.reviewer_name || '', now, body.memo || '반려', now, id).run()
  c.executionCtx.waitUntil(notifyLeaveDecision(c.env, id, '반려', body.memo || ''))
  return c.json({ ok: true })
})
app.post('/api/leave-requests/:id/cancel', async (c) => {
  const id = c.req.param('id')
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE leave_requests SET status='취소', updated_at=? WHERE id=?`
  ).bind(now, id).run()
  return c.json({ ok: true })
})
// GET balance: accrued (from hire_date) - used (approved) = remaining
app.get('/api/leave-balance/:userId', async (c) => {
  const uid = c.req.param('userId')
  let user: any = null
  try {
    user = await c.env.DB.prepare('SELECT id, username, name, hire_date FROM users WHERE id=? OR username=?').bind(uid, uid).first()
  } catch (_) { /* hire_date column may not exist yet */ }
  let accrued = 0
  if (user?.hire_date) {
    const hire = new Date(user.hire_date)
    const now = new Date()
    if (!isNaN(hire.getTime())) {
      const months = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth())
      if (months < 12) {
        accrued = Math.min(11, Math.max(0, months))
      } else {
        const yearsAfter1 = Math.floor((months - 12) / 12)
        accrued = Math.min(25, 15 + Math.floor(yearsAfter1 / 2))
      }
    }
  }
  const usedRow = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(days), 0) AS used FROM leave_requests
     WHERE (user_id=? OR user_name=?) AND status='승인' AND leave_type IN ('연차','반차','반반차')`
  ).bind(uid, user?.name || uid).first<any>()
  const used = Number(usedRow?.used || 0)
  return c.json({
    userId: uid,
    name: user?.name || null,
    hire_date: user?.hire_date || null,
    accrued,
    used,
    remaining: Math.max(0, accrued - used)
  })
})
app.route('/api/design-items', crud('design_items'))
app.route('/api/site-photos', crud('site_photos'))
app.route('/api/site-daily-logs', crud('site_daily_logs'))
app.route('/api/site-issues', crud('site_issues'))
// Settlement module
app.route('/api/stl/projects', crud('stl_projects'))
app.route('/api/stl/labor', crud('stl_labor_costs'))
app.route('/api/stl/material', crud('stl_material_costs'))
app.route('/api/stl/sub', crud('stl_sub_costs'))
app.route('/api/stl/expense', crud('stl_expense_costs'))
app.route('/api/stl/transport', crud('stl_transport_costs'))
app.route('/api/stl/payments', crud('stl_payments'))

// Settlement bulk save: delete all costs for a project, then re-insert
app.post('/api/stl/bulk-save/:pid', async (c) => {
  const db = c.env.DB
  await ensureTables(db)
  const pid = c.req.param('pid')
  const body = await c.req.json()
  const tables = ['stl_labor_costs','stl_material_costs','stl_sub_costs','stl_expense_costs','stl_transport_costs','stl_payments']
  // Delete all existing costs for this project
  for (const t of tables) {
    await db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).bind(pid).run()
  }
  // Insert new rows
  const insertRows = async (table: string, rows: any[]) => {
    for (const row of rows) {
      const keys = Object.keys(row)
      const placeholders = keys.map(() => '?').join(',')
      const vals = keys.map(k => row[k])
      await db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).bind(...vals).run()
    }
  }
  if (body.labor?.length)     await insertRows('stl_labor_costs', body.labor)
  if (body.material?.length)  await insertRows('stl_material_costs', body.material)
  if (body.sub?.length)       await insertRows('stl_sub_costs', body.sub)
  if (body.expense?.length)   await insertRows('stl_expense_costs', body.expense)
  if (body.transport?.length) await insertRows('stl_transport_costs', body.transport)
  if (body.payment?.length)   await insertRows('stl_payments', body.payment)
  return c.json({ success: true })
})

// Settlement bulk delete: remove project + all costs
app.delete('/api/stl/bulk-delete/:pid', async (c) => {
  const db = c.env.DB
  await ensureTables(db)
  const pid = c.req.param('pid')
  const tables = ['stl_labor_costs','stl_material_costs','stl_sub_costs','stl_expense_costs','stl_transport_costs','stl_payments']
  for (const t of tables) {
    await db.prepare(`DELETE FROM ${t} WHERE project_id = ?`).bind(pid).run()
  }
  await db.prepare('DELETE FROM stl_projects WHERE id = ?').bind(pid).run()
  return c.json({ success: true })
})

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

  // Seed work presets (using individual inserts for D1 compatibility)
  try {
    await db.exec(`
      INSERT OR IGNORE INTO work_presets (id, cid, name, items) VALUES
      ('wp1', 'C01', '기초공사', '[{"nm":"먹메김","spec":"식","unit":"식","qty":1},{"nm":"보양","spec":"식","unit":"식","qty":1},{"nm":"내부수평비계","spec":"식","unit":"식","qty":1},{"nm":"소운반비","spec":"식","unit":"식","qty":1},{"nm":"대운반비","spec":"식","unit":"식","qty":1},{"nm":"폐자재처리","spec":"식","unit":"식","qty":1},{"nm":"현장정리정돈","spec":"식","unit":"식","qty":1},{"nm":"준공청소","spec":"식","unit":"식","qty":1}]'),
      ('wp2', 'C02', '철거공사', '[{"nm":"기존 벽체 철거","spec":"m²","unit":"m²","qty":1},{"nm":"기존 바닥 철거","spec":"m²","unit":"m²","qty":1},{"nm":"기존 천정 철거","spec":"m²","unit":"m²","qty":1},{"nm":"설비 철거","spec":"식","unit":"식","qty":1},{"nm":"잡철거","spec":"식","unit":"식","qty":1}]'),
      ('wp3', 'C04', '목공사', '[{"nm":"경량칸막이","spec":"m²","unit":"m²","qty":1},{"nm":"천정틀","spec":"m²","unit":"m²","qty":1},{"nm":"합판작업","spec":"m²","unit":"m²","qty":1},{"nm":"몰딩","spec":"m","unit":"m","qty":1},{"nm":"문틀/문짝","spec":"세트","unit":"세트","qty":1}]'),
      ('wp4', 'C06', '도장공사', '[{"nm":"벽면도장","spec":"m²","unit":"m²","qty":1},{"nm":"천정도장","spec":"m²","unit":"m²","qty":1},{"nm":"친환경페인트","spec":"m²","unit":"m²","qty":1},{"nm":"퍼티작업","spec":"m²","unit":"m²","qty":1}]'),
      ('wp5', 'C03', '금속·유리공사', '[{"nm":"유리파티션","spec":"m²","unit":"m²","qty":1},{"nm":"강화유리도어","spec":"세트","unit":"세트","qty":1},{"nm":"유리난간","spec":"m","unit":"m","qty":1},{"nm":"스틸프레임","spec":"m","unit":"m","qty":1},{"nm":"알루미늄창호","spec":"세트","unit":"세트","qty":1}]'),
      ('wp6', 'C05', '전기·통신공사', '[{"nm":"LED조명 설치","spec":"개","unit":"개","qty":1},{"nm":"콘센트 설치","spec":"개","unit":"개","qty":1},{"nm":"스위치 설치","spec":"개","unit":"개","qty":1},{"nm":"분전반 교체","spec":"식","unit":"식","qty":1},{"nm":"배선공사","spec":"식","unit":"식","qty":1},{"nm":"통신배선","spec":"식","unit":"식","qty":1},{"nm":"비상조명","spec":"개","unit":"개","qty":1}]'),
      ('wp7', 'C07', '필름공사', '[{"nm":"창문 단열필름","spec":"m²","unit":"m²","qty":1},{"nm":"유리 안전필름","spec":"m²","unit":"m²","qty":1},{"nm":"인테리어필름(벽면)","spec":"m²","unit":"m²","qty":1},{"nm":"인테리어필름(가구)","spec":"m²","unit":"m²","qty":1},{"nm":"간판용 필름","spec":"m²","unit":"m²","qty":1}]'),
      ('wp8', 'C08', '바닥공사', '[{"nm":"바닥타일","spec":"m²","unit":"m²","qty":1},{"nm":"장판시공","spec":"m²","unit":"m²","qty":1},{"nm":"강마루시공","spec":"m²","unit":"m²","qty":1},{"nm":"에폭시코팅","spec":"m²","unit":"m²","qty":1},{"nm":"걸레받이","spec":"m","unit":"m","qty":1},{"nm":"방수공사","spec":"m²","unit":"m²","qty":1}]'),
      ('wp9', 'C09', '제작가구', '[{"nm":"붙박이장","spec":"세트","unit":"세트","qty":1},{"nm":"신발장","spec":"세트","unit":"세트","qty":1},{"nm":"수납장","spec":"세트","unit":"세트","qty":1},{"nm":"책상/테이블","spec":"세트","unit":"세트","qty":1},{"nm":"카운터제작","spec":"식","unit":"식","qty":1}]'),
      ('wp10', 'C10', '에어컨공사', '[{"nm":"벽걸이 에어컨 설치","spec":"대","unit":"대","qty":1},{"nm":"천정형 에어컨 설치","spec":"대","unit":"대","qty":1},{"nm":"시스템 에어컨","spec":"대","unit":"대","qty":1},{"nm":"냉매배관","spec":"m","unit":"m","qty":1},{"nm":"드레인배관","spec":"m","unit":"m","qty":1},{"nm":"실외기 거치대","spec":"식","unit":"식","qty":1}]'),
      ('wp11', 'C11', '덕트공사', '[{"nm":"환기덕트","spec":"m","unit":"m","qty":1},{"nm":"급기덕트","spec":"m","unit":"m","qty":1},{"nm":"배기덕트","spec":"m","unit":"m","qty":1},{"nm":"환풍기 설치","spec":"대","unit":"대","qty":1},{"nm":"디퓨저/그릴","spec":"개","unit":"개","qty":1}]'),
      ('wp12', 'C12', '설비공사', '[{"nm":"급수배관","spec":"m","unit":"m","qty":1},{"nm":"배수배관","spec":"m","unit":"m","qty":1},{"nm":"온수배관","spec":"m","unit":"m","qty":1},{"nm":"세면대 설치","spec":"개","unit":"개","qty":1},{"nm":"양변기 설치","spec":"개","unit":"개","qty":1},{"nm":"수전 교체","spec":"개","unit":"개","qty":1}]'),
      ('wp13', 'C13', '소방공사', '[{"nm":"스프링클러","spec":"개","unit":"개","qty":1},{"nm":"감지기 설치","spec":"개","unit":"개","qty":1},{"nm":"유도등 설치","spec":"개","unit":"개","qty":1},{"nm":"소화기 비치","spec":"개","unit":"개","qty":1},{"nm":"소방배관","spec":"m","unit":"m","qty":1},{"nm":"방화문","spec":"개","unit":"개","qty":1}]'),
      ('wp14', 'C14', '타일공사', '[{"nm":"벽타일","spec":"m²","unit":"m²","qty":1},{"nm":"바닥타일","spec":"m²","unit":"m²","qty":1},{"nm":"포세린타일","spec":"m²","unit":"m²","qty":1},{"nm":"줄눈시공","spec":"m²","unit":"m²","qty":1},{"nm":"타일 물끊기","spec":"m","unit":"m","qty":1}]'),
      ('wp15', 'C15', '간판공사', '[{"nm":"전면간판","spec":"식","unit":"식","qty":1},{"nm":"돌출간판","spec":"식","unit":"식","qty":1},{"nm":"채널사인","spec":"식","unit":"식","qty":1},{"nm":"LED사인","spec":"식","unit":"식","qty":1},{"nm":"안내사인","spec":"개","unit":"개","qty":1}]'),
      ('wp16', 'C16', '커튼·블라인드', '[{"nm":"롤스크린","spec":"개","unit":"개","qty":1},{"nm":"버티칼블라인드","spec":"개","unit":"개","qty":1},{"nm":"우드블라인드","spec":"개","unit":"개","qty":1},{"nm":"암막커튼","spec":"m","unit":"m","qty":1},{"nm":"쉬어커튼","spec":"m","unit":"m","qty":1}]'),
      ('wp17', 'C17', '조화공사', '[{"nm":"인조잔디","spec":"m²","unit":"m²","qty":1},{"nm":"조화벽면","spec":"m²","unit":"m²","qty":1},{"nm":"화분·플랜터","spec":"개","unit":"개","qty":1},{"nm":"조경석","spec":"식","unit":"식","qty":1}]'),
      ('wp18', 'C18', '이동가구·기전', '[{"nm":"사무용 책상","spec":"개","unit":"개","qty":1},{"nm":"사무용 의자","spec":"개","unit":"개","qty":1},{"nm":"회의테이블","spec":"세트","unit":"세트","qty":1},{"nm":"소파","spec":"세트","unit":"세트","qty":1},{"nm":"냉장고","spec":"대","unit":"대","qty":1},{"nm":"전자레인지","spec":"대","unit":"대","qty":1},{"nm":"정수기","spec":"대","unit":"대","qty":1}]')
    `)
  } catch(e) { console.log('Preset seed skipped:', e) }

  // Seed estimate template sets
  try {
    const templateData = [
      { id: 'ets1', name: '기초공사 세트', description: '먹메김, 보양, 비계, 운반, 청소 포함', category: '기초공사', items: JSON.stringify([{nm:"먹메김",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"보양",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"내부수평비계",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"소운반비",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"대운반비",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"폐자재처리",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"현장정리정돈",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"준공청소",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets2', name: '철거공사 세트', description: '벽체, 바닥, 천정, 설비 철거', category: '철거공사', items: JSON.stringify([{nm:"기존 벽체 철거",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"기존 바닥 철거",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"기존 천정 철거",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"설비 철거",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"잡철거",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets3', name: '목공사 세트', description: '경량칸막이, 천정틀, 합판, 몰딩, 문짝', category: '목공사', items: JSON.stringify([{nm:"경량칸막이",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"천정틀",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"합판작업",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"몰딩",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"문틀/문짝",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets4', name: '도장공사 세트', description: '벽면/천정 도장, 친환경페인트', category: '도장공사', items: JSON.stringify([{nm:"벽면도장",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"천정도장",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"친환경페인트",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"퍼티작업",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets5', name: '전기공사 세트', description: '조명, 콘센트, 스위치, 분전반, 통신', category: '전기공사', items: JSON.stringify([{nm:"LED조명 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"콘센트 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"스위치 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"분전반 교체",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"배선공사",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"통신배선",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"비상조명",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets6', name: '바닥공사 세트', description: '타일, 장판, 마루, 에폭시', category: '바닥공사', items: JSON.stringify([{nm:"바닥타일",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"장판시공",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"강마루시공",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"에폭시코팅",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"걸레받이",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"방수공사",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets7', name: '금속·유리 세트', description: '유리파티션, 강화유리도어, 스틸프레임', category: '금속·유리 공사', items: JSON.stringify([{nm:"유리파티션",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"강화유리도어",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"유리난간",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"스틸프레임",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"알루미늄창호",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets8', name: '필름공사 세트', description: '단열, 안전, 인테리어 필름', category: '필름 공사', items: JSON.stringify([{nm:"창문 단열필름",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"유리 안전필름",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"인테리어필름(벽면)",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"인테리어필름(가구)",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"간판용 필름",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets9', name: '제작가구 세트', description: '붙박이장, 수납장, 카운터', category: '제작가구', items: JSON.stringify([{nm:"붙박이장",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"신발장",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"수납장",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"책상/테이블",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"카운터제작",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets10', name: '에어컨공사 세트', description: '에어컨 설치, 배관, 실외기', category: '에어컨 공사', items: JSON.stringify([{nm:"벽걸이 에어컨 설치",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0},{nm:"천정형 에어컨 설치",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0},{nm:"시스템 에어컨",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0},{nm:"냉매배관",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"드레인배관",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"실외기 거치대",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets11', name: '덕트공사 세트', description: '환기, 급배기 덕트, 환풍기', category: '덕트 공사', items: JSON.stringify([{nm:"환기덕트",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"급기덕트",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"배기덕트",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"환풍기 설치",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0},{nm:"디퓨저/그릴",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets12', name: '설비공사 세트', description: '급배수, 위생기구 설치', category: '설비 공사', items: JSON.stringify([{nm:"급수배관",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"배수배관",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"온수배관",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"세면대 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"양변기 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"수전 교체",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets13', name: '소방공사 세트', description: '스프링클러, 감지기, 유도등', category: '소방 공사', items: JSON.stringify([{nm:"스프링클러",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"감지기 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"유도등 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"소화기 비치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"소방배관",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"방화문",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets14', name: '타일공사 세트', description: '벽/바닥 타일, 줄눈', category: '타일 공사', items: JSON.stringify([{nm:"벽타일",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"바닥타일",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"포세린타일",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"줄눈시공",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"타일 물끊기",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets15', name: '간판공사 세트', description: '전면, 돌출, 채널사인', category: '간판 공사', items: JSON.stringify([{nm:"전면간판",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"돌출간판",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"채널사인",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"LED사인",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"안내사인",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets16', name: '커튼·블라인드 세트', description: '롤스크린, 블라인드, 커튼', category: '커튼·블라인드', items: JSON.stringify([{nm:"롤스크린",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"버티칼블라인드",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"우드블라인드",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"암막커튼",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"쉬어커튼",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets17', name: '조화공사 세트', description: '인조잔디, 조화벽면, 플랜터', category: '조화 공사', items: JSON.stringify([{nm:"인조잔디",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"조화벽면",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"화분·플랜터",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"조경석",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets18', name: '이동가구·기전 세트', description: '사무가구, 가전제품', category: '이동가구·기전', items: JSON.stringify([{nm:"사무용 책상",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"사무용 의자",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"회의테이블",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"소파",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0},{nm:"냉장고",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0},{nm:"전자레인지",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0},{nm:"정수기",spec:"대",unit:"대",qty:1,mp:0,lp:0,ep:0}]) },
    ]
    for (const t of templateData) {
      await db.prepare('INSERT OR IGNORE INTO estimate_template_sets (id, name, description, category, items) VALUES (?, ?, ?, ?, ?)').bind(t.id, t.name, t.description, t.category, t.items).run()
    }
  } catch(e) { console.log('Template seed skipped:', e) }

  // Seed default user preferences
  try {
    await db.prepare('INSERT OR IGNORE INTO user_prefs (id) VALUES (?)').bind('default').run()
  } catch(e) { console.log('User prefs seed skipped:', e) }

  return c.json({ status: 'tables_ready' })
})

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', version: 'v8.6' }))

// ===== PASSWORD HASHING (PBKDF2-SHA256) =====
async function hashPassword(password: string, salt?: string): Promise<string> {
  const enc = new TextEncoder()
  const s = salt || crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(s), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256)
  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `pbkdf2:${s}:${hash}`
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('pbkdf2:')) return password === stored  // legacy plain-text fallback
  const [, salt] = stored.split(':')
  const hashed = await hashPassword(password, salt)
  return hashed === stored
}

// ===== AUTH ENDPOINTS =====
app.post('/api/auth/login', async (c) => {
  const db = c.env.DB
  await ensureTables(db)
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: '아이디와 비밀번호를 입력하세요' }, 400)
  const user = await db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').bind(username).first() as Record<string, unknown> | null
  if (!user) return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, 401)
  const passwordOk = await verifyPassword(password, user.password as string)
  if (!passwordOk) return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, 401)
  // Auto-upgrade plain-text password to PBKDF2 hash on successful login
  if (!(user.password as string).startsWith('pbkdf2:')) {
    const hashed = await hashPassword(password)
    await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashed, user.id).run()
  }
  // Create session (24h expiry)
  const sid = crypto.randomUUID()
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await db.prepare('INSERT INTO sessions (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)').bind(sid, user.id, user.role, expires).run()
  // Update last login
  await db.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run()
  return c.json({ success: true, session: sid, user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email } })
})

app.post('/api/auth/logout', async (c) => {
  const db = c.env.DB
  const sid = c.req.header('X-Session-Id') || ''
  if (sid) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run()
  return c.json({ success: true })
})

app.get('/api/auth/me', async (c) => {
  const db = c.env.DB
  await ensureTables(db)
  const sid = c.req.header('X-Session-Id') || ''
  if (!sid) return c.json({ error: 'No session' }, 401)
  const sess = await db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').bind(sid, new Date().toISOString()).first() as Record<string, unknown> | null
  if (!sess) return c.json({ error: 'Invalid session' }, 401)
  const user = await db.prepare('SELECT id, username, name, role, email, phone, position, hire_date, dept FROM users WHERE id = ?').bind(sess.user_id).first()
  if (!user) return c.json({ error: 'User not found' }, 401)
  return c.json(user)
})

// Users CRUD (admin only - simple version)
app.get('/api/users', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare('SELECT id, username, name, role, email, phone, position, hire_date, dept, active, last_login, created_at FROM users ORDER BY created_at DESC').all()
  return c.json(results || [])
})

app.post('/api/users', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const id = body.id || crypto.randomUUID()
  // Hash password with PBKDF2 for new users / password updates
  let pw = body.password || ''
  if (pw && !pw.startsWith('pbkdf2:')) pw = await hashPassword(pw)
  await db.prepare('INSERT OR REPLACE INTO users (id, username, password, name, role, email, phone, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
    id, body.username, pw, body.name || '', body.role || 'staff', body.email || '', body.phone || '', body.active ?? 1
  ).run()
  return c.json({ success: true, id })
})

app.delete('/api/users/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  // Don't allow deleting the last admin
  const admins = await db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ? AND id != ?').bind('admin', id).first<{cnt:number}>()
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{role:string}>()
  if (user?.role === 'admin' && (!admins || admins.cnt === 0)) return c.json({ error: '최소 1명의 관리자가 필요합니다' }, 400)
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  return c.json({ success: true })
})

app.put('/api/users/:id/password', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { password } = await c.req.json()
  if (!password || password.length < 4) return c.json({ error: '비밀번호는 4자 이상이어야 합니다' }, 400)
  const hashed = await hashPassword(password)
  await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashed, id).run()
  return c.json({ success: true })
})

// ===== NOTIFICATIONS: Mark as read =====
app.put('/api/notifications/:id/read', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  await db.prepare('UPDATE notifications SET status = ?, read_at = ? WHERE id = ?').bind('read', new Date().toISOString(), id).run()
  return c.json({ success: true })
})

// Mark all notifications as read
app.put('/api/notifications-read-all', async (c) => {
  const db = c.env.DB
  await db.prepare('UPDATE notifications SET status = ?, read_at = ? WHERE status = ?').bind('read', new Date().toISOString(), 'unread').run()
  return c.json({ success: true })
})

// Get unread count
app.get('/api/notifications/unread-count', async (c) => {
  const db = c.env.DB
  const result = await db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE status = ?').bind('unread').first<{ cnt: number }>()
  return c.json({ count: result?.cnt || 0 })
})

// ===== PRICEDB STATS =====
app.get('/api/pricedb/:id/stats', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const history = await db.prepare('SELECT * FROM pricedb_history WHERE price_id = ? ORDER BY used_date DESC').bind(id).all()
  const items = (history.results || []) as Array<Record<string, unknown>>
  const avgPrice = items.length > 0 ? items.reduce((a, h) => a + (Number(h.unit_price) || 0), 0) / items.length : 0
  const lastPrice = items.length > 0 ? Number(items[0].unit_price) || 0 : 0
  return c.json({ history: items, avgPrice, lastPrice, usageCount: items.length })
})

// ===== APPROVAL WORKFLOW =====
app.put('/api/approvals/:id/approve', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  await db.prepare('UPDATE approvals SET status = ?, approve_date = ?, approver = ? WHERE id = ?').bind('승인', new Date().toISOString().split('T')[0], body.approver || '', id).run()
  // Also update related item if expense
  const approval = await db.prepare('SELECT * FROM approvals WHERE id = ?').bind(id).first() as Record<string, unknown> | null
  if (approval?.type === 'expense' && approval?.related_id) {
    await db.prepare('UPDATE expenses SET status = ?, approver = ?, approved_date = ? WHERE id = ?').bind('승인', body.approver || '', new Date().toISOString().split('T')[0], approval.related_id).run()
  }
  return c.json({ success: true })
})

app.put('/api/approvals/:id/reject', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json()
  await db.prepare('UPDATE approvals SET status = ?, reject_reason = ?, approve_date = ? WHERE id = ?').bind('반려', body.reason || '', new Date().toISOString().split('T')[0], id).run()
  const approval = await db.prepare('SELECT * FROM approvals WHERE id = ?').bind(id).first() as Record<string, unknown> | null
  if (approval?.type === 'expense' && approval?.related_id) {
    await db.prepare('UPDATE expenses SET status = ?, reject_reason = ? WHERE id = ?').bind('반려', body.reason || '', approval.related_id).run()
  }
  return c.json({ success: true })
})

// ===== DASHBOARD STATS (cost flow summary) =====
app.get('/api/dashboard/stats', async (c) => {
  const db = c.env.DB
  const [projects, labor, expenses, orders] = await Promise.all([
    db.prepare('SELECT * FROM projects').all(),
    db.prepare('SELECT pid, SUM(net_amount) as total, SUM(CASE WHEN paid=1 THEN net_amount ELSE 0 END) as paid_total FROM labor_costs GROUP BY pid').all(),
    db.prepare('SELECT pid, SUM(amount) as total, SUM(CASE WHEN status="승인" THEN amount ELSE 0 END) as approved_total FROM expenses GROUP BY pid').all(),
    db.prepare('SELECT pid, SUM(amount) as total, SUM(CASE WHEN paid=1 THEN amount ELSE 0 END) as paid_total FROM orders_manual GROUP BY pid').all(),
  ])
  return c.json({
    projects: projects.results || [],
    laborByProject: labor.results || [],
    expensesByProject: expenses.results || [],
    ordersByProject: orders.results || [],
  })
})

// ===== WEATHER API (OpenWeatherMap Proxy) =====
app.get('/api/weather', async (c) => {
  const lat = c.req.query('lat') || '37.5665'  // Seoul default
  const lon = c.req.query('lon') || '126.9780'

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,cloud_cover&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1`
    const res = await fetch(url)
    const data = await res.json() as Record<string, any>
    if (!res.ok) return c.json({ error: 'Weather API error', detail: data }, res.status)

    const current = data.current || {}
    const daily = data.daily || {}
    const wmoCode = current.weather_code || 0
    const wmoMap: Record<number, {desc:string, icon:string}> = {
      0:{desc:'맑음',icon:'01d'},1:{desc:'대체로 맑음',icon:'02d'},2:{desc:'구름 조금',icon:'03d'},3:{desc:'흐림',icon:'04d'},
      45:{desc:'안개',icon:'50d'},48:{desc:'짙은 안개',icon:'50d'},
      51:{desc:'가벼운 이슬비',icon:'09d'},53:{desc:'이슬비',icon:'09d'},55:{desc:'강한 이슬비',icon:'09d'},
      61:{desc:'가벼운 비',icon:'10d'},63:{desc:'비',icon:'10d'},65:{desc:'강한 비',icon:'10d'},
      71:{desc:'가벼운 눈',icon:'13d'},73:{desc:'눈',icon:'13d'},75:{desc:'강한 눈',icon:'13d'},
      80:{desc:'소나기',icon:'09d'},81:{desc:'강한 소나기',icon:'09d'},82:{desc:'폭우',icon:'11d'},
      95:{desc:'천둥번개',icon:'11d'},96:{desc:'우박 동반 뇌우',icon:'11d'},99:{desc:'강한 우박 뇌우',icon:'11d'}
    }
    const wmo = wmoMap[wmoCode] || {desc:'알 수 없음',icon:'01d'}
    const temp = Math.round(current.temperature_2m || 0)
    const windSpeed = current.wind_speed_10m || 0

    return c.json({
      city: '서울',
      temp,
      feels_like: Math.round(current.apparent_temperature || 0),
      temp_min: Math.round(daily.temperature_2m_min?.[0] || 0),
      temp_max: Math.round(daily.temperature_2m_max?.[0] || 0),
      humidity: current.relative_humidity_2m || 0,
      description: wmo.desc,
      icon: wmo.icon,
      icon_url: `https://openweathermap.org/img/wn/${wmo.icon}@2x.png`,
      wind_speed: windSpeed,
      clouds: current.cloud_cover || 0,
      outdoor_ok: (temp > 0 && temp < 38 && windSpeed < 36),
      rain_warning: [51,53,55,61,63,65,80,81,82,95,96,99].includes(wmoCode),
      snow_warning: [71,73,75].includes(wmoCode)
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// 5일 예보 (시공 일정 참고용) — Open-Meteo 무료
app.get('/api/weather/forecast', async (c) => {
  const lat = c.req.query('lat') || '37.5665'
  const lon = c.req.query('lon') || '126.9780'

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=5`
    const res = await fetch(url)
    const data = await res.json() as Record<string, any>
    if (!res.ok) return c.json({ error: 'Forecast API error', detail: data }, res.status)

    const daily = data.daily || {}
    const dates = daily.time || []
    const wmoMap: Record<number, {desc:string, icon:string}> = {
      0:{desc:'맑음',icon:'01d'},1:{desc:'대체로 맑음',icon:'02d'},2:{desc:'구름 조금',icon:'03d'},3:{desc:'흐림',icon:'04d'},
      45:{desc:'안개',icon:'50d'},48:{desc:'짙은 안개',icon:'50d'},
      51:{desc:'가벼운 이슬비',icon:'09d'},53:{desc:'이슬비',icon:'09d'},55:{desc:'강한 이슬비',icon:'09d'},
      61:{desc:'가벼운 비',icon:'10d'},63:{desc:'비',icon:'10d'},65:{desc:'강한 비',icon:'10d'},
      71:{desc:'가벼운 눈',icon:'13d'},73:{desc:'눈',icon:'13d'},75:{desc:'강한 눈',icon:'13d'},
      80:{desc:'소나기',icon:'09d'},81:{desc:'강한 소나기',icon:'09d'},82:{desc:'폭우',icon:'11d'},
      95:{desc:'천둥번개',icon:'11d'},96:{desc:'우박 동반 뇌우',icon:'11d'},99:{desc:'강한 우박 뇌우',icon:'11d'}
    }

    const forecast = dates.map((date: string, i: number) => {
      const code = daily.weather_code?.[i] || 0
      const wmo = wmoMap[code] || {desc:'알 수 없음',icon:'01d'}
      return {
        date,
        temp_min: Math.round(daily.temperature_2m_min?.[i] || 0),
        temp_max: Math.round(daily.temperature_2m_max?.[i] || 0),
        description: wmo.desc,
        icon: wmo.icon,
        icon_url: `https://openweathermap.org/img/wn/${wmo.icon}@2x.png`,
        rain: (daily.precipitation_probability_max?.[i] || 0) > 40,
        rain_prob: daily.precipitation_probability_max?.[i] || 0
      }
    })

    return c.json({ city: '서울', forecast })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ===== SPELLCHECK API (OpenAI) =====
app.post('/api/spellcheck', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'OPENAI_API_KEY not configured' }, 500)

  const body = await c.req.json()
  const { text } = body
  if (!text || typeof text !== 'string') return c.json({ error: 'text is required' }, 400)
  if (text.length > 5000) return c.json({ error: 'Text too long (max 5000 chars)' }, 400)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `당신은 한국어 맞춤법 검사 전문가입니다. 사용자가 보낸 텍스트의 맞춤법, 띄어쓰기, 문법 오류를 검사하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "corrected": "교정된 전체 텍스트",
  "errors": [
    {"original": "틀린 부분", "corrected": "올바른 표현", "reason": "간단한 설명"}
  ],
  "score": 0-100 (맞춤법 점수)
}

오류가 없으면 errors를 빈 배열로, score를 100으로 반환하세요.`
          },
          { role: 'user', content: text }
        ]
      })
    })

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) return c.json({ error: 'OpenAI API error', detail: data }, res.status)

    const choices = data.choices as Array<Record<string, unknown>>
    const content = (choices?.[0]?.message as Record<string, string>)?.content || '{}'

    // JSON 파싱 시도
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const result = JSON.parse(cleaned)
      return c.json(result)
    } catch {
      return c.json({ corrected: content, errors: [], score: 0, raw: true })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ===== AI 문서 작성 도우미 (OpenAI) =====
app.post('/api/ai/assist', async (c) => {
  const apiKey = c.env.OPENAI_API_KEY
  if (!apiKey) return c.json({ error: 'OPENAI_API_KEY not configured' }, 500)

  const body = await c.req.json()
  const { type, context } = body

  if (!type) return c.json({ error: 'type is required' }, 400)

  const prompts: Record<string, string> = {
    'estimate_memo': `인테리어 견적서에 들어갈 전문적인 메모/비고를 작성하세요. 현장 정보: ${context}. 3줄 이내로 간결하게 작성하세요.`,
    'meeting_summary': `미팅 내용을 요약하세요: ${context}. 핵심 사항, 결정 사항, 후속 조치를 구분하여 작성하세요.`,
    'contract_clause': `인테리어 공사 계약서에 포함할 특약 조항을 제안하세요. 공사 정보: ${context}. 법적으로 유효한 문구로 3가지 제안하세요.`,
    'email_draft': `인테리어 공사 관련 이메일을 작성하세요. 상황: ${context}. 전문적이고 정중한 톤으로 작성하세요.`
  }

  const prompt = prompts[type] || `${context}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: '당신은 인테리어/건설 업계 전문 비서입니다. 한국어로 전문적이고 실용적인 문서를 작성합니다.' },
          { role: 'user', content: prompt }
        ]
      })
    })

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) return c.json({ error: 'OpenAI API error', detail: data }, res.status)

    const choices = data.choices as Array<Record<string, unknown>>
    const content = (choices?.[0]?.message as Record<string, string>)?.content || ''
    return c.json({ result: content })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ===== EMAIL API (Resend) =====
// 견적서/계약서 이메일 발송
app.post('/api/email/send', async (c) => {
  const apiKey = c.env.RESEND_API_KEY
  if (!apiKey) return c.json({ error: 'RESEND_API_KEY not configured' }, 500)

  const body = await c.req.json()
  const { to, subject, html, from_name } = body

  if (!to || !subject) return c.json({ error: 'to, subject are required' }, 400)

  const fromAddr = from_name
    ? `${from_name} <onboarding@resend.dev>`
    : 'Frame Plus ERP <onboarding@resend.dev>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddr,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || `<p>${subject}</p>`
      })
    })

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) return c.json({ error: 'Email send failed', detail: data }, res.status)
    return c.json({ success: true, id: data.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// 견적서 이메일 발송 (프로젝트 데이터 기반 자동 HTML 생성)
app.post('/api/email/estimate', async (c) => {
  const apiKey = c.env.RESEND_API_KEY
  if (!apiKey) return c.json({ error: 'RESEND_API_KEY not configured' }, 500)

  const body = await c.req.json()
  const { to, project_id, cc, custom_message } = body

  if (!to || !project_id) return c.json({ error: 'to, project_id required' }, 400)

  // 프로젝트 데이터 조회
  const db = c.env.DB
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first() as Record<string, unknown> | null
  if (!project) return c.json({ error: 'Project not found' }, 404)

  // 회사 정보 조회
  const company = await db.prepare('SELECT * FROM company WHERE id = 1').first() as Record<string, unknown> | null

  // 견적 아이템 파싱
  let items: Array<Record<string, unknown>> = []
  try { items = JSON.parse(project.items as string || '[]') } catch {}

  // 총액 계산
  let totalSell = 0
  items.forEach((item) => {
    const qty = Number(item.qty) || 0
    const sp = Number(item.sp) || 1
    const mp = Number(item.mp) || 0
    const lp = Number(item.lp) || 0
    const ep = Number(item.ep) || 0
    totalSell += (mp + lp + ep) * qty * sp
  })

  const companyName = company?.name_ko || company?.name || 'Frame Plus'
  const ceo = company?.ceo || ''
  const tel = company?.tel || ''
  const email = company?.email || ''

  // 견적서 HTML 이메일 템플릿
  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Noto Sans KR',sans-serif;background:#f5f5f5;padding:20px;">
<div style="max-width:650px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">
  <div style="background:#0a0a0a;color:#fff;padding:32px;text-align:center;">
    <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:.05em;">${companyName}</h1>
    <p style="margin:8px 0 0;font-size:13px;opacity:.6;">견 적 서</p>
  </div>
  <div style="padding:32px;">
    ${custom_message ? `<div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:16px;margin-bottom:24px;border-radius:4px;font-size:14px;color:#333;">${custom_message}</div>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
      <tr><td style="padding:8px 12px;background:#f8f8f8;font-weight:600;width:120px;border:1px solid #e5e5e5;">프로젝트명</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${project.nm}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">현장위치</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${project.loc}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">면적</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${project.area} m²</td></tr>
      <tr><td style="padding:8px 12px;background:#f8f8f8;font-weight:600;border:1px solid #e5e5e5;">견적일자</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${project.date}</td></tr>
    </table>

    <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #0a0a0a;">견적 항목</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
      <thead>
        <tr style="background:#0a0a0a;color:#fff;">
          <th style="padding:10px 8px;text-align:left;font-size:11px;">공종</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;">항목</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;">수량</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;">재료비</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;">노무비</th>
          <th style="padding:10px 8px;text-align:right;font-size:11px;">소계</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => {
          const qty = Number(item.qty) || 0
          const sp = Number(item.sp) || 1
          const mp = Number(item.mp) || 0
          const lp = Number(item.lp) || 0
          const ep = Number(item.ep) || 0
          const sub = (mp + lp + ep) * qty * sp
          return `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:8px;">${item.cid || ''}</td>
            <td style="padding:8px;">${item.nm || ''}</td>
            <td style="padding:8px;text-align:right;">${qty.toLocaleString()}</td>
            <td style="padding:8px;text-align:right;">${(mp * qty * sp).toLocaleString()}</td>
            <td style="padding:8px;text-align:right;">${(lp * qty * sp).toLocaleString()}</td>
            <td style="padding:8px;text-align:right;font-weight:600;">${sub.toLocaleString()}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <div style="background:#0a0a0a;color:#fff;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;opacity:.6;">견적 총액 (VAT별도)</p>
      <p style="margin:0;font-size:28px;font-weight:800;">${totalSell.toLocaleString()}원</p>
    </div>

    <div style="font-size:12px;color:#777;border-top:1px solid #eee;padding-top:16px;">
      <p style="margin:2px 0;"><strong>${companyName}</strong>${ceo ? ` | 대표 ${ceo}` : ''}</p>
      ${tel ? `<p style="margin:2px 0;">Tel: ${tel}</p>` : ''}
      ${email ? `<p style="margin:2px 0;">Email: ${email}</p>` : ''}
      <p style="margin:8px 0 0;font-size:11px;color:#aaa;">본 견적서는 Frame Plus ERP에서 자동 발송되었습니다.</p>
    </div>
  </div>
</div>
</body>
</html>`

  const fromAddr = `${companyName} <onboarding@resend.dev>`
  const toList = Array.isArray(to) ? to : [to]

  try {
    const payload: Record<string, unknown> = {
      from: fromAddr,
      to: toList,
      subject: `[견적서] ${project.nm} - ${companyName}`,
      html: emailHtml
    }
    if (cc) payload.cc = Array.isArray(cc) ? cc : [cc]

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const data = await res.json() as Record<string, unknown>
    if (!res.ok) return c.json({ error: 'Email send failed', detail: data }, res.status)
    return c.json({ success: true, id: data.id, to: toList, subject: `[견적서] ${project.nm}` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ===== NOTION MIGRATION API =====
const NOTION_DB_IDS = {
  projects: 'df1679ac-a084-4c53-82d6-40f3e3b22219',
  vendors: 'd959a68d-76d7-4c94-bcfb-b165987f2fb5',
  employees: '4ac0a44f-6b1a-42a9-94e0-2d60e5d866b5',
  consultations: '16fc5096-50d7-81c4-bd26-c7ea16e4f683',
  expenses: '52d4a4b8-d615-43f4-a1ec-39102704d5d7',
  leave_requests: '19dc5096-50d7-81e4-a6ad-d4c6dd483617',
  leave_types: '19dc5096-50d7-812d-94ee-cbaa65c42c85',
}

async function notionQuery(token: string, dbId: string, startCursor?: string): Promise<any> {
  const body: any = { page_size: 100 }
  if (startCursor) body.start_cursor = startCursor
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function nText(prop: any): string {
  if (!prop) return ''
  const arr = prop.rich_text || prop.title || []
  return arr.map((t: any) => t.plain_text || '').join('')
}
function nSelect(prop: any): string { return prop?.select?.name || prop?.status?.name || '' }
function nMultiSelect(prop: any): string[] { return (prop?.multi_select || []).map((s: any) => s.name) }
function nNumber(prop: any): number { return prop?.number || 0 }
function nDate(prop: any): string { return prop?.date?.start || '' }
function nDateEnd(prop: any): string { return prop?.date?.end || '' }
function nCheckbox(prop: any): boolean { return prop?.checkbox || false }
function nPhone(prop: any): string { return prop?.phone_number || '' }
function nEmail(prop: any): string { return prop?.email || '' }
function nPeople(prop: any): string { return (prop?.people || []).map((p: any) => p.name || '').join(', ') }

// Get migration status
app.get('/api/notion/status', async (c) => {
  const db = c.env.DB
  const tables = ['projects', 'vendors', 'users', 'consultations', 'expenses', 'leave_requests', 'leave_types']
  const counts: Record<string, number> = {}
  for (const t of tables) {
    try {
      const r = await db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).first<{cnt:number}>()
      counts[t] = r?.cnt || 0
    } catch { counts[t] = 0 }
  }
  return c.json({ counts, notion_dbs: Object.keys(NOTION_DB_IDS) })
})

// Migrate a specific table from Notion
app.post('/api/notion/migrate/:target', async (c) => {
  const db = c.env.DB
  const target = c.req.param('target')
  const body = await c.req.json() as { token?: string; mode?: string; batch_size?: number; batch_offset?: number }
  const token = body.token || c.env.NOTION_TOKEN || ''
  if (!token) return c.json({ error: 'Notion token required' }, 400)
  const mode = body.mode || 'merge' // merge=기존 유지+추가, replace=전체 교체
  const batchSize = body.batch_size || 0 // 0 = all at once
  const batchOffset = body.batch_offset || 0

  const dbId = (NOTION_DB_IDS as any)[target]
  if (!dbId) return c.json({ error: `Unknown target: ${target}` }, 400)

  let allResults: any[] = []
  let cursor: string | undefined = undefined
  do {
    const page: any = await notionQuery(token, dbId, cursor)
    allResults = allResults.concat(page.results || [])
    cursor = page.has_more ? page.next_cursor : undefined
  } while (cursor)

  const totalFetched = allResults.length
  // Apply batch slicing if batch_size is set
  if (batchSize > 0) {
    allResults = allResults.slice(batchOffset, batchOffset + batchSize)
  }

  let migrated = 0, skipped = 0, errors = 0
  const errorSamples: string[] = []

  if (target === 'projects') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare('DELETE FROM projects WHERE id LIKE ?').bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const id = 'notion-' + r.id.replace(/-/g, '')
        const nm = nText(p['프로젝트명']) || '(제목없음)'
        const client = nText(p['클라이언트'])
        const loc = nText(p['현장 주소'])
        const contact = nPhone(p['담당자'])
        const email = nEmail(p['이메일'])
        const mgr = nPeople(p['공사 담당자'])
        const date = nDate(p['수주일'])
        const status = nSelect(p['공사진행 상태']) || '작성중'
        const contract_status_raw = nSelect(p['상담계약 상태'])
        const contract_status = contract_status_raw === '계약 완료' ? '계약완료' : contract_status_raw === '확정/계약 전' ? '확정/계약전' : contract_status_raw || '미생성'
        const construction_status = nSelect(p['공사진행 상태'])
        const project_type = nSelect(p['프로젝트 구분'])
        const scope_tags = JSON.stringify(nMultiSelect(p['공사 범위']))
        const area_text = nText(p['예산 범위'])
        const start = nDate(p['공사 기간'])
        const end = nDateEnd(p['공사 기간'])
        const memo = nText(p['공사 내용'])
        const gantt_tasks = start ? JSON.stringify([{id:'auto',nm:'공사기간',start,end:end||start,color:'#2563eb',progress:0,assignee:mgr,note:''}]) : '[]'

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first()
          if (exists) { skipped++; continue }
        }
        await db.prepare(`INSERT OR REPLACE INTO projects (id,nm,client,contact,email,loc,mgr,date,status,contract_status,construction_status,project_type,scope_tags,memo,gantt_tasks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          id, nm, client, contact, email, loc, mgr, date, status, contract_status, construction_status, project_type, scope_tags, memo, gantt_tasks, r.created_time, r.last_edited_time
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  else if (target === 'vendors') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare('DELETE FROM vendors WHERE id LIKE ?').bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const id = 'notion-' + r.id.replace(/-/g, '')
        const nm = nText(p['거래처명']) || '(제목없음)'
        const contact = nText(p['거래처 담당자'])
        const phone = nPhone(p['전화번호'])
        const addr = nText(p['거래처 주소'])
        const category = nMultiSelect(p['업종']).join(', ')
        const bank_info = nText(p['계좌정보 A'])
        const memo = nText(p['비고'])

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM vendors WHERE id = ? OR nm = ?').bind(id, nm).first()
          if (exists) { skipped++; continue }
        }
        await db.prepare(`INSERT OR REPLACE INTO vendors (id,nm,contact,phone,addr,category,bank_info,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
          id, nm, contact, phone, addr, category, bank_info, memo, r.created_time
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  else if (target === 'employees') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare("DELETE FROM users WHERE id LIKE ? AND id != 'admin-default'").bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const name = nText(p['이름']) || '(이름없음)'
        const position = nSelect(p['직책'])
        const hire_date = nDate(p['입사일'])
        const id = 'notion-' + r.id.replace(/-/g, '')
        // Map position to role
        const role = (position === '소장' || position === '팀장') ? 'admin' : 'staff'
        const username = name.replace(/\s/g, '').toLowerCase()

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM users WHERE name = ?').bind(name).first()
          if (exists) {
            // Update position/hire_date on existing user
            await db.prepare('UPDATE users SET position = ?, hire_date = ? WHERE name = ?').bind(position, hire_date, name).run()
            skipped++; continue
          }
        }
        const pw = await hashPassword('fp' + username + '2026')
        await db.prepare(`INSERT OR REPLACE INTO users (id,username,password,name,role,position,hire_date,active) VALUES (?,?,?,?,?,?,?,1)`).bind(
          id, username, pw, name, role, position, hire_date
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  else if (target === 'consultations') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare('DELETE FROM consultations WHERE id LIKE ?').bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const id = 'notion-' + r.id.replace(/-/g, '')
        const client_name = nText(p['성함'])
        const client_phone = nPhone(p['연락처'])
        const location = nText(p['주소지'])
        const area_text = nText(p['공사면적'])
        const budget = nText(p['예산금액'])
        const client_email = nEmail(p['이메일'])
        const status_raw = nSelect(p['상태'])
        const status = status_raw === '상담 완료' ? '상담완료' : status_raw === '상담 신청' ? '신규' : status_raw === 'X' ? '종료' : status_raw || '신규'
        const privacy_agreed = nCheckbox(p['개인정보 수집과 이용에 대한 동의']) ? 1 : 0
        const marketing_agreed = nCheckbox(p['할인 등 혜택 안내를 위한 마케팅 활용 동의 (선택)']) ? 1 : 0
        const notes = nText(p['비고'])

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM consultations WHERE id = ?').bind(id).first()
          if (exists) { skipped++; continue }
        }
        await db.prepare(`INSERT OR REPLACE INTO consultations (id,client_name,client_phone,client_email,location,budget,area_text,status,privacy_agreed,marketing_agreed,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          id, client_name, client_phone, client_email, location, budget, area_text, status, privacy_agreed, marketing_agreed, notes, r.created_time, r.last_edited_time
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  else if (target === 'expenses') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare('DELETE FROM expenses WHERE id LIKE ?').bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const id = 'notion-' + r.id.replace(/-/g, '')
        const title = nText(p['제목']) || '(제목없음)'
        const amount = nNumber(p['지출 금액'])
        const amount_vat = nNumber(p['지출 금액(VAT포함)'])
        const vendor = nText(p['업체명'])
        const status_arr = nMultiSelect(p['처리상태'])
        const status = status_arr.includes('지급완료') ? '완료' : status_arr.includes('반려') ? '반려' : status_arr.includes('요청') ? '대기' : '대기'
        const has_invoice = nCheckbox(p['계산서 여부']) ? 1 : 0
        const payment_due = nSelect(p['요청일'])
        const memo = nText(p['비고'])

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM expenses WHERE id = ?').bind(id).first()
          if (exists) { skipped++; continue }
        }
        await db.prepare(`INSERT OR REPLACE INTO expenses (id,title,amount,amount_vat,vendor,status,has_invoice,payment_due,memo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
          id, title, amount, amount_vat, vendor, status, has_invoice, payment_due, memo, r.created_time
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  else if (target === 'leave_requests') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare('DELETE FROM leave_requests WHERE id LIKE ?').bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const id = 'notion-' + r.id.replace(/-/g, '')
        const title = nText(p['제목'])
        const start_date = nDate(p['신청기간'])
        const end_date = nDateEnd(p['신청기간'])
        const reason = nText(p['신청사유'])
        const status_raw = nSelect(p['현재상태'])
        const status = status_raw === '승인완료' ? '승인' : status_raw === '승인반려' ? '반려' : status_raw === '관리자 확인 중' ? '검토중' : '작성중'
        const reviewer = nPeople(p['처리자'])
        const reviewer_memo = nText(p['처리자 메모'])
        const reviewed_at = nDate(p['처리일시'])

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM leave_requests WHERE id = ?').bind(id).first()
          if (exists) { skipped++; continue }
        }
        await db.prepare(`INSERT OR REPLACE INTO leave_requests (id,user_name,leave_type,start_date,end_date,reason,status,reviewer_name,reviewer_memo,reviewed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
          id, title, '연차', start_date, end_date || start_date, reason, status, reviewer, reviewer_memo, reviewed_at, r.created_time
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  else if (target === 'leave_types') {
    if (mode === 'replace' && batchOffset === 0) await db.prepare('DELETE FROM leave_types WHERE id LIKE ?').bind('notion-%').run()
    for (const r of allResults) {
      try {
        const p = r.properties
        const id = 'notion-' + r.id.replace(/-/g, '')
        const name = nText(p['휴가명']) || '(제목없음)'
        const category = nSelect(p['휴가구분'])
        const default_days_raw = nSelect(p['기본 휴가일수'])
        const default_days = parseFloat(default_days_raw) || 1
        const consumes_annual = nCheckbox(p['연차소비']) ? 1 : 0

        if (mode === 'merge') {
          const exists = await db.prepare('SELECT id FROM leave_types WHERE id = ?').bind(id).first()
          if (exists) { skipped++; continue }
        }
        await db.prepare(`INSERT OR REPLACE INTO leave_types (id,name,category,default_days,consumes_annual,created_at) VALUES (?,?,?,?,?,?)`).bind(
          id, name, category, default_days, consumes_annual, r.created_time
        ).run()
        migrated++
      } catch(e: any) { errors++; if (errorSamples.length < 5) errorSamples.push(e?.message || String(e)) }
    }
  }

  return c.json({ target, total_fetched: totalFetched, batch_processed: allResults.length, migrated, skipped, errors, mode, ...(batchSize > 0 ? { batch_offset: batchOffset, batch_size: batchSize } : {}), ...(errorSamples.length > 0 ? { errorSamples: errorSamples.slice(0, 5) } : {}) })
})

// Notion DB ID lookup for direct iteration
app.post('/api/notion/migrate-all', async (c) => {
  // For migrate-all, we internally call the same logic per target
  // This avoids self-fetch which is problematic in Workers
  return c.json({ error: 'Use individual /api/notion/migrate/:target endpoints for each table, or call them sequentially from the frontend.' }, 400)
})

// ===== EXTERNAL INQUIRY FORM (public, no auth — for website embed) =====
// POST body: { name, phone?, email?, company?, area_text?, budget_range?, requirements?, timeline?, privacy_agreed, marketing_agreed?, _hp? }
app.post('/api/inquiry', async (c) => {
  try {
    const body = await c.req.json<any>()
    // Honeypot — bots fill hidden _hp field, real users don't
    if (body._hp) return c.json({ ok: true })
    if (!body.name || (!body.phone && !body.email)) {
      return c.json({ error: '이름과 (연락처 또는 이메일)은 필수입니다' }, 400)
    }
    if (!body.privacy_agreed) {
      return c.json({ error: '개인정보 수집·이용 동의가 필요합니다' }, 400)
    }
    // Suggest 3 business days within +2~+7
    const now = new Date()
    const suggestions: string[] = []
    const d = new Date(now)
    for (let i = 0; i < 14 && suggestions.length < 3; i++) {
      d.setDate(d.getDate() + 1)
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue
      const offset = Math.ceil((d.getTime() - now.getTime()) / 86400000)
      if (offset >= 2 && offset <= 7) suggestions.push(d.toISOString().slice(0, 10))
    }
    // Insert into consultations
    const id = `inq-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const now_iso = new Date().toISOString()
    const notes = [
      body.company ? `회사: ${body.company}` : '',
      body.area_text ? `면적: ${body.area_text}` : '',
      body.budget_range ? `예산: ${body.budget_range}` : '',
      body.timeline ? `희망일정: ${body.timeline}` : '',
      body.requirements ? `요구사항: ${body.requirements}` : ''
    ].filter(Boolean).join('\n')
    await c.env.DB.prepare(`
      INSERT INTO consultations (
        id, client_name, client_phone, client_email, client_contact,
        source, status, pipeline_stage, notes,
        privacy_agreed, marketing_agreed, area_text,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'website', '신규', '초기상담', ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      String(body.name).slice(0, 80),
      String(body.phone || '').slice(0, 40),
      String(body.email || '').slice(0, 120),
      String(body.company || '').slice(0, 120),
      notes.slice(0, 4000),
      body.privacy_agreed ? 1 : 0,
      body.marketing_agreed ? 1 : 0,
      String(body.area_text || '').slice(0, 40),
      now_iso,
      now_iso
    ).run()
    // Email notification (best-effort)
    const apiKey = c.env.RESEND_API_KEY
    if (apiKey) {
      const esc = (s: any) => String(s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Frame Plus ERP <onboarding@resend.dev>',
            to: ['main@frameplus.kr'],
            subject: `[상담신청] ${esc(body.name)}${body.company ? ' / ' + esc(body.company) : ''}`,
            html: `
              <h2 style="font-family:sans-serif;color:#DC2626">새 상담 신청</h2>
              <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;border:1px solid #E5E7EB">
                <tr><td style="background:#F9FAFB"><b>이름</b></td><td>${esc(body.name)}</td></tr>
                <tr><td style="background:#F9FAFB"><b>연락처</b></td><td>${esc(body.phone || '-')}</td></tr>
                <tr><td style="background:#F9FAFB"><b>이메일</b></td><td>${esc(body.email || '-')}</td></tr>
                <tr><td style="background:#F9FAFB"><b>회사</b></td><td>${esc(body.company || '-')}</td></tr>
                <tr><td style="background:#F9FAFB"><b>면적</b></td><td>${esc(body.area_text || '-')}</td></tr>
                <tr><td style="background:#F9FAFB"><b>예산</b></td><td>${esc(body.budget_range || '-')}</td></tr>
                <tr><td style="background:#F9FAFB"><b>희망일정</b></td><td>${esc(body.timeline || '-')}</td></tr>
                <tr><td style="background:#F9FAFB"><b>요구사항</b></td><td><pre style="white-space:pre-wrap;font-family:inherit;margin:0">${esc(body.requirements || '-')}</pre></td></tr>
                <tr><td style="background:#F9FAFB"><b>마케팅 수신</b></td><td>${body.marketing_agreed ? '동의' : '미동의'}</td></tr>
              </table>
              <p style="margin-top:16px;font-family:sans-serif"><b>추천 미팅 후보일:</b> ${suggestions.join(', ') || '-'}</p>
              <p style="font-family:sans-serif;margin-top:20px"><a href="https://frameplus-erp.pages.dev/" style="background:#DC2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">ERP에서 상담 칸반 보기 →</a></p>
            `
          })
        })
      } catch (_) { /* ignore email errors */ }
    }
    // SMS auto-reply to inquirer (best-effort — needs SOLAPI_* env)
    if (body.phone) {
      try {
        await sendSolapi(c.env, {
          to: String(body.phone),
          text: `[프레임플러스] ${String(body.name).slice(0,40)}님, 상담 신청이 접수되었습니다. 영업일 1일 이내 연락드리겠습니다.\n추천 미팅일: ${suggestions.join(', ') || '-'}`,
          type: 'SMS'
        })
      } catch (_) { /* ignore */ }
    }
    return c.json({
      ok: true,
      id,
      suggestedDates: suggestions,
      message: '상담 신청이 접수되었습니다. 영업일 기준 1일 이내 연락드리겠습니다.'
    })
  } catch (e: any) {
    return c.json({ error: e?.message || 'inquiry failed' }, 500)
  }
})

// ===== SETTLEMENT MIGRATION (stl_* → ERP core tables) — P5 단계 2 =====
// POST body: { dryRun?: boolean, mode?: 'merge' | 'replace' }
app.post('/api/migrate-settlement', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const dryRun = !!body.dryRun
  const mode = body.mode === 'replace' ? 'replace' : 'merge'
  const stats: Record<string, { found: number; migrated: number; skipped: number }> = {
    labor: { found: 0, migrated: 0, skipped: 0 },
    material: { found: 0, migrated: 0, skipped: 0 },
    subcontract: { found: 0, migrated: 0, skipped: 0 },
    expense: { found: 0, migrated: 0, skipped: 0 },
    transport: { found: 0, migrated: 0, skipped: 0 },
    payment: { found: 0, migrated: 0, skipped: 0 },
  }
  try {
    // 1) stl_labor_costs → labor_costs
    const labors = await c.env.DB.prepare('SELECT * FROM stl_labor_costs').all<any>().catch(() => ({ results: [] as any[] }))
    stats.labor.found = labors.results?.length || 0
    for (const r of (labors.results || [])) {
      const newId = 'stl-' + r.id
      if (mode === 'merge') {
        const ex = await c.env.DB.prepare('SELECT id FROM labor_costs WHERE id=?').bind(newId).first()
        if (ex) { stats.labor.skipped++; continue }
      }
      if (!dryRun) {
        const total = (Number(r.daily_rate || 0) * Number(r.days || 0) * Number(r.workers || 1)) + Number(r.surcharge || 0)
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO labor_costs (id, pid, date, worker_name, worker_type, daily_rate, days, total, work_type, job, surcharge, memo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(newId, r.project_id || '', r.date || '', r.job || '-', r.work_type || '', Number(r.daily_rate || 0), Number(r.days || 0), total, r.work_type || '', r.job || '', Number(r.surcharge || 0), '정산관리 노무비 이관', r.created_at || new Date().toISOString()).run()
      }
      stats.labor.migrated++
    }
    // 2) stl_material_costs → orders_manual (cost_type='material')
    const mats = await c.env.DB.prepare('SELECT * FROM stl_material_costs').all<any>().catch(() => ({ results: [] as any[] }))
    stats.material.found = mats.results?.length || 0
    for (const r of (mats.results || [])) {
      const newId = 'stl-mat-' + r.id
      if (mode === 'merge') {
        const ex = await c.env.DB.prepare('SELECT id FROM orders_manual WHERE id=?').bind(newId).first()
        if (ex) { stats.material.skipped++; continue }
      }
      if (!dryRun) {
        const amount = Number(r.qty || 1) * Number(r.price || 0)
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO orders_manual (id, pid, vendor, order_date, amount, items, cost_type, memo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'material', ?, ?)`
        ).bind(newId, r.project_id || '', r.vendor || '', r.date || '', amount, JSON.stringify([{ name: r.name, qty: r.qty, unit: r.unit, price: r.price, category: r.category }]), '정산관리 자재비 이관', r.created_at || new Date().toISOString()).run()
      }
      stats.material.migrated++
    }
    // 3) stl_sub_costs → orders_manual (cost_type='subcontract')
    const subs = await c.env.DB.prepare('SELECT * FROM stl_sub_costs').all<any>().catch(() => ({ results: [] as any[] }))
    stats.subcontract.found = subs.results?.length || 0
    for (const r of (subs.results || [])) {
      const newId = 'stl-sub-' + r.id
      if (mode === 'merge') {
        const ex = await c.env.DB.prepare('SELECT id FROM orders_manual WHERE id=?').bind(newId).first()
        if (ex) { stats.subcontract.skipped++; continue }
      }
      if (!dryRun) {
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO orders_manual (id, pid, vendor, order_date, amount, items, cost_type, memo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'subcontract', ?, ?)`
        ).bind(newId, r.project_id || '', r.contractor || '', r.date || '', Number(r.amount || 0), JSON.stringify([{ work_type: r.work_type, content: r.content, contract_no: r.contract_no }]), '정산관리 외주비 이관', r.created_at || new Date().toISOString()).run()
      }
      stats.subcontract.migrated++
    }
    // 4) stl_expense_costs → expenses
    const exps = await c.env.DB.prepare('SELECT * FROM stl_expense_costs').all<any>().catch(() => ({ results: [] as any[] }))
    stats.expense.found = exps.results?.length || 0
    for (const r of (exps.results || [])) {
      const newId = 'stl-exp-' + r.id
      if (mode === 'merge') {
        const ex = await c.env.DB.prepare('SELECT id FROM expenses WHERE id=?').bind(newId).first()
        if (ex) { stats.expense.skipped++; continue }
      }
      if (!dryRun) {
        const amount = Number(r.qty || 1) * Number(r.price || 0)
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO expenses (id, pid, date, category, title, amount, status, memo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, '완료', ?, ?)`
        ).bind(newId, r.project_id || '', r.date || '', r.category || '기타', r.name || '-', amount, '정산관리 경비 이관', r.created_at || new Date().toISOString()).run()
      }
      stats.expense.migrated++
    }
    // 5) stl_transport_costs → expenses (is_transport=1)
    const trans = await c.env.DB.prepare('SELECT * FROM stl_transport_costs').all<any>().catch(() => ({ results: [] as any[] }))
    stats.transport.found = trans.results?.length || 0
    for (const r of (trans.results || [])) {
      const newId = 'stl-trs-' + r.id
      if (mode === 'merge') {
        const ex = await c.env.DB.prepare('SELECT id FROM expenses WHERE id=?').bind(newId).first()
        if (ex) { stats.transport.skipped++; continue }
      }
      if (!dryRun) {
        const amount = Number(r.qty || 1) * Number(r.price || 0)
        const title = `${r.origin || '-'} → ${r.destination || '-'} (${r.item || '운반'})`
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO expenses (id, pid, date, category, title, amount, status, is_transport, origin, destination, vehicle, memo, created_at)
           VALUES (?, ?, ?, '운반', ?, ?, '완료', 1, ?, ?, ?, ?, ?)`
        ).bind(newId, r.project_id || '', r.date || '', title, amount, r.origin || '', r.destination || '', r.vehicle || '', '정산관리 운반비 이관', r.created_at || new Date().toISOString()).run()
      }
      stats.transport.migrated++
    }
    // 6) stl_payments → projects.payments JSON
    const pays = await c.env.DB.prepare('SELECT * FROM stl_payments').all<any>().catch(() => ({ results: [] as any[] }))
    stats.payment.found = pays.results?.length || 0
    if (!dryRun) {
      const byProject: Record<string, any[]> = {}
      for (const r of (pays.results || [])) {
        const pid = r.project_id || ''
        if (!pid) { stats.payment.skipped++; continue }
        if (!byProject[pid]) byProject[pid] = []
        byProject[pid].push({ id: 'stl-pay-' + r.id, date: r.date, description: r.description, amount: Number(r.amount || 0), method: r.method, paid: true })
      }
      for (const [pid, list] of Object.entries(byProject)) {
        const proj = await c.env.DB.prepare('SELECT id, payments FROM projects WHERE id=?').bind(pid).first<any>()
        if (proj) {
          let existing: any[] = []
          try { existing = JSON.parse(proj.payments || '[]') } catch (_) { existing = [] }
          const existingIds = new Set(existing.map((p: any) => p.id))
          for (const p of list) {
            if (mode === 'merge' && existingIds.has(p.id)) { stats.payment.skipped++; continue }
            existing.push(p); stats.payment.migrated++
          }
          await c.env.DB.prepare('UPDATE projects SET payments=? WHERE id=?').bind(JSON.stringify(existing), pid).run()
        } else { stats.payment.skipped += list.length }
      }
    } else {
      stats.payment.migrated = stats.payment.found
    }
    return c.json({ ok: true, dryRun, mode, stats })
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || 'migration failed', stats }, 500)
  }
})

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
<title>Frame Plus ERP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600;700;800&family=Noto+Sans+KR:wght@300;400;500;600;700;800&family=Noto+Serif+KR:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏗️</text></svg>">
<style>
/* ===== FRAME PLUS ERP v8.6 - Claude-Inspired Editorial Design ===== */
:root{
  /* Accent — Red as point color */
  --primary:#DC2626;--primary-light:#FEF2F2;--primary-dark:#991B1B;--primary-50:#FEF2F2;--primary-100:#FEE2E2;--primary-500:#DC2626;--primary-600:#B91C1C;--primary-700:#991B1B;
  /* Neutrals — warm beige/ivory scale */
  --gray-50:#FAF9F4;--gray-100:#F3F1E9;--gray-200:#E5E3DC;--gray-300:#D1CFC8;--gray-400:#9C9B95;--gray-500:#6B6A65;--gray-600:#4B4A45;--gray-700:#373633;--gray-800:#1F1E1C;--gray-900:#0F0E0C;
  /* Status colors — muted */
  --success:#15803D;--success-light:#DCFCE7;--danger:#DC2626;--danger-light:#FEE2E2;--warning:#B45309;--warning-light:#FEF3C7;--info:#1F1F1F;--info-light:#F3F1E9;
  --purple:#7C3AED;--purple-light:#EDE9FE;--teal:#0F766E;--teal-light:#CCFBF1;--pink:#BE185D;--pink-light:#FCE7F3;
  /* Backgrounds & surfaces — Claude.ai warm ivory */
  --white:#FFFFFF;--bg:#F5F4EE;--card:#FFFFFF;--border:#E5E3DC;--border-light:#F3F1E9;
  /* Text — near-black on warm bg */
  --text:#1F1E1C;--text-secondary:#4B4A45;--text-muted:#6B6A65;
  --font-sans:'Noto Sans','Noto Sans KR','Apple SD Gothic Neo',system-ui,-apple-system,sans-serif;--font-serif:'Noto Serif KR',serif;
  --sidebar-w:260px;--sidebar-collapsed:68px;--topbar-h:56px;
  --radius-sm:6px;--radius:10px;--radius-lg:14px;--radius-xl:20px;
  --shadow-xs:0 1px 2px rgba(0,0,0,.04);--shadow-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);--shadow:0 4px 6px -1px rgba(0,0,0,.07),0 2px 4px -2px rgba(0,0,0,.05);--shadow-md:0 10px 15px -3px rgba(0,0,0,.08),0 4px 6px -4px rgba(0,0,0,.04);--shadow-lg:0 20px 25px -5px rgba(0,0,0,.08),0 8px 10px -6px rgba(0,0,0,.04);
  --transition:all .2s cubic-bezier(.4,0,.2,1);
}
/* ===== Backward-compatible aliases for v6 CSS vars ===== */
:root{
  --black:var(--gray-900);--dark:var(--text);--charcoal:var(--gray-700);
  --g800:var(--gray-800);--g700:var(--gray-700);--g600:var(--gray-600);--g500:var(--gray-500);--g400:var(--gray-400);--g300:var(--gray-300);--g200:var(--gray-200);--g150:var(--gray-200);--g100:var(--gray-100);--g50:var(--gray-50);
  --blue:var(--info);--blue-l:var(--info-light);--green:var(--success);--green-l:var(--success-light);
  --red:var(--danger);--red-l:var(--danger-light);--orange:var(--warning);--orange-l:var(--warning-light);
  --purple-l:var(--purple-light);--teal-l:var(--teal-light);
  --serif:var(--font-serif);--sans:var(--font-sans);
  --sw:var(--sidebar-w);--swc:var(--sidebar-collapsed);--hdr:var(--topbar-h);
  --border2:var(--border);
  --shadow-md:0 10px 15px -3px rgba(0,0,0,.08),0 4px 6px -4px rgba(0,0,0,.04);
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}

/* ===== DARK MODE — Claude-inspired warm dark ===== */
html.dark{
  --primary:#EF4444;--primary-light:rgba(239,68,68,.12);--primary-dark:#DC2626;--primary-50:rgba(239,68,68,.06);--primary-100:rgba(239,68,68,.14);--primary-500:#EF4444;--primary-600:#DC2626;--primary-700:#B91C1C;
  --gray-50:#1A1917;--gray-100:#262421;--gray-200:#363330;--gray-300:#4A4744;--gray-400:#6B6863;--gray-500:#8F8C86;--gray-600:#B5B2AC;--gray-700:#D2CFC9;--gray-800:#E8E5DF;--gray-900:#F5F4EE;
  --success:#34D399;--success-light:rgba(52,211,153,.15);--danger:#F87171;--danger-light:rgba(248,113,113,.15);--warning:#FBBF24;--warning-light:rgba(251,191,36,.15);--info:#60A5FA;--info-light:rgba(96,165,250,.15);
  --purple:#A78BFA;--purple-light:rgba(167,139,250,.15);--teal:#2DD4BF;--teal-light:rgba(45,212,191,.15);--pink:#F472B6;--pink-light:rgba(244,114,182,.15);
  --white:#1A1917;--bg:#13110F;--card:#1F1D1A;--border:#363330;--border-light:#2A2825;
  --text:#F5F4EE;--text-secondary:#D2CFC9;--text-muted:#8F8C86;
}
html.dark body{background:var(--bg);color:var(--text)}
html.dark #sidebar{background:#13110F;border-color:#363330}
html.dark .sb-item:hover{background:rgba(255,255,255,.04)}
html.dark .sb-item.active{background:var(--primary-light);color:var(--primary)}
html.dark .sb-item.active .sb-icon{color:var(--primary)}
html.dark #topbar{background:var(--card);border-color:var(--border)}
html.dark .modal{background:var(--card);color:var(--text)}
html.dark .inp,.dark .sel{background:var(--gray-100);border-color:var(--gray-200);color:var(--text)}
html.dark .tbl th{background:var(--gray-100);color:var(--gray-500)}
html.dark .tbl tr:hover td{background:var(--gray-50)}
html.dark .est-summary{background:#020617}
html.dark .est-sec-hdr{background:var(--card)}
html.dark .contract-doc{background:var(--card);color:var(--text)}
html.dark .toast{background:var(--primary-600)}
html.dark .btn-primary{background:var(--primary);color:#fff}
html.dark .btn-outline{background:var(--card);border-color:var(--border);color:var(--text)}
html.dark .kpi-card{background:var(--card);border-color:var(--border)}
html.dark .card{background:var(--card);border-color:var(--border)}
html.dark .filter-bar .inp,html.dark .filter-bar .sel{background:var(--gray-100);border-color:var(--gray-200);color:var(--text)}
html.dark .tbl td{color:var(--text);border-color:var(--border)}
html.dark .tbl-wrap{background:var(--card);border-color:var(--border)}
html.dark .est-section{background:var(--card);border-color:var(--border)}
html.dark .gantt-wrap{background:var(--card);border-color:var(--border)}
html.dark .cal-wrap{background:var(--card);border-color:var(--border)}
html.dark .cal-cell{border-color:var(--border)}
html.dark .cal-day-hdr{background:var(--gray-100);border-color:var(--border);color:var(--text-muted)}
html.dark .cost-flow{background:var(--card);border-color:var(--border)}
html.dark .badge-gray{background:var(--gray-200);color:var(--gray-500)}
html.dark .empty-state{color:var(--text-muted)}
html.dark .tab-btn{color:var(--text-muted)}
html.dark .tab-btn.active{color:var(--primary)}
html.dark .tab-list{border-color:var(--border)}
html.dark .mobile-nav{background:var(--card);border-color:var(--border)}
html.dark .mobile-nav-item{color:var(--text-muted)}
html.dark .mobile-nav-item.active{color:var(--primary)}

/* ===== ANIMATIONS ===== */
@keyframes shimmer{0%{opacity:.6}50%{opacity:.3}100%{opacity:.6}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes scaleIn{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}

/* ===== BASE ===== */
body{font-family:var(--font-sans);background:var(--bg);color:var(--text);font-size:13.5px;line-height:1.6;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
button{cursor:pointer;font-family:var(--font-sans)}
input,select,textarea{font-family:var(--font-sans);font-size:13.5px}
a{text-decoration:none;color:inherit}
::selection{background:var(--primary-100);color:var(--primary-700)}
*:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:var(--radius-sm)}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:none}

/* ===== LAYOUT ===== */
#app{display:flex;height:100vh;overflow:hidden}
#sidebar{width:var(--sidebar-w);min-width:var(--sidebar-w);background:var(--white);display:flex;flex-direction:column;transition:var(--transition);overflow:hidden;position:relative;z-index:100;border-right:1px solid var(--border)}
#sidebar.collapsed{width:var(--sidebar-collapsed);min-width:var(--sidebar-collapsed)}
.sb-header{height:var(--topbar-h);display:flex;align-items:center;padding:0 16px;border-bottom:1px solid var(--border-light);flex-shrink:0;gap:10px}
.sb-logo{display:flex;align-items:center;gap:10px;white-space:nowrap;opacity:1;transition:opacity .2s}
.sb-logo-icon{width:32px;height:32px;background:linear-gradient(135deg,#1F1E1C 0%,#4B4A45 100%);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sb-logo-icon svg{width:18px;height:18px;color:#fff}
.sb-logo-text{font-size:16px;font-weight:700;color:var(--text);letter-spacing:-.02em}
.sb-logo-ver{font-size:10px;font-weight:500;color:var(--text-muted);margin-left:2px}
.collapsed .sb-logo-text,.collapsed .sb-logo-ver{display:none}
.sb-toggle{margin-left:auto;width:34px;height:34px;border:1px solid var(--border);background:var(--white);color:var(--text);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);transition:var(--transition);flex-shrink:0;cursor:pointer}
.sb-toggle:hover{background:var(--primary);color:#fff;border-color:var(--primary);transform:scale(1.05)}
.collapsed .sb-toggle{margin-left:auto;margin-right:0}
.collapsed #sidebar .sb-header{justify-content:center}
.collapsed #sidebar .sb-logo{display:none}
.collapsed #sidebar .sb-toggle{margin:0 auto}
.sb-nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px 10px}
.sb-nav::-webkit-scrollbar{width:3px}
.sb-nav::-webkit-scrollbar-track{background:transparent}
.sb-nav::-webkit-scrollbar-thumb{background:var(--gray-200);border-radius:2px}
.sb-section{padding:14px 0 4px}
.sb-section:first-child{padding-top:0}
.sb-section-label{font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--text-muted);text-transform:uppercase;padding:0 10px 6px;white-space:nowrap;overflow:hidden;transition:opacity .2s}
.collapsed .sb-section-label{opacity:0}
.sb-item{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition);color:var(--text-secondary);font-size:13px;font-weight:500;white-space:nowrap;position:relative;margin-bottom:1px}
.sb-item:hover{background:var(--gray-100);color:var(--text)}
.sb-item.active{background:var(--primary-light);color:var(--primary)}
.sb-icon{width:18px;height:18px;flex-shrink:0;color:var(--gray-400);transition:var(--transition);display:flex;align-items:center;justify-content:center}
.sb-item.active .sb-icon{color:var(--primary)}
.sb-item:hover .sb-icon{color:var(--text-secondary)}
.sb-label{flex:1;overflow:hidden;transition:opacity .2s,width .2s}
.collapsed .sb-label{opacity:0;width:0}
.sb-badge{background:var(--danger);color:#fff;font-size:9px;font-weight:700;border-radius:10px;padding:2px 6px;line-height:1.3;flex-shrink:0;min-width:18px;text-align:center}
.collapsed .sb-badge{position:absolute;top:4px;right:4px;padding:1px 4px;font-size:8px}
.sb-user{padding:12px 16px;border-top:1px solid var(--border-light);flex-shrink:0;display:flex;align-items:center;gap:10px}
.sb-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#DC2626 0%,#991B1B 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
.sb-user-info{overflow:hidden}
.sb-user-name{font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-user-role{font-size:11px;color:var(--text-muted)}
.collapsed .sb-user-info{display:none}

/* ===== MAIN AREA ===== */
#main{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--bg)}
#topbar{height:var(--topbar-h);background:var(--white);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 24px;gap:16px;flex-shrink:0}
.topbar-title{font-size:16px;font-weight:700;color:var(--text);letter-spacing:-.01em}
.topbar-sub{font-size:12px;color:var(--text-muted);margin-left:4px}
.topbar-breadcrumb{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)}
.topbar-breadcrumb span{cursor:pointer;transition:color .15s}
.topbar-breadcrumb span:hover{color:var(--primary)}
.topbar-breadcrumb .sep{color:var(--gray-300)}
.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
#content{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px}
#content::-webkit-scrollbar{width:5px}
#content::-webkit-scrollbar-track{background:transparent}
#content::-webkit-scrollbar-thumb{background:var(--gray-300);border-radius:3px}

/* ===== BUTTONS ===== */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--radius);border:none;font-size:13px;font-weight:500;transition:var(--transition);cursor:pointer;white-space:nowrap;line-height:1.4}
.btn-sm{padding:6px 12px;font-size:12px;border-radius:var(--radius-sm)}
.btn-lg{padding:10px 20px;font-size:14px}
.btn-primary{background:var(--primary);color:#fff;box-shadow:0 1px 2px rgba(79,70,229,.3)}.btn-primary:hover{background:var(--primary-dark);box-shadow:0 2px 8px rgba(79,70,229,.35)}
.btn-blue{background:var(--info);color:#fff}.btn-blue:hover{background:#2563EB}
.btn-green{background:var(--success);color:#fff}.btn-green:hover{background:#059669}
.btn-red{background:var(--danger);color:#fff}.btn-red:hover{background:#DC2626}
.btn-outline{background:var(--white);border:1px solid var(--border);color:var(--text-secondary)}.btn-outline:hover{border-color:var(--gray-400);background:var(--gray-50)}
.btn-ghost{background:transparent;color:var(--text-secondary)}.btn-ghost:hover{background:var(--gray-100)}
.btn-icon{width:32px;height:32px;padding:0;justify-content:center;border-radius:var(--radius-sm)}

/* ===== CARDS ===== */
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;transition:box-shadow .2s}
.card:hover{box-shadow:var(--shadow-sm)}
.card-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.card-title .icon{color:var(--text-muted)}

/* ===== KPI CARDS (Pluuug style) ===== */
.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden;transition:var(--transition)}
.kpi-card:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.kpi-card.kpi-primary::before{background:var(--primary)}
.kpi-card.kpi-success::before{background:var(--success)}
.kpi-card.kpi-danger::before{background:var(--danger)}
.kpi-card.kpi-warning::before{background:var(--warning)}
.kpi-card.kpi-info::before{background:var(--info)}
.kpi-card.kpi-purple::before{background:var(--purple)}
.kpi-label{font-size:12px;color:var(--text-muted);font-weight:500;display:flex;align-items:center;gap:6px}
.kpi-value{font-size:26px;font-weight:800;line-height:1.2;letter-spacing:-.02em;color:var(--text);font-variant-numeric:tabular-nums}
.kpi-sub{font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:4px}
.kpi-change{font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:20px}
.kpi-change.up{background:var(--success-light);color:var(--success)}
.kpi-change.down{background:var(--danger-light);color:var(--danger)}

/* ===== TABLES ===== */
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card)}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{background:var(--gray-50);color:var(--text-muted);font-weight:600;font-size:11.5px;padding:10px 14px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap;cursor:pointer;user-select:none;text-transform:uppercase;letter-spacing:.03em}
.tbl th:hover{color:var(--text)}
.tbl td{padding:12px 14px;border-bottom:1px solid var(--border-light);color:var(--text);vertical-align:middle}
.tbl tr:hover td{background:var(--gray-50)}
.tbl tr:last-child td{border-bottom:none}

/* ===== BADGES ===== */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:600}
.badge-blue{background:var(--info-light);color:var(--info)}
.badge-green{background:var(--success-light);color:var(--success)}
.badge-red{background:var(--danger-light);color:var(--danger)}
.badge-orange{background:var(--warning-light);color:var(--warning)}
.badge-purple{background:var(--purple-light);color:var(--purple)}
.badge-warm{background:#F3EDE5;color:#9C6E3F;border:1px solid #E5D9C8}
.badge-red{background:var(--primary-light);color:var(--primary);border:1px solid var(--primary-100)}
.badge-gray{background:var(--gray-100);color:var(--gray-500)}
.badge-primary{background:var(--primary-light);color:var(--primary)}

/* ===== INPUTS ===== */
.inp{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13.5px;color:var(--text);background:var(--white);transition:var(--transition)}
.inp:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-50)}
.inp-sm{padding:6px 10px;font-size:12px}
.sel{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13.5px;color:var(--text);background:var(--white);cursor:pointer;transition:var(--transition)}
.sel:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-50)}
.lbl{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:5px}
.form-row{display:grid;gap:14px}
.form-row-2{grid-template-columns:1fr 1fr}
.form-row-3{grid-template-columns:1fr 1fr 1fr}
.form-row-4{grid-template-columns:1fr 1fr 1fr 1fr}

/* ===== MODALS ===== */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:1000;display:none;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:var(--white);border-radius:var(--radius-xl);width:min(680px,92vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-lg);animation:scaleIn .2s ease}
.modal-lg{width:min(900px,92vw)}
.modal-xl{width:min(1100px,95vw)}
.modal-sm{width:min(440px,92vw)}
.modal-hdr{padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.modal-title{font-size:16px;font-weight:700;color:var(--text)}
.modal-close{width:28px;height:28px;border:none;background:none;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;color:var(--text-muted);cursor:pointer;transition:var(--transition)}
.modal-close:hover{background:var(--gray-100);color:var(--text)}
.modal-body{padding:24px;overflow-y:auto;flex:1}
.modal-footer{padding:16px 24px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0}

/* ===== TOAST ===== */
#toast-area{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{background:var(--gray-800);color:#fff;padding:12px 18px;border-radius:var(--radius);font-size:13px;font-weight:500;box-shadow:var(--shadow-md);max-width:360px;animation:slideIn .3s ease;display:flex;align-items:center;gap:8px}
.toast-success{background:var(--success)}
.toast-error{background:var(--danger)}
.toast-warning{background:var(--warning);color:var(--gray-900)}

/* ===== PROGRESS ===== */
.prog{height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden}
.prog-bar{height:100%;border-radius:3px;transition:width .4s ease}
.prog-blue .prog-bar{background:var(--info)}
.prog-green .prog-bar{background:var(--success)}
.prog-orange .prog-bar{background:var(--warning)}
.prog-red .prog-bar{background:var(--danger)}
.prog-primary .prog-bar{background:var(--primary)}

/* ===== TABS ===== */
.tab-list{display:flex;gap:2px;border-bottom:2px solid var(--border);margin-bottom:20px}
.tab-btn{padding:10px 18px;border:none;background:none;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:var(--transition);border-radius:var(--radius-sm) var(--radius-sm) 0 0}
.tab-btn.active{color:var(--primary);border-bottom-color:var(--primary)}
.tab-btn:hover:not(.active){color:var(--text);background:var(--gray-50)}
.tab-pane{display:none}.tab-pane.active{display:block}

/* ===== FILTER BAR ===== */
.filter-bar{display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.filter-search{position:relative;flex:1;min-width:200px;max-width:320px}
.filter-search input{padding-left:36px}
.filter-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--gray-400)}

/* ===== DASHBOARD GRIDS ===== */
.dash-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}
.dash-grid-3{grid-template-columns:repeat(3,1fr)}
.dash-grid-2{grid-template-columns:repeat(2,1fr)}
.dash-2col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.dash-3col{display:grid;grid-template-columns:2fr 1fr;gap:16px}

/* ===== ESTIMATE SECTIONS ===== */
.est-section{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:10px;overflow:hidden}
.est-sec-hdr{padding:14px 18px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;background:var(--card);transition:background .15s}
.est-sec-hdr:hover{background:var(--gray-50)}
.est-sec-icon{font-size:16px}
.est-sec-title{font-size:13.5px;font-weight:600;flex:1;color:var(--text)}
.est-sec-count{font-size:11px;color:var(--text-muted);background:var(--gray-100);padding:2px 8px;border-radius:10px;font-weight:500}
.est-sec-total{font-size:14px;font-weight:700;color:var(--text);min-width:100px;text-align:right;font-variant-numeric:tabular-nums}
.est-sec-toggle{color:var(--gray-400);transition:transform .2s}
.est-sec-toggle.open{transform:rotate(180deg)}
.est-sec-body{display:none;border-top:1px solid var(--border)}
.est-sec-body.open{display:block}
.est-tbl{width:100%;border-collapse:collapse;font-size:12px}
.est-tbl th{background:var(--gray-50);color:var(--text-muted);font-size:10.5px;font-weight:600;padding:8px 12px;border-bottom:1px solid var(--border);text-align:right;text-transform:uppercase;letter-spacing:.03em}
.est-tbl th:first-child,.est-tbl th:nth-child(2),.est-tbl th:nth-child(3),.est-tbl th:nth-child(4){text-align:left}
.est-tbl td{padding:7px 12px;border-bottom:1px solid var(--border-light);vertical-align:middle}
.est-tbl tr:last-child td{border-bottom:none}
.est-tbl .inp{padding:5px 8px;font-size:12px}
.est-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.est-add-btn{display:flex;align-items:center;gap:6px;padding:10px 18px;color:var(--text-muted);font-size:12px;cursor:pointer;border:none;background:none;width:100%;transition:var(--transition)}
.est-add-btn:hover{color:var(--primary);background:var(--primary-light)}
.est-summary{background:linear-gradient(135deg,var(--gray-900) 0%,#1E293B 100%);border-radius:var(--radius-lg);overflow:hidden;margin-top:10px}
.est-sum-row{display:flex;align-items:center;padding:12px 24px;border-bottom:1px solid rgba(255,255,255,.06)}
.est-sum-row:last-child{border-bottom:none}
.est-sum-label{color:rgba(255,255,255,.55);font-size:13px;flex:1}
.est-sum-value{color:#fff;font-size:14px;font-weight:600;min-width:130px;text-align:right;font-variant-numeric:tabular-nums}
.est-sum-total{background:rgba(255,255,255,.04)}
.est-sum-total .est-sum-label{color:#fff;font-weight:700;font-size:14px}
.est-sum-total .est-sum-value{font-size:18px;font-weight:800}

/* ===== GANTT & ORDERS ===== */
.gantt-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-lg)}
.order-detail-wrap{display:grid;grid-template-columns:1fr 280px;gap:20px}
.order-right{display:flex;flex-direction:column;gap:12px}
.order-amt-card{background:linear-gradient(135deg,#1F1E1C 0%,#4B4A45 100%);color:#FAF9F4;border-radius:var(--radius-lg);padding:24px;text-align:center;border:1px solid #2A2825}
.order-amt-label{font-size:12px;color:rgba(255,255,255,.7);margin-bottom:4px}
.order-amt-value{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums}

/* ===== CONTRACT ===== */
.contract-doc{background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:36px;font-family:var(--font-serif);line-height:2;position:relative}
.contract-doc h2{font-size:20px;font-weight:700;text-align:center;margin-bottom:24px;letter-spacing:.1em}
.contract-doc h3{font-size:14px;font-weight:700;margin:20px 0 8px;border-bottom:1px solid var(--border);padding-bottom:6px}
.contract-clause{margin-bottom:12px;font-size:13px}
.contract-editable{border:none;background:transparent;border-bottom:1px solid transparent;padding:2px 4px;cursor:text;min-width:60px;font-family:inherit;font-size:inherit;color:inherit;transition:var(--transition)}
.contract-editable:hover{border-bottom-color:var(--border)}
.contract-editable:focus{outline:none;border-bottom-color:var(--primary);background:var(--primary-light)}

/* ===== CALENDAR ===== */
.cal-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
.cal-hdr{padding:18px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
.cal-title{font-size:17px;font-weight:700;flex:1;color:var(--text)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr)}
.cal-day-hdr{padding:10px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted);background:var(--gray-50);border-bottom:1px solid var(--border)}
.cal-day-hdr:first-child{color:var(--danger)}
.cal-day-hdr:last-child{color:var(--info)}
.cal-cell{min-height:85px;padding:6px 8px;border-right:1px solid var(--border-light);border-bottom:1px solid var(--border-light);vertical-align:top;cursor:pointer;transition:background .15s}
.cal-cell:hover{background:var(--gray-50)}
.cal-cell:nth-child(7n){border-right:none}
.cal-date{font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px}
.cal-date.today{background:var(--primary);color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px}
.cal-event{background:var(--primary-light);color:var(--primary);font-size:10px;padding:2px 6px;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}

/* ===== ESTIMATE PREVIEW ===== */
.pv-page{background:var(--white);max-width:860px;margin:0 auto 32px;box-shadow:var(--shadow-md);font-family:var(--font-serif)}
.pv-cover{min-height:100vh;background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);color:#fff;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.pv-cover::before{content:'';position:absolute;top:0;right:80px;width:1px;height:100%;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.06) 20%,rgba(255,255,255,.06) 80%,transparent)}
.pv-end{min-height:100vh;background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
.pv-end-circle{width:160px;height:160px;border-radius:50%;border:1px solid rgba(255,255,255,.2);display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:32px}
.pv-ep{padding:48px 60px;font-family:var(--font-serif)}
.pv-ep-logo{font-size:13px;font-weight:300;letter-spacing:.3em;color:var(--text-muted);text-transform:uppercase}
.pv-ep-title{font-size:22px;font-weight:700;letter-spacing:.12em;text-align:center;margin:24px 0 20px;padding:14px;border-top:2px solid var(--text);border-bottom:1px solid var(--gray-300)}
.pv-info-tbl{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}
.pv-info-tbl td{padding:7px 10px;border:1px solid var(--gray-200)}
.pv-info-tbl td:first-child{background:var(--gray-50);font-weight:600;width:100px}
.pv-stbl{width:100%;border-collapse:collapse;font-size:12px}
.pv-stbl th{background:var(--gray-900);color:#fff;padding:9px 10px;border:1px solid var(--gray-700);font-size:11px;font-weight:600;text-align:right}
.pv-stbl th:first-child,.pv-stbl th:nth-child(2){text-align:left}
.pv-stbl td{padding:7px 10px;border:1px solid var(--gray-200);text-align:right}
.pv-stbl td:first-child,.pv-stbl td:nth-child(2){text-align:left}
.pv-stbl tr.zero td{color:var(--gray-300)}
.pv-stbl tr.subtotal td{background:var(--gray-50);font-weight:600}
.pv-stbl tr.total td{background:var(--gray-100);font-weight:700;font-size:13px}
.pv-dtbl{width:100%;border-collapse:collapse;font-size:11.5px}
.pv-dtbl th{background:var(--gray-900);color:#fff;padding:7px 8px;border:1px solid var(--gray-700);font-size:10.5px;font-weight:600;text-align:center}
.pv-dtbl td{padding:6px 8px;border:1px solid var(--gray-200);vertical-align:middle;text-align:right}
.pv-dtbl td.tl{text-align:left}
.pv-dtbl tr.cat-hdr td{background:var(--gray-800);color:#fff;font-weight:700;font-size:12px;padding:9px 10px;text-align:left}
.pv-dtbl tr.sub-row td{background:var(--gray-50);font-weight:600;font-size:11px}
.pv-dtbl tr.total-row td{background:var(--gray-100);font-weight:700}
.pv-dtbl tr.indirect td{background:var(--gray-50)}
.pv-dtbl tr.grand-total td{background:var(--gray-800);color:#fff;font-weight:700;font-size:12px}
.pv-dtbl tr.adj-row td{background:var(--gray-50);color:var(--text-muted)}
.pv-dtbl tr.final-row td{background:var(--gray-900);color:#fff;font-weight:800;font-size:13px}
.chart-wrap{position:relative;height:260px}

/* ===== COST FLOW SUMMARY ===== */
.cost-flow{display:flex;align-items:center;gap:0;margin-bottom:20px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px 24px;overflow-x:auto}
.cost-flow-item{flex:1;min-width:120px;text-align:center;position:relative;padding:0 16px}
.cost-flow-item:not(:last-child)::after{content:'';position:absolute;right:-2px;top:50%;transform:translateY(-50%);width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:8px solid var(--gray-300)}
.cost-flow-label{font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:4px}
.cost-flow-value{font-size:18px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums}
.cost-flow-sub{font-size:10px;color:var(--text-muted);margin-top:2px}

/* ===== MOBILE BOTTOM NAV ===== */
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--white);border-top:1px solid var(--border);z-index:200;padding:4px 0 env(safe-area-inset-bottom,0)}
.mobile-nav-inner{display:flex;justify-content:space-around;align-items:center}
.mobile-nav-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 8px;border:none;background:none;cursor:pointer;color:var(--text-muted);font-size:10px;transition:var(--transition);font-weight:500}
.mobile-nav-item.active{color:var(--primary)}
.mobile-nav-item svg{width:20px;height:20px}
.mobile-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(2px);z-index:99}
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
@media(max-width:1200px){
  .dash-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:1024px){
  .dash-grid{grid-template-columns:repeat(2,1fr)}
  .dash-3col,.dash-2col{grid-template-columns:1fr}
  .form-row-4{grid-template-columns:1fr 1fr}
  .form-row-3{grid-template-columns:1fr 1fr}
  .order-detail-wrap{grid-template-columns:1fr}
}
@media(max-width:768px){
  #sidebar{position:fixed;left:-280px;top:0;bottom:0;width:280px;min-width:280px;transition:left .3s;z-index:200;box-shadow:var(--shadow-lg)}
  #sidebar.mobile-open{left:0}
  #sidebar.collapsed{width:280px;min-width:280px;left:-280px}
  #sidebar.collapsed.mobile-open{left:0}
  .collapsed .sb-logo-text,.collapsed .sb-logo-ver,.collapsed .sb-label,.collapsed .sb-section-label,.collapsed .sb-badge,.collapsed .sb-user-info{display:block;opacity:1;width:auto}
  .collapsed .sb-badge{position:static}
  #topbar{padding:0 14px}
  .topbar-title{font-size:14px}
  .topbar-actions .btn-sm{padding:5px 8px;font-size:11px}
  #content{padding:14px;padding-bottom:75px}
  .mobile-nav{display:block}
  .dash-grid{grid-template-columns:1fr 1fr}
  .dash-3col,.dash-2col{grid-template-columns:1fr}
  .form-row-2,.form-row-3,.form-row-4{grid-template-columns:1fr}
  .cal-cell{min-height:50px;padding:3px}
  .cal-event{font-size:8px;padding:1px 3px}
  .modal{width:96vw;max-height:92vh;border-radius:var(--radius-lg)}
  .modal-lg,.modal-xl{width:96vw}
  .kpi-value{font-size:20px}
  .btn-hamburger{display:flex!important}
  .order-detail-wrap{grid-template-columns:1fr}
  .cost-flow{flex-wrap:wrap;gap:12px}
  .cost-flow-item::after{display:none}
  /* P7-C: tables stay scrollable horizontally; cards tighter */
  .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .tbl{min-width:600px}
  .card{padding:16px}
  .card-title{font-size:13px}
  .filter-bar{flex-wrap:wrap;gap:8px}
  .filter-bar .inp,.filter-bar .sel{flex:1 1 140px;min-width:120px}
}
@media(max-width:480px){
  /* P7-C: full-screen modal on small phones, tighter spacing */
  .modal-bg{padding:0}
  .modal,.modal-lg,.modal-xl{width:100vw!important;max-width:100vw!important;max-height:100vh!important;border-radius:0!important;height:100vh}
  .modal-hdr{padding:14px}
  .modal-body{padding:14px!important}
  .modal-footer{padding:12px;position:sticky;bottom:0;background:var(--card)}
  #content{padding:12px;padding-bottom:80px}
  .card{padding:12px;border-radius:10px}
  h1{font-size:18px!important}
  .kpi-value{font-size:18px}
  .btn{padding:7px 12px;font-size:12.5px}
  .btn-sm{padding:5px 10px;font-size:11.5px}
  /* Buttons that look like toolbars wrap nicely */
  .topbar-actions{gap:4px}
}
@media(max-width:480px){
  .dash-grid{grid-template-columns:1fr}
  .cal-cell{min-height:40px}
}
.btn-hamburger{display:none;width:34px;height:34px;border:none;background:none;color:var(--text);align-items:center;justify-content:center;border-radius:var(--radius-sm);cursor:pointer;flex-shrink:0;margin-right:4px;transition:var(--transition)}
.btn-hamburger:hover{background:var(--gray-100)}

/* ===== LOADING ===== */
.loading{display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted);gap:10px;font-size:14px}
.loading::after{content:'';width:20px;height:20px;border:2px solid var(--gray-200);border-top-color:var(--primary);border-radius:50%;animation:spin .6s linear infinite}

/* ===== EMPTY STATE ===== */
.empty-state{text-align:center;padding:60px 20px;color:var(--text-muted)}
.empty-state-icon{font-size:48px;margin-bottom:12px;opacity:.5}
.empty-state-title{font-size:16px;font-weight:600;color:var(--text-secondary);margin-bottom:4px}
.empty-state-desc{font-size:13px;margin-bottom:16px}

/* ===== NOTIFICATION DROPDOWN ===== */
.notif-panel{position:absolute;top:100%;right:0;width:360px;background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);z-index:500;max-height:400px;overflow-y:auto;animation:slideUp .2s ease}
.notif-item{padding:14px 16px;border-bottom:1px solid var(--border-light);cursor:pointer;transition:background .15s}
.notif-item:hover{background:var(--gray-50)}
.notif-item.unread{border-left:3px solid var(--primary)}

/* ===== MISC ===== */
.divider{height:1px;background:var(--border);margin:16px 0}
.text-primary{color:var(--primary)!important}
.text-success{color:var(--success)!important}
.text-danger{color:var(--danger)!important}
.text-warning{color:var(--warning)!important}
.text-muted{color:var(--text-muted)!important}
.fw-700{font-weight:700!important}
.fs-badge{position:fixed;bottom:70px;right:16px;background:var(--primary);color:#fff;font-size:10px;padding:4px 12px;border-radius:20px;z-index:50;opacity:.7;font-weight:500;letter-spacing:.02em}
@media(min-width:769px){.fs-badge{bottom:16px}}
</style>
</head>
<body>
<div id="app">
<div class="mobile-overlay" id="mobile-overlay" onclick="closeMobileMenu()"></div>
<nav id="sidebar">
  <div class="sb-header">
    <div class="sb-logo">
      <div class="sb-logo-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      </div>
      <span class="sb-logo-text">Frame Plus</span>
      <span class="sb-logo-ver">v8.6</span>
    </div>
    <button class="sb-toggle" onclick="toggleSidebar()" title="메뉴 접기">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
  </div>
  <div class="sb-nav" id="sb-nav"></div>
  <div class="sb-user" id="sb-user">
    <div class="sb-avatar">FP</div>
    <div class="sb-user-info">
      <div class="sb-user-name" id="sb-user-name">Frame Plus</div>
      <div class="sb-user-role">관리자</div>
    </div>
  </div>
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
      더보기
    </button>
  </div>
</div>
<div class="fs-badge">v8.6 Full-Stack ERP</div>
<script src="/static/app.js"></script>
</body>
</html>`
}

// ===== SOLAPI (알림톡·SMS) HELPER =====
// Configure via: wrangler pages secret put SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER_PHONE (and KAKAO_PF_ID for 알림톡)
async function _hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}
async function sendSolapi(env: Bindings, opts: { to: string; text: string; type?: 'SMS' | 'LMS' | 'ATA'; subject?: string; templateId?: string }): Promise<{ ok: boolean; error?: string }> {
  const apiKey = env.SOLAPI_API_KEY
  const apiSecret = env.SOLAPI_API_SECRET
  const from = env.SOLAPI_SENDER_PHONE
  if (!apiKey || !apiSecret || !from) return { ok: false, error: 'solapi env not configured' }
  if (!opts.to || !opts.text) return { ok: false, error: 'to, text required' }
  const date = new Date().toISOString()
  const salt = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const sig = await _hmacSha256(apiSecret, date + salt)
  const auth = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${sig}`
  const message: any = { to: opts.to.replace(/\D/g, ''), from: from.replace(/\D/g, ''), text: opts.text }
  if (opts.type === 'LMS') {
    message.type = 'LMS'
    if (opts.subject) message.subject = opts.subject
  } else if (opts.type === 'ATA' && opts.templateId && env.KAKAO_PF_ID) {
    message.type = 'ATA'
    message.kakaoOptions = { pfId: env.KAKAO_PF_ID, templateId: opts.templateId, disableSms: false }
  }
  try {
    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })
    if (!res.ok) return { ok: false, error: await res.text() }
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message || 'send failed' } }
}
// Admin-only test endpoint
app.post('/api/solapi/test', async (c) => {
  const { to, text, type, subject } = await c.req.json<any>().catch(() => ({}))
  if (!to || !text) return c.json({ error: 'to, text required' }, 400)
  return c.json(await sendSolapi(c.env, { to, text, type, subject }))
})
// Leave approval/reject auto-notification: send SMS to requester (best-effort)
async function notifyLeaveDecision(env: Bindings, requestId: string, decision: '승인' | '반려', memo: string) {
  try {
    const req = await env.DB.prepare(`SELECT user_id, user_name, leave_type, start_date, end_date FROM leave_requests WHERE id=?`).bind(requestId).first<any>()
    if (!req?.user_id) return
    const user = await env.DB.prepare(`SELECT phone FROM users WHERE id=? OR username=?`).bind(req.user_id, req.user_id).first<any>()
    if (!user?.phone) return
    const txt = `[프레임플러스] ${req.user_name||''}님의 ${req.leave_type||'연차'} 신청(${req.start_date||'-'}~${req.end_date||'-'})이 ${decision}되었습니다.${memo?'\n메모: '+memo.slice(0,80):''}`
    await sendSolapi(env, { to: user.phone, text: txt, type: 'SMS' })
  } catch (_) { /* ignore */ }
}

// ===== SCHEDULED: Meeting D-1 / D-day notification =====
// Cron: "0 0 * * *" UTC = 09:00 KST (configured in wrangler.jsonc)
// Sends one digest email to all active admin users listing today's & tomorrow's meetings.
async function runMeetingNotify(env: Bindings): Promise<{ todayCount: number; tomorrowCount: number; sent: boolean }> {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const today = kst.toISOString().slice(0, 10)
  const tomorrow = new Date(kst.getTime() + 86400000).toISOString().slice(0, 10)
  const meetings = await env.DB.prepare(
    `SELECT id, title, date, time, client, contact, loc, status, assignee, memo
     FROM meetings WHERE date IN (?, ?) AND COALESCE(status,'') != '취소'
     ORDER BY date ASC, time ASC`
  ).bind(today, tomorrow).all<any>()
  const list = meetings.results || []
  const todayList = list.filter((m: any) => m.date === today)
  const tomorrowList = list.filter((m: any) => m.date === tomorrow)
  if (list.length === 0) return { todayCount: 0, tomorrowCount: 0, sent: false }
  let adminEmails: string[] = []
  try {
    const admins = await env.DB.prepare(
      `SELECT email FROM users WHERE role='admin' AND COALESCE(active,1)=1 AND COALESCE(email,'') != ''`
    ).all<any>()
    adminEmails = (admins.results || []).map((a: any) => a.email).filter(Boolean)
  } catch (_) { /* email column may not exist */ }
  if (!env.RESEND_API_KEY || adminEmails.length === 0) {
    return { todayCount: todayList.length, tomorrowCount: tomorrowList.length, sent: false }
  }
  const esc = (s: any) => String(s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
  const rows = (l: any[]) => l.map((m: any) => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #E5E7EB;white-space:nowrap"><b>${esc(m.time || '-')}</b></td>
      <td style="padding:6px;border-bottom:1px solid #E5E7EB">${esc(m.title)}</td>
      <td style="padding:6px;border-bottom:1px solid #E5E7EB">${esc(m.client || '-')}</td>
      <td style="padding:6px;border-bottom:1px solid #E5E7EB">${esc(m.loc || '-')}</td>
      <td style="padding:6px;border-bottom:1px solid #E5E7EB">${esc(m.assignee || '-')}</td>
    </tr>`).join('')
  const html = `
    <div style="font-family:'Pretendard','Noto Sans KR',sans-serif;max-width:680px;margin:0 auto;padding:20px">
      <h2 style="color:#DC2626;margin:0 0 8px 0">📅 미팅 알림 — ${today}</h2>
      <p style="color:#6B7280;font-size:13px;margin:0 0 24px 0">오늘 ${todayList.length}건 / 내일 ${tomorrowList.length}건</p>
      ${todayList.length ? `
      <h3 style="margin:24px 0 8px 0;font-size:15px;color:#DC2626">🔴 오늘 미팅 (${todayList.length}건)</h3>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #E5E7EB;border-radius:6px;overflow:hidden">
        <thead><tr style="background:#FEE2E2"><th style="padding:8px;text-align:left">시간</th><th style="padding:8px;text-align:left">제목</th><th style="padding:8px;text-align:left">고객</th><th style="padding:8px;text-align:left">장소</th><th style="padding:8px;text-align:left">담당</th></tr></thead>
        <tbody>${rows(todayList)}</tbody>
      </table>` : ''}
      ${tomorrowList.length ? `
      <h3 style="margin:24px 0 8px 0;font-size:15px;color:#D97706">🟡 내일 미팅 (${tomorrowList.length}건)</h3>
      <table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #E5E7EB;border-radius:6px;overflow:hidden">
        <thead><tr style="background:#FEF3C7"><th style="padding:8px;text-align:left">시간</th><th style="padding:8px;text-align:left">제목</th><th style="padding:8px;text-align:left">고객</th><th style="padding:8px;text-align:left">장소</th><th style="padding:8px;text-align:left">담당</th></tr></thead>
        <tbody>${rows(tomorrowList)}</tbody>
      </table>` : ''}
      <p style="margin-top:28px"><a href="https://frameplus-erp.pages.dev/" style="background:#DC2626;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">ERP에서 미팅 캘린더 보기 →</a></p>
      <p style="color:#9CA3AF;font-size:11px;margin-top:24px">이 메일은 Frame Plus ERP가 매일 KST 09:00에 자동 발송합니다.</p>
    </div>
  `
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Frame Plus ERP <onboarding@resend.dev>',
        to: adminEmails,
        subject: `[미팅 알림] 오늘 ${todayList.length}건 / 내일 ${tomorrowList.length}건`,
        html
      })
    })
    // Bonus: SMS to admin phones (best-effort — only if SOLAPI configured)
    if (env.SOLAPI_API_KEY) {
      try {
        const phoneRows = await env.DB.prepare(
          `SELECT phone FROM users WHERE role='admin' AND COALESCE(active,1)=1 AND COALESCE(phone,'') != ''`
        ).all<any>()
        const phones = (phoneRows.results || []).map((r: any) => r.phone).filter(Boolean)
        const firstToday = todayList[0]
        const smsText = `[프레임플러스] 오늘 미팅 ${todayList.length}건 / 내일 ${tomorrowList.length}건${firstToday ? `\n첫 일정: ${firstToday.time || ''} ${firstToday.title || ''}` : ''}\nERP: https://frameplus-erp.pages.dev/`
        for (const phone of phones) {
          try { await sendSolapi(env, { to: phone, text: smsText, type: 'SMS' }) } catch (_) {}
        }
      } catch (_) {}
    }
    return { todayCount: todayList.length, tomorrowCount: tomorrowList.length, sent: true }
  } catch (_) {
    return { todayCount: todayList.length, tomorrowCount: tomorrowList.length, sent: false }
  }
}

// Manual trigger (admin only via auth middleware) — for testing the digest immediately
app.post('/api/cron/meeting-notify', async (c) => {
  const result = await runMeetingNotify(c.env)
  return c.json({ ok: true, ...result })
})

export default {
  fetch: app.fetch,
  scheduled: async (_event: any, env: Bindings, ctx: any) => {
    ctx.waitUntil(runMeetingNotify(env))
  }
}
