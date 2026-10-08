// 입금 붙여넣기 파서 — 은행 입금 문자 7종 · 목록형 · 토스형 · 거래내역 표(TSV · CSV) · 출금 제외 · 중복 · 연도 추정
// [가정] 은행 문자 형식은 은행 · 시기별로 조금씩 다르다 — 대표 형식으로 검증하고, 못 읽은 건은 사유와 함께 돌려준다
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDeposits, matchPayment } from '../src/jobs/calc.ts'

const TODAY = '2026-10-08'
const one = (text: string) => { const r = parseDeposits(text, TODAY); assert.equal(r.deposits.length, 1, JSON.stringify(r)); return r.deposits[0] }

test('은행 입금 문자 7종 — 금액 · 날짜 · 시각 · 입금자 · 은행, 잔액 · 계좌번호는 버림', () => {
  const cases: [string, string, string][] = [
    ['[Web발신]\nKB국민 10/08 14:23\n123456**789\n대성건설\n입금\n1,000,000\n잔액5,234,000', 'KB국민', '대성건설'],
    ['[Web발신]\n신한10/08 14:23\n110-***-123456\n입금     1,000,000\n잔액     5,234,000\n 대성건설', '신한', '대성건설'],
    ['[Web발신]\n우리 10/08 14:23\n1002-***-123456\n입금 1,000,000원\n대성건설', '우리', '대성건설'],
    ['[Web발신]\n농협 입금1,000,000원\n10/08 14:23 302-****-1234-11 대성건설 잔액5,234,000원', 'NH농협', '대성건설'],
    ['[Web발신]\n하나,10/08,14:23\n123-******-12345\n입금1,000,000원\n대성건설\n잔액5,234,000원', '하나', '대성건설'],
    ['[Web발신]\n[IBK]10/08 14:23\n123-******-01-011\n입금 1,000,000\n대성건설\n잔액 5,234,000', 'IBK기업', '대성건설'],
    ['[Web발신]\n[KB]10/08 14:23 123456**789 (주)대성건설 입금 1,000,000 잔액5,234,000', 'KB국민', '(주)대성건설'.replace(/\([^)]*\)/, '').trim()],
  ]
  for (const [sms, bank, payer] of cases) {
    const d = one(sms)
    assert.equal(d.amount, 1_000_000, sms)
    assert.equal(d.paidAt, '2026-10-08', sms)
    assert.equal(d.time, '14:23', sms)
    assert.equal(d.bank, bank, sms)
    assert.equal(d.payerName, payer, sms)
    assert.equal(d.source, 'sms')
    assert.equal(d.dateGuessed, false)
    assert.ok(!JSON.stringify(d).includes('5,234,000') && !JSON.stringify(d).includes('5234000'), '잔액 미보관')
  }
})

test('여러 건 — 빈 줄 · [Web발신] 구분, 목록형 한 줄씩, 시간순 정렬', () => {
  const r = parseDeposits(`[Web발신]
신한10/07 09:10
110-***-123456
입금 500,000
 한울건설
[Web발신]
우리 10/08 14:23
1002-***-123456
입금 1,000,000원
대성건설

10/06 18:00 김소장 입금 300,000
10/05 08:30 박경리 입금 120,000 잔액 3,000,000`, TODAY)
  assert.deepEqual(r.deposits.map(d => [d.paidAt, d.payerName, d.amount]), [
    ['2026-10-05', '박경리', 120_000], ['2026-10-06', '김소장', 300_000], ['2026-10-07', '한울건설', 500_000], ['2026-10-08', '대성건설', 1_000_000],
  ])
})

test('토스 · 카카오뱅크 알림형, 날짜 없으면 오늘로 표시', () => {
  const t = one('대성건설님이 1,000,000원을 보냈어요')
  assert.equal(t.payerName, '대성건설'); assert.equal(t.amount, 1_000_000); assert.equal(t.paidAt, TODAY); assert.equal(t.dateGuessed, true)
  const k = one('입금 250,000원\n한울건설 → 내 입출금통장(1234)')
  assert.equal(k.payerName, '한울건설'); assert.equal(k.amount, 250_000)
})

