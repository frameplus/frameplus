# Frame Plus ERP v8.0 - Full-Stack Edition

## Project Overview
- **Name**: Frame Plus ERP v8.0
- **Goal**: 인테리어 시공 업체를 위한 통합 ERP 시스템 (견적/계약/공정/수금/발주/경영/인사 관리)
- **Stack**: Hono + Cloudflare Pages + D1 Database (SQLite)
- **Features**: 로그인/RBAC, 다기기 동기화, 엑셀 내보내기, PDF 생성, 모바일 반응형, 다크모드

## URLs
- **Production**: https://frameplus-erp.pages.dev
- **GitHub**: https://github.com/frameplus/frameplus

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

## Data Architecture
- **Database**: Cloudflare D1 (SQLite 기반, 글로벌 분산)
- **Tables**: users, sessions, company, team, projects, vendors, meetings, pricedb, orders_manual, as_list, notices, tax_invoices, msg_templates, labor_costs, expenses, item_images, work_presets, notifications, pricedb_history, estimate_template_sets, approvals, user_prefs, consultations, rfp, clients, erp_attachments
- **Frontend Cache**: API 응답을 메모리에 캐시하여 UI 성능 최적화
- **인증**: 세션 기반 (24시간 만료, X-Session-Id 헤더)

## Code Metrics
- **app.js**: ~8,100+ lines, 380+ functions
- **src/index.tsx**: ~1,290+ lines (backend)
- **Built output**: ~109 KB (_worker.js)
- **D1 Tables**: 26개
- **API Endpoints**: 35+
- **Phase 완료**: 8/8 + Value-Up

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
- **Last Updated**: 2026-02-19

## 향후 개발 가능 영역
- [ ] 실시간 알림 (SSE/폴링)
- [ ] AI 계약서 리스크 분석 (OpenAI 연동)
- [ ] 현장용 모바일 전용 뷰
- [ ] 이메일 발송 실제 API 연동 (Resend/SendGrid)
- [ ] 엑셀 업로드 (SheetJS 연동)
