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
app.get('/api/health', (c) => c.json({ status: 'ok', version: 'v6.0' }))

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
<title>Frame Plus ERP v6</title>
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
/* ===== DARK MODE ===== */
html.dark{
  --black:#0a0a0a;--dark:#e8e8e8;--charcoal:#d1d5db;
  --g800:#ccc;--g700:#bbb;--g600:#aaa;--g500:#888;--g400:#666;--g300:#444;--g200:#333;--g150:#2a2a2a;--g100:#222;--g50:#1a1a1a;
  --white:#0f0f0f;--bg:#111;--card:#1a1a1a;--border:#2d2d2d;--border2:#3a3a3a;
  --blue:#3b82f6;--blue-l:rgba(59,130,246,.12);--green:#22c55e;--green-l:rgba(34,197,94,.12);
  --red:#ef4444;--red-l:rgba(239,68,68,.12);--orange:#f59e0b;--orange-l:rgba(245,158,11,.12);
  --purple:#8b5cf6;--purple-l:rgba(139,92,246,.12);--teal:#14b8a6;--teal-l:rgba(20,184,166,.12);
}
html.dark body{background:var(--bg);color:var(--dark)}
html.dark #sidebar{background:#000}
html.dark .btn-primary{background:var(--blue);color:#fff}
html.dark .btn-outline{background:var(--card);border-color:var(--border2);color:var(--dark)}
html.dark .inp,.dark .sel{background:var(--card);border-color:var(--border2);color:var(--dark)}
html.dark .tbl th{background:var(--g100);color:var(--g600)}
html.dark .tbl tr:hover td{background:var(--g50)}
html.dark .modal{background:var(--card);color:var(--dark)}
html.dark .est-summary{background:#000}
html.dark .toast{background:var(--blue)}
html.dark .contract-doc{background:var(--card);color:var(--dark)}
/* Skeleton shimmer animation */
@keyframes shimmer{0%{opacity:.6}50%{opacity:.3}100%{opacity:.6}}
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
<div class="fs-badge">v6 Full-Stack · D1 Database · Dark Mode</div>
<script src="/static/app.js"></script>
</body>
</html>`
}

export default app
