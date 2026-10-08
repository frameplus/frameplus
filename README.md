# Frame Plus ERP v8.0 - Full-Stack Edition

## Project Overview
- **Name**: Frame Plus ERP v8.0
- **Goal**: 인테리어 시공 업체를 위한 통합 ERP 시스템 (견적/계약/공정/수금/발주/경영/인사 관리)
- **Stack**: Hono + Cloudflare Pages + D1 Database (SQLite)
- **Features**: 로그인/RBAC, 다기기 동기화, 엑셀 내보내기, PDF 생성, 모바일 반응형, 다크모드

## URLs
- **Production**: https://frameplus-erp.pages.dev
- **GitHub**: https://github.com/frameplus/frameplus

## JOBS 앱 (현장 반장 기록 · 청구 · 입금) — 1~4차
- **경로**: `/jobs/` (모바일 PWA, 휴대폰 OTP 로그인 — ERP 계정과 무관) · 공개 청구서 `/jobs/v/:token` · 공개 견적서 `/jobs/q/:token` · 약관 `/jobs/legal/{terms,privacy,location}` · API `/api/jobs/*`
- **코드**: `src/jobs/` (calc · schema · api · page), `public/static/jobs/`, `migrations/0005_jobs_core.sql`, 테스트 `npm test`
- **환경변수**: `JOBS_PUBLIC_ORIGIN`(공유 링크 origin), `SOLAPI_*`(인증 문자 · 청구서 문자), `RESEND_API_KEY`(청구서 · 견적서 메일), `JOBS_KAKAO_TPL_INVOICE|DUNNING|QUOTE`(알림톡 템플릿 ID, 심사 후), `JOBS_DEV_OTP=1`은 **로컬 전용**(인증번호를 응답에 표시)
- **R2 바인딩(선택)**: Pages → Settings → Bindings → R2 bucket `JOBS_PHOTOS`(버킷 `jobs-photos`). 있으면 사진을 R2 에, 없으면 D1 base64 에 저장. 로컬: `npx wrangler pages dev dist --local --r2 JOBS_PHOTOS --binding JOBS_DEV_OTP=1`
- **알림(4차)**: 웹 푸시(VAPID, RFC 8291 암호화 직접 구현) + 앱 알림함. 퇴근 알람 3회 → 90분 뒤 자동 퇴근 · 입금 예정 D-3 · 연체 · 평일 저녁 미기록. Pages 는 크론이 없어 별도 Worker `workers/jobs-cron`(10분마다)이 `POST /api/jobs/cron/run` 호출. 설정: `JOBS_VAPID_PUBLIC|PRIVATE|SUBJECT`, `JOBS_CRON_SECRET` — [docs/JOBS_NOTIFICATIONS.md](./docs/JOBS_NOTIFICATIONS.md)
- **입금 자동 기록(4차, S-27~29 대체)**: 은행 입금 문자 · 인터넷뱅킹 거래내역(엑셀 복사)을 붙여넣으면 `POST /api/jobs/payments/import` 가 날짜 · 금액 · 입금자만 읽어 매칭 ①금액 ②입금자명 · 규칙 ③확인 필요 → S-29 현장 지정 · «앞으로 이 입금자는 이 현장» 규칙. 잔액 · 계좌번호 · 원문 미저장, 같은 문자 재붙여넣기 · 직접 기록과 중복 방지, 한 번에 30건. 오픈뱅킹은 금융결제원 이용기관 등록 후
- **봇 «직접 묻기»(S-12)**: 카드 6종은 앱이 바로 답하고, 기간 · 현장을 콕 집은 질문만 `POST /api/jobs/bot/ask` → OpenAI(ERP 와 같은 `OPENAI_API_KEY`, 모델 `JOBS_AI_MODEL` 기본 gpt-4o-mini). 사용자당 하루 20회, 기록 요약만 전송(이름 · 전화번호 · 주소 · 사업자번호 · 입금자명 · 메모 · 위치 제외), 질문 문장은 저장 안 함. 키가 없으면 503 → 카드 답변으로 폴백
- **사진 주소**: 어느 저장소든 `/jobs/photo/:id?e=만료&s=서명`(HMAC-SHA256) 서명 URL 로만 열린다 — 앱 24시간 · 공개 청구서 6시간, 서명 없음 · 위조 · 만료는 403. 비밀키 `JOBS_URL_SECRET`(선택, 16자+) 없으면 첫 사용 시 자동 생성해 D1 `jobs_kv` 에 보관
- **네이티브 래핑**: `capacitor.config.ts` + [docs/JOBS_CAPACITOR.md](./docs/JOBS_CAPACITOR.md), 알림톡 문안 [docs/JOBS_KAKAO_TEMPLATES.md](./docs/JOBS_KAKAO_TEMPLATES.md)
- **검토 보고서**: [docs/JOBS_REVIEW.md](./docs/JOBS_REVIEW.md) — 구현 범위 · 실사용 판단 · 출시 리스크(위치정보 · 직업안정법 · 오픈뱅킹 · 스토어 정책) · 착수 순서

