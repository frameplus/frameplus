// ============================================================================
// JOBS — 계산 규칙 (명세 03 "앱의 심장")
// 순수 함수만. D1/Hono/브라우저 의존 없음 → node --test 로 단독 검증 가능.
//
//   gross = Σ(출근일 × 일급) + Σ(연장시간 × 시급) + Σ(경비 where chargeToClient)
//   tax   = taxOf(gross, taxMode)
//   net   = gross − tax
//
// 청구 OFF 경비(공구·개인 자재)는 gross 에 넣지 않고 "내가 쓴 경비"로 따로 집계만 한다.
// ============================================================================

export type TaxMode = 'rate33' | 'dailyWorker' | 'insurance4' | 'none'
export type SettlementRule = 'sameDay' | 'weeklyFri' | 'monthEnd' | 'nextMonth10'
export type Attendance = 'full' | 'half'
export type ExpenseType = 'fuel' | 'parking' | 'tool' | 'material' | 'etc'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue'

export const TAX_MODES: Record<TaxMode, { label: string; short: string; rate: string; formula: string }> = {
  rate33:      { label: '3.3% 사업소득', short: '3.3%',  rate: '3.3%',   formula: '소득세 3% + 지방소득세 0.3%. 프리랜서 원천징수 — 가장 흔한 기본값.' },
  dailyWorker: { label: '일용직 신고',   short: '일용직', rate: '2.97%',  formula: '(일급 − 150,000) × 2.97%. 일급 15만 이하는 0원. 하루 단위로 계산해 합산.' },
  insurance4:  { label: '4대보험 가입',  short: '4대보험', rate: '약 9.4%', formula: '국민연금 4.5% + 건강 3.545% + 장기요양(건강×12.95%) + 고용 0.9%. 본인부담분만.' },
  none:        { label: '공제 없음',     short: '없음',  rate: '0%',     formula: '세금 없이 전액. net = gross.' },
}

export const SETTLEMENT_RULES: Record<SettlementRule, { label: string; calc: string }> = {
  sameDay:     { label: '당일 지급',          calc: 'dueDate = 작업일' },
  weeklyFri:   { label: '주급 · 매주 금요일', calc: 'dueDate = 작업 주의 금요일' },
  monthEnd:    { label: '월말 지급',          calc: 'dueDate = 작업월 마지막 날' },
  nextMonth10: { label: '익월 10일',          calc: 'dueDate = 작업월 +1개월 10일' },
}

export const EXPENSE_TYPES: Record<ExpenseType, string> = {
  fuel: '주유비', parking: '주차비', tool: '공구비', material: '자재비', etc: '기타',
}

export const TAX_MODE_KEYS = Object.keys(TAX_MODES) as TaxMode[]
export const SETTLEMENT_RULE_KEYS = Object.keys(SETTLEMENT_RULES) as SettlementRule[]
export const EXPENSE_TYPE_KEYS = Object.keys(EXPENSE_TYPES) as ExpenseType[]

export const isTaxMode = (v: unknown): v is TaxMode => typeof v === 'string' && v in TAX_MODES
export const isSettlementRule = (v: unknown): v is SettlementRule => typeof v === 'string' && v in SETTLEMENT_RULES
export const isExpenseType = (v: unknown): v is ExpenseType => typeof v === 'string' && v in EXPENSE_TYPES

// ----------------------------------------------------------------------------
// 세율 상수 — [확인 필요] 연도별 고시 요율. 바뀌면 여기 한 곳만 수정.
// ----------------------------------------------------------------------------
export const TAX_RATES = {
  /** 사업소득 원천징수 소득세율 (소득세법 §129 ①3) */
  businessIncome: 0.03,
  /** 지방소득세 = 소득세의 10% */
  localOfIncome: 0.10,
  /** 일용근로소득 근로소득공제 — 1일 150,000원 (소득세법 §47 ②) */
  dailyDeduction: 150_000,
  /** 일용근로소득 세율 6% × (1 − 근로소득세액공제 55%) = 2.7% */
  dailyEffective: 0.06 * (1 - 0.55),
  /** 소액부징수 — 원천징수 소득세액 1,000원 미만이면 징수하지 않음 (소득세법 §86) */
  minWithholding: 1_000,
  /** 4대보험 본인부담 요율 [확인 필요: 2026년 고시] */
  insurance: {
    pension: 0.045,          // 국민연금 (기준소득월액 상·하한 미적용 — [가정])
    health: 0.03545,         // 건강보험 (7.09% ÷ 2)
    longTermOfHealth: 0.1295,// 장기요양 = 건강보험료 × 12.95%
    employment: 0.009,       // 고용보험
  },
} as const

