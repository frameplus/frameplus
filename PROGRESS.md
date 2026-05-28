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

#### A: Notion → D1 데이터 마이그레이션
- [x] Migration API 구현 (`/api/notion/migrate/:target`) — 7개 타겟, merge/replace 모드
- [x] Notion API 헬퍼 함수 구현 (nText, nSelect, nMultiSelect, nNumber, nDate 등)
- [x] **ID 충돌 버그 수정** — `slice(0,12)` → 전체 UUID 사용 (32자 hex)
- [x] **배치 처리 추가** — D1 subrequest 제한 해결 (batch_size/batch_offset)
- [x] **프로덕션 마이그레이션 완료** — 전체 2,019 레코드, 에러 0

| 테이블 | Notion 원본 | 프로덕션 | 비고 |
|--------|------------|---------|------|
| projects | 133 | 153 (+20 기존) | 공사진행상태, 프로젝트구분, 공사범위 포함 |
| vendors | 224 | 228 (+4 기존) | 업종, 계좌정보 포함 |
| employees → users | 11 | 13 (+2 기존) | 직책, 입사일 매핑, 비밀번호 자동생성 |
| consultations | 34 | 35 (+1 기존) | 개인정보동의, 마케팅동의 포함 |
| expenses | 1,541 | 1,542 (+1 기존) | VAT포함금액, 계산서여부, 배치 처리(200건/batch) |
| leave_requests | 68 | 68 | 승인상태 매핑 |
| leave_types | 8 | 8 | 연차소비여부 포함 |
| **합계** | **2,019** | **2,047** | |

- [x] NOTION_TOKEN Cloudflare secret 등록

### P1: 프로젝트 상세 모드 개선 (2026-05-28)
- [x] `dbToProject`/`projectToDb`에 Notion 신규 필드 추가 (projectType, constructionStatus, scopeTags)
- [x] 프로젝트 목록 UI 개선:
  - 프로젝트 구분 배지 (인테리어/리모델링/신축/부분시공/설계/AS — 컬러코딩)
  - 공사 범위 태그 표시 (최대 3개 + overflow)
  - 공사 상태 아이콘 (시공예정🟡/시공중🔵/시공완료🟢/하자보수🔴)
- [x] Overview 헤더에 프로젝트 구분/공사 상태 배지 추가
- [x] Overview 하단 2-컬럼 추가:
  - 프로젝트 정보 상세 카드 (구분/상태/범위/주소/연락처/이메일/메모)
  - 연관 상담 연결 (고객사명 매칭으로 상담 이력 표시)
  - 최근 활동 타임라인 (발주/노무/지출 최근 5건)
- [x] 프로젝트 추가/편집 모달에 새 필드 추가 (프로젝트구분, 공사상태, 공사범위)
- [x] 검색 필터 확장 (프로젝트구분, 공사범위, 담당자도 검색)
- [x] `projTypeBadge()`, `scopeTagBadges()`, `constrStatusBadge()` 헬퍼 함수

---

## 🔲 미완료 / 다음 작업

### P2: 영업 모듈
- [ ] 7단계 칸반 (상담→계약)
- [ ] RFP 제안서 관리

### P3: 견적 5탭 미리보기 + Gantt 자동생성
### P4: 디자인 모듈 (5개 뷰)
### P5: 현장 관리
### P6: 프리셋 3-레벨 드릴다운 + PO Form
### P7: CSS/테스트/배포 최적화
### P8: 부가 모듈 (개인페이지, 회의 cron, 문의 폼, 휴가 워크플로우)

---

## 📊 코드 규모

| 항목 | 수치 |
|------|------|
| src/index.tsx (백엔드) | ~1,550+ lines |
| public/static/app.js (프론트) | ~9,300+ lines, 390+ functions |
| D1 테이블 | 28개 |
| API 엔드포인트 | 40+ |
| 빌드 크기 | ~126 KB (_worker.js) |
| 프로덕션 데이터 | 2,047 레코드 |

## 🔗 Git Log (최근)
| 커밋 | 내용 |
|------|------|
| `c2aab8b` | P1: 프로젝트 상세 모드 개선 + Notion 필드 통합 |
| `e9227f2` | Notion migration: 배치 처리 + 에러 로깅 |
| `d0752ec` | Notion 연동: 스키마 정렬 + 데이터 마이그레이션 API + ID충돌 수정 |
| `3187399` | CRITICAL: Auth middleware + PBKDF2 password hashing |
