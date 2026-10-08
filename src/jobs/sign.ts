// ============================================================================
// JOBS — 서명 URL (사진). HMAC-SHA256(비밀키, "photo:{id}.{만료}") 앞 16바이트 → base64url 22자
//   /jobs/photo/{id}?e={만료 epoch초}&s={서명}
// 만료는 1시간 단위로 올림 — 같은 시간대에는 같은 URL 이라 브라우저 캐시가 살아 있다.
// ============================================================================
// 의존성 없음 — node --test 가 확장자 없는 상대 import 를 풀지 못하므로 base64url 을 여기서 직접 구현
const te = new TextEncoder()
const b64urlEncode = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
/** 서명 URL 최대 유효기간 — 이보다 먼 만료는 위조로 본다 */
export const MAX_PHOTO_TTL_SEC = 8 * 86400

export async function hmacSig(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(msg))).slice(0, 16))
}

export function photoExpiry(ttlSec: number, nowSec = Date.now() / 1000): number {
  return Math.ceil((nowSec + Math.min(ttlSec, MAX_PHOTO_TTL_SEC)) / 3600) * 3600
}

export async function signedPhotoPath(secret: string, id: string, ttlSec: number, nowSec = Date.now() / 1000): Promise<string> {
  const exp = photoExpiry(ttlSec, nowSec)
  return `/jobs/photo/${id}?e=${exp}&s=${await hmacSig(secret, `photo:${id}.${exp}`)}`
}

export async function verifyPhotoSig(secret: string, id: string, e: unknown, s: unknown, nowSec = Date.now() / 1000): Promise<boolean> {
  const exp = Number(e)
  if (!Number.isInteger(exp) || exp <= nowSec || exp > nowSec + MAX_PHOTO_TTL_SEC + 3600) return false
  if (typeof s !== 'string' || s.length !== 22) return false
  const want = await hmacSig(secret, `photo:${id}.${exp}`)
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i)
  return diff === 0
}