/** 10원 미만 절사 — 원천징수세액 단수 처리 (국고금관리법 §47) */
export const floor10 = (n: number): number => Math.floor(Math.round(n * 100) / 1000) * 10 // 소수 2자리에서 반올림해 부동소수 오차(3509.99…) 제거 후 절사

/** 3자리 콤마 (로케일 의존 없음) */
export const fmt = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export interface TaxContext {
  /** 일용직 계산용: 하루 단위 지급액 목록. 없으면 gross 전체를 하루로 본다. */
  dayPays?: number[]
}

export interface TaxBreakdown {
  mode: TaxMode
  total: number
  parts: { label: string; amount: number }[]
}

/** 세액 상세 — 화면의 "청구 − 소득세 3% − 지방소득세 0.3% = 실수령" 줄에 쓴다. */
export function taxBreakdown(gross: number, mode: TaxMode, ctx: TaxContext = {}): TaxBreakdown {
  const g = Math.max(0, Math.round(gross))
  switch (mode) {
    case 'none':
      return { mode, total: 0, parts: [] }
    case 'rate33': {
      let income = floor10(g * TAX_RATES.businessIncome)
      if (income < TAX_RATES.minWithholding) income = 0
      const local = floor10(income * TAX_RATES.localOfIncome)
      return { mode, total: income + local, parts: [{ label: '소득세 3%', amount: income }, { label: '지방소득세 0.3%', amount: local }] }
    }
    case 'dailyWorker': {
      const days = ctx.dayPays && ctx.dayPays.length ? ctx.dayPays : [g]
      let income = 0
      for (const pay of days) {
        const taxable = Math.max(0, Math.round(pay) - TAX_RATES.dailyDeduction)
        income += floor10(taxable * TAX_RATES.dailyEffective)
      }
      // [가정] 소액부징수는 지급(청구) 단위 합계 기준으로 적용
      if (income < TAX_RATES.minWithholding) income = 0
      const local = floor10(income * TAX_RATES.localOfIncome)
      return { mode, total: income + local, parts: [{ label: '소득세 2.7%', amount: income }, { label: '지방소득세 0.27%', amount: local }] }
    }
    case 'insurance4': {
      const r = TAX_RATES.insurance
      const pension = floor10(g * r.pension)
      const health = floor10(g * r.health)
      const longTerm = floor10(health * r.longTermOfHealth)
      const employment = floor10(g * r.employment)
      return {
        mode, total: pension + health + longTerm + employment,
        parts: [
          { label: '국민연금 4.5%', amount: pension }, { label: '건강보험 3.545%', amount: health },
          { label: '장기요양', amount: longTerm }, { label: '고용보험 0.9%', amount: employment },
        ],
      }
    }
  }
}

export const taxOf = (gross: number, mode: TaxMode, ctx: TaxContext = {}): number => taxBreakdown(gross, mode, ctx).total

// ----------------------------------------------------------------------------
// 날짜 — 'YYYY-MM-DD' 문자열만 주고받는다 (타임존 사고 방지: 내부는 UTC 고정)
// ----------------------------------------------------------------------------
export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`invalid date: ${s}`)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
}
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseYmd(s).getTime())
export const ymd = (d: Date): string => d.toISOString().slice(0, 10)
export function addDays(s: string, n: number): string { const d = parseYmd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d) }
export function monthStart(s: string): string { return s.slice(0, 7) + '-01' }
export function monthEnd(s: string): string { const d = parseYmd(s); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) }
export function daysBetween(from: string, to: string): number { return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) }
/** 오늘 (KST) */
export function todayKst(now: Date = new Date()): string { return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10) }

/** 정산 규칙 → 입금 예정일 */
export function dueDateFor(rule: SettlementRule, workDate: string): string {
  switch (rule) {
    case 'sameDay': return workDate
    case 'weeklyFri': {
      // [가정] 작업일 이후 첫 금요일 (토·일 작업은 다음 주 금요일)
      const dow = parseYmd(workDate).getUTCDay() // 0=일 … 5=금 6=토
      return addDays(workDate, (5 - dow + 7) % 7)
    }
    case 'monthEnd': return monthEnd(workDate)
    case 'nextMonth10': {
      const d = parseYmd(workDate)
      return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 10)))
    }
  }
}

