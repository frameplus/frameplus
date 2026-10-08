// ============================================================================
// JOBS — /api/jobs/* (Hono 서브앱). ERP 인증과 완전히 분리된 휴대폰 OTP 세션.
// 모든 조회·변경은 user_id 로 소유권을 강제한다.
// ============================================================================
import { Hono } from 'hono'
import { ensureJobsTables } from './schema'
import { createNotifications, flushPushQueue, runJobsCron, vapidFromEnv } from './notify'
import { isAllowedPushEndpoint, b64urlDecode } from './webpush'
import {
  type TaxMode, type SettlementRule, type Attendance, type InvoiceStatus, type InvoiceRow, type ExpenseType,
  TAX_MODES, EXPENSE_TYPES, isTaxMode, isSettlementRule, isExpenseType, isYmd, todayKst, monthEnd, addDays, daysBetween,
  calcWorkLog, buildInvoice, retaxInvoice, dueDateFor, invoiceStatus, dunningLevel, fmt,
  type QuoteItem, type VatMode, calcQuote, quoteItemAmount, isVatMode, isQuoteItemKind, applyQuoteToRows, summarizeYear,
} from './calc'

export type JobsBindings = {
  DB: D1Database
  /** '1' 이면 문자 대신 응답에 devCode 를 돌려준다 (로컬 개발 전용) */
  JOBS_DEV_OTP?: string
  /** 공유 링크의 origin (예: https://www.frameplus.kr). 없으면 요청 origin */
  JOBS_PUBLIC_ORIGIN?: string
  /** R2 버킷(선택) — 있으면 사진을 R2 에 저장(키 photos/{user}/{id}.ext), 없으면 D1 base64 */
  JOBS_PHOTOS?: R2Bucket
  /** 카카오 알림톡 템플릿 ID(심사 완료 후) — 없으면 카카오톡 채널은 문자로 대체 */
  JOBS_KAKAO_TPL_INVOICE?: string
  JOBS_KAKAO_TPL_DUNNING?: string
  JOBS_KAKAO_TPL_QUOTE?: string
  /** 웹 푸시 VAPID 키 (scripts/jobs-vapid-keys.mjs 로 생성) — 없으면 앱 알림함에만 쌓인다 */
  JOBS_VAPID_PUBLIC?: string
  JOBS_VAPID_PRIVATE?: string
  JOBS_VAPID_SUBJECT?: string
  /** POST /api/jobs/cron/run 호출 비밀값 (workers/jobs-cron 의 CRON_SECRET 과 같아야 함) */
  JOBS_CRON_SECRET?: string
  /** 크론 1회당 푸시 전송 상한 (기본 20) */
  JOBS_PUSH_BATCH?: string
}
export type SmsSender = (env: any, opts: { to: string; text: string; type?: 'SMS' | 'LMS' | 'ATA'; subject?: string; templateId?: string; variables?: Record<string, string> }) => Promise<{ ok: boolean; error?: string }>
export type EmailSender = (env: any, opts: { to: string; subject: string; html: string }) => Promise<{ ok: boolean; error?: string }>
export type JobsDeps = { sendSms: SmsSender; sendEmail: EmailSender; version: string }

type UserRow = { id: string; phone: string; name: string; biz_no: string; default_tax_mode: TaxMode; clock_out_time: string; notif_prefs: string; status: string; created_at: string }
type Env = { Bindings: JobsBindings; Variables: { jobsUser: UserRow } }

// ---------------------------------------------------------------- helpers ---
const nowIso = () => new Date().toISOString()
const plusMs = (ms: number) => new Date(Date.now() + ms).toISOString()
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('')
const newId = (prefix: string) => `${prefix}_${randomHex(10)}`
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}
const normPhone = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const isPhone = (p: string) => /^01[016789]\d{7,8}$/.test(p)
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown, def = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : def }
const numOrNull = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const bool01 = (v: unknown, def = 0) => (v === undefined || v === null ? def : (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0))
const hhmm = (v: unknown) => { const s = str(v, 5); return /^\d{2}:\d{2}$/.test(s) ? s : '' }
const publicUser = (u: UserRow) => ({ id: u.id, phone: u.phone, name: u.name || '', bizNo: u.biz_no || '', defaultTaxMode: u.default_tax_mode || 'rate33', clockOutTime: u.clock_out_time || '18:00', notifPrefs: safeJson(u.notif_prefs, {}), createdAt: u.created_at })
function safeJson<T>(s: unknown, def: T): T { try { return s ? JSON.parse(String(s)) as T : def } catch { return def } }
const period = (a: string, b: string) => `${a.slice(5).replace('-', '.')}~${b.slice(5).replace('-', '.')}`
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',')

// ---- 사진 저장: R2 바인딩이 있으면 R2, 없으면 D1 base64(data URI). 조회는 /jobs/photo/:id (추측 불가능한 id 기반 비공개 URL [가정]) ----
const DATA_URI_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
const b64ToBytes = (b64: string) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
async function storePhoto(bucket: R2Bucket | undefined, userId: string, photoId: string, dataUri: string): Promise<string> {
  const m = DATA_URI_RE.exec(dataUri)
  if (!bucket || !m) return dataUri
  const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'
  const key = `photos/${userId}/${photoId}.${ext}`
  await bucket.put(key, b64ToBytes(m[2]), { httpMetadata: { contentType: m[1], cacheControl: 'private, max-age=86400' } })
  return 'r2:' + key
}
async function deletePhotoObjects(bucket: R2Bucket | undefined, uris: string[]): Promise<void> {
  if (!bucket) return
  const keys = uris.filter(u => typeof u === 'string' && u.startsWith('r2:')).map(u => u.slice(3))
  if (keys.length) await bucket.delete(keys)
}
const photoUrl = (p: { id: string; uri: string }) => (p.uri && p.uri.startsWith('r2:') ? `/jobs/photo/${p.id}` : p.uri)

function siteOut(s: any) {
  return {
    id: s.id, name: s.name, company: s.company || '', address: s.address || '', lat: s.lat, lng: s.lng, geoRadius: s.geo_radius ?? 150,
    contactName: s.contact_name || '', contactPhone: s.contact_phone || '', memo: s.memo || '',
    dayRate: s.day_rate || 0, hourRate: s.hour_rate || 0, overtimeRate: s.overtime_rate || 0,
    settlementRule: s.settlement_rule, taxMode: s.tax_mode, clockOutTime: s.clock_out_time || '',
    alarmDue: !!s.alarm_due, alarmClockOut: !!s.alarm_clock_out, archived: !!s.archived, createdAt: s.created_at, updatedAt: s.updated_at,
  }
}
function logOut(w: any) {
  return {
    id: w.id, siteId: w.site_id, siteName: w.site_name, siteCompany: w.site_company, date: w.date, source: w.source,
    checkInAt: w.check_in_at || '', checkOutAt: w.check_out_at || '', checkInLat: w.check_in_lat, checkInLng: w.check_in_lng, geoDistanceM: w.geo_distance_m,
    attendance: w.attendance as Attendance, overtimeHours: w.overtime_hours || 0, dayRate: w.day_rate || 0, hourRate: w.hour_rate || 0,
    taxModeOverride: w.tax_mode_override || null, gross: w.gross || 0, tax: w.tax || 0, net: w.net || 0, editedManually: !!w.edited_manually, checkoutAuto: !!w.checkout_auto,
    memo: w.memo || '', invoiceId: w.invoice_id || null, createdAt: w.created_at, updatedAt: w.updated_at,
    expenses: (w.expenses || []).map(expOut), photos: (w.photos || []).map(photoOut),
  }
}
const expOut = (e: any) => ({ id: e.id, worklogId: e.worklog_id, type: e.type, typeLabel: EXPENSE_TYPES[e.type as ExpenseType] || e.type, name: e.name || '', amount: e.amount || 0, chargeToClient: !!e.charge_to_client, receiptUri: e.receipt_uri || '' })
const photoOut = (p: any) => ({ id: p.id, worklogId: p.worklog_id, uri: photoUrl(p), takenAt: p.taken_at || '', lat: p.lat, lng: p.lng, label: p.label || '', attachToInvoice: !!p.attach_to_invoice })
function invoiceOut(i: any, today: string) {
  const remaining = Math.max(0, (i.net || 0) - (i.paid_amount || 0))
  const over = i.due_date && i.status !== 'paid' && i.status !== 'draft' ? Math.max(0, daysBetween(i.due_date, today)) : 0
  return {
    id: i.id, siteId: i.site_id, siteName: i.site_name, siteCompany: i.site_company, periodStart: i.period_start, periodEnd: i.period_end,
    rows: safeJson<InvoiceRow[]>(i.rows, []), gross: i.gross || 0, taxMode: i.tax_mode as TaxMode, taxModeLabel: TAX_MODES[i.tax_mode as TaxMode]?.label || i.tax_mode,
    tax: i.tax || 0, net: i.net || 0, dueDate: i.due_date || '', status: i.status as InvoiceStatus, paidAmount: i.paid_amount || 0, remaining,
    daysOverdue: over, dunningLevel: i.status === 'overdue' ? dunningLevel(i.due_date, today) : 'none',
    attachPhotos: !!i.attach_photos, editedManually: !!i.edited_manually, memo: i.memo || '', shareToken: i.share_token || '',
    createdAt: i.created_at, updatedAt: i.updated_at,
  }
}
const paymentOut = (p: any) => ({ id: p.id, invoiceId: p.invoice_id, siteId: p.site_id, siteName: p.site_name, amount: p.amount, payerName: p.payer_name || '', paidAt: p.paid_at, method: p.method, source: p.source, matchedBy: p.matched_by, excluded: !!p.excluded, needsReview: !!p.needs_review, memo: p.memo || '', createdAt: p.created_at })
const sendlogOut = (s: any) => ({ id: s.id, docType: s.doc_type, docId: s.doc_id, channel: s.channel, to: s.to_addr || '', amount: s.amount || 0, dunningLevel: s.dunning_level || '', sentAt: s.sent_at, readAt: s.read_at || null })

/** 예정일이 지난 청구서는 조회 시점에 overdue 로 전환 (크론 없이도 동작) */
async function refreshInvoiceStatuses(db: D1Database, rows: any[], today: string): Promise<void> {
  const stmts: D1PreparedStatement[] = []
  for (const i of rows) {
    const next = invoiceStatus(i.status, i.net || 0, i.paid_amount || 0, i.due_date || '', today)
    if (next !== i.status) { i.status = next; stmts.push(db.prepare('UPDATE jobs_invoices SET status = ?, updated_at = ? WHERE id = ?').bind(next, nowIso(), i.id)) }
  }
  if (stmts.length) await db.batch(stmts)
}

