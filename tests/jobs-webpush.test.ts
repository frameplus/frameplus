// 웹 푸시 암호화 · VAPID 검증 — RFC 8291 부록 A 공식 테스트 벡터 + 사용자 에이전트 쪽 복호화 왕복
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encryptWebPush, importEcdhKeys, vapidAuthorization, isAllowedPushEndpoint, sendWebPush, b64urlEncode, b64urlDecode } from '../src/jobs/webpush.ts'

const te = new TextEncoder()
const td = new TextDecoder()

test('RFC 8291 부록 A 테스트 벡터 — 본문이 바이트 단위로 일치', async () => {
  const asKeys = await importEcdhKeys(
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw')
  const body = await encryptWebPush(te.encode('When I grow up, I want to be a watermelon'),
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), asKeys })
  assert.equal(b64urlEncode(body),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN')
})

// 사용자 에이전트(브라우저) 쪽 복호화 — 서버 구현과 독립적으로 RFC 대로 작성
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } ; return o }
async function uaDecrypt(body: Uint8Array, uaPriv: CryptoKey, uaPubRaw: Uint8Array, auth: Uint8Array) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen)
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256))
  const ikm = (await hmac(await hmac(auth, ecdh), cat(te.encode('WebPush: info\0'), uaPubRaw, asPub, new Uint8Array([1])))).slice(0, 32)
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct))
  let end = pt.length - 1
  while (end >= 0 && pt[end] === 0) end--
  assert.equal(pt[end], 2, '마지막 레코드 구분자 0x02')
  return { text: td.decode(pt.slice(0, end)), rs: new DataView(body.buffer, body.byteOffset).getUint32(16) }
}

test('암호화 → 브라우저 쪽 복호화 왕복 (한글 JSON 페이로드)', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey) as ArrayBuffer)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const payload = JSON.stringify({ title: '퇴근하셨어요?', body: '문정동 현장 · 출근 07:30', url: '/jobs/#/home', log: 'wl_abc' })
  const body = await encryptWebPush(te.encode(payload), b64urlEncode(uaPub), b64urlEncode(auth))
  const out = await uaDecrypt(body, ua.privateKey, uaPub, auth)
  assert.equal(out.text, payload)
  assert.equal(out.rs, 4096)
  // 같은 입력도 매번 다른 암호문 (무작위 salt · 임시 키)
  const body2 = await encryptWebPush(te.encode(payload), b64urlEncode(uaPub), b64urlEncode(auth))
  assert.notEqual(b64urlEncode(body), b64urlEncode(body2))
})

test('잘못된 구독 키는 거부', async () => {
  await assert.rejects(() => encryptWebPush(te.encode('x'), 'AAAA', b64urlEncode(new Uint8Array(16))), /p256dh/)
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const uaPub = b64urlEncode(await crypto.subtle.exportKey('raw', ua.publicKey) as ArrayBuffer)
  await assert.rejects(() => encryptWebPush(te.encode('x'), uaPub, b64urlEncode(new Uint8Array(8))), /auth/)
})

test('VAPID JWT — ES256 서명 검증 · aud=푸시 서비스 origin · exp ≤ 24h', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer)
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey
  const vapid = { publicKey: b64urlEncode(pubRaw), privateKey: jwk.d!, subject: 'https://www.frameplus.kr' }
  const now = 1_790_000_000
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc123', vapid, 48 * 3600, now)
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
  assert.ok(m, header)
  assert.equal(m[4], vapid.publicKey)
  const claims = JSON.parse(td.decode(b64urlDecode(m[2])))
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now + 24 * 3600, sub: 'https://www.frameplus.kr' })
  assert.deepEqual(JSON.parse(td.decode(b64urlDecode(m[1]))), { typ: 'JWT', alg: 'ES256' })
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64urlDecode(m[3]), te.encode(`${m[1]}.${m[2]}`))
  assert.equal(ok, true)
})

test('푸시 서비스 주소 허용 목록 (SSRF 방지)', () => {
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x'), true)
  assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/QG1'), true)
  assert.equal(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true)
  assert.equal(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'), true)
  assert.equal(isAllowedPushEndpoint('https://evil.example.com/fcm.googleapis.com'), false)
  assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x'), false)
  assert.equal(isAllowedPushEndpoint('http://fcm.googleapis.com/x'), false)
  assert.equal(isAllowedPushEndpoint('http://127.0.0.1:4000/push'), false)
  assert.equal(isAllowedPushEndpoint('http://127.0.0.1:4000/push', true), true)
  assert.equal(isAllowedPushEndpoint('not a url'), false)
})

test('sendWebPush — 헤더 구성 · 410 은 gone 으로 보고', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey) as ArrayBuffer)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const vapid = { publicKey: b64urlEncode(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer), privateKey: (await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey).d!, subject: 'https://www.frameplus.kr' }
  let seen: any = null
  const fakeFetch = (async (url: string, init: any) => { seen = { url, init }; return new Response(null, { status: 201 }) }) as unknown as typeof fetch
  const r = await sendWebPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64urlEncode(uaPub), auth: b64urlEncode(auth) }, { title: '테스트' }, vapid, { urgency: 'high', ttl: 600, topic: 'clockout-wl1', fetchImpl: fakeFetch })
  assert.deepEqual(r, { ok: true, status: 201, gone: false })
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm')
  assert.equal(seen.init.headers.TTL, '600')
  assert.equal(seen.init.headers.Urgency, 'high')
  assert.equal(seen.init.headers.Topic, 'clockout-wl1')
  assert.match(seen.init.headers.Authorization, /^vapid t=.+, k=/)
  const dec = await uaDecrypt(seen.init.body, ua.privateKey, uaPub, auth)
  assert.equal(JSON.parse(dec.text).title, '테스트')
  const gone = await sendWebPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64urlEncode(uaPub), auth: b64urlEncode(auth) }, 'x', vapid, { fetchImpl: (async () => new Response(null, { status: 410 })) as unknown as typeof fetch })
  assert.deepEqual(gone, { ok: false, status: 410, gone: true })
})