// ----------------------------------------------------------------------------
// 출근 기록 1건의 금액
// ----------------------------------------------------------------------------
export interface ExpenseInput { type: ExpenseType; name?: string; amount: number; chargeToClient: boolean }
export interface WorkLogInput {
  attendance: Attendance
  dayRate: number
  overtimeHours: number
  hourRate: number
  taxMode: TaxMode
  expenses?: ExpenseInput[]
}
export interface WorkLogAmounts {
  labor: number
  overtime: number
  expensesCharged: number
  expensesOwn: number
  gross: number
  tax: number
  net: number
}

export const laborOf = (attendance: Attendance, dayRate: number): number =>
  attendance === 'half' ? Math.round(dayRate / 2) : Math.round(dayRate)

export function calcWorkLog(w: WorkLogInput): WorkLogAmounts {
  const labor = laborOf(w.attendance, w.dayRate || 0)
  const overtime = Math.round((w.overtimeHours || 0) * (w.hourRate || 0))
  let expensesCharged = 0, expensesOwn = 0
  for (const e of w.expenses || []) {
    const a = Math.round(e.amount || 0)
    if (e.chargeToClient) expensesCharged += a; else expensesOwn += a
  }
  const gross = labor + overtime + expensesCharged
  const tax = taxOf(gross, w.taxMode, { dayPays: [gross] })
  return { labor, overtime, expensesCharged, expensesOwn, gross, tax, net: gross - tax }
}

// ----------------------------------------------------------------------------
// 청구서 — 기간의 WorkLog 를 내역 행으로
// ----------------------------------------------------------------------------
export interface WorkLogLike { id: string; date: string; attendance: Attendance; dayRate: number; hourRate: number; overtimeHours: number }
export interface ExpenseLike { worklogId: string; type: ExpenseType; name?: string; amount: number; chargeToClient: boolean }
export interface InvoiceRow {
  kind: 'labor' | 'half' | 'overtime' | 'expense' | 'excluded'
  label: string
  detail: string
  qty: number
  unitPrice: number
  amount: number
  /** 청구 OFF 경비 — 문서에 «제외»로 표기, gross 에 포함하지 않음 */
  excluded: boolean
}
export interface InvoiceCalc {
  rows: InvoiceRow[]
  gross: number
  tax: number
  net: number
  taxMode: TaxMode
  breakdown: TaxBreakdown
  ownExpenses: number
  days: number
  halfDays: number
  overtimeHours: number
  dayPays: number[]
}

