# Frame Plus ERP — 개발 진행 현황 (PROGRESS.md)

> 마지막 업데이트: 2026-05-28

---

## ✅ 완료된 작업

### P0: 보안 긴급 패치 (2026-05-28)
- [x] Auth 미들웨어 적용 — 모든 `/api/*` 엔드포인트에 세션 검증 (health, login, init-tables 제외)
- [x] PBKDF2-SHA256 비밀번호 해싱 (100k iterations, Web Crypto API)
- [x] 평문 비밀번호 자동 업그레이드 (로그인 시 PBKDF2로 마이그레이션)
- [x] CEO 계정 생성 (`ceo` / `FramePlus2026!`), 기본 admin 비활성화 (프로덕션)
- [x] Cloudflare Pages 수동 배포 완료

### Notion 연동 — 스키마 정렬 + 데이터 마이그레이션 (2026-05-28)

#### C: 스키마 갭 분석 & 정렬
- [x] Notion 워크스페이스 전체 스캔 (300+ 항목, 8 DB, 11명 직원)
- [x] 7개 핵심 DB 프로퍼티 스키마 상세 추출
- [x] GAP 분석: Notion vs ERP 구조 비교
- [x] 스키마 정렬 — 13개 ALTER TABLE 컬럼 추가:
  - `projects`: scope_tags, project_type, construction_status
  - `vendors`: category, bank_info, trade_amount
  - `users`: position, hire_date, dept
  - `expenses`: payment_due, vendor_id, amount_vat, has_invoice
  - `consultations`: privacy_agreed, marketing_agreed, area_text
- [x] 신규 테이블 2개 생성: `leave_requests`, `leave_types`
- [x] CRUD 라우트 추가: `/api/leave-requests`, `/api/leave-types`

#### A: 데이터 마이그레이션
- [x] Notion API 연동 (`POST /api/migrate-notion`)
- [x] 7개 타겟 마이그레이션 (projects, vendors, users, consultations, expenses, leave_requests, leave_types)
- [x] ID 충돌 수정: `slice(0,12)` → 풀 UUID 32자 (`notion-` + 32hex)
- [x] 에러 로깅 (errorSamples 최대 5건)
- [x] 배치 처리 (batch_size/batch_offset) — D1 subrequest limit 대응
- [x] batchOffset>0 시 DELETE 스킵 (중간 배치에서 데이터 보존)
- [x] NOTION_TOKEN Cloudflare secret 등록
- [x] 프로덕션 마이그레이션 완료 — 전체 2,047+ 레코드, 0 errors

### P1: 프로젝트 상세 모드 (2026-05-28)
- [x] `dbToProject` / `projectToDb` — Notion 필드 추가 (projectType, constructionStatus, scopeTags)
- [x] `projTypeBadge()`, `scopeTagBadges()`, `constrStatusBadge()` 헬퍼 함수
- [x] 프로젝트 목록 UI — 타입 뱃지, 공사범위 태그, 공사상태 표시
- [x] Overview 강화:
  - 프로젝트 정보 카드 (project_type, construction_status, scope_tags, 주소, 연락처, 이메일, 메모)
  - 연관 상담 연결 (고객사명 매칭)
  - 최근 활동 타임라인 (발주/노무/지출 최근 5건)
- [x] 프로젝트 추가/편집 모달에 새 필드 3개
- [x] 검색 필터 확장 (프로젝트구분, 공사범위, 담당자도 검색)

### P2: 영업 모듈 강화 (2026-05-28)
- [x] **7단계 파이프라인 칸반 UI** — 초기상담/니즈파악/제안준비/제안완료/계약진행/실주/보류
  - `PIPELINE_STAGES`, `PIPELINE_COLORS`, `PIPELINE_ICONS` 상수
  - `renderConsultKanban()` — 칸반 컬럼 렌더링
  - `renderKanbanCard()` — 드래그 가능한 카드
  - 칸반/리스트 뷰 토글 버튼
- [x] **드래그앤드롭** — `dragConsultStart()`, `dragConsultEnd()`, `dropConsultCard()`
  - 단계 변경 시 DB 자동 반영 (`POST /api/consultations`)
  - `mapStatusToPipeline()` — 기존 status → pipeline_stage 자동 매핑 (legacy 호환)
- [x] **DB 스키마 확장** (consultations):
  - `pipeline_stage`, `expected_amount`, `expected_close_date`, `lost_reason`
