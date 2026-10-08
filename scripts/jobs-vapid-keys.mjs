// JOBS 웹 푸시 VAPID 키 + 크론 비밀값 생성 — `node scripts/jobs-vapid-keys.mjs`
// 출력값을 Cloudflare Pages → Settings → Variables and Secrets 에 넣는다. PRIVATE · CRON_SECRET 은 반드시 «Secret» 유형으로.
// 키를 바꾸면 기존 기기 구독이 무효가 되어 사용자가 설정에서 «알림 켜기»를 다시 눌러야 한다.
const { subtle } = globalThis.crypto
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = Buffer.from(await subtle.exportKey('raw', kp.publicKey)).toString('base64url')
const { d } = await subtle.exportKey('jwk', kp.privateKey)
const cron = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(24))).toString('base64url')
console.log(`JOBS_VAPID_PUBLIC=${pub}`)
console.log(`JOBS_VAPID_PRIVATE=${d}`)
console.log('JOBS_VAPID_SUBJECT=https://www.frameplus.kr')
console.log(`JOBS_CRON_SECRET=${cron}`)
console.log('# workers/jobs-cron 에도 같은 값: npx wrangler secret put CRON_SECRET')