export function createJobsApi(deps: JobsDeps) {
  const api = new Hono<Env>()

  api.use('*', async (c, next) => { await ensureJobsTables(c.env.DB); await next() })

  // ---- 인증 (OTP) 외 모든 경로는 Bearer 세션 필수 ------------------------------
  api.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname
    if (/\/(auth\/(request-code|verify)|health|cron\/run)$/.test(path)) return next()
    const auth = c.req.header('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) return c.json({ error: '로그인이 필요합니다', code: 'unauthorized' }, 401)
    const sid = await sha256Hex(token)
    const user = await c.env.DB.prepare('SELECT u.* FROM jobs_sessions s JOIN jobs_users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?').bind(sid, nowIso()).first<UserRow>()
    if (!user) return c.json({ error: '세션이 만료되었습니다. 다시 로그인해 주세요', code: 'unauthorized' }, 401)
    c.set('jobsUser', user)
    await next()
  })

  api.get('/health', (c) => c.json({ ok: true, app: 'jobs', version: deps.version }))

  // ================================================================ AUTH ===
  api.post('/auth/request-code', async (c) => {
    const body = await c.req.json<any>().catch(() => ({}))
    const phone = normPhone(body.phone)
    if (!isPhone(phone)) return c.json({ error: '휴대폰 번호를 확인해 주세요 (예: 010-1234-5678)' }, 400)
    const prev = await c.env.DB.prepare('SELECT sent_at FROM jobs_otp WHERE phone = ?').bind(phone).first<any>()
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < 60_000) return c.json({ error: '잠시 후 다시 요청해 주세요 (1분)' }, 429)
    // SMS 펌핑(대량 발송 유도) 방어 — 최근 1시간 전체 발송 건수 상한 [가정: 파일럿 규모 기준 100건]
    const hourly = await c.env.DB.prepare('SELECT COUNT(*) n FROM jobs_otp WHERE sent_at > ?').bind(plusMs(-3_600_000)).first<any>()
    if (hourly && hourly.n >= 100) return c.json({ error: '인증 요청이 많습니다. 잠시 후 다시 시도해 주세요' }, 429)
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))
    const hash = await sha256Hex(`${phone}:${code}`)
    await c.env.DB.prepare('INSERT OR REPLACE INTO jobs_otp (phone, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)').bind(phone, hash, plusMs(5 * 60_000), nowIso()).run()
    const dev = c.env.JOBS_DEV_OTP === '1'
    if (!dev) {
      const r = await deps.sendSms(c.env, { to: phone, text: `[JOBS] 인증번호 ${code}\n5분 안에 입력해 주세요.`, type: 'SMS' })
      if (!r.ok) return c.json({ error: '인증 문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요', detail: r.error }, 503)
    }
    return c.json({ ok: true, expiresIn: 300, ...(dev ? { devCode: code } : {}) })
  })

  api.post('/auth/verify', async (c) => {
    const db = c.env.DB
    const body = await c.req.json<any>().catch(() => ({}))
    const phone = normPhone(body.phone), code = str(body.code, 6)
    if (!isPhone(phone) || !/^\d{6}$/.test(code)) return c.json({ error: '번호와 인증번호 6자리를 입력해 주세요' }, 400)
    const row = await db.prepare('SELECT * FROM jobs_otp WHERE phone = ?').bind(phone).first<any>()
    if (!row || row.expires_at < nowIso()) return c.json({ error: '인증번호가 만료되었습니다. 다시 받아 주세요' }, 400)
    if (row.attempts >= 5) return c.json({ error: '시도 횟수를 초과했습니다. 인증번호를 다시 받아 주세요' }, 429)
    if ((await sha256Hex(`${phone}:${code}`)) !== row.code_hash) {
      await db.prepare('UPDATE jobs_otp SET attempts = attempts + 1 WHERE phone = ?').bind(phone).run()
      return c.json({ error: '인증번호가 맞지 않습니다' }, 400)
    }
    await db.prepare('DELETE FROM jobs_otp WHERE phone = ?').bind(phone).run()
    let user = await db.prepare('SELECT * FROM jobs_users WHERE phone = ?').bind(phone).first<UserRow>()
    let isNew = false
    if (!user) {
      const id = newId('u')
      await db.prepare('INSERT INTO jobs_users (id, phone, name) VALUES (?, ?, ?)').bind(id, phone, '').run()
      user = (await db.prepare('SELECT * FROM jobs_users WHERE id = ?').bind(id).first<UserRow>())!
      isNew = true
    }
    if (user.status === 'restricted' || user.status === 'deleted') return c.json({ error: '이용이 제한된 계정입니다' }, 403)
    const token = randomHex(32)
    await db.batch([
      db.prepare('INSERT INTO jobs_sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), user.id, plusMs(30 * 86_400_000)),
      db.prepare('UPDATE jobs_users SET last_login = ? WHERE id = ?').bind(nowIso(), user.id),
      db.prepare('DELETE FROM jobs_sessions WHERE expires_at < ?').bind(nowIso()), // 만료 세션 정리 (크론 없이 로그인 시점에)
    ])
    return c.json({ token, user: publicUser(user), isNew })
  })

  api.get('/auth/me', (c) => c.json({ user: publicUser(c.get('jobsUser')) }))
  api.post('/auth/logout', async (c) => {
    const token = (c.req.header('Authorization') || '').slice(7).trim()
    await c.env.DB.prepare('DELETE FROM jobs_sessions WHERE id = ?').bind(await sha256Hex(token)).run()
    return c.json({ ok: true })
  })

  // ================================================================= ME ====
  api.get('/me', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const [sites, logs, invs] = await Promise.all([
      db.prepare('SELECT COUNT(*) n FROM jobs_sites WHERE user_id = ? AND archived = 0').bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n, COALESCE(SUM(net),0) net FROM jobs_worklogs WHERE user_id = ? AND substr(date,1,4) = ?').bind(u.id, todayKst().slice(0, 4)).first<any>(),
      db.prepare("SELECT COUNT(*) n FROM jobs_invoices WHERE user_id = ? AND status IN ('sent','partial','overdue')").bind(u.id).first<any>(),
    ])
    return c.json({ user: publicUser(u), stats: { sites: sites?.n || 0, yearDays: logs?.n || 0, yearNet: logs?.net || 0, openInvoices: invs?.n || 0 } })
  })
  api.put('/me', async (c) => {
    const u = c.get('jobsUser'), body = await c.req.json<any>().catch(() => ({}))
    const sets: string[] = [], vals: any[] = []
    if (body.name !== undefined) { sets.push('name = ?'); vals.push(str(body.name, 30)) }
    if (body.bizNo !== undefined) { sets.push('biz_no = ?'); vals.push(str(body.bizNo, 12).replace(/[^\d-]/g, '')) }
    if (body.defaultTaxMode !== undefined) { if (!isTaxMode(body.defaultTaxMode)) return c.json({ error: '세액공제 방식이 올바르지 않습니다' }, 400); sets.push('default_tax_mode = ?'); vals.push(body.defaultTaxMode) }
    if (body.clockOutTime !== undefined) { sets.push('clock_out_time = ?'); vals.push(hhmm(body.clockOutTime) || '18:00') }
    if (body.notifPrefs !== undefined && typeof body.notifPrefs === 'object') { sets.push('notif_prefs = ?'); vals.push(JSON.stringify(body.notifPrefs).slice(0, 2000)) }
    if (!sets.length) return c.json({ error: '바꿀 내용이 없습니다' }, 400)
    sets.push('updated_at = ?'); vals.push(nowIso(), u.id)
    await c.env.DB.prepare(`UPDATE jobs_users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
    const fresh = await c.env.DB.prepare('SELECT * FROM jobs_users WHERE id = ?').bind(u.id).first<UserRow>()
    return c.json({ user: publicUser(fresh!) })
  })

  // 회원 탈퇴 (S-37) — 미입금 청구서가 있으면 경고 후 진행. 개인정보 · 위치 · 사진 · 출근 기록은 즉시 삭제,
  // 청구서 · 견적서 · 입금 · 보낸 기록은 분쟁 근거 · 법령 보관(개인정보는 익명화, 공유 링크는 폐기)
  api.get('/me/withdraw-check', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const [open, sites, logs, photos, invs, quotes] = await Promise.all([
      db.prepare("SELECT COUNT(*) n, COALESCE(SUM(net - paid_amount), 0) unpaid FROM jobs_invoices WHERE user_id = ? AND status IN ('sent','partial','overdue')").bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_sites WHERE user_id = ?').bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_worklogs WHERE user_id = ?').bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_photos WHERE user_id = ?').bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_invoices WHERE user_id = ?').bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_quotes WHERE user_id = ?').bind(u.id).first<any>(),
    ])
    return c.json({ openInvoices: open?.n || 0, unpaid: open?.unpaid || 0, sites: sites?.n || 0, worklogs: logs?.n || 0, photos: photos?.n || 0, invoices: invs?.n || 0, quotes: quotes?.n || 0 })
  })
  api.post('/me/withdraw', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const body = await c.req.json<any>().catch(() => ({}))
    if (body.confirm !== true) return c.json({ error: '탈퇴 확인이 필요합니다' }, 400)
    const ph = await db.prepare('SELECT uri FROM jobs_photos WHERE user_id = ?').bind(u.id).all<any>()
    const now = nowIso()
    await db.batch([
      db.prepare('DELETE FROM jobs_sessions WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM jobs_otp WHERE phone = ?').bind(u.phone),
      db.prepare('DELETE FROM jobs_photos WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM jobs_expenses WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM jobs_worklogs WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM jobs_payer_rules WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM jobs_push_subs WHERE user_id = ?').bind(u.id),
      db.prepare('DELETE FROM jobs_notifications WHERE user_id = ?').bind(u.id),
      db.prepare("UPDATE jobs_sites SET contact_name = '', contact_phone = '', address = '', lat = NULL, lng = NULL, memo = '', archived = 1, updated_at = ? WHERE user_id = ?").bind(now, u.id),
      db.prepare("UPDATE jobs_quotes SET contact_phone = '', share_token = NULL, updated_at = ? WHERE user_id = ?").bind(now, u.id),
      db.prepare('UPDATE jobs_invoices SET share_token = NULL, updated_at = ? WHERE user_id = ?').bind(now, u.id),
      db.prepare("UPDATE jobs_users SET phone = ?, name = '', biz_no = '', notif_prefs = '{}', status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").bind('del_' + randomHex(8), now, now, u.id),
    ])
    await deletePhotoObjects(c.env.JOBS_PHOTOS, (ph.results || []).map((p: any) => p.uri))
    return c.json({ ok: true })
  })

  // ============================================================== SITES ====
  async function loadSite(db: D1Database, userId: string, id: string) {
    return db.prepare('SELECT * FROM jobs_sites WHERE id = ? AND user_id = ?').bind(id, userId).first<any>()
  }
  function siteFromBody(body: any, prev?: any) {
    const g = (k: string, dflt: any) => (body[k] !== undefined ? body[k] : prev ? prev : dflt)
    const name = str(body.name !== undefined ? body.name : prev?.name, 40)
    if (!name) return { error: '현장명을 입력해 주세요' }
    const settlementRule = body.settlementRule !== undefined ? body.settlementRule : prev?.settlement_rule
    const taxMode = body.taxMode !== undefined ? body.taxMode : prev?.tax_mode
    if (!isSettlementRule(settlementRule)) return { error: '정산 규칙을 골라 주세요 (필수)' }
    if (!isTaxMode(taxMode)) return { error: '세금 처리 방식을 골라 주세요 (필수)' }
    const dayRate = int(body.dayRate !== undefined ? body.dayRate : prev?.day_rate, 0)
    const hourRate = int(body.hourRate !== undefined ? body.hourRate : prev?.hour_rate, 0)
    const overtimeRate = int(body.overtimeRate !== undefined ? body.overtimeRate : prev?.overtime_rate, 0)
    if (dayRate < 0 || hourRate < 0 || overtimeRate < 0) return { error: '단가는 0 이상이어야 합니다' }
    const geoRadius = Math.min(2000, Math.max(30, int(body.geoRadius !== undefined ? body.geoRadius : prev?.geo_radius, 150)))
    return {
      value: {
        name, company: str(body.company !== undefined ? body.company : prev?.company, 60), address: str(body.address !== undefined ? body.address : prev?.address, 200),
        lat: body.lat !== undefined ? numOrNull(body.lat) : (prev?.lat ?? null), lng: body.lng !== undefined ? numOrNull(body.lng) : (prev?.lng ?? null), geoRadius,
        contactName: str(body.contactName !== undefined ? body.contactName : prev?.contact_name, 30), contactPhone: str(body.contactPhone !== undefined ? body.contactPhone : prev?.contact_phone, 20),
        memo: str(body.memo !== undefined ? body.memo : prev?.memo, 500), dayRate, hourRate, overtimeRate, settlementRule: settlementRule as SettlementRule, taxMode: taxMode as TaxMode,
        clockOutTime: body.clockOutTime !== undefined ? hhmm(body.clockOutTime) : (prev?.clock_out_time || ''),
        alarmDue: bool01(body.alarmDue, prev ? prev.alarm_due : 1), alarmClockOut: bool01(body.alarmClockOut, prev ? prev.alarm_clock_out : 1),
        archived: bool01(body.archived, prev ? prev.archived : 0),
      },
    }
  }

  api.get('/sites', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const all = c.req.query('all') === '1'
    const [sites, inv, month] = await Promise.all([
      db.prepare(`SELECT * FROM jobs_sites WHERE user_id = ? ${all ? '' : 'AND archived = 0'} ORDER BY archived ASC, updated_at DESC`).bind(u.id).all<any>(),
      db.prepare("SELECT * FROM jobs_invoices WHERE user_id = ? AND status IN ('sent','partial','overdue')").bind(u.id).all<any>(),
      db.prepare('SELECT site_id, COUNT(*) n, MAX(date) last FROM jobs_worklogs WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY site_id').bind(u.id, today.slice(0, 7) + '-01', monthEnd(today)).all<any>(),
    ])
    await refreshInvoiceStatuses(db, inv.results || [], today)
    const stats: Record<string, { unpaid: number; nextDue: string; overdue: boolean; monthDays: number; lastDate: string }> = {}
    for (const i of inv.results || []) {
      const s = stats[i.site_id] || (stats[i.site_id] = { unpaid: 0, nextDue: '', overdue: false, monthDays: 0, lastDate: '' })
      s.unpaid += Math.max(0, (i.net || 0) - (i.paid_amount || 0))
      if (i.due_date && (!s.nextDue || i.due_date < s.nextDue)) s.nextDue = i.due_date
      if (i.status === 'overdue') s.overdue = true
    }
    for (const m of month.results || []) {
      const s = stats[m.site_id] || (stats[m.site_id] = { unpaid: 0, nextDue: '', overdue: false, monthDays: 0, lastDate: '' })
      s.monthDays = m.n; s.lastDate = m.last
    }
    const list = (sites.results || []).map((s: any) => ({ ...siteOut(s), stats: stats[s.id] || { unpaid: 0, nextDue: '', overdue: false, monthDays: 0, lastDate: '' } }))
    // 미입금 있는 현장이 항상 위 (S-18)
    list.sort((a: any, b: any) => (a.archived === b.archived ? (b.stats.unpaid > 0 ? 1 : 0) - (a.stats.unpaid > 0 ? 1 : 0) : a.archived ? 1 : -1))
    return c.json(list)
  })
  api.post('/sites', async (c) => {
    const u = c.get('jobsUser'), body = await c.req.json<any>().catch(() => ({}))
    const r = siteFromBody(body)
    if ('error' in r) return c.json({ error: r.error }, 400)
    const v = r.value, id = newId('st'), now = nowIso()
    await c.env.DB.prepare(`INSERT INTO jobs_sites (id, user_id, name, company, address, lat, lng, geo_radius, contact_name, contact_phone, memo, day_rate, hour_rate, overtime_rate, settlement_rule, tax_mode, clock_out_time, alarm_due, alarm_clock_out, archived, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, u.id, v.name, v.company, v.address, v.lat, v.lng, v.geoRadius, v.contactName, v.contactPhone, v.memo, v.dayRate, v.hourRate, v.overtimeRate, v.settlementRule, v.taxMode, v.clockOutTime, v.alarmDue, v.alarmClockOut, v.archived, now, now).run()
    return c.json(siteOut(await loadSite(c.env.DB, u.id, id)), 201)
  })
  api.get('/sites/:id', async (c) => {
    const s = await loadSite(c.env.DB, c.get('jobsUser').id, c.req.param('id'))
    if (!s) return c.json({ error: '현장을 찾을 수 없습니다' }, 404)
    return c.json(siteOut(s))
  })
  api.put('/sites/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, id = c.req.param('id')
    const prev = await loadSite(db, u.id, id)
    if (!prev) return c.json({ error: '현장을 찾을 수 없습니다' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const r = siteFromBody(body, prev)
    if ('error' in r) return c.json({ error: r.error }, 400)
    const v = r.value
    await db.prepare(`UPDATE jobs_sites SET name=?, company=?, address=?, lat=?, lng=?, geo_radius=?, contact_name=?, contact_phone=?, memo=?, day_rate=?, hour_rate=?, overtime_rate=?, settlement_rule=?, tax_mode=?, clock_out_time=?, alarm_due=?, alarm_clock_out=?, archived=?, updated_at=? WHERE id = ? AND user_id = ?`)
      .bind(v.name, v.company, v.address, v.lat, v.lng, v.geoRadius, v.contactName, v.contactPhone, v.memo, v.dayRate, v.hourRate, v.overtimeRate, v.settlementRule, v.taxMode, v.clockOutTime, v.alarmDue, v.alarmClockOut, v.archived, nowIso(), id, u.id).run()
    // 세금 처리 변경 시 «앞으로만» 이 기본 — applyToPast=true 면 청구서에 안 들어간 지난 기록도 재계산 (S-08 규칙)
    if (body.applyToPast === true && v.taxMode !== prev.tax_mode) {
      const logs = await db.prepare('SELECT * FROM jobs_worklogs WHERE site_id = ? AND user_id = ? AND invoice_id IS NULL AND tax_mode_override IS NULL').bind(id, u.id).all<any>()
      const exps = await db.prepare('SELECT e.* FROM jobs_expenses e JOIN jobs_worklogs w ON w.id = e.worklog_id WHERE w.site_id = ? AND w.user_id = ? AND w.invoice_id IS NULL').bind(id, u.id).all<any>()
      const byLog = new Map<string, any[]>()
      for (const e of exps.results || []) { const a = byLog.get(e.worklog_id) || []; a.push(e); byLog.set(e.worklog_id, a) }
      const stmts = (logs.results || []).map((w: any) => {
        const a = calcWorkLog({ attendance: w.attendance, dayRate: w.day_rate, overtimeHours: w.overtime_hours, hourRate: w.hour_rate, taxMode: v.taxMode, expenses: (byLog.get(w.id) || []).map((e: any) => ({ type: e.type, amount: e.amount, chargeToClient: !!e.charge_to_client })) })
        return db.prepare('UPDATE jobs_worklogs SET gross=?, tax=?, net=?, updated_at=? WHERE id = ?').bind(a.gross, a.tax, a.net, nowIso(), w.id)
      })
      if (stmts.length) await db.batch(stmts)
    }
    return c.json(siteOut(await loadSite(db, u.id, id)))
  })
  api.delete('/sites/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, id = c.req.param('id')
    const prev = await loadSite(db, u.id, id)
    if (!prev) return c.json({ error: '현장을 찾을 수 없습니다' }, 404)
    const n = await db.prepare('SELECT COUNT(*) n FROM jobs_worklogs WHERE site_id = ?').bind(id).first<any>()
    if (n && n.n > 0) {
      await db.prepare('UPDATE jobs_sites SET archived = 1, updated_at = ? WHERE id = ?').bind(nowIso(), id).run()
      return c.json({ ok: true, archived: true, message: '기록이 있는 현장은 삭제 대신 보관했습니다' })
    }
    await db.prepare('DELETE FROM jobs_sites WHERE id = ? AND user_id = ?').bind(id, u.id).run()
    return c.json({ ok: true, archived: false })
  })

  // =========================================================== WORKLOGS ====
  async function loadLogs(db: D1Database, userId: string, where: string, binds: any[]) {
    const logs = await db.prepare(`SELECT w.*, s.name AS site_name, s.company AS site_company FROM jobs_worklogs w JOIN jobs_sites s ON s.id = w.site_id WHERE w.user_id = ? ${where} ORDER BY w.date DESC, w.created_at DESC`).bind(userId, ...binds).all<any>()
    const rows = logs.results || []
    if (!rows.length) return rows
    const ids = rows.map((r: any) => r.id)
    const byLog = new Map<string, any[]>()
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const exps = await db.prepare(`SELECT * FROM jobs_expenses WHERE worklog_id IN (${placeholders(chunk.length)})`).bind(...chunk).all<any>()
      for (const e of exps.results || []) { const a = byLog.get(e.worklog_id) || []; a.push(e); byLog.set(e.worklog_id, a) }
    }
    for (const r of rows) r.expenses = byLog.get(r.id) || []
    return rows
  }

  api.get('/worklogs', async (c) => {
    const u = c.get('jobsUser')
    const today = todayKst()
    let from = c.req.query('from') || '', to = c.req.query('to') || ''
    const month = c.req.query('month') || ''
    if (/^\d{4}-\d{2}$/.test(month)) { from = month + '-01'; to = monthEnd(from) }
    if (!isYmd(from) || !isYmd(to)) { from = today.slice(0, 7) + '-01'; to = monthEnd(today) }
    const siteId = c.req.query('site_id') || ''
    const rows = await loadLogs(c.env.DB, u.id, `AND w.date BETWEEN ? AND ? ${siteId ? 'AND w.site_id = ?' : ''}`, siteId ? [from, to, siteId] : [from, to])
    return c.json(rows.map(logOut))
  })
  api.get('/worklogs/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const rows = await loadLogs(db, u.id, 'AND w.id = ?', [c.req.param('id')])
    if (!rows.length) return c.json({ error: '기록을 찾을 수 없습니다' }, 404)
    const photos = await db.prepare('SELECT * FROM jobs_photos WHERE worklog_id = ? ORDER BY taken_at').bind(rows[0].id).all<any>()
    rows[0].photos = photos.results || []
    return c.json(logOut(rows[0]))
  })

  async function saveWorkLog(c: any, existing: any | null) {
    const u: UserRow = c.get('jobsUser'), db: D1Database = c.env.DB
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') return c.json({ error: '잘못된 요청입니다' }, 400)
    if (existing && (body.checkOutOnly === true || body.confirmCheckout === true)) {
      // S-05 «퇴근 기록» · 자동 퇴근 «맞아요» — 시각 · 위치만 바꾸므로 청구서에 들어간 기록이어도 허용 (금액 불변)
      if (body.confirmCheckout === true) {
        await db.prepare('UPDATE jobs_worklogs SET checkout_auto = 0, updated_at = ? WHERE id = ? AND user_id = ?').bind(nowIso(), existing.id, u.id).run()
      } else if (body.onlyIfEmpty === true && existing.check_out_at) {
        // 알림 «퇴근 기록» 버튼이 두 번 눌려도 처음 기록을 덮어쓰지 않는다
      } else {
        const checkOutAt = hhmm(body.checkOutAt) || str(body.checkOutAt, 30)
        await db.prepare('UPDATE jobs_worklogs SET check_out_at = ?, check_out_lat = ?, check_out_lng = ?, checkout_auto = 0, updated_at = ? WHERE id = ? AND user_id = ?')
          .bind(checkOutAt, body.checkOutLat !== undefined ? numOrNull(body.checkOutLat) : existing.check_out_lat, body.checkOutLng !== undefined ? numOrNull(body.checkOutLng) : existing.check_out_lng, nowIso(), existing.id, u.id).run()
      }
      const rows = await loadLogs(db, u.id, 'AND w.id = ?', [existing.id])
      return c.json(logOut(rows[0]))
    }
    if (existing?.invoice_id) return c.json({ error: '청구서에 들어간 기록입니다. 청구서를 삭제한 뒤 수정해 주세요', invoiceId: existing.invoice_id }, 409)
    const siteId = str(body.siteId !== undefined ? body.siteId : existing?.site_id, 40)
    const site = siteId ? await loadSite(db, u.id, siteId) : null
    if (!site) return c.json({ error: '현장을 골라 주세요' }, 400)
    const date = body.date !== undefined ? str(body.date, 10) : existing?.date
    if (!isYmd(date)) return c.json({ error: '날짜가 올바르지 않습니다' }, 400)
    const attendance: Attendance = (body.attendance !== undefined ? body.attendance : existing?.attendance || 'full') === 'half' ? 'half' : 'full'
    const overtimeHours = Math.max(0, Math.min(24, Number(body.overtimeHours !== undefined ? body.overtimeHours : existing?.overtime_hours || 0) || 0))
    const dayRate = int(body.dayRate !== undefined ? body.dayRate : existing ? existing.day_rate : site.day_rate, 0)
    const hourRate = int(body.hourRate !== undefined ? body.hourRate : existing ? existing.hour_rate : (site.overtime_rate || site.hour_rate), 0)
    if (dayRate < 0 || hourRate < 0) return c.json({ error: '단가는 0 이상이어야 합니다' }, 400)
    let taxModeOverride: TaxMode | null = existing?.tax_mode_override || null
    if (body.taxModeOverride !== undefined) {
      if (body.taxModeOverride === null || body.taxModeOverride === '') taxModeOverride = null
      else if (isTaxMode(body.taxModeOverride)) taxModeOverride = body.taxModeOverride
      else return c.json({ error: '세액공제 방식이 올바르지 않습니다' }, 400)
    }
    if (taxModeOverride === site.tax_mode) taxModeOverride = null
    const taxMode: TaxMode = taxModeOverride || site.tax_mode
    // 경비
    let expenses: { type: ExpenseType; name: string; amount: number; chargeToClient: boolean }[] | null = null
    if (Array.isArray(body.expenses)) {
      if (body.expenses.length > 20) return c.json({ error: '경비는 20건까지 입력할 수 있습니다' }, 400)
      expenses = []
      for (const e of body.expenses) {
        const amount = int(e?.amount, 0)
        if (amount <= 0) continue
        expenses.push({ type: isExpenseType(e?.type) ? e.type : 'etc', name: str(e?.name, 40), amount, chargeToClient: e?.chargeToClient === undefined ? true : !!e.chargeToClient })
      }
    } else if (existing) {
      const prevExp = await db.prepare('SELECT * FROM jobs_expenses WHERE worklog_id = ?').bind(existing.id).all<any>()
      expenses = (prevExp.results || []).map((e: any) => ({ type: e.type, name: e.name, amount: e.amount, chargeToClient: !!e.charge_to_client }))
      expenses = null // 변경 없음 → 그대로 두고 계산에만 사용
      var keptExpenses = (prevExp.results || []).map((e: any) => ({ type: e.type as ExpenseType, name: e.name, amount: e.amount, chargeToClient: !!e.charge_to_client }))
    }
    const calcExpenses = expenses ?? (typeof keptExpenses !== 'undefined' ? keptExpenses : [])
    // 사진
    // 사진: {id} 는 기존 사진 유지, {uri: data URI} 는 새 사진. photos 키가 없으면 그대로 둔다.
    let photos: { id?: string; uri: string; takenAt: string; lat: number | null; lng: number | null; label: string }[] | null = null
    if (Array.isArray(body.photos)) {
      if (body.photos.length > 6) return c.json({ error: '사진은 6장까지 붙일 수 있습니다' }, 400)
      photos = []
      for (const p of body.photos) {
        if (p && typeof p.id === 'string' && !p.uri) { photos.push({ id: str(p.id, 40), uri: '', takenAt: '', lat: null, lng: null, label: '' }); continue }
        const uri = String(p?.uri || '')
        if (!DATA_URI_RE.test(uri)) return c.json({ error: '사진 형식이 올바르지 않습니다' }, 400)
        if (uri.length > 700_000) return c.json({ error: '사진 한 장은 500KB 이하로 줄여 주세요' }, 400)
        photos.push({ uri, takenAt: str(p?.takenAt, 30), lat: numOrNull(p?.lat), lng: numOrNull(p?.lng), label: str(p?.label, 40) })
      }
    }
    const amounts = calcWorkLog({ attendance, dayRate, overtimeHours, hourRate, taxMode, expenses: calcExpenses })
    const now = nowIso()
    const id = existing?.id || newId('wl')
    const source = ['voice', 'manual', 'copy', 'gps'].includes(body.source) ? body.source : existing?.source || 'manual'
    const checkInAt = body.checkInAt !== undefined ? str(body.checkInAt, 30) : existing?.check_in_at || ''
    const checkOutAt = body.checkOutAt !== undefined ? str(body.checkOutAt, 30) : existing?.check_out_at || ''
    const stmts: D1PreparedStatement[] = []
    if (!existing) {
      const dup = await db.prepare('SELECT id FROM jobs_worklogs WHERE user_id = ? AND site_id = ? AND date = ?').bind(u.id, siteId, date).first<any>()
      if (dup) return c.json({ error: '이 날짜에 이 현장 기록이 이미 있습니다', existingId: dup.id }, 409)
      stmts.push(db.prepare(`INSERT INTO jobs_worklogs (id, user_id, site_id, date, source, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng, geo_distance_m, attendance, overtime_hours, day_rate, hour_rate, tax_mode_override, gross, tax, net, edited_manually, memo, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, u.id, siteId, date, source, checkInAt, checkOutAt, numOrNull(body.checkInLat), numOrNull(body.checkInLng), numOrNull(body.checkOutLat), numOrNull(body.checkOutLng),
        body.geoDistanceM !== undefined ? int(body.geoDistanceM) : null, attendance, overtimeHours, dayRate, hourRate, taxModeOverride, amounts.gross, amounts.tax, amounts.net,
        source === 'manual' ? 1 : 0, str(body.memo, 300), now, now))
    } else {
      if (date !== existing.date || siteId !== existing.site_id) {
        const dup = await db.prepare('SELECT id FROM jobs_worklogs WHERE user_id = ? AND site_id = ? AND date = ? AND id != ?').bind(u.id, siteId, date, id).first<any>()
        if (dup) return c.json({ error: '이 날짜에 이 현장 기록이 이미 있습니다', existingId: dup.id }, 409)
      }
      stmts.push(db.prepare(`UPDATE jobs_worklogs SET site_id=?, date=?, check_in_at=?, check_out_at=?, check_out_lat=?, check_out_lng=?, attendance=?, overtime_hours=?, day_rate=?, hour_rate=?, tax_mode_override=?, gross=?, tax=?, net=?, edited_manually=?, memo=?, checkout_auto=0, updated_at=? WHERE id = ? AND user_id = ?`).bind(
        siteId, date, checkInAt, checkOutAt, body.checkOutLat !== undefined ? numOrNull(body.checkOutLat) : existing.check_out_lat, body.checkOutLng !== undefined ? numOrNull(body.checkOutLng) : existing.check_out_lng, attendance, overtimeHours, dayRate, hourRate, taxModeOverride, amounts.gross, amounts.tax, amounts.net,
        body.checkOutOnly === true ? (existing.edited_manually || 0) : 1, // 퇴근 버튼(S-05 전경 버전)은 «수정됨» 표시를 남기지 않는다
        body.memo !== undefined ? str(body.memo, 300) : existing.memo || '', now, id, u.id))
    }
    if (expenses) {
      stmts.push(db.prepare('DELETE FROM jobs_expenses WHERE worklog_id = ?').bind(id))
      for (const e of expenses) stmts.push(db.prepare('INSERT INTO jobs_expenses (id, user_id, worklog_id, type, name, amount, charge_to_client) VALUES (?,?,?,?,?,?,?)').bind(newId('ex'), u.id, id, e.type, e.name, e.amount, e.chargeToClient ? 1 : 0))
    }
    let removedUris: string[] = []
    if (photos) {
      const prevPhotos = existing ? ((await db.prepare('SELECT id, uri FROM jobs_photos WHERE worklog_id = ?').bind(id).all<any>()).results || []) : []
      const keep = new Set(photos.filter(p => p.id).map(p => p.id as string))
      const removed = prevPhotos.filter((p: any) => !keep.has(p.id))
      removedUris = removed.map((p: any) => p.uri)
      for (const p of removed) stmts.push(db.prepare('DELETE FROM jobs_photos WHERE id = ?').bind(p.id))
      for (const p of photos.filter(p => !p.id)) {
        const pid = newId('ph')
        const uri = await storePhoto(c.env.JOBS_PHOTOS, u.id, pid, p.uri)
        stmts.push(db.prepare('INSERT INTO jobs_photos (id, user_id, worklog_id, uri, taken_at, lat, lng, label) VALUES (?,?,?,?,?,?,?,?)').bind(pid, u.id, id, uri, p.takenAt, p.lat, p.lng, p.label))
      }
    }
    await db.batch(stmts)
    await deletePhotoObjects(c.env.JOBS_PHOTOS, removedUris)
    const rows = await loadLogs(db, u.id, 'AND w.id = ?', [id])
    rows[0].photos = (await db.prepare('SELECT * FROM jobs_photos WHERE worklog_id = ? ORDER BY taken_at').bind(id).all<any>()).results || []
    return c.json(logOut(rows[0]), existing ? 200 : 201)
  }
  api.post('/worklogs', (c) => saveWorkLog(c, null))
  api.put('/worklogs/:id', async (c) => {
    const existing = await c.env.DB.prepare('SELECT * FROM jobs_worklogs WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('jobsUser').id).first<any>()
    if (!existing) return c.json({ error: '기록을 찾을 수 없습니다' }, 404)
    return saveWorkLog(c, existing)
  })
  api.delete('/worklogs/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, id = c.req.param('id')
    const existing = await db.prepare('SELECT * FROM jobs_worklogs WHERE id = ? AND user_id = ?').bind(id, u.id).first<any>()
    if (!existing) return c.json({ error: '기록을 찾을 수 없습니다' }, 404)
    if (existing.invoice_id) return c.json({ error: '청구서에 들어간 기록은 지울 수 없습니다. 청구서를 먼저 삭제해 주세요' }, 409)
    const ph = await db.prepare('SELECT uri FROM jobs_photos WHERE worklog_id = ?').bind(id).all<any>()
    await db.batch([
      db.prepare('DELETE FROM jobs_expenses WHERE worklog_id = ?').bind(id),
      db.prepare('DELETE FROM jobs_photos WHERE worklog_id = ?').bind(id),
      db.prepare('DELETE FROM jobs_worklogs WHERE id = ?').bind(id),
    ])
    await deletePhotoObjects(c.env.JOBS_PHOTOS, (ph.results || []).map((p: any) => p.uri))
    return c.json({ ok: true })
  })
  // S-02 «어제와 같이» — 직전 기록을 복제하고 날짜만 바꾼다
  api.post('/worklogs/copy', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const body = await c.req.json<any>().catch(() => ({}))
    const date = isYmd(body.date) ? body.date : todayKst()
    const siteId = str(body.siteId, 40)
    const src = await db.prepare(`SELECT * FROM jobs_worklogs WHERE user_id = ? AND date < ? ${siteId ? 'AND site_id = ?' : ''} ORDER BY date DESC LIMIT 1`).bind(u.id, date, ...(siteId ? [siteId] : [])).first<any>()
    if (!src) return c.json({ error: '복사할 지난 기록이 없습니다' }, 404)
    const dup = await db.prepare('SELECT id FROM jobs_worklogs WHERE user_id = ? AND site_id = ? AND date = ?').bind(u.id, src.site_id, date).first<any>()
    if (dup) return c.json({ error: '이 날짜에 이미 기록이 있습니다', existingId: dup.id }, 409)
    const exps = await db.prepare('SELECT * FROM jobs_expenses WHERE worklog_id = ?').bind(src.id).all<any>()
    const expenses = (exps.results || []).map((e: any) => ({ type: e.type as ExpenseType, name: e.name, amount: e.amount, chargeToClient: !!e.charge_to_client }))
    const taxMode: TaxMode = src.tax_mode_override || (await loadSite(db, u.id, src.site_id))?.tax_mode || u.default_tax_mode
    const a = calcWorkLog({ attendance: src.attendance, dayRate: src.day_rate, overtimeHours: src.overtime_hours, hourRate: src.hour_rate, taxMode, expenses })
    const id = newId('wl'), now = nowIso()
    const stmts = [db.prepare(`INSERT INTO jobs_worklogs (id, user_id, site_id, date, source, check_in_at, check_out_at, attendance, overtime_hours, day_rate, hour_rate, tax_mode_override, gross, tax, net, edited_manually, memo, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, u.id, src.site_id, date, 'copy', src.check_in_at || '', src.check_out_at || '', src.attendance, src.overtime_hours, src.day_rate, src.hour_rate, src.tax_mode_override, a.gross, a.tax, a.net, 0, '', now, now)]
    for (const e of expenses) stmts.push(db.prepare('INSERT INTO jobs_expenses (id, user_id, worklog_id, type, name, amount, charge_to_client) VALUES (?,?,?,?,?,?,?)').bind(newId('ex'), u.id, id, e.type, e.name, e.amount, e.chargeToClient ? 1 : 0))
    await db.batch(stmts)
    const rows = await loadLogs(db, u.id, 'AND w.id = ?', [id])
    return c.json(logOut(rows[0]), 201)
  })

  // ========================================================== DASHBOARD ====
  api.get('/dashboard', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const month = /^\d{4}-\d{2}$/.test(c.req.query('month') || '') ? c.req.query('month')! : today.slice(0, 7)
    const from = month + '-01', to = monthEnd(from)
    const rangeFrom = addDays(today, -29)
    const [monthLogs, rangeLogs, invRes, paidRes, todayRes, unreadRes, autoRes] = await Promise.all([
      loadLogs(db, u.id, 'AND w.date BETWEEN ? AND ?', [from, to]),
      db.prepare('SELECT date, attendance, net, invoice_id FROM jobs_worklogs WHERE user_id = ? AND date BETWEEN ? AND ?').bind(u.id, rangeFrom, today).all<any>(),
      db.prepare("SELECT i.*, s.name AS site_name, s.company AS site_company FROM jobs_invoices i JOIN jobs_sites s ON s.id = i.site_id WHERE i.user_id = ? AND i.status != 'draft'").bind(u.id).all<any>(),
      db.prepare('SELECT COALESCE(SUM(amount),0) paid FROM jobs_payments WHERE user_id = ? AND excluded = 0 AND substr(paid_at,1,7) = ?').bind(u.id, month).first<any>(),
      loadLogs(db, u.id, 'AND w.date = ?', [today]),
      db.prepare('SELECT COUNT(*) n FROM jobs_notifications WHERE user_id = ? AND read_at IS NULL').bind(u.id).first<any>(),
      db.prepare('SELECT w.id, w.date, w.check_out_at, s.name AS site_name FROM jobs_worklogs w JOIN jobs_sites s ON s.id = w.site_id WHERE w.user_id = ? AND w.checkout_auto = 1 AND w.date >= ? ORDER BY w.date DESC LIMIT 5').bind(u.id, addDays(today, -14)).all<any>(),
    ])
    const invoices = invRes.results || []
    await refreshInvoiceStatuses(db, invoices, today)
    const invById = new Map(invoices.map((i: any) => [i.id, i]))
    let monthGross = 0, monthTax = 0, monthNet = 0, monthDays = 0
    for (const l of monthLogs) { monthGross += l.gross || 0; monthTax += l.tax || 0; monthNet += l.net || 0; monthDays += l.attendance === 'half' ? 0.5 : 1 }
    const monthInv = invoices.filter((i: any) => i.period_end >= from && i.period_end <= to)
    const settled = monthInv.reduce((s: number, i: any) => s + Math.min(i.paid_amount || 0, i.net || 0), 0)
    const open = invoices.filter((i: any) => (i.net || 0) - (i.paid_amount || 0) > 0 && i.status !== 'paid')
    const unsettledAll = open.reduce((s: number, i: any) => s + ((i.net || 0) - (i.paid_amount || 0)), 0)
    const unsettledMonth = Math.max(0, monthNet - settled)
    const openOut = open.map((i: any) => invoiceOut(i, today)).sort((a, b) => (b.daysOverdue - a.daysOverdue) || a.dueDate.localeCompare(b.dueDate))
    const dueSoon = openOut.filter(i => i.daysOverdue === 0 && i.dueDate && daysBetween(today, i.dueDate) <= 7).map(i => ({ ...i, dDay: daysBetween(today, i.dueDate) }))
    // 7 / 14 / 30 일 집계 — 청구서가 없거나 미완납이면 «미정산»
    const ranges: Record<string, { days: number; net: number; unsettled: number; count: number }> = {}
    for (const n of [7, 14, 30]) {
      const start = addDays(today, -(n - 1))
      const r = { days: 0, net: 0, unsettled: 0, count: 0 }
      for (const l of rangeLogs.results || []) {
        if (l.date < start) continue
        r.count++; r.days += l.attendance === 'half' ? 0.5 : 1; r.net += l.net || 0
        const inv = l.invoice_id ? invById.get(l.invoice_id) : null
        if (!inv || inv.status !== 'paid') r.unsettled += l.net || 0
      }
      ranges[String(n)] = r
    }
    // 캘린더 마커
    const byDate: Record<string, { net: number; count: number; half: boolean; sites: string[]; overtime: number }> = {}
    for (const l of monthLogs) {
      const d = byDate[l.date] || (byDate[l.date] = { net: 0, count: 0, half: false, sites: [], overtime: 0 })
      d.net += l.net || 0; d.count++; if (l.attendance === 'half') d.half = true; d.overtime += l.overtime_hours || 0
      if (!d.sites.includes(l.site_name)) d.sites.push(l.site_name)
    }
    const dueMarks: Record<string, 'due' | 'overdue' | 'paid'> = {}
    for (const i of invoices) {
      if (!i.due_date || i.due_date < from || i.due_date > to) continue
      dueMarks[i.due_date] = i.status === 'paid' ? 'paid' : i.status === 'overdue' ? 'overdue' : 'due'
    }
    // 미정산 청구서가 걸린 날(기간) 표시용: overdue 청구서의 기간에 속한 기록
    const overdueLogDates = new Set<string>()
    for (const l of monthLogs) { const inv = l.invoice_id ? invById.get(l.invoice_id) : null; if (inv && inv.status === 'overdue') overdueLogDates.add(l.date) }
    return c.json({
      month, today, monthGross, monthTax, monthNet, monthDays,
      kpi: { settled, unsettledMonth, unsettledAll, days: monthDays },
      paidThisMonth: paidRes?.paid || 0,
      todayLogs: todayRes.map(logOut),
      logs: monthLogs.map(logOut),
      ranges,
      unsettled: openOut,
      dueSoon,
      calendar: { byDate, dueMarks, overdueLogDates: Array.from(overdueLogDates) },
      unreadNotifications: unreadRes?.n || 0,
      autoCheckouts: (autoRes.results || []).map((w: any) => ({ id: w.id, date: w.date, siteName: w.site_name, checkOutAt: w.check_out_at || '' })),
    })
  })

  // ======================================================= NOTIFICATIONS ====
  api.get('/notifications', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const [list, cnt, subs] = await Promise.all([
      db.prepare('SELECT id, kind, title, body, url, read_at, created_at FROM jobs_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(u.id).all<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_notifications WHERE user_id = ? AND read_at IS NULL').bind(u.id).first<any>(),
      db.prepare('SELECT COUNT(*) n FROM jobs_push_subs WHERE user_id = ?').bind(u.id).first<any>(),
    ])
    return c.json({ unread: cnt?.n || 0, devices: subs?.n || 0, items: (list.results || []).map((n: any) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body || '', url: n.url || '', read: !!n.read_at, createdAt: n.created_at })) })
  })
  api.post('/notifications/read', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, body = await c.req.json<any>().catch(() => ({}))
    if (body.all === true) {
      await db.prepare('UPDATE jobs_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(nowIso(), u.id).run()
    } else {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map((v: unknown) => str(v, 40)).filter(Boolean).slice(0, 100)
      if (!ids.length) return c.json({ error: '읽음 처리할 알림이 없습니다' }, 400)
      await db.prepare(`UPDATE jobs_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders(ids.length)})`).bind(nowIso(), u.id, ...ids).run()
    }
    const cnt = await db.prepare('SELECT COUNT(*) n FROM jobs_notifications WHERE user_id = ? AND read_at IS NULL').bind(u.id).first<any>()
    return c.json({ ok: true, unread: cnt?.n || 0 })
  })

  // ============================================================== PUSH ====
  api.get('/push/key', (c) => c.json({ publicKey: c.env.JOBS_VAPID_PUBLIC && c.env.JOBS_VAPID_PRIVATE ? c.env.JOBS_VAPID_PUBLIC : null }))
  api.post('/push/subscribe', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, body = await c.req.json<any>().catch(() => ({}))
    const endpoint = str(body.endpoint, 1000), p256dh = str(body.keys?.p256dh, 200), auth = str(body.keys?.auth, 100)
    if (!isAllowedPushEndpoint(endpoint, c.env.JOBS_DEV_OTP === '1')) return c.json({ error: '지원하지 않는 푸시 주소입니다' }, 400)
    let okKeys = false
    try { const k = b64urlDecode(p256dh), a = b64urlDecode(auth); okKeys = k.length === 65 && k[0] === 4 && a.length === 16 } catch { okKeys = false }
    if (!okKeys) return c.json({ error: '푸시 구독 키가 올바르지 않습니다' }, 400)
    await db.prepare(`INSERT INTO jobs_push_subs (id, user_id, endpoint, p256dh, auth, ua) VALUES (?,?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fail_count = 0`)
      .bind(newId('ps'), u.id, endpoint, p256dh, auth, str(c.req.header('User-Agent'), 200)).run()
    const n = await db.prepare('SELECT COUNT(*) n FROM jobs_push_subs WHERE user_id = ?').bind(u.id).first<any>()
    return c.json({ ok: true, devices: n?.n || 0 })
  })
  api.post('/push/unsubscribe', async (c) => {
    const u = c.get('jobsUser'), body = await c.req.json<any>().catch(() => ({}))
    await c.env.DB.prepare('DELETE FROM jobs_push_subs WHERE user_id = ? AND endpoint = ?').bind(u.id, str(body.endpoint, 1000)).run()
    return c.json({ ok: true })
  })
  api.post('/push/test', async (c) => {
    const u = c.get('jobsUser')
    if (!vapidFromEnv(c.env)) return c.json({ error: '푸시 키(JOBS_VAPID_*)가 아직 설정되지 않았습니다' }, 503)
    await createNotifications(c.env.DB, [{ userId: u.id, kind: 'test', dedupe: `test:${Date.now()}`, title: 'JOBS 알림 테스트', body: '이 알림이 보이면 퇴근 알람 · 입금 예정일 알림을 받을 수 있습니다', url: '/jobs/#/settings', push: { urgency: 'high' } }])
    const r = await flushPushQueue(c.env, 5)
    return c.json({ ok: true, ...r })
  })

  // ============================================================== CRON ====
  // 외부 크론(workers/jobs-cron)이 10분마다 호출. Bearer 세션 대신 X-Jobs-Cron 비밀값으로 보호
  api.post('/cron/run', async (c) => {
    const secret = c.env.JOBS_CRON_SECRET
    if (!secret) return c.json({ error: 'cron not configured' }, 503)
    const got = c.req.header('X-Jobs-Cron') || ''
    if ((await sha256Hex(got)) !== (await sha256Hex(secret))) return c.json({ error: 'forbidden' }, 403)
    let now = new Date()
    const q = c.req.query('now')
    if (c.env.JOBS_DEV_OTP === '1' && q) { const d = new Date(q); if (!isNaN(d.getTime())) now = d } // 로컬 테스트 전용 시각 주입
    return c.json({ ok: true, at: now.toISOString(), ...(await runJobsCron(c.env, now)) })
  })

  // =========================================================== INVOICES ====
  async function loadInvoice(db: D1Database, userId: string, id: string) {
    return db.prepare('SELECT i.*, s.name AS site_name, s.company AS site_company FROM jobs_invoices i JOIN jobs_sites s ON s.id = i.site_id WHERE i.id = ? AND i.user_id = ?').bind(id, userId).first<any>()
  }
  async function previewInvoice(c: any, body: any) {
    const u: UserRow = c.get('jobsUser'), db: D1Database = c.env.DB
    const site = await loadSite(db, u.id, str(body.siteId, 40))
    if (!site) return { error: '현장을 골라 주세요', status: 400 }
    const periodStart = str(body.periodStart, 10), periodEnd = str(body.periodEnd, 10)
    if (!isYmd(periodStart) || !isYmd(periodEnd) || periodStart > periodEnd) return { error: '기간이 올바르지 않습니다', status: 400 }
    const taxMode: TaxMode = isTaxMode(body.taxMode) ? body.taxMode : site.tax_mode
    const logs = await loadLogs(db, u.id, 'AND w.site_id = ? AND w.date BETWEEN ? AND ? AND w.invoice_id IS NULL', [site.id, periodStart, periodEnd])
    if (!logs.length) return { error: '이 기간에 청구서에 넣을 출근 기록이 없습니다', status: 400 }
    const calc = buildInvoice(
      logs.map((l: any) => ({ id: l.id, date: l.date, attendance: l.attendance, dayRate: l.day_rate, hourRate: l.hour_rate, overtimeHours: l.overtime_hours })),
      logs.flatMap((l: any) => (l.expenses || []).map((e: any) => ({ worklogId: l.id, type: e.type, name: e.name, amount: e.amount, chargeToClient: !!e.charge_to_client }))),
      taxMode,
    )
    const dueDate = dueDateFor(site.settlement_rule as SettlementRule, periodEnd)
    const photoCount = await db.prepare(`SELECT COUNT(*) n FROM jobs_photos WHERE worklog_id IN (${placeholders(logs.length)}) AND attach_to_invoice = 1`).bind(...logs.map((l: any) => l.id)).first<any>()
    return { site, logs, calc, taxMode, dueDate, periodStart, periodEnd, photoCount: photoCount?.n || 0 }
  }
  api.post('/invoices/preview', async (c) => {
    const body = await c.req.json<any>().catch(() => ({}))
    const p = await previewInvoice(c, body)
    if ('error' in p) return c.json({ error: p.error }, p.status as any)
    return c.json({ site: siteOut(p.site), periodStart: p.periodStart, periodEnd: p.periodEnd, dueDate: p.dueDate, taxMode: p.taxMode, logCount: p.logs.length, photoCount: p.photoCount, ...p.calc, logs: p.logs.map(logOut) })
  })
  api.post('/invoices', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const body = await c.req.json<any>().catch(() => ({}))
    const p = await previewInvoice(c, body)
    if ('error' in p) return c.json({ error: p.error }, p.status as any)
    const id = newId('inv'), now = nowIso(), token = randomHex(12)
    const ids = p.logs.map((l: any) => l.id)
    await db.batch([
      db.prepare(`INSERT INTO jobs_invoices (id, user_id, site_id, period_start, period_end, rows, day_pays, gross, tax_mode, tax, net, due_date, status, paid_amount, attach_photos, memo, share_token, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft',0,?,?,?,?,?)`).bind(id, u.id, p.site.id, p.periodStart, p.periodEnd, JSON.stringify(p.calc.rows), JSON.stringify(p.calc.dayPays), p.calc.gross, p.taxMode, p.calc.tax, p.calc.net, p.dueDate, bool01(body.attachPhotos, 0), str(body.memo, 300), token, now, now),
      db.prepare(`UPDATE jobs_worklogs SET invoice_id = ? WHERE id IN (${placeholders(ids.length)})`).bind(id, ...ids),
    ])
    return c.json(invoiceOut(await loadInvoice(db, u.id, id), todayKst()), 201)
  })
  api.get('/invoices', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const scope = c.req.query('status') || 'all'
    const where = scope === 'open' ? "AND i.status IN ('sent','partial','overdue')" : scope === 'draft' ? "AND i.status = 'draft'" : ''
    const res = await db.prepare(`SELECT i.*, s.name AS site_name, s.company AS site_company FROM jobs_invoices i JOIN jobs_sites s ON s.id = i.site_id WHERE i.user_id = ? ${where} ORDER BY i.period_end DESC, i.created_at DESC`).bind(u.id).all<any>()
    const rows = res.results || []
    await refreshInvoiceStatuses(db, rows, today)
    return c.json(rows.map((i: any) => invoiceOut(i, today)))
  })
  api.get('/invoices/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    await refreshInvoiceStatuses(db, [inv], today)
    const [pays, sends, logs, photos] = await Promise.all([
      db.prepare('SELECT * FROM jobs_payments WHERE invoice_id = ? ORDER BY paid_at DESC').bind(inv.id).all<any>(),
      db.prepare('SELECT * FROM jobs_sendlogs WHERE doc_id = ? ORDER BY sent_at DESC').bind(inv.id).all<any>(),
      db.prepare('SELECT id, date, attendance, overtime_hours, net FROM jobs_worklogs WHERE invoice_id = ? ORDER BY date').bind(inv.id).all<any>(),
      db.prepare('SELECT p.id, p.worklog_id, p.taken_at, p.lat, p.lng, p.label FROM jobs_photos p JOIN jobs_worklogs w ON w.id = p.worklog_id WHERE w.invoice_id = ? AND p.attach_to_invoice = 1 ORDER BY p.taken_at').bind(inv.id).all<any>(),
    ])
    const site = await loadSite(db, u.id, inv.site_id)
    return c.json({
      ...invoiceOut(inv, today), site: siteOut(site), breakdown: retaxInvoice(safeJson<InvoiceRow[]>(inv.rows, []), inv.tax_mode, safeJson<number[]>(inv.day_pays, [])).breakdown,
      payments: (pays.results || []).map(paymentOut), sendLogs: (sends.results || []).map(sendlogOut),
      worklogs: (logs.results || []), photoCount: (photos.results || []).length,
      shareUrl: shareUrl(c, inv.share_token),
    })
  })
  api.put('/invoices/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const sets: string[] = [], vals: any[] = []
    if (body.taxMode !== undefined && body.taxMode !== inv.tax_mode) {
      if (!isTaxMode(body.taxMode)) return c.json({ error: '세액공제 방식이 올바르지 않습니다' }, 400)
      if (inv.status === 'paid') return c.json({ error: '입금 완료된 청구서는 세액을 바꿀 수 없습니다' }, 409)
      const r = retaxInvoice(safeJson<InvoiceRow[]>(inv.rows, []), body.taxMode, safeJson<number[]>(inv.day_pays, []))
      sets.push('tax_mode = ?', 'gross = ?', 'tax = ?', 'net = ?'); vals.push(body.taxMode, r.gross, r.tax, r.net)
      inv.net = r.net
    }
    if (body.attachPhotos !== undefined) { sets.push('attach_photos = ?'); vals.push(bool01(body.attachPhotos, 0)) }
    if (body.memo !== undefined) { sets.push('memo = ?'); vals.push(str(body.memo, 300)) }
    if (body.dueDate !== undefined) { if (!isYmd(body.dueDate)) return c.json({ error: '예정일이 올바르지 않습니다' }, 400); sets.push('due_date = ?'); vals.push(body.dueDate); inv.due_date = body.dueDate }
    if (body.status === 'sent' && inv.status === 'draft') { sets.push('status = ?'); vals.push('sent'); inv.status = 'sent' }
    if (!sets.length) return c.json({ error: '바꿀 내용이 없습니다' }, 400)
    const next = invoiceStatus(inv.status, inv.net, inv.paid_amount || 0, inv.due_date, today)
    if (next !== inv.status) { sets.push('status = ?'); vals.push(next) }
    sets.push('updated_at = ?'); vals.push(nowIso(), inv.id)
    await db.prepare(`UPDATE jobs_invoices SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
    return c.json(invoiceOut(await loadInvoice(db, u.id, inv.id), today))
  })
  api.delete('/invoices/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    const n = await db.prepare('SELECT COUNT(*) n FROM jobs_payments WHERE invoice_id = ?').bind(inv.id).first<any>()
    if (n && n.n > 0) return c.json({ error: '입금 기록이 있는 청구서는 삭제할 수 없습니다' }, 409)
    await db.batch([
      db.prepare('UPDATE jobs_worklogs SET invoice_id = NULL WHERE invoice_id = ?').bind(inv.id),
      db.prepare('DELETE FROM jobs_invoices WHERE id = ?').bind(inv.id),
    ])
    return c.json({ ok: true })
  })

  function shareUrl(c: any, token: string, kind: 'v' | 'q' = 'v') {
    const origin = (c.env.JOBS_PUBLIC_ORIGIN || new URL(c.req.url).origin).replace(/\/$/, '')
    return `${origin}/jobs/${kind}/${token}`
  }
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  const emailHtml = (title: string, lines: [string, string][], link: string, btn: string) => `
    <div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1C1E">
      <h2 style="margin:0 0 14px;font-size:20px">${title}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:15px">${lines.map(([k, v]) => `<tr><td style="padding:8px 0;color:#6B6B6B;border-bottom:1px solid #EFEFF4">${k}</td><td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #EFEFF4">${v}</td></tr>`).join('')}</table>
      <p style="margin:22px 0"><a href="${link}" style="background:#0A6CD6;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">${btn}</a></p>
      <p style="color:#8E8E93;font-size:12px">이 메일은 JOBS 앱 사용자가 보냈습니다. 링크는 로그인 없이 열리며 PDF로 저장할 수 있습니다.</p>
    </div>`
  function invoiceText(inv: any, link: string) {
    return `[JOBS 청구서] ${inv.site_company || inv.site_name} 귀하\n${inv.site_name} · ${period(inv.period_start, inv.period_end)}\n청구 ${fmt(inv.gross)}원 − 세액공제(${TAX_MODES[inv.tax_mode as TaxMode]?.short || ''}) ${fmt(inv.tax)}원 = 실수령 ${fmt(inv.net)}원\n입금 예정일 ${inv.due_date}\n청구서 보기: ${link}`
  }
  function dunningText(inv: any, level: 'polite' | 'firm', link: string, today: string) {
    const remaining = Math.max(0, (inv.net || 0) - (inv.paid_amount || 0)), over = Math.max(0, daysBetween(inv.due_date, today))
    const head = `[JOBS] ${inv.site_company || inv.site_name} 담당자님, ${inv.site_name} ${period(inv.period_start, inv.period_end)} 청구서`
    if (level === 'firm') return `${head} 잔액 ${fmt(remaining)}원이 입금 예정일(${inv.due_date})로부터 ${over}일째 미입금입니다. ${addDays(today, 3)}까지 입금을 요청드립니다. 입금이 어려우시면 일정을 회신해 주세요.\n청구서: ${link}`
    return `${head} 실수령액 ${fmt(remaining)}원이 입금 예정일(${inv.due_date})을 ${over}일 지났습니다. 확인 후 입금 부탁드립니다.\n청구서: ${link}`
  }
  // S-10 보내기 — sms | kakao(알림톡 템플릿 전 SMS 대체) | link | pdf
  api.post('/invoices/:id/send', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const channel = ['sms', 'kakao', 'email', 'link', 'pdf'].includes(body.channel) ? body.channel : 'link'
    const link = shareUrl(c, inv.share_token)
    const text = invoiceText(inv, link)
    let to = '', via: string = channel
    if (channel === 'sms' || channel === 'kakao') {
      to = normPhone(body.to || (await loadSite(db, u.id, inv.site_id))?.contact_phone)
      if (!isPhone(to) && !/^0\d{8,10}$/.test(to)) return c.json({ error: '받는 사람 번호를 입력해 주세요' }, 400)
      const tpl = channel === 'kakao' ? c.env.JOBS_KAKAO_TPL_INVOICE : ''
      via = tpl ? 'kakao' : 'sms'
      const r = tpl
        ? await deps.sendSms(c.env, { to, text, type: 'ATA', templateId: tpl, variables: { '#{업체}': inv.site_company || inv.site_name, '#{현장}': inv.site_name, '#{기간}': period(inv.period_start, inv.period_end), '#{청구금액}': fmt(inv.gross), '#{세액}': fmt(inv.tax), '#{실수령}': fmt(inv.net), '#{예정일}': inv.due_date, '#{링크}': link } })
        : await deps.sendSms(c.env, { to, text, type: 'LMS', subject: `${inv.site_name} 청구서` })
      if (!r.ok) return c.json({ error: '문자를 보내지 못했습니다', detail: r.error }, 503)
    } else if (channel === 'email') {
      to = str(body.to, 120).toLowerCase()
      if (!isEmail(to)) return c.json({ error: '받는 메일 주소를 입력해 주세요' }, 400)
      const r = await deps.sendEmail(c.env, { to, subject: `[JOBS 청구서] ${inv.site_name} ${period(inv.period_start, inv.period_end)} · 실수령 ${fmt(inv.net)}원`,
        html: emailHtml(`청구서 — ${inv.site_name}`, [['받는 곳', inv.site_company || '-'], ['기간', period(inv.period_start, inv.period_end)], ['청구 금액', fmt(inv.gross) + '원'], [`세액공제 (${TAX_MODES[inv.tax_mode as TaxMode]?.short || ''})`, '− ' + fmt(inv.tax) + '원'], ['실수령액', fmt(inv.net) + '원'], ['입금 예정일', inv.due_date]], link, '청구서 열기 · PDF 저장') })
      if (!r.ok) return c.json({ error: '메일을 보내지 못했습니다', detail: r.error }, 503)
    }
    const stmts = [db.prepare('INSERT INTO jobs_sendlogs (id, user_id, doc_type, doc_id, channel, to_addr, amount, sent_at) VALUES (?,?,?,?,?,?,?,?)').bind(newId('sl'), u.id, 'invoice', inv.id, channel, to, inv.net, nowIso())]
    if (inv.status === 'draft') {
      const next = invoiceStatus('sent', inv.net, inv.paid_amount || 0, inv.due_date, today)
      stmts.push(db.prepare('UPDATE jobs_invoices SET status = ?, updated_at = ? WHERE id = ?').bind(next, nowIso(), inv.id))
    }
    await db.batch(stmts)
    return c.json({ ok: true, channel, via, link, text, invoice: invoiceOut(await loadInvoice(db, u.id, inv.id), today) })
  })
  // S-14 독촉 문안 · 발송
  api.get('/invoices/:id/dunning', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    await refreshInvoiceStatuses(db, [inv], today)
    const link = shareUrl(c, inv.share_token)
    const level = dunningLevel(inv.due_date, today)
    return c.json({ level, daysOverdue: Math.max(0, daysBetween(inv.due_date, today)), remaining: Math.max(0, inv.net - (inv.paid_amount || 0)), polite: dunningText(inv, 'polite', link, today), firm: dunningText(inv, 'firm', link, today) })
  })
  api.post('/invoices/:id/dunning', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const level = body.level === 'firm' ? 'firm' : 'polite'
    const channel = ['sms', 'kakao', 'email', 'link'].includes(body.channel) ? body.channel : 'link'
    const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 1000) : dunningText(inv, level, shareUrl(c, inv.share_token), today)
    let to = '', via: string = channel
    if (channel === 'email') {
      to = str(body.to, 120).toLowerCase()
      if (!isEmail(to)) return c.json({ error: '받는 메일 주소를 입력해 주세요' }, 400)
      const r = await deps.sendEmail(c.env, { to, subject: `[JOBS] 입금 요청 — ${inv.site_name} ${period(inv.period_start, inv.period_end)}`, html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;white-space:pre-wrap;line-height:1.6">${text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!))}</div>` })
      if (!r.ok) return c.json({ error: '메일을 보내지 못했습니다', detail: r.error }, 503)
    } else if (channel !== 'link') {
      to = normPhone(body.to || (await loadSite(db, u.id, inv.site_id))?.contact_phone)
      if (!isPhone(to) && !/^0\d{8,10}$/.test(to)) return c.json({ error: '받는 사람 번호를 입력해 주세요' }, 400)
      const tpl = channel === 'kakao' ? c.env.JOBS_KAKAO_TPL_DUNNING : ''
      via = tpl ? 'kakao' : 'sms'
      const r = tpl
        ? await deps.sendSms(c.env, { to, text, type: 'ATA', templateId: tpl, variables: { '#{업체}': inv.site_company || inv.site_name, '#{현장}': inv.site_name, '#{기간}': period(inv.period_start, inv.period_end), '#{잔액}': fmt(Math.max(0, inv.net - (inv.paid_amount || 0))), '#{예정일}': inv.due_date, '#{경과일}': String(Math.max(0, daysBetween(inv.due_date, today))), '#{링크}': shareUrl(c, inv.share_token) } })
        : await deps.sendSms(c.env, { to, text, type: 'LMS', subject: '입금 요청' })
      if (!r.ok) return c.json({ error: '문자를 보내지 못했습니다', detail: r.error }, 503)
    }
    await db.prepare('INSERT INTO jobs_sendlogs (id, user_id, doc_type, doc_id, channel, to_addr, amount, dunning_level, sent_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(newId('sl'), u.id, 'dunning', inv.id, channel, to, Math.max(0, inv.net - (inv.paid_amount || 0)), level, nowIso()).run()
    return c.json({ ok: true, via, text })
  })
  // S-13 입금 확인 · 일부 입금 (source manual)
  api.post('/invoices/:id/payments', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, today = todayKst()
    const inv = await loadInvoice(db, u.id, c.req.param('id'))
    if (!inv) return c.json({ error: '청구서를 찾을 수 없습니다' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const amount = int(body.amount, 0)
    if (amount <= 0) return c.json({ error: '입금액을 입력해 주세요' }, 400)
    const remaining = Math.max(0, inv.net - (inv.paid_amount || 0))
    if (amount > remaining + 1_000_000) return c.json({ error: `남은 금액(${fmt(remaining)}원)보다 너무 큽니다. 금액을 확인해 주세요` }, 400)
    const paidAt = isYmd(body.paidAt) ? body.paidAt : today
    const method = ['transfer', 'cash', 'check'].includes(body.method) ? body.method : 'transfer'
    const paidAmount = (inv.paid_amount || 0) + amount
    const base: InvoiceStatus = inv.status === 'draft' ? 'sent' : inv.status
    const next = invoiceStatus(base, inv.net, paidAmount, inv.due_date, today)
    await db.batch([
      db.prepare('INSERT INTO jobs_payments (id, user_id, invoice_id, site_id, amount, payer_name, paid_at, method, source, matched_by, memo) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(newId('pay'), u.id, inv.id, inv.site_id, amount, str(body.payerName, 40), paidAt, method, 'manual', 'manual', str(body.memo, 200)),
      db.prepare('UPDATE jobs_invoices SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?').bind(paidAmount, next, nowIso(), inv.id),
    ])
    return c.json({ ok: true, invoice: invoiceOut(await loadInvoice(db, u.id, inv.id), today), remaining: Math.max(0, inv.net - paidAmount) })
  })
  api.get('/payments', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const month = /^\d{4}-\d{2}$/.test(c.req.query('month') || '') ? c.req.query('month') : ''
    const res = await db.prepare(`SELECT p.*, s.name AS site_name FROM jobs_payments p LEFT JOIN jobs_sites s ON s.id = p.site_id WHERE p.user_id = ? ${month ? 'AND substr(p.paid_at,1,7) = ?' : ''} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT 200`).bind(u.id, ...(month ? [month] : [])).all<any>()
    return c.json((res.results || []).map(paymentOut))
  })
  api.get('/sendlogs', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const res = await db.prepare('SELECT l.*, i.site_id, s.name AS site_name FROM jobs_sendlogs l LEFT JOIN jobs_invoices i ON i.id = l.doc_id LEFT JOIN jobs_sites s ON s.id = i.site_id WHERE l.user_id = ? ORDER BY l.sent_at DESC LIMIT 200').bind(u.id).all<any>()
    return c.json((res.results || []).map((r: any) => ({ ...sendlogOut(r), siteName: r.site_name || '' })))
  })

  // ============================================================= QUOTES (S-09 · S-16) ====
  function quoteOut(q: any) {
    const items = safeJson<QuoteItem[]>(q.items, [])
    const calc = calcQuote(items, q.vat_mode as VatMode)
    return {
      id: q.id, siteId: q.site_id || '', siteName: q.site_name || '', clientName: q.client_name || '', contactPhone: q.contact_phone || '',
      periodStart: q.period_start || '', periodEnd: q.period_end || '', items: items.map(it => ({ ...it, amount: quoteItemAmount(it) })),
      ...calc, status: q.status, shareToken: q.share_token || '', createdAt: q.created_at, updatedAt: q.updated_at,
    }
  }
  async function loadQuote(db: D1Database, userId: string, id: string) {
    return db.prepare('SELECT q.*, s.name AS site_name FROM jobs_quotes q LEFT JOIN jobs_sites s ON s.id = q.site_id WHERE q.id = ? AND q.user_id = ?').bind(id, userId).first<any>()
  }
  function quoteFromBody(body: any, prev?: any) {
    const src: any[] = Array.isArray(body.items) ? body.items : (prev ? safeJson<any[]>(prev.items, []) : [])
    if (src.length > 50) return { error: '품목은 50개까지 넣을 수 있습니다' }
    const items: QuoteItem[] = []
    for (const it of src) {
      const qty = Number(it?.qty) || 0, unitPrice = int(it?.unitPrice, 0), name = str(it?.name, 60)
      if (!name && !unitPrice) continue
      if (qty < 0 || unitPrice < 0) return { error: '수량 · 단가는 0 이상이어야 합니다' }
      items.push({ kind: isQuoteItemKind(it?.kind) ? it.kind : 'labor', name, qty, unit: str(it?.unit, 10) || '식', unitPrice })
    }
    const vatMode = body.vatMode !== undefined ? body.vatMode : prev?.vat_mode || 'exclusive'
    if (!isVatMode(vatMode)) return { error: '부가세 방식이 올바르지 않습니다' }
    const periodStart = body.periodStart !== undefined ? str(body.periodStart, 10) : prev?.period_start || ''
    const periodEnd = body.periodEnd !== undefined ? str(body.periodEnd, 10) : prev?.period_end || ''
    if ((periodStart && !isYmd(periodStart)) || (periodEnd && !isYmd(periodEnd)) || (periodStart && periodEnd && periodStart > periodEnd)) return { error: '공사 기간이 올바르지 않습니다' }
    return { value: {
      siteId: str(body.siteId !== undefined ? body.siteId : prev?.site_id, 40), clientName: str(body.clientName !== undefined ? body.clientName : prev?.client_name, 60),
      contactPhone: str(body.contactPhone !== undefined ? body.contactPhone : prev?.contact_phone, 20), periodStart, periodEnd, items, vatMode: vatMode as VatMode, total: calcQuote(items, vatMode).total,
    } }
  }
  api.get('/quotes', async (c) => {
    const u = c.get('jobsUser')
    const res = await c.env.DB.prepare('SELECT q.*, s.name AS site_name FROM jobs_quotes q LEFT JOIN jobs_sites s ON s.id = q.site_id WHERE q.user_id = ? ORDER BY q.updated_at DESC LIMIT 200').bind(u.id).all<any>()
    return c.json((res.results || []).map(quoteOut))
  })
  api.post('/quotes', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB, body = await c.req.json<any>().catch(() => ({}))
    const r = quoteFromBody(body)
    if ('error' in r) return c.json({ error: r.error }, 400)
    const v = r.value
    if (v.siteId && !(await loadSite(db, u.id, v.siteId))) return c.json({ error: '현장을 찾을 수 없습니다' }, 400)
    const id = newId('qt'), now = nowIso()
    await db.prepare(`INSERT INTO jobs_quotes (id, user_id, site_id, client_name, contact_phone, period_start, period_end, items, vat_mode, total, status, share_token, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)`)
      .bind(id, u.id, v.siteId, v.clientName, v.contactPhone, v.periodStart, v.periodEnd, JSON.stringify(v.items), v.vatMode, v.total, randomHex(12), now, now).run()
    return c.json(quoteOut(await loadQuote(db, u.id, id)), 201)
  })
  api.get('/quotes/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const q = await loadQuote(db, u.id, c.req.param('id'))
    if (!q) return c.json({ error: '견적서를 찾을 수 없습니다' }, 404)
    const [sends, inv] = await Promise.all([
      db.prepare('SELECT * FROM jobs_sendlogs WHERE doc_id = ? ORDER BY sent_at DESC').bind(q.id).all<any>(),
      db.prepare('SELECT id, status, net FROM jobs_invoices WHERE quote_id = ? AND user_id = ?').bind(q.id, u.id).first<any>(),
    ])
    return c.json({ ...quoteOut(q), shareUrl: shareUrl(c, q.share_token, 'q'), sendLogs: (sends.results || []).map(sendlogOut), invoice: inv ? { id: inv.id, status: inv.status, net: inv.net } : null })
  })
  api.put('/quotes/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const prev = await loadQuote(db, u.id, c.req.param('id'))
    if (!prev) return c.json({ error: '견적서를 찾을 수 없습니다' }, 404)
    if (prev.status === 'converted') return c.json({ error: '청구서로 전환된 견적서는 수정할 수 없습니다' }, 409)
    const body = await c.req.json<any>().catch(() => ({}))
    const r = quoteFromBody(body, prev)
    if ('error' in r) return c.json({ error: r.error }, 400)
    const v = r.value
    if (v.siteId && !(await loadSite(db, u.id, v.siteId))) return c.json({ error: '현장을 찾을 수 없습니다' }, 400)
    await db.prepare('UPDATE jobs_quotes SET site_id=?, client_name=?, contact_phone=?, period_start=?, period_end=?, items=?, vat_mode=?, total=?, updated_at=? WHERE id = ? AND user_id = ?')
      .bind(v.siteId, v.clientName, v.contactPhone, v.periodStart, v.periodEnd, JSON.stringify(v.items), v.vatMode, v.total, nowIso(), prev.id, u.id).run()
    return c.json(quoteOut(await loadQuote(db, u.id, prev.id)))
  })
  api.delete('/quotes/:id', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const prev = await loadQuote(db, u.id, c.req.param('id'))
    if (!prev) return c.json({ error: '견적서를 찾을 수 없습니다' }, 404)
    if (prev.status === 'converted') return c.json({ error: '청구서로 전환된 견적서는 삭제할 수 없습니다' }, 409)
    await db.prepare('DELETE FROM jobs_quotes WHERE id = ? AND user_id = ?').bind(prev.id, u.id).run()
    return c.json({ ok: true })
  })
  // S-10 보내기 — 견적서 (청구서와 같은 시트)
  api.post('/quotes/:id/send', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const q = await loadQuote(db, u.id, c.req.param('id'))
    if (!q) return c.json({ error: '견적서를 찾을 수 없습니다' }, 404)
    const body = await c.req.json<any>().catch(() => ({}))
    const channel = ['sms', 'kakao', 'email', 'link', 'pdf'].includes(body.channel) ? body.channel : 'link'
    const qo = quoteOut(q), link = shareUrl(c, q.share_token, 'q')
    const text = `[JOBS 견적서] ${qo.clientName || qo.siteName} 귀하\n${qo.siteName ? qo.siteName + ' · ' : ''}${qo.periodStart ? period(qo.periodStart, qo.periodEnd || qo.periodStart) : '기간 미정'}\n견적 합계 ${fmt(qo.total)}원 (${qo.vatLabel})\n견적서 보기: ${link}`
    let to = '', via: string = channel
    if (channel === 'sms' || channel === 'kakao') {
      to = normPhone(body.to || q.contact_phone)
      if (!isPhone(to) && !/^0\d{8,10}$/.test(to)) return c.json({ error: '받는 사람 번호를 입력해 주세요' }, 400)
      const tpl = channel === 'kakao' ? c.env.JOBS_KAKAO_TPL_QUOTE : ''
      via = tpl ? 'kakao' : 'sms'
      const r = tpl
        ? await deps.sendSms(c.env, { to, text, type: 'ATA', templateId: tpl, variables: { '#{업체}': qo.clientName || qo.siteName, '#{현장}': qo.siteName || qo.clientName, '#{기간}': qo.periodStart ? period(qo.periodStart, qo.periodEnd || qo.periodStart) : '기간 미정', '#{합계}': fmt(qo.total), '#{부가세}': qo.vatLabel, '#{링크}': link } })
        : await deps.sendSms(c.env, { to, text, type: 'LMS', subject: `${qo.siteName || '견적서'}` })
      if (!r.ok) return c.json({ error: '문자를 보내지 못했습니다', detail: r.error }, 503)
    } else if (channel === 'email') {
      to = str(body.to, 120).toLowerCase()
      if (!isEmail(to)) return c.json({ error: '받는 메일 주소를 입력해 주세요' }, 400)
      const r = await deps.sendEmail(c.env, { to, subject: `[JOBS 견적서] ${qo.siteName || qo.clientName} · 합계 ${fmt(qo.total)}원 (${qo.vatLabel})`,
        html: emailHtml(`견적서 — ${qo.siteName || qo.clientName}`, [['받는 곳', qo.clientName || '-'], ['공사 기간', qo.periodStart ? period(qo.periodStart, qo.periodEnd || qo.periodStart) : '-'], ['인력', fmt(qo.labor) + '원'], ['자재 · 경비', fmt(qo.material) + '원'], [`견적 합계 (${qo.vatLabel})`, fmt(qo.total) + '원']], link, '견적서 열기 · PDF 저장') })
      if (!r.ok) return c.json({ error: '메일을 보내지 못했습니다', detail: r.error }, 503)
    }
    const stmts = [db.prepare('INSERT INTO jobs_sendlogs (id, user_id, doc_type, doc_id, channel, to_addr, amount, sent_at) VALUES (?,?,?,?,?,?,?,?)').bind(newId('sl'), u.id, 'quote', q.id, channel, to, qo.total, nowIso())]
    if (q.status === 'draft') stmts.push(db.prepare("UPDATE jobs_quotes SET status = 'sent', updated_at = ? WHERE id = ?").bind(nowIso(), q.id))
    await db.batch(stmts)
    return c.json({ ok: true, channel, via, link, text, quote: quoteOut(await loadQuote(db, u.id, q.id)) })
  })
  // S-16 견적 → 청구 전환 — 미리보기(견적 vs 실제) · 전환
  async function convertPreview(c: any, q: any, body: any) {
    if (!q.site_id) return { error: '견적서에 현장을 연결해야 청구서로 바꿀 수 있습니다', status: 400 }
    const today = todayKst()
    const p = await previewInvoice(c, { siteId: q.site_id, periodStart: body.periodStart || q.period_start || today.slice(0, 7) + '-01', periodEnd: body.periodEnd || q.period_end || monthEnd(today), taxMode: body.taxMode })
    if ('error' in p) return p
    const qo = quoteOut(q)
    const actualLabor = p.calc.rows.filter(r => !r.excluded && (r.kind === 'labor' || r.kind === 'half' || r.kind === 'overtime')).reduce((s, r) => s + r.amount, 0)
    const actualMaterial = p.calc.rows.filter(r => !r.excluded && r.kind === 'expense').reduce((s, r) => s + r.amount, 0)
    return { p, qo, compare: { labor: { quote: qo.labor, actual: actualLabor, diff: actualLabor - qo.labor }, material: { quote: qo.material, actual: actualMaterial, diff: actualMaterial - qo.material } } }
  }
  api.post('/quotes/:id/convert/preview', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const q = await loadQuote(db, u.id, c.req.param('id'))
    if (!q) return c.json({ error: '견적서를 찾을 수 없습니다' }, 404)
    if (q.status === 'converted') return c.json({ error: '이미 청구서로 전환된 견적서입니다' }, 409)
    const body = await c.req.json<any>().catch(() => ({}))
    const r = await convertPreview(c, q, body)
    if ('error' in r) return c.json({ error: r.error }, r.status as any)
    const use = { labor: body.useQuoteLabor === true, material: body.useQuoteMaterial === true }
    const rows = applyQuoteToRows(r.p.calc.rows, r.qo, use)
    const tx = retaxInvoice(rows, r.p.taxMode, r.p.calc.dayPays)
    return c.json({ quote: r.qo, site: siteOut(r.p.site), periodStart: r.p.periodStart, periodEnd: r.p.periodEnd, dueDate: r.p.dueDate, taxMode: r.p.taxMode, logCount: r.p.logs.length, compare: r.compare, use, rows, gross: tx.gross, tax: tx.tax, net: tx.net, breakdown: tx.breakdown })
  })
  api.post('/quotes/:id/convert', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const q = await loadQuote(db, u.id, c.req.param('id'))
    if (!q) return c.json({ error: '견적서를 찾을 수 없습니다' }, 404)
    if (q.status === 'converted') return c.json({ error: '이미 청구서로 전환된 견적서입니다' }, 409)
    const body = await c.req.json<any>().catch(() => ({}))
    const r = await convertPreview(c, q, body)
    if ('error' in r) return c.json({ error: r.error }, r.status as any)
    const use = { labor: body.useQuoteLabor === true, material: body.useQuoteMaterial === true }
    const rows = applyQuoteToRows(r.p.calc.rows, r.qo, use)
    const tx = retaxInvoice(rows, r.p.taxMode, r.p.calc.dayPays)
    const id = newId('inv'), now = nowIso(), ids = r.p.logs.map((l: any) => l.id)
    await db.batch([
      db.prepare(`INSERT INTO jobs_invoices (id, user_id, site_id, period_start, period_end, rows, day_pays, gross, tax_mode, tax, net, due_date, status, paid_amount, attach_photos, edited_manually, memo, share_token, quote_id, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft',0,?,?,?,?,?,?,?)`).bind(id, u.id, r.p.site.id, r.p.periodStart, r.p.periodEnd, JSON.stringify(rows), JSON.stringify(r.p.calc.dayPays), tx.gross, r.p.taxMode, tx.tax, tx.net, r.p.dueDate, bool01(body.attachPhotos, 0), use.labor || use.material ? 1 : 0, str(body.memo, 300), randomHex(12), q.id, now, now),
      db.prepare(`UPDATE jobs_worklogs SET invoice_id = ? WHERE id IN (${placeholders(ids.length)})`).bind(id, ...ids),
      db.prepare("UPDATE jobs_quotes SET status = 'converted', updated_at = ? WHERE id = ?").bind(now, q.id),
    ])
    return c.json(invoiceOut(await loadInvoice(db, u.id, id), todayKst()), 201)
  })

  // ================================================== YEAR SUMMARY (S-15 연간 세액 정산서) ====
  api.get('/year-summary', async (c) => {
    const u = c.get('jobsUser'), db = c.env.DB
    const year = /^\d{4}$/.test(c.req.query('year') || '') ? c.req.query('year')! : todayKst().slice(0, 4)
    const [res, years] = await Promise.all([
      db.prepare('SELECT w.date, w.site_id, s.name AS site_name, COALESCE(w.tax_mode_override, s.tax_mode) AS tax_mode, w.attendance, w.gross, w.tax, w.net FROM jobs_worklogs w JOIN jobs_sites s ON s.id = w.site_id WHERE w.user_id = ? AND substr(w.date, 1, 4) = ?').bind(u.id, year).all<any>(),
      db.prepare('SELECT DISTINCT substr(date, 1, 4) AS y FROM jobs_worklogs WHERE user_id = ? ORDER BY y DESC').bind(u.id).all<any>(),
    ])
    const summary = summarizeYear((res.results || []).map((r: any) => ({ date: r.date, siteId: r.site_id, siteName: r.site_name, taxMode: r.tax_mode, attendance: r.attendance, gross: r.gross || 0, tax: r.tax || 0, net: r.net || 0 })), year)
    return c.json({ ...summary, user: { name: u.name || '', bizNo: u.biz_no || '', phone: u.phone }, years: (years.results || []).map((r: any) => r.y), generatedAt: todayKst() })
  })

  return api
}

