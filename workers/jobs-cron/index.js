// JOBS 알림 크론 — 10분마다 Pages 의 /api/jobs/cron/run 을 호출한다. 비밀값은 `wrangler secret put CRON_SECRET`
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env))
  },
  // 상태 확인용 (비밀값 · 결과 노출 없음)
  async fetch() {
    return new Response('jobs-cron ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  },
}

async function run(env) {
  if (!env.CRON_SECRET || !env.TARGET_URL) { console.log('jobs-cron: CRON_SECRET / TARGET_URL 미설정'); return }
  const res = await fetch(env.TARGET_URL, { method: 'POST', headers: { 'X-Jobs-Cron': env.CRON_SECRET } })
  console.log('jobs-cron', res.status, (await res.text()).slice(0, 500))
}
