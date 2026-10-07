// node --test tests/  (Node 22.18+ 타입 스트리핑으로 .ts 직접 실행)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  taxOf, taxBreakdown, calcWorkLog, buildInvoice, retaxInvoice, dueDateFor, invoiceStatus, dunningLevel,
  matchPayment, normalizePayer, floor10, fmt, addDays, monthEnd, daysBetween,
} from '../src/jobs/calc.ts'

// ---- 명세 03 검증용 실제 수치 (8월 · 문정동) --------------------------------
// 출근 18일 × 280,000 = 5,040,000 · 연장 6h × 35,000 = 210,000 · 주유 52,000 · 주차 18,000
// 공구비 (chargeToClient=false) → 청구 제외
// gross 5,320,000 · tax 3.3% = 175,560 · net 5,144,440
const logs = Array.from({ length: 18 }, (_, i) => ({
  id: `wl${i}`, date: `2026-08-${String(3 + i).padStart(2, '0')}`,
  attendance: 'full' as const, dayRate: 280_000, hourRate: 35_000, overtimeHours: i < 3 ? 2 : 0,
}))
const expenses = [
  { worklogId: 'wl0', type: 'fuel' as const, amount: 52_000, chargeToClient: true },
  { worklogId: 'wl1', type: 'parking' as const, amount: 18_000, chargeToClient: true },
  { worklogId: 'wl2', type: 'tool' as const, amount: 30_000, chargeToClient: false },
]

test('명세 검증 수치: gross 5,320,000 · tax 175,560 · net 5,144,440', () => {
  const inv = buildInvoice(logs, expenses, 'rate33')
  assert.equal(inv.gross, 5_320_000)
  assert.equal(inv.tax, 175_560)
  assert.equal(inv.net, 5_144_440)
  assert.equal(inv.days, 18)
  assert.equal(inv.overtimeHours, 6)
  assert.equal(inv.ownExpenses, 30_000)
  const labels = inv.rows.map(r => `${r.label}|${r.detail}|${r.amount}|${r.excluded}`)
  assert.ok(labels.includes('출근|18일 × 280,000원|5040000|false'))
  assert.ok(labels.includes('연장|6시간 × 35,000원|210000|false'))
  assert.ok(labels.includes('주유비|청구 켜짐|52000|false'))
  assert.ok(labels.includes('주차비|청구 켜짐|18000|false'))
  assert.ok(labels.includes('공구비|청구 꺼짐 · 자기 부담|30000|true'))
  assert.deepEqual(inv.breakdown.parts, [{ label: '소득세 3%', amount: 159_600 }, { label: '지방소득세 0.3%', amount: 15_960 }])
})

test('세액공제 탭 변경은 rows 를 유지한 채 세액만 재계산', () => {
  const inv = buildInvoice(logs, expenses, 'rate33')
  const none = retaxInvoice(inv.rows, 'none', inv.dayPays)
  assert.equal(none.gross, 5_320_000); assert.equal(none.tax, 0); assert.equal(none.net, 5_320_000)
  const daily = retaxInvoice(inv.rows, 'dailyWorker', inv.dayPays)
  assert.equal(daily.tax, taxOf(5_320_000, 'dailyWorker', { dayPays: inv.dayPays }))
})

test('taxOf — 4가지 모드', () => {
  assert.equal(taxOf(5_320_000, 'none'), 0)
  assert.equal(taxOf(5_320_000, 'rate33'), 175_560)
  // 일용직: (280,000 − 150,000) × 2.7% = 3,510/일 × 18일 = 63,180 → 지방소득세 10% = 6,310(10원 절사) → 69,490
  assert.equal(taxOf(5_040_000, 'dailyWorker', { dayPays: Array(18).fill(280_000) }), 69_490)
  assert.deepEqual(taxBreakdown(5_040_000, 'dailyWorker', { dayPays: Array(18).fill(280_000) }).parts.map(p => p.amount), [63_180, 6_310])
  // 일급 15만 이하는 0원
  assert.equal(taxOf(300_000, 'dailyWorker', { dayPays: [150_000, 150_000] }), 0)
  // 4대보험: 1,000,000 → 국민연금 45,000 + 건강 35,450 + 장기요양 4,590 + 고용 9,000 = 94,040
  const ins = taxBreakdown(1_000_000, 'insurance4')
  assert.equal(ins.total, 94_040)
  assert.deepEqual(ins.parts.map(p => p.amount), [45_000, 35_450, 4_590, 9_000])
})

test('소액부징수 — 원천징수 소득세 1,000원 미만은 0', () => {
  assert.equal(taxOf(30_000, 'rate33'), 0)          // 900원 → 0
  assert.equal(taxOf(40_000, 'rate33'), 1_200 + 120) // 1,200 + 지방 120
})

test('10원 미만 절사 · 포맷', () => {
  assert.equal(floor10(4_590.775), 4_590)
  assert.equal(floor10(159_600), 159_600)
  assert.equal(fmt(5_144_440), '5,144,440')
  assert.equal(fmt(0), '0')
})

test('calcWorkLog — 하루 기록 (반일 · 연장 · 청구 OFF 경비)', () => {
  const full = calcWorkLog({ attendance: 'full', dayRate: 280_000, overtimeHours: 2, hourRate: 35_000, taxMode: 'rate33',
    expenses: [{ type: 'fuel', amount: 10_000, chargeToClient: true }, { type: 'tool', amount: 50_000, chargeToClient: false }] })
  assert.equal(full.labor, 280_000); assert.equal(full.overtime, 70_000)
  assert.equal(full.expensesCharged, 10_000); assert.equal(full.expensesOwn, 50_000)
  assert.equal(full.gross, 360_000); assert.equal(full.tax, 10_800 + 1_080); assert.equal(full.net, 348_120)
  const half = calcWorkLog({ attendance: 'half', dayRate: 280_000, overtimeHours: 0, hourRate: 0, taxMode: 'none' })
  assert.equal(half.labor, 140_000); assert.equal(half.net, 140_000)
})