/** 공개 조회 (로그인 없이 열리는 읽기 전용 청구서) 에서 쓰는 로더 */
export async function loadInvoiceByToken(db: D1Database, token: string) {
  if (!/^[0-9a-f]{24}$/.test(token)) return null
  await ensureJobsTables(db)
  const inv = await db.prepare('SELECT i.*, s.name AS site_name, s.company AS site_company, s.address AS site_address, s.contact_name AS site_contact, u.name AS user_name, u.phone AS user_phone, u.biz_no AS user_biz FROM jobs_invoices i JOIN jobs_sites s ON s.id = i.site_id JOIN jobs_users u ON u.id = i.user_id WHERE i.share_token = ?').bind(token).first<any>()
  if (!inv) return null
  const photos = inv.attach_photos ? await db.prepare('SELECT p.id, p.uri, p.taken_at, p.lat, p.lng FROM jobs_photos p JOIN jobs_worklogs w ON w.id = p.worklog_id WHERE w.invoice_id = ? AND p.attach_to_invoice = 1 ORDER BY p.taken_at LIMIT 12').bind(inv.id).all<any>() : { results: [] }
  for (const p of photos.results || []) p.uri = photoUrl(p)
  const logs = await db.prepare('SELECT date, attendance, overtime_hours FROM jobs_worklogs WHERE invoice_id = ? ORDER BY date').bind(inv.id).all<any>()
  return { inv, photos: photos.results || [], logs: logs.results || [] }
}

