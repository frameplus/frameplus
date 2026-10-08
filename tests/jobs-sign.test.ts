// 사진 서명 URL — 서명 · 검증 · 만료 · 위조 차단
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signedPhotoPath, verifyPhotoSig, photoExpiry, MAX_PHOTO_TTL_SEC } from '../src/jobs/sign.ts'

const SECRET = 'test-secret-0123456789abcdef'
const NOW = 1_790_000_123
const parse = (path: string) => { const u = new URL('http://x' + path); return { id: u.pathname.split('/').pop()!, e: u.searchParams.get('e'), s: u.searchParams.get('s') } }

test('서명 → 검증 통과, 만료는 1시간 단위로 올림', async () => {
  const p = parse(await signedPhotoPath(SECRET, 'ph_0123456789abcdef0123', 86400, NOW))
  assert.equal(Number(p.e) % 3600, 0)
  assert.ok(Number(p.e) >= NOW + 86400 && Number(p.e) < NOW + 86400 + 3600)
  assert.equal(p.s!.length, 22)
  assert.equal(await verifyPhotoSig(SECRET, p.id, p.e, p.s, NOW), true)
  // 같은 시간대에 다시 서명하면 같은 URL (브라우저 캐시 유지)
  assert.equal(await signedPhotoPath(SECRET, p.id, 86400, NOW + 60), await signedPhotoPath(SECRET, p.id, 86400, NOW))
})

test('위조 · 다른 사진 · 다른 비밀키 · 만료 · 과도한 만료는 거부', async () => {
  const p = parse(await signedPhotoPath(SECRET, 'ph_0123456789abcdef0123', 3600, NOW))
  const flipped = (p.s![0] === 'A' ? 'B' : 'A') + p.s!.slice(1)
  assert.equal(await verifyPhotoSig(SECRET, p.id, p.e, flipped, NOW), false)
  assert.equal(await verifyPhotoSig(SECRET, 'ph_ffffffffffffffffffff', p.e, p.s, NOW), false)
  assert.equal(await verifyPhotoSig('other-secret', p.id, p.e, p.s, NOW), false)
  assert.equal(await verifyPhotoSig(SECRET, p.id, p.e, p.s, Number(p.e) + 1), false)     // 만료 후
  assert.equal(await verifyPhotoSig(SECRET, p.id, String(Number(p.e) + 3600), p.s, NOW), false) // 만료 변조
  assert.equal(await verifyPhotoSig(SECRET, p.id, null, p.s, NOW), false)
  assert.equal(await verifyPhotoSig(SECRET, p.id, p.e, null, NOW), false)
  assert.equal(await verifyPhotoSig(SECRET, p.id, '12.5', p.s, NOW), false)
  // 요청한 TTL 이 상한을 넘어도 상한으로 잘린다
  assert.ok(photoExpiry(365 * 86400, NOW) <= NOW + MAX_PHOTO_TTL_SEC + 3600)
})