test('출금 · 카드 승인 · 입금 취소 · 회사명 «우리건설»은 은행으로 오인하지 않음', () => {
  const r = parseDeposits(`[Web발신]
신한10/08 14:23
110-***-123456
출금 50,000
잔액 1,000,000

[Web발신]
신한카드(1234)승인 홍길동 12,000원 일시불 10/08 14:23 스타벅스

[Web발신]
국민 10/08 15:00 입금취소 100,000`, TODAY)
  assert.equal(r.deposits.length, 0)
  assert.deepEqual(r.skipped.map(s => s.reason), ['출금 · 결제 문자', '출금 · 결제 문자', '입금 취소 문자'])
  const w = one('10/08 14:23 우리건설 입금 700,000')
  assert.equal(w.bank, ''); assert.equal(w.payerName, '우리건설')
})

test('연도 추정 — 1월에 붙인 12월 문자는 작년', () => {
  const r = parseDeposits('[Web발신]\n신한12/30 10:00\n입금 100,000\n대성건설', '2027-01-03')
  assert.equal(r.deposits[0].paidAt, '2026-12-30')
})

test('같은 문자를 두 번 붙여도 한 건, 다른 시각이면 두 건', () => {
  const sms = '[Web발신]\n우리 10/08 14:23\n입금 1,000,000원\n대성건설'
  const r = parseDeposits(sms + '\n\n' + sms + '\n\n' + sms.replace('14:23', '16:40'), TODAY)
  assert.equal(r.deposits.length, 2)
  assert.equal(r.skipped[0].reason, '같은 입금이 두 번 붙여넣어짐')
  assert.notEqual(r.deposits[0].key, r.deposits[1].key)
})

test('거래내역 표(엑셀 복사 TSV) — 제목 줄로 칸 찾기, 출금 줄 무시, 입금자 칸 우선순위', () => {
  const kb = [
    '조회기간: 2026.10.01 ~ 2026.10.08',
    '거래일시\t적요\t보낸분/받는분\t송금메모\t출금액(원)\t입금액(원)\t잔액(원)\t거래점',
    '2026.10.08 14:23:11\t타행이체\t대성건설\t\t0\t1,000,000\t5,234,000\t인터넷',
    '2026.10.07 09:00:00\t체크카드\t스타벅스\t\t4,500\t0\t4,234,000\t',
    '2026.10.06 18:10:00\tFBS입금\t\t8월 노임\t0\t300,000\t4,238,500\t',
  ].join('\n')
  const r = parseDeposits(kb, TODAY)
  assert.deepEqual(r.deposits.map(d => [d.paidAt, d.time, d.payerName, d.amount, d.source]), [
    ['2026-10-06', '18:10', '8월 노임', 300_000, 'excel'], ['2026-10-08', '14:23', '대성건설', 1_000_000, 'excel'],
  ])
  const sh = '거래일자\t거래시간\t적요\t출금(원)\t입금(원)\t내용\t잔액(원)\n2026-10-08\t14:23\t타행\t\t1,000,000\t한울건설\t5,234,000'
  const d = one(sh)
  assert.deepEqual([d.paidAt, d.time, d.payerName, d.amount], ['2026-10-08', '14:23', '한울건설', 1_000_000])
})

test('거래내역 CSV(따옴표 금액) · 날짜 형식 20261008', () => {
  const csv = '거래일자,입금자명,입금액,출금액,잔액\n20261008,"(주)대성건설","1,000,000",0,"5,234,000"\n20261007,카드대금,0,"120,000","4,234,000"'
  const d = one(csv)
  assert.deepEqual([d.paidAt, d.payerName, d.amount], ['2026-10-08', '대성건설', 1_000_000])
})

test('파싱 결과 → 기존 매칭 엔진(①②③)과 그대로 연결', () => {
  const invs = [
    { id: 'i1', siteId: 's1', net: 1_000_000, paidAmount: 0, dueDate: '2026-09-30', company: '(주)대성건설' },
    { id: 'i2', siteId: 's2', net: 967_000, paidAmount: 0, dueDate: '2026-10-09', company: '세종건설' },
  ]
  const [a, b] = parseDeposits('10/08 14:23 아무개 입금 967,000\n10/08 15:00 대성건설 입금 400,000', TODAY).deposits
  assert.equal(matchPayment(a, invs, []).matchedBy, 'amount')
  const m = matchPayment(b, invs, [])
  assert.equal(m.matchedBy, 'payer'); assert.deepEqual(m.allocations, [{ invoiceId: 'i1', amount: 400_000 }])
})