/** 공개 견적서 뷰(/jobs/q/:token) 로더 */
export async function loadQuoteByToken(db: D1Database, token: string) {
  if (!/^[0-9a-f]{24}$/.test(token)) return null
  await ensureJobsTables(db)
  const q = await db.prepare('SELECT q.*, s.name AS site_name, s.address AS site_address, u.name AS user_name, u.phone AS user_phone, u.biz_no AS user_biz FROM jobs_quotes q LEFT JOIN jobs_sites s ON s.id = q.site_id JOIN jobs_users u ON u.id = q.user_id WHERE q.share_token = ?').bind(token).first<any>()
  if (!q) return null
  const items = (() => { try { return JSON.parse(q.items || '[]') as QuoteItem[] } catch { return [] as QuoteItem[] } })()
  return { q, items, calc: calcQuote(items, q.vat_mode as VatMode) }
}

/** 사진 바이너리 — /jobs/photo/:id. R2 면 객체 스트림, D1 base64 면 디코드해서 응답 */
export async function servePhoto(env: JobsBindings, id: string): Promise<Response | null> {
  if (!/^ph_[0-9a-f]{20}$/.test(id)) return null
  await ensureJobsTables(env.DB)
  const p = await env.DB.prepare('SELECT uri FROM jobs_photos WHERE id = ?').bind(id).first<any>()
  if (!p) return null
  const headers: Record<string, string> = { 'Cache-Control': 'private, max-age=86400', 'X-Robots-Tag': 'noindex' }
  if (String(p.uri).startsWith('r2:')) {
    if (!env.JOBS_PHOTOS) return null
    const obj = await env.JOBS_PHOTOS.get(String(p.uri).slice(3))
    if (!obj) return null
    return new Response(obj.body, { headers: { ...headers, 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg' } })
  }
  const m = DATA_URI_RE.exec(String(p.uri))
  if (!m) return null
  return new Response(b64ToBytes(m[2]), { headers: { ...headers, 'Content-Type': m[1] } })
}