## 로그인 정보
| 계정 | 아이디 | 비밀번호 | 역할 |
|------|--------|----------|------|
| 기본 관리자 | admin | admin1234 | admin |
| (관리자 설정에서 직원 계정 추가 가능) | - | - | staff |

## 역할 기반 접근 제어 (RBAC)

| 기능 | 관리자 (admin) | 직원 (staff) |
|------|:-:|:-:|
| 대시보드 (수익/마진 포함) | O | X (프로젝트 건수/공정률 표시) |
| 경영 현황 | O | X |
| 현금 흐름 | O | X |
| 수익 분석 | O | X |
| 프로젝트 목록 (마진율 컬럼) | O | X (마진율 숨김) |
| 프로젝트 상세 (비용 구성) | O | X (작업 건수만 표시) |
| 프로젝트 예산 (원가/이익) | O | X (발주건수/인건비건수 표시) |
| 프로젝트 리포트 (재무상세) | O | X (공정률/수금률만 표시) |
| 수금 관리 (금액) | O | X (건수/수금률만 표시) |
| 리포트 (수익성탭) | O | X (인건비/지출 탭만) |
| 관리자 설정 | O | X |
| 그 외 모든 기능 | O | O |

## 완료된 기능 (v8.0 Value-Up 완료)

### Phase 0-2: 핵심 모듈 (16개 페이지)
1. **대시보드** - KPI 카드, 위험 알림, 주간 일정, 월별 매출 차트, 담당자별 KPI 현황
2. **프로젝트 목록** - CRUD, 검색/필터, 상태별 관리, 다중 담당자 배정
3. **견적 작성** - 18개 공종 아코디언 편집기, 실시간 합계, 단수정리, 18개 프리셋 완비
4. **공정표 (간트차트)** - 시각적 바 차트, 진행률 편집, 자동생성 엔진
5. **발주 관리** - 자동 발주서 생성, 거래처 자동완성, 거래처 정보 연동
6. **수금 관리** - 계약금/중도금/잔금 추적, 입금처리, 연체 알림
7. **계약서** - 도급계약서 자동 생성, 견적서→계약서 자동전환, AI 검토(데모), PDF
8. **미팅 캘린더** - 월간 캘린더 뷰, 미팅 CRUD
9. **고객 CRM** - 독립 고객 DB, CRUD, 등급 관리, 프로젝트 동기화
10. **단가 DB** - 공종별 단가 관리, 견적 연동
11. **거래처** - 업체 관리, 평점 시스템, 발주 자동연동
12. **세금계산서** - 매출/매입 분리, 월별 집계, 자동 세액 계산
13. **AS/하자보수** - 접수/처리/완료 추적
14. **팀원 관리** - 프로필 카드, 프로젝트 배정 현황
15. **리포트** - 수익성 분석, 인건비/지출 현황, 차트
16. **관리자** - 회사 정보, 사용자 관리, 시스템 설정, 데이터 관리, 공지사항

### Phase 3: 영업 모듈
- **상담 관리** - 상담 접수/진행/완료 추적
- **RFP/제안** - 제안서 관리, 상태 추적

### Phase 4: 견적 미리보기 5탭 시스템 + Gantt 자동생성
- 견적 미리보기 (표지/견적표/내역서/공정표/조건)
- 공정표(Gantt) 자동 생성 엔진

### Phase 5-6: 수금/세금계산서 강화
- 수금 관리 고도화 (캘린더/고객별 뷰, 연체 알림)
- 세금계산서 매입 관리 추가

### Phase 7: 로그인 + RBAC
- ID/비밀번호 로그인 시스템 (24시간 세션)
- 역할 기반 접근 제어 (admin/staff)
- 직원용 대시보드 (수익/마진 데이터 제외)
- 사용자 관리 CRUD (관리자 설정 내)

### Phase 8: 최종 통합
- 리포트/예산/수금 페이지 RBAC 적용
- ERP 프로젝트 상세 (Overview/Budget/Report) RBAC 적용
- 데이터 무결성 검사 강화 (12개 항목)
- JS 문법 오류 수정, 버전 v8.0 업데이트