export function buildInvoice(logs: WorkLogLike[], expenses: ExpenseLike[], taxMode: TaxMode): InvoiceCalc {
  const rows: InvoiceRow[] = []
  const byRate = new Map<string, { qty: number; unit: number; kind: 'labor' | 'half' | 'overtime' }>()
  const addGroup = (kind: 'labor' | 'half' | 'overtime', unit: number, qty: number) => {
    const key = `${kind}:${unit}`
    const g = byRate.get(key) || { qty: 0, unit, kind }
    g.qty += qty
    byRate.set(key, g)
  }
  const expByLog = new Map<string, number>()
  for (const e of expenses) {
    if (!e.chargeToClient) continue
    expByLog.set(e.worklogId, (expByLog.get(e.worklogId) || 0) + Math.round(e.amount || 0))
  }

  let days = 0, halfDays = 0, overtimeHours = 0
  const dayPays: number[] = []
  for (const l of logs) {
    const labor = laborOf(l.attendance, l.dayRate || 0)
    if (l.attendance === 'half') { halfDays++; addGroup('half', l.dayRate || 0, 1) }
    else { days++; addGroup('labor', l.dayRate || 0, 1) }
    const ot = l.overtimeHours || 0
    if (ot > 0) { overtimeHours += ot; addGroup('overtime', l.hourRate || 0, ot) }
    dayPays.push(labor + Math.round(ot * (l.hourRate || 0)) + (expByLog.get(l.id) || 0))
  }
  for (const g of byRate.values()) {
    const amount = g.kind === 'half' ? Math.round(g.qty * g.unit / 2) : Math.round(g.qty * g.unit)
    rows.push({
      kind: g.kind,
      label: g.kind === 'labor' ? '출근' : g.kind === 'half' ? '반일 출근' : '연장',
      detail: g.kind === 'overtime' ? `${fmt(g.qty)}시간 × ${fmt(g.unit)}원` : g.kind === 'half' ? `${fmt(g.qty)}일 × ${fmt(g.unit / 2)}원` : `${fmt(g.qty)}일 × ${fmt(g.unit)}원`,
      qty: g.qty, unitPrice: g.unit, amount, excluded: false,
    })
  }
  // 경비: 유형별 합산 — 청구 ON 은 행, 청구 OFF 는 «제외» 행
  const expCharged = new Map<ExpenseType, number>()
  const expOwn = new Map<ExpenseType, number>()
  for (const e of expenses) {
    const m = e.chargeToClient ? expCharged : expOwn
    m.set(e.type, (m.get(e.type) || 0) + Math.round(e.amount || 0))
  }
  for (const t of EXPENSE_TYPE_KEYS) {
    const a = expCharged.get(t)
    if (a) rows.push({ kind: 'expense', label: EXPENSE_TYPES[t], detail: '청구 켜짐', qty: 1, unitPrice: a, amount: a, excluded: false })
  }
  let ownExpenses = 0
  for (const t of EXPENSE_TYPE_KEYS) {
    const a = expOwn.get(t)
    if (a) { ownExpenses += a; rows.push({ kind: 'excluded', label: EXPENSE_TYPES[t], detail: '청구 꺼짐 · 자기 부담', qty: 1, unitPrice: a, amount: a, excluded: true }) }
  }
  const gross = rows.filter(r => !r.excluded).reduce((s, r) => s + r.amount, 0)
  const breakdown = taxBreakdown(gross, taxMode, { dayPays })
  return { rows, gross, tax: breakdown.total, net: gross - breakdown.total, taxMode, breakdown, ownExpenses, days, halfDays, overtimeHours, dayPays }
}

/** 저장된 rows 로 세액만 다시 계산 (청구서에서 세액공제 탭을 바꿀 때) */
export function retaxInvoice(rows: InvoiceRow[], taxMode: TaxMode, dayPays: number[]): { gross: number; tax: number; net: number; breakdown: TaxBreakdown } {
  const gross = rows.filter(r => !r.excluded).reduce((s, r) => s + Math.round(r.amount || 0), 0)
  const breakdown = taxBreakdown(gross, taxMode, { dayPays })
  return { gross, tax: breakdown.total, net: gross - breakdown.total, breakdown }
}

// ----------------------------------------------------------------------------
// 청구서 상태 · 독촉 단계
// ----------------------------------------------------------------------------
export function invoiceStatus(current: InvoiceStatus, net: number, paidAmount: number, dueDate: string, today: string): InvoiceStatus {
  if (current === 'draft') return 'draft'
  if (paidAmount >= net && net > 0) return 'paid'
  // [가정] 예정일 초과면 일부 입금이어도 overdue (남은 금액이 연체) — 화면은 paidAmount 로 "일부 입금" 표시
  if (dueDate && today > dueDate) return 'overdue'
  if (paidAmount > 0) return 'partial'
  return 'sent'
}

export type DunningLevel = 'none' | 'polite' | 'firm'
export function dunningLevel(dueDate: string, today: string): DunningLevel {
  const over = daysBetween(dueDate, today)
  if (over >= 10) return 'firm'
  if (over >= 3) return 'polite'
  return 'none'
}

// ----------------------------------------------------------------------------
// 입금 자동 매칭 matchRule — 순서대로 시도, 첫 성공에서 멈춤 (S-28)
// ----------------------------------------------------------------------------
export interface OpenInvoiceLike { id: string; siteId: string; net: number; paidAmount: number; dueDate: string; company?: string; contactName?: string }
export interface PayerRuleLike { payerName: string; siteId: string }
export type MatchedBy = 'amount' | 'payer' | 'rule' | 'manual'
export interface MatchResult {
  matchedBy: MatchedBy | null
  siteId: string | null
  allocations: { invoiceId: string; amount: number }[]
  /** 어느 청구서에도 붙이지 못한 잔액 */
  remainder: number
  needsReview: boolean
}

