// 인사이트 시드 소스 검증 → SOURCES_REPORT.md
// 사용: RADAR_BASE_URL=https://frameplus-erp.pages.dev CRON_TOKEN=... node scripts/verify-sources.mjs
// 운영 Worker가 직접 fetch하므로(로컬 네트워크 무관) 실제 수집 환경 기준 결과가 나온다. 실패 소스는 서버에서 enabled=0 처리된다.
import { writeFileSync } from 'node:fs'

const base = (process.env.RADAR_BASE_URL || 'https://frameplus-erp.pages.dev').replace(/\/$/, '')
const token = process.env.CRON_TOKEN
if (!token) { console.error('CRON_TOKEN 환경변수가 필요합니다'); process.exit(1) }

const res = await fetch(`${base}/api/cron/radar/verify`, { method: 'POST', headers: { 'X-Cron-Token': token } })
const data = await res.json()
if (!data.ok) { console.error('검증 실패:', data); process.exit(1) }
const { ok, failed, report } = data.result
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|')
const lines = [
  '# SOURCES_REPORT — 인사이트 시드 소스 검증',
  '',
  `- 실행: ${new Date().toISOString()} · 대상: ${base}`,
  `- 결과: 통과 **${ok}** / 실패 **${failed}** (완료 기준: 통과 15개 이상)`,
  '',
  '| 결과 | 이름 | 유형 | 항목 수 / 사유 | URL |',
  '|---|---|---|---|---|',
  ...report.map(r => `| ${r.ok ? '✅' : '❌'} | ${esc(r.name)} | ${r.type} | ${r.ok ? r.count : esc(r.error)} | ${esc(r.url)} |`),
  '',
  '실패 소스는 `enabled=0`으로 꺼졌다. 대체 주소를 찾으면 인사이트 > 소스 관리에서 URL 수정 후 [테스트] → 켜기.',
]
writeFileSync('SOURCES_REPORT.md', lines.join('\n') + '\n')
console.log(`통과 ${ok} / 실패 ${failed} → SOURCES_REPORT.md`)
