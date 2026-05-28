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
- [x] 전체 재마이그레이션 완료 (로컬):

| 테이블 | Notion 원본 | 마이그레이션 | 비고 |
|--------|------------|------------|------|
| projects | 133 | 133 | 공사진행상태, 프로젝트구분, 공사범위 포함 |
| vendors | 224 | 224 | 업종, 계좌정보 포함 |
| employees → users | 11 | 11 | 직책, 입사일 매핑, 비밀번호 자동생성 |
| consultations | 34 | 34 | 개인정보동의, 마케팅동의 포함 |
| expenses | 1,541 | 1,541 | VAT포함금액, 계산서여부 포함 |
| leave_requests | 68 | 68 | 승인상태 매핑 |
| leave_types | 8 | 8 | 연차소비여부 포함 |
| **합계** | **2,019** | **2,019** | |

---

## 🔲 미완료 / 다음 작업

### 즉시 (이번 세션)
- [x] 빌드 후 users SELECT 쿼리 반영 확인
- [x] ID 충돌 수정 후 전체 재마이그레이션
- [ ] Cloudflare Pages 프로덕션 배포
- [ ] NOTION_TOKEN Cloudflare secret 등록
- [ ] 프로덕션 환경에서 마이그레이션 실행
- [ ] 프로덕션 데이터 무결성 검증

### P1: 프로젝트 상세 모드 (다음 단계)
- [ ] PROJECT_NAV 네비게이션 (5개 탭: 개요/예산/공정/보고/첨부)
- [ ] enterProject() 함수 구현
- [ ] 4개 신규 뷰 (예산요약, 공정표, 보고서, 첨부파일)

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
| src/index.tsx (백엔드) | ~1,500+ lines |
| public/static/app.js (프론트) | ~9,200+ lines, 380+ functions |
| D1 테이블 | 28개 (+2: leave_requests, leave_types) |
| API 엔드포인트 | 40+ |
| 빌드 크기 | ~126 KB (_worker.js) |
| Notion 마이그레이션 데이터 | 2,019 레코드 |
