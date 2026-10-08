// ============================================================================
// JOBS — Web Push 발송 (RFC 8030) · 메시지 암호화 aes128gcm (RFC 8291 / RFC 8188) · VAPID (RFC 8292)
// Web Crypto 만 사용 — Cloudflare Workers 와 Node 22 에서 같은 코드가 돈다. 외부 의존성 없음.
// ============================================================================

const te = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function b64urlDecode(str: string): Uint8Array {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

// ---- HKDF (RFC 5869) — 출력 32바이트 이하만 쓰므로 Expand 는 1블록 ----
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}
const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array) => hmac(salt, ikm)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len)
}

export interface EcdhKeys { privateKey: CryptoKey; publicRaw: Uint8Array }
async function generateEcdh(): Promise<EcdhKeys> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  return { privateKey: kp.privateKey, publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer) }
}
/** 테스트 벡터 재현용 — 원시 개인키(d) + 비압축 공개키로 ECDH 키를 만든다 */
export async function importEcdhKeys(publicB64: string, privateB64: string): Promise<EcdhKeys> {
  const pub = b64urlDecode(publicB64)
  const privateKey = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: privateB64, ext: true },
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  return { privateKey, publicRaw: pub }
}

/**
 * RFC 8291 메시지 암호화. 반환값이 곧 HTTP 본문(헤더 salt|rs|idlen|keyid + 암호문 1레코드).
 * opts.salt / opts.asKeys 는 테스트 벡터 재현용 — 운영에서는 매번 무작위.
 */
export async function encryptWebPush(payload: Uint8Array, uaPublicB64: string, authB64: string,
  opts: { salt?: Uint8Array; asKeys?: EcdhKeys; rs?: number } = {}): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(uaPublicB64)
  const authSecret = b64urlDecode(authB64)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid p256dh key')
  if (authSecret.length !== 16) throw new Error('invalid auth secret')
  if (payload.length > 3800) throw new Error('payload too large')
  const as = opts.asKeys || await generateEcdh()
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))
  // PRK_key = HKDF-Extract(auth_secret, ecdh_secret); IKM = HKDF-Expand(PRK_key, "WebPush: info" 0x00 ua_public as_public, 32)
  const ikm = await hkdfExpand(await hkdfExtract(authSecret, ecdhSecret), concat(te.encode('WebPush: info\0'), uaPublic, as.publicRaw), 32)
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16))
  const prk = await hkdfExtract(salt, ikm)
  const cek = await hkdfExpand(prk, te.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfExpand(prk, te.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 단일(=마지막) 레코드: 평문 || 0x02 (RFC 8188 패딩 구분자)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))
  const header = new Uint8Array(16 + 4 + 1 + as.publicRaw.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, opts.rs || 4096)
  header[20] = as.publicRaw.length
  header.set(as.publicRaw, 21)
  return concat(header, ct)
}

export interface VapidKeys { publicKey: string; privateKey: string; subject: string }

/** RFC 8292 — Authorization: vapid t=<JWT ES256>, k=<공개키> */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, expiresInSec = 12 * 3600, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin
  const enc = (o: object) => b64urlEncode(te.encode(JSON.stringify(o)))
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: nowSec + Math.min(expiresInSec, 24 * 3600), sub: vapid.subject })}`
  const pub = b64urlDecode(vapid.publicKey)
  if (pub.length !== 65) throw new Error('invalid VAPID public key')
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: vapid.privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // Web Crypto ECDSA 서명은 r||s 64바이트(IEEE P1363) — JWS ES256 형식 그대로
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned))
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${vapid.publicKey}`
}

/** 브라우저 푸시 서비스만 허용(SSRF 방지). dev=true 면 로컬 모의 서버(http://127.0.0.1)도 허용 */
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/]
export function isAllowedPushEndpoint(endpoint: string, dev = false): boolean {
  try {
    const u = new URL(endpoint)
    if (dev && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return true
    return u.protocol === 'https:' && PUSH_HOSTS.some(r => r.test(u.hostname))
  } catch { return false }
}

export interface PushSubscriptionLike { endpoint: string; p256dh: string; auth: string }
export interface PushResult { ok: boolean; status: number; gone: boolean; error?: string }

export async function sendWebPush(sub: PushSubscriptionLike, payload: unknown, vapid: VapidKeys,
  opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string; fetchImpl?: typeof fetch } = {}): Promise<PushResult> {
  try {
    const body = await encryptWebPush(te.encode(typeof payload === 'string' ? payload : JSON.stringify(payload)), sub.p256dh, sub.auth)
    const headers: Record<string, string> = {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 86400),
    }
    if (opts.urgency) headers.Urgency = opts.urgency
    if (opts.topic && /^[A-Za-z0-9_-]{1,32}$/.test(opts.topic)) headers.Topic = opts.topic
    const res = await (opts.fetchImpl || fetch)(sub.endpoint, { method: 'POST', headers, body })
    return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 }
  } catch (e: any) {
    return { ok: false, status: 0, gone: false, error: e?.message || 'push failed' }
  }
}
