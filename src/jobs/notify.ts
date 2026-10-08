// ============================================================================
// JOBS — 알림 (명세 05): 앱 알림함 + 웹 푸시 큐 + 정기 실행(크론)
//   · 알림은 jobs_notifications 에 먼저 쌓고(dedupe_key 로 한 번만), 푸시는 큐(push_state=0)로 나눠 보낸다.
//     → 크론 1회 CPU 시간을 작게 유지하고, 실패한 푸시는 알림함에 그대로 남는다.
//   · Cloudflare Pages Functions 는 Cron Trigger 가 없으므로 외부 크론(workers/jobs-cron)이
//     POST /api/jobs/cron/run 을 10분마다 호출한다.
// ============================================================================
import { ensureJobsTables } from './schema'
import { clockoutStage, daysBetween, addDays, fmt } from './calc'
import { sendWebPush, type VapidKeys } from './webpush'
import type { JobsBindings } from './api'

export interface PushOptions {
  urgency?: 'normal' | 'high'
  tag?: string
  ttl?: number
  log?: string
  actions?: { action: string; title: string }[]
}
export interface NoteInput {
  userId: string
  kind: string
  dedupe: string
  refId?: string
  title: string
  body?: string
  url?: string
  /** false 면 알림함에만 (조용한 시간 · 푸시 불필요) */
  push?: false | PushOptions
}

