import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = { DB: D1Database; RESEND_API_KEY: string; OPENWEATHER_API_KEY: string; OPENAI_API_KEY: string }
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
      ('wp4', 'C06', '도장공사', '[{"nm":"벽면도장","spec":"m²","unit":"m²","qty":1},{"nm":"천정도장","spec":"m²","unit":"m²","qty":1},{"nm":"친환경페인트","spec":"m²","unit":"m²","qty":1},{"nm":"퍼티작업","spec":"m²","unit":"m²","qty":1}]')
    `)
  } catch(e) { console.log('Preset seed skipped:', e) }

  // Seed estimate template sets
  try {
    const templateData = [
      { id: 'ets1', name: '기초공사 세트', description: '먹메김, 보양, 비계, 운반, 청소 포함', category: '기초공사', items: JSON.stringify([{nm:"먹메김",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"보양",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"내부수평비계",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"소운반비",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"대운반비",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"폐자재처리",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"현장정리정돈",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"준공청소",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets2', name: '철거공사 세트', description: '벽체, 바닥, 천정, 설비 철거', category: '철거공사', items: JSON.stringify([{nm:"기존 벽체 철거",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"기존 바닥 철거",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"기존 천정 철거",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"설비 철거",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"잡철거",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets3', name: '목공사 세트', description: '경량칸막이, 천정틀, 합판, 몰딩, 문짝', category: '목공사', items: JSON.stringify([{nm:"경량칸막이",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"천정틀",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"합판작업",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"몰딩",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0},{nm:"문틀/문짝",spec:"세트",unit:"세트",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets4', name: '도장공사 세트', description: '벽면/천정 도장, 친환경페인트', category: '도장공사', items: JSON.stringify([{nm:"벽면도장",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"천정도장",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"친환경페인트",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"퍼티작업",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets5', name: '전기공사 세트', description: '조명, 콘센트, 스위치, 분전반', category: '전기공사', items: JSON.stringify([{nm:"LED조명 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"콘센트 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"스위치 설치",spec:"개",unit:"개",qty:1,mp:0,lp:0,ep:0},{nm:"분전반 교체",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0},{nm:"배선공사",spec:"식",unit:"식",qty:1,mp:0,lp:0,ep:0}]) },
      { id: 'ets6', name: '바닥공사 세트', description: '타일, 장판, 마루, 에폭시', category: '바닥공사', items: JSON.stringify([{nm:"바닥타일",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"장판시공",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"강마루시공",spec:"m²",unit:"m²",qty:1,mp:0,lp:0,ep:0},{nm:"걸레받이",spec:"m",unit:"m",qty:1,mp:0,lp:0,ep:0}]) },
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
app.get('/api/health', (c) => c.json({ status: 'ok', version: 'v7.0' }))

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
  const apiKey = c.env.OPENWEATHER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENWEATHER_API_KEY not configured' }, 500)

  const lat = c.req.query('lat') || '37.5665'  // Seoul default
  const lon = c.req.query('lon') || '126.9780'
  const city = c.req.query('city')

  try {
    let url: string
    if (city) {
      url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=kr`
    } else {
      url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr`
    }

    const res = await fetch(url)
    const data = await res.json() as Record<string, unknown>
    if (!res.ok) return c.json({ error: 'Weather API error', detail: data }, res.status)

    // 간결한 응답 포맷
    const main = data.main as Record<string, number>
    const weather = (data.weather as Array<Record<string, string>>)?.[0]
    const wind = data.wind as Record<string, number>
    const clouds = data.clouds as Record<string, number>

    return c.json({
      city: (data.name as string) || city || 'Seoul',
      temp: Math.round(main?.temp || 0),
      feels_like: Math.round(main?.feels_like || 0),
      temp_min: Math.round(main?.temp_min || 0),
      temp_max: Math.round(main?.temp_max || 0),
      humidity: main?.humidity || 0,
      description: weather?.description || '',
      icon: weather?.icon || '01d',
      icon_url: `https://openweathermap.org/img/wn/${weather?.icon || '01d'}@2x.png`,
      wind_speed: wind?.speed || 0,
      clouds: clouds?.all || 0,
      // 시공 현장 날씨 판단
      outdoor_ok: (main?.temp > 0 && main?.temp < 38 && (wind?.speed || 0) < 10),
      rain_warning: !!(data.rain || (weather?.main === 'Rain')),
      snow_warning: !!(data.snow || (weather?.main === 'Snow'))
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// 5일 예보 (시공 일정 참고용)
app.get('/api/weather/forecast', async (c) => {
  const apiKey = c.env.OPENWEATHER_API_KEY
  if (!apiKey) return c.json({ error: 'OPENWEATHER_API_KEY not configured' }, 500)

  const lat = c.req.query('lat') || '37.5665'
  const lon = c.req.query('lon') || '126.9780'
  const city = c.req.query('city')

  try {
    let url: string
    if (city) {
      url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=kr&cnt=40`
    } else {
      url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=kr&cnt=40`
    }

    const res = await fetch(url)
    const data = await res.json() as Record<string, unknown>
    if (!res.ok) return c.json({ error: 'Forecast API error', detail: data }, res.status)

    const list = (data.list as Array<Record<string, unknown>>) || []
    // 일별 그룹핑 (3시간 간격 → 일 단위)
    const daily: Record<string, { temps: number[]; desc: string; icon: string; rain: boolean }> = {}
    list.forEach((item) => {
      const dt = (item.dt_txt as string)?.split(' ')[0] || ''
      if (!daily[dt]) daily[dt] = { temps: [], desc: '', icon: '', rain: false }
      const main = item.main as Record<string, number>
      const weather = (item.weather as Array<Record<string, string>>)?.[0]
      daily[dt].temps.push(main?.temp || 0)
      if (weather?.icon?.includes('d')) { daily[dt].desc = weather?.description || ''; daily[dt].icon = weather?.icon || '' }
      if (weather?.main === 'Rain' || weather?.main === 'Snow' || item.rain || item.snow) daily[dt].rain = true
    })

    const forecast = Object.entries(daily).slice(0, 5).map(([date, d]) => ({
      date,
      temp_min: Math.round(Math.min(...d.temps)),
      temp_max: Math.round(Math.max(...d.temps)),
      description: d.desc,
      icon: d.icon,
      icon_url: `https://openweathermap.org/img/wn/${d.icon || '01d'}@2x.png`,
      rain: d.rain
    }))

    return c.json({ city: (data.city as Record<string, string>)?.name || 'Seoul', forecast })
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+KR:wght@300;400;500;600;700&family=Noto+Serif+KR:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏗️</text></svg>">
<style>
/* ===== FRAME PLUS ERP v7 - Pluuug-Inspired SaaS Design ===== */
:root{
  --primary:#4F46E5;--primary-light:#EEF2FF;--primary-dark:#3730A3;--primary-50:#EEF2FF;--primary-100:#E0E7FF;--primary-500:#6366F1;--primary-600:#4F46E5;--primary-700:#4338CA;
  --gray-50:#F9FAFB;--gray-100:#F3F4F6;--gray-200:#E5E7EB;--gray-300:#D1D5DB;--gray-400:#9CA3AF;--gray-500:#6B7280;--gray-600:#4B5563;--gray-700:#374151;--gray-800:#1F2937;--gray-900:#111827;
  --success:#10B981;--success-light:#D1FAE5;--danger:#EF4444;--danger-light:#FEE2E2;--warning:#F59E0B;--warning-light:#FEF3C7;--info:#3B82F6;--info-light:#DBEAFE;
  --purple:#8B5CF6;--purple-light:#EDE9FE;--teal:#14B8A6;--teal-light:#CCFBF1;--pink:#EC4899;--pink-light:#FCE7F3;
  --white:#FFFFFF;--bg:#F8FAFC;--card:#FFFFFF;--border:#E2E8F0;--border-light:#F1F5F9;
  --text:#0F172A;--text-secondary:#475569;--text-muted:#94A3B8;
  --font-sans:'Inter','Noto Sans KR',system-ui,-apple-system,sans-serif;--font-serif:'Noto Serif KR',serif;
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

/* ===== DARK MODE ===== */
html.dark{
  --primary:#818CF8;--primary-light:rgba(129,140,248,.12);--primary-dark:#6366F1;--primary-50:rgba(129,140,248,.08);--primary-100:rgba(129,140,248,.15);--primary-500:#818CF8;--primary-600:#6366F1;--primary-700:#4F46E5;
  --gray-50:#0F172A;--gray-100:#1E293B;--gray-200:#334155;--gray-300:#475569;--gray-400:#64748B;--gray-500:#94A3B8;--gray-600:#CBD5E1;--gray-700:#E2E8F0;--gray-800:#F1F5F9;--gray-900:#F8FAFC;
  --success:#34D399;--success-light:rgba(52,211,153,.15);--danger:#F87171;--danger-light:rgba(248,113,113,.15);--warning:#FBBF24;--warning-light:rgba(251,191,36,.15);--info:#60A5FA;--info-light:rgba(96,165,250,.15);
  --purple:#A78BFA;--purple-light:rgba(167,139,250,.15);--teal:#2DD4BF;--teal-light:rgba(45,212,191,.15);--pink:#F472B6;--pink-light:rgba(244,114,182,.15);
  --white:#0F172A;--bg:#020617;--card:#0F172A;--border:#1E293B;--border-light:#1E293B;
  --text:#F8FAFC;--text-secondary:#CBD5E1;--text-muted:#64748B;
}
html.dark body{background:var(--bg);color:var(--text)}
html.dark #sidebar{background:#020617;border-color:#1E293B}
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

/* ===== LAYOUT ===== */
#app{display:flex;height:100vh;overflow:hidden}
#sidebar{width:var(--sidebar-w);min-width:var(--sidebar-w);background:var(--white);display:flex;flex-direction:column;transition:var(--transition);overflow:hidden;position:relative;z-index:100;border-right:1px solid var(--border)}
#sidebar.collapsed{width:var(--sidebar-collapsed);min-width:var(--sidebar-collapsed)}
.sb-header{height:var(--topbar-h);display:flex;align-items:center;padding:0 16px;border-bottom:1px solid var(--border-light);flex-shrink:0;gap:10px}
.sb-logo{display:flex;align-items:center;gap:10px;white-space:nowrap;opacity:1;transition:opacity .2s}
.sb-logo-icon{width:32px;height:32px;background:linear-gradient(135deg,var(--primary) 0%,#818CF8 100%);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sb-logo-icon svg{width:18px;height:18px;color:#fff}
.sb-logo-text{font-size:16px;font-weight:700;color:var(--text);letter-spacing:-.02em}
.sb-logo-ver{font-size:10px;font-weight:500;color:var(--text-muted);margin-left:2px}
.collapsed .sb-logo-text,.collapsed .sb-logo-ver{display:none}
.sb-toggle{margin-left:auto;width:28px;height:28px;border:none;background:none;color:var(--text-muted);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);transition:var(--transition);flex-shrink:0}
.sb-toggle:hover{background:var(--gray-100);color:var(--text)}
.collapsed .sb-toggle{margin-left:auto}
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
.sb-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary) 0%,#818CF8 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
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
.order-amt-card{background:linear-gradient(135deg,var(--primary) 0%,#818CF8 100%);color:#fff;border-radius:var(--radius-lg);padding:24px;text-align:center}
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
      <span class="sb-logo-ver">v7</span>
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
<div class="fs-badge">v7 Full-Stack ERP</div>
<script src="/static/app.js"></script>
</body>
</html>`
}

export default app
