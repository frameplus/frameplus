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
| 대시보드 (수익/마진 포함) | ✅ | ❌ (프로젝트 건수/공정률 표시) |
| 경영 현황 | ✅ | ❌ |
| 현금 흐름 | ✅ | ❌ |
| 수익 분석 | ✅ | ❌ |
| 프로젝트 목록 (마진율 컬럼) | ✅ | ❌ (마진율 숨김) |
| 프로젝트 상세 (비용 구성) | ✅ | ❌ (작업 건수만 표시) |
| 프로젝트 예산 (원가/이익) | ✅ | ❌ (발주건수/인건비건수 표시) |
| 프로젝트 리포트 (재무상세) | ✅ | ❌ (공정률/수금률만 표시) |
| 수금 관리 (금액) | ✅ | ❌ (건수/수금률만 표시) |
| 리포트 (수익성탭) | ✅ | ❌ (인건비/지출 탭만) |
| 관리자 설정 | ✅ | ❌ |
| 그 외 모든 기능 | ✅ | ✅ |

## 완료된 기능 (8 Phase 완료)

### Phase 0-2: 핵심 모듈 (16개 페이지)
1. **대시보드** - KPI 카드, 위험 알림, 주간 일정, 월별 매출 차트
2. **프로젝트 목록** - CRUD, 검색/필터, 상태별 관리
3. **견적 작성** - 18개 공종 아코디언 편집기, 실시간 합계, 단수정리
4. **공정표 (간트차트)** - 시각적 바 차트, 진행률 편집, 자동정렬
5. **발주 관리** - 자동 발주서 생성, 상세 편집, 이메일 발송
6. **수금 관리** - 계약금/중도금/잔금 추적, 입금처리, 연체 알림
7. **계약서** - 도급계약서 자동 생성, AI 검토(데모), PDF 다운로드
8. **미팅 캘린더** - 월간 캘린더 뷰, 미팅 CRUD
9. **고객 CRM** - 프로젝트 기반 고객 데이터 집계
10. **단가 DB** - 공종별 단가 관리, 견적 연동
11. **거래처** - 업체 관리, 평점 시스템
12. **세금계산서** - 매출/매입 분리, 월별 집계, 자동 세액 계산
13. **AS·하자보수** - 접수/처리/완료 추적
14. **팀원 관리** - 프로필 카드, 프로젝트 배정 현황
15. **리포트** - 수익성 분석, 인건비/지출 현황, 차트
16. **관리자** - 회사 정보, 사용자 관리, 시스템 설정, 데이터 관리, 공지사항

### Phase 3: 영업 모듈
- **상담 관리** - 상담 접수/진행/완료 추적
- **RFP·제안** - 제안서 관리, 상태 추적

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

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET | /api/auth/me | 세션 확인 |
| GET/POST | /api/users | 사용자 목록/생성 |
| PUT/DELETE | /api/users/:id | 사용자 수정/삭제 |
| GET | /api/health | 서버 상태 확인 |
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
| GET/PUT | /api/company | 회사 정보 조회/수정 |

## Data Architecture
- **Database**: Cloudflare D1 (SQLite 기반, 글로벌 분산)
- **Tables**: users, sessions, company, team, projects, vendors, meetings, pricedb, orders_manual, as_list, notices, tax_invoices, msg_templates, labor_costs, expenses, item_images, work_presets, notifications, pricedb_history, estimate_template_sets, approvals, user_prefs, consultations, rfp
- **Frontend Cache**: API 응답을 메모리에 캐시하여 UI 성능 최적화
- **인증**: 세션 기반 (24시간 만료, X-Session-Id 헤더)

## Code Metrics
- **app.js**: 7,758 lines, 352 functions
- **src/index.tsx**: ~1,264 lines (backend)
- **Built output**: ~96 KB (_worker.js)

## Tech Stack
- **Backend**: Hono v4 (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + CSS (Custom Design System)
- **Charts**: Chart.js 4.4
- **Excel**: SheetJS (xlsx)
- **PDF**: html2pdf.js
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
- **Status**: ✅ Production Active
- **Last Updated**: 2026-02-19

## 향후 개발 예정
- [ ] 담당자 여러명 지정 기능
- [ ] 개인 KPI 확인 기능
- [ ] 날씨 API 연동
- [ ] 실시간 알림 (Push)