const nowIso = () => new Date().toISOString()
const rid = () => 'nt_' + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(16).padStart(2, '0')).join('')
const safeJson = (s: unknown): any => { try { return s ? JSON.parse(String(s)) : {} } catch { return {} } }
const hm = (v: unknown) => { const s = String(v ?? '').slice(0, 5); return /^\d{2}:\d{2}$/.test(s) ? s : '' }
const kdate = (s: string) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`

export function vapidFromEnv(env: JobsBindings): VapidKeys | null {
  if (!env.JOBS_VAPID_PUBLIC || !env.JOBS_VAPID_PRIVATE) return null
  return { publicKey: env.JOBS_VAPID_PUBLIC, privateKey: env.JOBS_VAPID_PRIVATE, subject: env.JOBS_VAPID_SUBJECT || 'https://www.frameplus.kr' }
}

/** INSERT OR IGNORE — 같은 dedupe_key 알림은 사용자당 한 번만. 새로 들어간 건수를 돌려준다 */
export async function createNotifications(db: D1Database, notes: NoteInput[], at = nowIso()): Promise<number> {
  if (!notes.length) return 0
  const stmts = notes.map(n => db.prepare('INSERT OR IGNORE INTO jobs_notifications (id, user_id, kind, ref_id, dedupe_key, title, body, url, push_payload, push_state, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(rid(), n.userId, n.kind, n.refId || '', n.dedupe, n.title.slice(0, 120), (n.body || '').slice(0, 300), n.url || '', n.push ? JSON.stringify(n.push) : '', n.push ? 0 : 2, at))
  let inserted = 0
  for (let i = 0; i < stmts.length; i += 50) {
    for (const r of await db.batch(stmts.slice(i, i + 50))) inserted += Number((r.meta as any)?.changes || 0)
  }
  return inserted
}

/** 대기 중인 푸시(push_state=0)를 limit 건까지 보낸다. 410/404 구독은 삭제 */
export async function flushPushQueue(env: JobsBindings, limit = 20, fetchImpl?: typeof fetch) {
  const db = env.DB
  const out = { sent: 0, failed: 0, skipped: 0, removedSubs: 0 }
  const rows = (await db.prepare('SELECT * FROM jobs_notifications WHERE push_state = 0 ORDER BY created_at LIMIT ?').bind(limit).all<any>()).results || []
  if (!rows.length) return out
  const vapid = vapidFromEnv(env)
  if (!vapid) { // 키 미설정 — 푸시는 건너뛰고 알림함에만 남긴다
    await db.batch(rows.map((r: any) => db.prepare('UPDATE jobs_notifications SET push_state = 2 WHERE id = ?').bind(r.id)))
    out.skipped = rows.length
    return out
  }
  const users = [...new Set(rows.map((r: any) => r.user_id as string))]
  const subs = (await db.prepare(`SELECT * FROM jobs_push_subs WHERE user_id IN (${users.map(() => '?').join(',')})`).bind(...users).all<any>()).results || []
  const byUser = new Map<string, any[]>()
  for (const s of subs) { const a = byUser.get(s.user_id) || []; a.push(s); byUser.set(s.user_id, a) }
  const gone = new Set<string>()
  const updates: D1PreparedStatement[] = []
  for (const n of rows) {
    const targets = (byUser.get(n.user_id) || []).filter((s: any) => !gone.has(s.id))
    if (!targets.length) { updates.push(db.prepare('UPDATE jobs_notifications SET push_state = 2 WHERE id = ?').bind(n.id)); out.skipped++; continue }
    const extra: PushOptions = safeJson(n.push_payload)
    const payload = { id: n.id, title: n.title, body: n.body, url: n.url || '/jobs/#/home', tag: extra.tag, log: extra.log, actions: extra.actions || [] }
    let anyOk = false
    for (const s of targets) {
      const r = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, vapid,
        { urgency: extra.urgency || 'normal', ttl: extra.ttl ?? 6 * 3600, topic: extra.tag, fetchImpl })
      if (r.ok) { anyOk = true; updates.push(db.prepare('UPDATE jobs_push_subs SET last_ok_at = ?, fail_count = 0 WHERE id = ?').bind(nowIso(), s.id)) }
      else if (r.gone) { gone.add(s.id); out.removedSubs++; updates.push(db.prepare('DELETE FROM jobs_push_subs WHERE id = ?').bind(s.id)) }
      else updates.push(db.prepare('UPDATE jobs_push_subs SET fail_count = fail_count + 1 WHERE id = ?').bind(s.id))
    }
    updates.push(db.prepare('UPDATE jobs_notifications SET push_state = ? WHERE id = ?').bind(anyOk ? 1 : 3, n.id))
    if (anyOk) out.sent++; else out.failed++
  }
  for (let i = 0; i < updates.length; i += 50) await db.batch(updates.slice(i, i + 50))
  return out
}

/**
 * 정기 실행 — 10분 간격 가정. 모든 단계는 멱등(dedupe_key)이라 몇 번을 돌려도 같은 알림이 두 번 가지 않는다.
 *  1) 퇴근 알람: 오늘 출근 시각이 있고 퇴근이 빈 기록 → 퇴근 알람 시각부터 30분 간격 3회, +90분에 자동 퇴근 기록
 *     (자정을 넘긴 기록은 알람 설정과 무관하게 퇴근 알람 시각으로 자동 기록 + «확인해 주세요»)
 *  2) 08~21시: 입금 예정일 D-3 · 예정일 초과(1일) · 10일 초과
 *  3) 평일 19~21시: 최근 14일 안에 기록이 있는데 오늘 기록이 없으면 1회
 *  4) 08~21시: 확인 필요 입금 3일 경과 재알림, 30일 경과 자동 제외
 *  5) 푸시 큐 전송
 */
export async function runJobsCron(env: JobsBindings, now = new Date(), opts: { pushLimit?: number; fetchImpl?: typeof fetch } = {}) {
  const db = env.DB
  await ensureJobsTables(db)
  const kst = new Date(now.getTime() + 9 * 3600e3)
  const today = kst.toISOString().slice(0, 10), nowHm = kst.toISOString().slice(11, 16)
  const hour = kst.getUTCHours(), dow = kst.getUTCDay()
  const quiet = hour < 7 || hour >= 21
  const daytime = hour >= 8 && hour < 21
  const at = now.toISOString()
  const notes: NoteInput[] = []
  const fixes: D1PreparedStatement[] = []
  const stats = { clockout: 0, autoCheckout: 0, dueSoon: 0, overdue: 0, noRecord: 0, reviewRemind: 0, reviewExcluded: 0, newNotifications: 0, push: { sent: 0, failed: 0, skipped: 0, removedSubs: 0 } }

  // ---- 1) 퇴근 알람 · 자동 퇴근 ----
  const open = (await db.prepare(`SELECT w.id, w.user_id, w.date, w.check_in_at, s.name AS site_name, s.clock_out_time AS site_co, s.alarm_clock_out, u.clock_out_time AS user_co, u.notif_prefs
      FROM jobs_worklogs w JOIN jobs_sites s ON s.id = w.site_id JOIN jobs_users u ON u.id = w.user_id
      WHERE w.date BETWEEN ? AND ? AND COALESCE(w.check_in_at, '') != '' AND COALESCE(w.check_out_at, '') = '' AND u.status = 'active'`)
    .bind(addDays(today, -7), today).all<any>()).results || []
  for (const w of open) {
    const prefs = safeJson(w.notif_prefs)
    const co = hm(w.site_co) || hm(w.user_co) || '18:00'
    const checkIn = hm(w.check_in_at)
    const alarmsOn = !!w.alarm_clock_out && prefs.clockOut !== false
    const pastDay = w.date < today
    const stage = pastDay ? 4 : clockoutStage(co, nowHm, checkIn)
    if (stage === 0) continue
    if (stage === 4) {
      if (!pastDay && !alarmsOn) continue          // 알람을 끈 사람은 자정 정리 때만
      if (checkIn && checkIn >= co) continue        // 퇴근 알람 이후 출근(야간)은 자동 기록하지 않음
      fixes.push(db.prepare("UPDATE jobs_worklogs SET check_out_at = ?, checkout_auto = 1, updated_at = ? WHERE id = ? AND COALESCE(check_out_at, '') = ''").bind(co, at, w.id))
      notes.push({ userId: w.user_id, kind: 'checkout_auto', dedupe: `checkout_auto:${w.id}`, refId: w.id,
        title: `퇴근 시간을 ${co}으로 넣었어요`, body: `${w.site_name} · ${kdate(w.date)} — 응답이 없어 퇴근 알람 시각으로 기록했습니다. 맞는지 확인해 주세요.`,
        url: `/jobs/#/log/${w.id}`, push: quiet ? false : { tag: `clockout-${w.id}` } })
      stats.autoCheckout++
      continue
    }
    if (!alarmsOn) continue
    notes.push({ userId: w.user_id, kind: 'clockout', dedupe: `clockout:${w.id}:${stage}`, refId: w.id,
      title: '퇴근하셨어요?', body: `${w.site_name} · 출근 ${checkIn} · 퇴근 알람 ${co}${stage > 1 ? ` · ${stage}번째 알림` : ''}`,
      url: '/jobs/#/home', push: { urgency: 'high', tag: `clockout-${w.id}`, ttl: 1800, log: w.id, actions: [{ action: 'checkout', title: '퇴근 기록' }, { action: 'edit', title: '시간 수정' }] } })
    stats.clockout++
  }

  // 예정일 지난 청구서 상태 정리 (조회 때도 하지만 알림 전에 한 번 더)
  fixes.push(db.prepare("UPDATE jobs_invoices SET status = 'overdue', updated_at = ? WHERE status IN ('sent','partial') AND COALESCE(due_date, '') != '' AND due_date < ? AND net > paid_amount").bind(at, today))

  if (daytime) {
    // ---- 2) 입금 예정일 D-3 · 초과 ----
    const inv = (await db.prepare(`SELECT i.id, i.user_id, i.due_date, i.net, i.paid_amount, i.period_start, s.name AS site_name, s.alarm_due, u.notif_prefs
        FROM jobs_invoices i JOIN jobs_sites s ON s.id = i.site_id JOIN jobs_users u ON u.id = i.user_id
        WHERE i.status IN ('sent','partial','overdue') AND i.net > i.paid_amount AND COALESCE(i.due_date, '') != '' AND i.due_date <= ? AND u.status = 'active'`)
      .bind(addDays(today, 3)).all<any>()).results || []
    for (const i of inv) {
      if (!i.alarm_due || safeJson(i.notif_prefs).due === false) continue
      const d = daysBetween(today, i.due_date), remaining = i.net - i.paid_amount
      const label = `${i.site_name} ${+String(i.period_start).slice(5, 7)}월 청구서`
      if (d === 3) {
        notes.push({ userId: i.user_id, kind: 'due_soon', dedupe: `due3:${i.id}:${i.due_date}`, refId: i.id, title: `${i.site_name} 3일 뒤 입금 예정`,
          body: `${label} · 입금 예정일 ${kdate(i.due_date)} · 받을 금액 ${fmt(remaining)}원`, url: `/jobs/#/invoice/${i.id}`, push: {} })
        stats.dueSoon++
      } else if (d < 0 && d > -10) {
        notes.push({ userId: i.user_id, kind: 'overdue', dedupe: `overdue:${i.id}:${i.due_date}`, refId: i.id, title: `${i.site_name} 입금 예정일이 지났어요`,
          body: `${label} · 남은 금액 ${fmt(remaining)}원 · 독촉 문안을 만들어 두었어요`, url: `/jobs/#/invoice/${i.id}/dunning`, push: {} })
        stats.overdue++
      } else if (d <= -10) {
        notes.push({ userId: i.user_id, kind: 'overdue', dedupe: `overdue10:${i.id}:${i.due_date}`, refId: i.id, title: `${i.site_name} ${-d}일째 미입금`,
          body: `${label} · 남은 금액 ${fmt(remaining)}원 · 단호한 독촉 문안을 준비했어요`, url: `/jobs/#/invoice/${i.id}/dunning`, push: {} })
        stats.overdue++
      }
    }

    // ---- 4) 확인 필요 입금 — 3일 뒤 재알림 · 30일 지나면 자동 제외 ----
    fixes.push(db.prepare("UPDATE jobs_payments SET excluded = 1, needs_review = 0, memo = CASE WHEN COALESCE(memo, '') = '' THEN '30일 지나 자동 제외' ELSE memo END WHERE needs_review = 1 AND excluded = 0 AND paid_at <= ?").bind(addDays(today, -30)))
    const rev = (await db.prepare(`SELECT p.id, p.user_id, p.amount, p.payer_name, p.paid_at FROM jobs_payments p JOIN jobs_users u ON u.id = p.user_id
        WHERE p.needs_review = 1 AND p.excluded = 0 AND p.paid_at <= ? AND p.paid_at > ? AND u.status = 'active'`).bind(addDays(today, -3), addDays(today, -30)).all<any>()).results || []
    for (const p of rev) {
      notes.push({ userId: p.user_id, kind: 'payment_review', dedupe: `review3:${p.id}`, refId: p.id, title: `입금 ${fmt(p.amount)}원, 현장을 지정해 주세요`,
        body: `${p.payer_name || '입금자 미상'} · ${kdate(p.paid_at)} — 지정하지 않으면 30일 뒤 «제외»로 정리됩니다`, url: `/jobs/#/payment/${p.id}`, push: {} })
      stats.reviewRemind++
    }
  }

  // ---- 3) 평일 저녁 출근 미기록 ----
  if (dow >= 1 && dow <= 5 && hour >= 19 && hour < 21) {
    const users = (await db.prepare(`SELECT u.id, u.notif_prefs FROM jobs_users u WHERE u.status = 'active'
        AND EXISTS (SELECT 1 FROM jobs_sites s WHERE s.user_id = u.id AND s.archived = 0)
        AND EXISTS (SELECT 1 FROM jobs_worklogs w WHERE w.user_id = u.id AND w.date >= ? AND w.date < ?)
        AND NOT EXISTS (SELECT 1 FROM jobs_worklogs w WHERE w.user_id = u.id AND w.date = ?)`).bind(addDays(today, -14), today, today).all<any>()).results || []
    for (const u of users) {
      if (safeJson(u.notif_prefs).noRecord === false) continue
      notes.push({ userId: u.id, kind: 'no_record', dedupe: `norecord:${today}`, title: '오늘 출근 기록이 없습니다', body: '일하셨다면 지금 남겨 두세요 — 10초면 됩니다', url: '/jobs/#/home', push: {} })
      stats.noRecord++
    }
  }

  for (let i = 0; i < fixes.length; i += 50) await db.batch(fixes.slice(i, i + 50))
  stats.newNotifications = await createNotifications(db, notes, at)
  stats.push = await flushPushQueue(env, opts.pushLimit ?? (Number(env.JOBS_PUSH_BATCH) || 20), opts.fetchImpl)
  // 60일 지난 알림 정리
  await db.prepare('DELETE FROM jobs_notifications WHERE created_at < ?').bind(new Date(now.getTime() - 60 * 86400e3).toISOString()).run()
  return stats
}