- [x] **RFP 입찰관리 강화**:
  - `evaluation_score`, `team_members`, `competitors`, `presentation_date`, `go_nogo` 컬럼 추가
  - RFP 테이블에 평가점수, Go/NoGo, 팀·경쟁사 컬럼 표시
  - RFP 등록/편집 모달에 "🏆 입찰관리" 섹션 추가
- [x] 파이프라인 KPI 요약바 (단계별 건수 + 금액)

### P3: 견적 프리뷰 6탭 + Gantt 9단계 (2026-05-28)
- [x] **견적 프리뷰 6탭** (기존 5탭에서 확장):
  - 표지 / 요약 / 상세내역서 / 집계표 / 공정표 / **대금조건(NEW)**
- [x] **`buildPvPayment()` 대금조건 탭**:
  - 총 계약금액 헤더, 대금 스케줄 테이블 (비율/금액/납부기한/비고)
  - 대금 지급 일정 시각 바
  - 공정 연계 마일스톤 (착공/중간검수/준공)
  - 대금지급 조건 6조항 + 입금계좌 안내
- [x] **`GANTT_PHASES` 9단계 상수** — 준비/선행/골조/설비마감/마감1/마감2/설치/부속/마무리
  - `getCatPhase()` — C01~C18 → 9단계 Phase 그룹 매핑
  - 공정표 프리뷰에 Phase 요약 카드 추가
  - 테이블에 "단계" 컬럼 추가 (Phase 뱃지)
- [x] 견적서 메인 화면에 "공정표 자동생성" 버튼 추가
- [x] `autoGenerateGantt()` 기존 엔진 정상 작동 (카테고리→Phase 매핑)

---

## 🔲 미완료 / 다음 작업

### P4: 디자인 모듈 (5개 뷰)
- [ ] 디자인 파일 관리, 갤러리 뷰, 시안 비교

### P5: 현장 관리
- [ ] 사진 관리, 분석 테이블

### P6: 프리셋 3-레벨 드릴다운 + PO Form
- [ ] 프리셋 → 공종 → 항목 3단계 + 발주서 양식

### P7: CSS/테스트/배포 최적화
- [ ] UI 다듬기, 성능 개선

### P8: 부가 모듈
- [ ] 개인페이지, 회의 cron, 문의 폼, 휴가 워크플로우

---

## 📊 코드 규모

| 항목 | 수치 |
|------|------|
| src/index.tsx (백엔드) | ~1,730+ lines |
| public/static/app.js (프론트) | ~9,700+ lines, 410+ functions |
| D1 테이블 | 28개 |
| API 엔드포인트 | 42+ |
| 빌드 크기 | ~127 KB (_worker.js) |
| 프로덕션 데이터 | 2,047+ 레코드 |

## 🔗 Git Log (최근)
| 커밋 | 내용 |
|------|------|
| `2fe0a89` | P3: 견적 프리뷰 6탭 + GANTT_PHASES 9단계 + 대금조건 탭 |
| `b1adb16` | P2: 영업 모듈 강화 — 7단계 칸반 파이프라인 + RFP 입찰관리 |
| `9fdbb93` | PROGRESS.md 업데이트: P1 완료 |
| `c2aab8b` | P1: 프로젝트 상세 모드 개선 + Notion 필드 통합 |
| `e9227f2` | Notion migration: 배치 처리 + 에러 로깅 |
| `d0752ec` | Notion 연동: 스키마 정렬 + 데이터 마이그레이션 API + ID충돌 수정 |
| `3187399` | CRITICAL: Auth middleware + PBKDF2 password hashing |

## 🔑 이어서 작업 시 참고사항

### 환경 설정
- **GitHub**: `https://github.com/frameplus/frameplus.git` (main 브랜치)
- **Cloudflare Pages**: `frameplus-erp` 프로젝트 → `https://frameplus-erp.pages.dev`
- **D1 Database**: `frameplus-erp-production` (database_id: `25dbe1fb-b659-41c8-9fa0-8c8c54280244`)
- **NOTION_TOKEN**: Cloudflare secret으로 등록 완료 (값은 Cloudflare 콘솔에서 확인)
- **PM2 설정**: `ecosystem.config.cjs` — `wrangler pages dev dist --d1=frameplus-erp-production --local --ip 0.0.0.0 --port 3000`

### 빌드/배포 명령
```bash
cd /home/user/webapp
npm run build                                               # Vite 빌드
pm2 start ecosystem.config.cjs                              # 로컬 서버 시작
npx wrangler pages deploy dist --project-name frameplus-erp # 프로덕션 배포
```

### 로컬 DB 접근
```bash
# admin/admin1234 로 로그인 (로컬)
# 프로덕션: ceo/FramePlus2026!
```