/** 입금자명 정규화 — 공백·법인 접두어 제거 */
export function normalizePayer(s: string): string {
  return (s || '')
    .replace(/\(주\)|㈜|주식회사|유한회사|\(유\)/g, '')
    .replace(/[\s·.,\-_()]/g, '')
    .toLowerCase()
}

export function matchPayment(p: { amount: number; payerName: string }, invoices: OpenInvoiceLike[], rules: PayerRuleLike[]): MatchResult {
  const amount = Math.round(p.amount || 0)
  const open = invoices.filter(i => i.net - i.paidAmount > 0)
  const none: MatchResult = { matchedBy: null, siteId: null, allocations: [], remainder: amount, needsReview: true }
  if (amount <= 0) return none

  // ① 금액 일치 — 미입금액과 정확히 같은 청구서가 1건이면 그 청구서에
  const exact = open.filter(i => i.net - i.paidAmount === amount)
  if (exact.length === 1) {
    return { matchedBy: 'amount', siteId: exact[0].siteId, allocations: [{ invoiceId: exact[0].id, amount }], remainder: 0, needsReview: false }
  }

  // ② 입금자명 일치 — PayerRule 우선, 그다음 현장 업체명 · 담당자명
  const payer = normalizePayer(p.payerName)
  let siteId: string | null = null
  let matchedBy: MatchedBy | null = null
  if (payer) {
    const rule = rules.find(r => normalizePayer(r.payerName) === payer)
    if (rule) { siteId = rule.siteId; matchedBy = 'rule' }
    else {
      const hit = open.find(i => {
        const c = normalizePayer(i.company || ''), n = normalizePayer(i.contactName || '')
        return (c && (c === payer || c.includes(payer) || payer.includes(c))) || (n && n === payer)
      })
      if (hit) { siteId = hit.siteId; matchedBy = 'payer' }
    }
  }
  if (!siteId) return none

  // 그 현장의 미입금 청구서에 오래된 예정일부터 채운다. 넘치면 다음 청구서로 이월, 그래도 남으면 확인 요청.
  const targets = open.filter(i => i.siteId === siteId).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  if (!targets.length) return { ...none, matchedBy, siteId }
  let left = amount
  const allocations: { invoiceId: string; amount: number }[] = []
  for (const inv of targets) {
    if (left <= 0) break
    const remaining = inv.net - inv.paidAmount
    const take = Math.min(remaining, left)
    allocations.push({ invoiceId: inv.id, amount: take })
    left -= take
  }
  return { matchedBy, siteId, allocations, remainder: left, needsReview: left > 0 }
}

// ----------------------------------------------------------------------------
// 견적서 (S-09) — 작업 전 금액을 문서로. 세액공제는 견적 단계에서 적용하지 않는다(청구서에서만).
// ----------------------------------------------------------------------------
export type VatMode = 'exclusive' | 'inclusive'
export type QuoteItemKind = 'labor' | 'material'
export interface QuoteItem { kind: QuoteItemKind; name: string; qty: number; unit: string; unitPrice: number }
export interface QuoteCalc { labor: number; material: number; subtotal: number; vat: number; total: number; vatMode: VatMode; vatLabel: string }
export const isVatMode = (v: unknown): v is VatMode => v === 'exclusive' || v === 'inclusive'
export const isQuoteItemKind = (v: unknown): v is QuoteItemKind => v === 'labor' || v === 'material'
export const quoteItemAmount = (it: QuoteItem): number => Math.round((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))
/** [가정] 별도 = 합계는 공급가액만(문서에 «부가세 별도» 명기), 포함 = 합계에 10% 를 더해 «부가세 포함» 표시 */
export function calcQuote(items: QuoteItem[], vatMode: VatMode): QuoteCalc {
  let labor = 0, material = 0
  for (const it of items) { const a = quoteItemAmount(it); if (it.kind === 'material') material += a; else labor += a }
  const subtotal = labor + material, vat = Math.round(subtotal * 0.1)
  return vatMode === 'inclusive'
    ? { labor, material, subtotal, vat, total: subtotal + vat, vatMode, vatLabel: '부가세 포함' }
    : { labor, material, subtotal, vat, total: subtotal, vatMode, vatLabel: '부가세 별도' }
}