### v8.0 Value-Up (최신)
- **v8.0 버전 표기 통일** (백엔드/프론트엔드 모두 v8.0)
- **18개 공종 프리셋 완비** (기존 4개 → 18개 전체)
- **Open-Meteo 날씨 API** (무료, 키 불필요, 5일 예보 포함)
- **인건비 월별 그룹 뷰** (아코디언 UI, 월별 미니차트)
- **CRM 독립 고객 DB** (등급 관리 S~D, 프로젝트 동기화, 미등록 고객 감지)
- **ERP 첨부파일 관리** (드래그앤드롭 업로드, 폴더별 관리, 미리보기, 다운로드)
- **거래처→발주 자동연동** (datalist 자동완성, 거래처 정보 자동표시)
- **견적서→계약서 자동전환** (수금일정/조항 자동생성, 공종별 내역 포함)
- **다중 담당자 배정** (프로젝트 생성/편집 시 체크박스 복수 선택)
- **담당자별 KPI 뷰** (대시보드에 매출/비용/수익률 퍼포먼스 테이블)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET | /api/auth/me | 세션 확인 |
| GET/POST | /api/users | 사용자 목록/생성 |
| PUT/DELETE | /api/users/:id | 사용자 수정/삭제 |
| GET | /api/health | 서버 상태 확인 |
| GET | /api/weather | 현재 날씨 (Open-Meteo) |
| GET | /api/weather/forecast | 5일 날씨 예보 |
| GET/POST | /api/projects | 프로젝트 목록/생성 |
| GET/PUT/DELETE | /api/projects/:id | 프로젝트 조회/수정/삭제 |
| GET/POST | /api/vendors | 거래처 목록/생성 |
| GET/POST | /api/meetings | 미팅 목록/생성 |
| GET/POST | /api/pricedb | 단가DB 목록/생성 |
| GET/POST | /api/orders | 발주 목록/생성 |
| GET/POST | /api/as | AS 목록/생성 |
| GET/POST | /api/notices | 공지사항 목록/생성 |
| GET/POST | /api/tax | 세금계산서 목록/생성 |
| GET/POST | /api/templates | 메시지 템플릿 목록/생성 |
| GET/POST | /api/team | 팀원 목록/생성 |
| GET/POST | /api/labor | 인건비 목록/생성 |
| GET/POST | /api/expenses | 지출결의 목록/생성 |
| GET/POST | /api/consultations | 상담 목록/생성 |
| GET/POST | /api/rfp | RFP 목록/생성 |
| GET/POST | /api/notifications | 알림 목록/생성 |
| GET/POST | /api/approvals | 결재 목록/생성 |
| GET/POST | /api/clients | 고객 목록/생성 |
| GET/PUT/DELETE | /api/clients/:id | 고객 조회/수정/삭제 |
| GET/POST | /api/erp-attachments | 첨부파일 목록/생성 |
| GET/DELETE | /api/erp-attachments/:id | 첨부파일 조회/삭제 |
| GET/PUT | /api/company | 회사 정보 조회/수정 |
| GET/POST | /api/leave-requests | 휴가신청 목록/생성 |
| GET/PUT/DELETE | /api/leave-requests/:id | 휴가신청 조회/수정/삭제 |
| GET/POST | /api/leave-types | 휴가유형 목록/생성 |
| GET | /api/notion/status | Notion 마이그레이션 현황 |
| POST | /api/notion/migrate/:target | Notion 데이터 마이그레이션 |

## Data Architecture
- **Database**: Cloudflare D1 (SQLite 기반, 글로벌 분산)
- **Tables**: users, sessions, company, team, projects, vendors, meetings, pricedb, orders_manual, as_list, notices, tax_invoices, msg_templates, labor_costs, expenses, item_images, work_presets, notifications, pricedb_history, estimate_template_sets, approvals, user_prefs, consultations, rfp, clients, erp_attachments, leave_requests, leave_types
- **Notion Integration**: 7개 DB 연동 (projects, vendors, employees, consultations, expenses, leave_requests, leave_types) — 총 2,019 레코드 마이그레이션
- **Frontend Cache**: API 응답을 메모리에 캐시하여 UI 성능 최적화
- **인증**: 세션 기반 (24시간 만료, X-Session-Id 헤더)

## Code Metrics
- **app.js**: ~9,200+ lines, 380+ functions
- **src/index.tsx**: ~1,500+ lines (backend)
- **Built output**: ~126 KB (_worker.js)
- **D1 Tables**: 28개
- **API Endpoints**: 40+
- **Phase 완료**: 8/8 + Value-Up + Notion연동
- **Notion 마이그레이션**: 2,019 레코드 (7개 DB)

## Tech Stack
- **Backend**: Hono v4 (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + CSS (Custom Design System)
- **Charts**: Chart.js 4.4
- **Excel**: SheetJS (xlsx)
- **PDF**: html2pdf.js
- **Weather**: Open-Meteo API (free)
- **Fonts**: Noto Serif KR, Noto Sans KR

## Development
```bash
# Install
npm install

# Build
npm run build

# Local dev with D1
npm run db:migrate:local
npm run db:seed
npm run dev:sandbox

# Deploy
npm run deploy
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Active (Production)
- **Last Updated**: 2026-05-28

## 향후 개발 로드맵
- [ ] P1: 프로젝트 상세 모드 (PROJECT_NAV, 5탭 뷰)
- [ ] P2: 영업 모듈 (7단계 칸반, RFP 관리)
- [ ] P3: 견적 5탭 미리보기 + Gantt 자동생성
- [ ] P4: 디자인 모듈 (5개 뷰)
- [ ] P5: 현장 관리
- [ ] P6: 프리셋 3-레벨 드릴다운 + PO Form
- [ ] P7: CSS/테스트/배포 최적화
- [ ] P8: 부가 모듈 (개인페이지, 회의 cron, 문의 폼, 휴가 워크플로우)

> 상세 진행 현황은 [PROGRESS.md](./PROGRESS.md) 참조