test('정산 규칙 → 입금 예정일', () => {
  // 2026-01-01 = 목요일
  assert.equal(dueDateFor('sameDay', '2026-01-01'), '2026-01-01')
  assert.equal(dueDateFor('weeklyFri', '2026-01-01'), '2026-01-02')
  assert.equal(dueDateFor('weeklyFri', '2026-01-02'), '2026-01-02')  // 금요일 작업 → 당일
  assert.equal(dueDateFor('weeklyFri', '2026-01-03'), '2026-01-09')  // 토요일 작업 → 다음 주 금요일
  assert.equal(dueDateFor('monthEnd', '2026-02-10'), '2026-02-28')
  assert.equal(dueDateFor('monthEnd', '2028-02-10'), '2028-02-29')
  assert.equal(dueDateFor('nextMonth10', '2026-12-05'), '2027-01-10')
  assert.equal(addDays('2026-08-31', 1), '2026-09-01')
  assert.equal(monthEnd('2026-08-05'), '2026-08-31')
  assert.equal(daysBetween('2026-08-31', '2026-09-10'), 10)
})

test('청구서 상태 · 독촉 단계', () => {
  assert.equal(invoiceStatus('draft', 100, 0, '2026-08-31', '2026-09-30'), 'draft')
  assert.equal(invoiceStatus('sent', 100, 100, '2026-08-31', '2026-09-30'), 'paid')
  assert.equal(invoiceStatus('sent', 100, 30, '2026-08-31', '2026-08-20'), 'partial')
  assert.equal(invoiceStatus('sent', 100, 0, '2026-08-31', '2026-08-31'), 'sent')
  assert.equal(invoiceStatus('sent', 100, 0, '2026-08-31', '2026-09-01'), 'overdue')
  assert.equal(invoiceStatus('partial', 100, 30, '2026-08-31', '2026-09-01'), 'overdue')
  assert.equal(dunningLevel('2026-08-31', '2026-09-02'), 'none')
  assert.equal(dunningLevel('2026-08-31', '2026-09-03'), 'polite')
  assert.equal(dunningLevel('2026-08-31', '2026-09-10'), 'firm')
})

test('입금 매칭 ① 금액 일치', () => {
  const invs = [
    { id: 'a', siteId: 's1', net: 5_144_440, paidAmount: 0, dueDate: '2026-08-31', company: '대성건설' },
    { id: 'b', siteId: 's2', net: 2_000_000, paidAmount: 500_000, dueDate: '2026-09-10', company: '한울건설' },
  ]
  const r = matchPayment({ amount: 5_144_440, payerName: '모르는입금자' }, invs, [])
  assert.equal(r.matchedBy, 'amount'); assert.equal(r.needsReview, false)
  assert.deepEqual(r.allocations, [{ invoiceId: 'a', amount: 5_144_440 }])
})

test('입금 매칭 ② 입금자명 — 일부 입금 · 이월 · 규칙', () => {
  const invs = [
    { id: 'a', siteId: 's1', net: 1_000_000, paidAmount: 0, dueDate: '2026-07-31', company: '(주)대성건설' },
    { id: 'b', siteId: 's1', net: 1_000_000, paidAmount: 0, dueDate: '2026-08-31', company: '(주)대성건설' },
    { id: 'c', siteId: 's2', net: 3_000_000, paidAmount: 0, dueDate: '2026-08-31', company: '한울건설', contactName: '김소장' },
  ]
  const partial = matchPayment({ amount: 600_000, payerName: '대성건설' }, invs, [])
  assert.equal(partial.matchedBy, 'payer'); assert.equal(partial.needsReview, false)
  assert.deepEqual(partial.allocations, [{ invoiceId: 'a', amount: 600_000 }])

  const carry = matchPayment({ amount: 1_500_000, payerName: '대성건설' }, invs, [])
  assert.deepEqual(carry.allocations, [{ invoiceId: 'a', amount: 1_000_000 }, { invoiceId: 'b', amount: 500_000 }])
  assert.equal(carry.remainder, 0); assert.equal(carry.needsReview, false)

  const over = matchPayment({ amount: 2_500_000, payerName: '대성건설' }, invs, [])
  assert.equal(over.remainder, 500_000); assert.equal(over.needsReview, true)

  const byContact = matchPayment({ amount: 100_000, payerName: '김소장' }, invs, [])
  assert.equal(byContact.siteId, 's2'); assert.equal(byContact.matchedBy, 'payer')

  const byRule = matchPayment({ amount: 100_000, payerName: '박경리' }, invs, [{ payerName: '박경리', siteId: 's2' }])
  assert.equal(byRule.siteId, 's2'); assert.equal(byRule.matchedBy, 'rule')
  assert.deepEqual(byRule.allocations, [{ invoiceId: 'c', amount: 100_000 }])
})

test('입금 매칭 ③ 둘 다 아님 → needsReview', () => {
  const invs = [{ id: 'a', siteId: 's1', net: 1_000_000, paidAmount: 0, dueDate: '2026-07-31', company: '대성건설' }]
  const r = matchPayment({ amount: 123_456, payerName: '누구' }, invs, [])
  assert.equal(r.matchedBy, null); assert.equal(r.needsReview, true); assert.equal(r.remainder, 123_456)
  assert.equal(normalizePayer('(주) 대성 건설'), '대성건설')
  assert.equal(normalizePayer('주식회사 한울건설'), '한울건설')
})