/**
 * S-16 견적 → 청구 전환. 기본값은 실제 기록. 인력 / 자재·경비 묶음 단위로 견적 금액을 쓸 수 있다.
 * [가정] 명세의 «줄마다 선택»을 인력 · 자재 두 묶음으로 단순화. 전환은 공급가액 기준(부가세 행은 넣지 않음) [확인 필요].
 */
export function applyQuoteToRows(rows: InvoiceRow[], quote: QuoteCalc, use: { labor: boolean; material: boolean }): InvoiceRow[] {
  let out = rows.slice()
  if (use.labor) {
    out = out.filter(r => r.kind !== 'labor' && r.kind !== 'half' && r.kind !== 'overtime')
    out.unshift({ kind: 'labor', label: '인력 (견적)', detail: '견적서 금액 적용', qty: 1, unitPrice: quote.labor, amount: quote.labor, excluded: false })
  }
  if (use.material) {
    out = out.filter(r => r.kind !== 'expense')
    const at = out.findIndex(r => r.excluded)
    const row: InvoiceRow = { kind: 'expense', label: '자재 · 경비 (견적)', detail: '견적서 금액 적용', qty: 1, unitPrice: quote.material, amount: quote.material, excluded: false }
    if (at < 0) out.push(row); else out.splice(at, 0, row)
  }
  return out
}

// ----------------------------------------------------------------------------
// 연간 세액 정산서 (S-15) — WorkLog 집계, 편집 불가. taxMode 별 소계 분리.
// ----------------------------------------------------------------------------
export interface YearLogLike { date: string; siteId: string; siteName: string; taxMode: TaxMode; attendance: Attendance; gross: number; tax: number; net: number }
export interface YearTotals { days: number; gross: number; tax: number; net: number }
export interface YearSummary {
  year: string
  total: YearTotals
  bySite: ({ siteId: string; siteName: string } & YearTotals)[]
  byMonth: ({ month: string } & YearTotals)[]
  byTaxMode: ({ taxMode: TaxMode; label: string } & YearTotals)[]
}
export function summarizeYear(logs: YearLogLike[], year: string): YearSummary {
  const zero = (): YearTotals => ({ days: 0, gross: 0, tax: 0, net: 0 })
  const total = zero()
  const site = new Map<string, YearSummary['bySite'][0]>()
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, ...zero() }))
  const mode = new Map<TaxMode, YearSummary['byTaxMode'][0]>()
  for (const l of logs) {
    if (!l.date.startsWith(year + '-')) continue
    const d = l.attendance === 'half' ? 0.5 : 1
    const add = (t: YearTotals) => { t.days += d; t.gross += l.gross || 0; t.tax += l.tax || 0; t.net += l.net || 0 }
    add(total)
    const s = site.get(l.siteId) || { siteId: l.siteId, siteName: l.siteName, ...zero() }; add(s); site.set(l.siteId, s)
    add(byMonth[+l.date.slice(5, 7) - 1])
    const m = mode.get(l.taxMode) || { taxMode: l.taxMode, label: TAX_MODES[l.taxMode]?.label || l.taxMode, ...zero() }; add(m); mode.set(l.taxMode, m)
  }
  return { year, total, bySite: [...site.values()].sort((a, b) => b.net - a.net), byMonth, byTaxMode: [...mode.values()].sort((a, b) => b.net - a.net) }
}

// ----------------------------------------------------------------------------
// 퇴근 알람 (S-05) — 30분 간격 최대 3회, 그 뒤(+90분) 자동 기록
// ----------------------------------------------------------------------------
const hmToMin = (s: string) => (/^\d{2}:\d{2}$/.test(s || '') ? +s.slice(0, 2) * 60 + +s.slice(3) : NaN)
/** 0: 아직 아님 · 1~3: n번째 알림 · 4: 자동 퇴근 기록. 퇴근 알람 시각 이후에 출근한 기록(야간 등)은 대상 아님 */
export function clockoutStage(clockOut: string, now: string, checkIn = ''): number {
  const co = hmToMin(clockOut), n = hmToMin(now), ci = hmToMin(checkIn)
  if (isNaN(co) || isNaN(n)) return 0
  if (!isNaN(ci) && ci >= co) return 0
  const past = n - co
  if (past < 0) return 0
  if (past >= 90) return 4
  return Math.floor(past / 30) + 1
}
