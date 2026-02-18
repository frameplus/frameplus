# Frame Plus ERP v5 - Full-Stack Edition

## Project Overview
- **Name**: Frame Plus ERP v5
- **Goal**: 인테리어 시공 업체를 위한 통합 ERP 시스템 (견적/계약/공정/수금/발주 관리)
- **Stack**: Hono + Cloudflare Pages + D1 Database (SQLite)
- **Features**: 다기기 동기화, 엑셀 내보내기, PDF 생성, 모바일 반응형

## URLs
- **Sandbox**: https://3000-idjdo1hqq5ps3s4amck89-8f57ffe2.sandbox.novita.ai

## Completed Features

### Core Modules (16 pages)
1. **대시보드** - KPI 카드, 위험 알림, 주간 일정, 월별 매출 차트
2. **프로젝트 목록** - CRUD, 검색/필터, 상태별 관리
3. **견적 작성** - 18개 공종 아코디언 편집기, 실시간 합계, 단수정리
4. **공정표 (간트차트)** - 시각적 바 차트, 진행률 편집, 자동정렬
5. **발주 관리** - 자동 발주서 생성, 상세 편집, 이메일 발송
6. **수금 관리** - 계약금/중도금/잔금 추적, 입금처리
7. **계약서** - 도급계약서 자동 생성, AI 검토(데모), PDF 다운로드
8. **미팅 캘린더** - 월간 캘린더 뷰, 미팅 CRUD
9. **고객 CRM** - 프로젝트 기반 고객 데이터 집계
10. **단가 DB** - 공종별 단가 관리, 견적 연동
11. **거래처** - 업체 관리, 평점 시스템
12. **세금계산서** - 발행 관리, 자동 세액 계산
13. **AS·하자보수** - 접수/처리/완료 추적
14. **팀원 관리** - 프로필 카드, 프로젝트 배정 현황
15. **리포트** - 수익성 분석, 상태별/공종별 차트
16. **관리자** - 회사 정보, 데이터 백업/복구, 공지사항

### New in v5 (vs v4)
- **D1 Database Backend**: localStorage -> Cloudflare D1 (다기기 동기화)
- **REST API**: Hono 기반 CRUD API 엔드포인트
- **엑셀 내보내기**: SheetJS 연동으로 실제 .xlsx 파일 생성
- **PDF 생성**: html2pdf.js 연동으로 PDF 다운로드
- **모바일 반응형**: 
  - 하단 네비게이션 바
  - 사이드바 슬라이드 메뉴
  - 반응형 그리드 (4→2→1 컬럼)
  - 터치 친화적 UI
- **계약서 페이지**: 도급계약서 자동 생성/편집/출력

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
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
| GET/PUT | /api/company | 회사 정보 조회/수정 |

## Data Architecture
- **Database**: Cloudflare D1 (SQLite 기반, 글로벌 분산)
- **Tables**: company, team, projects, vendors, meetings, pricedb, orders_manual, as_list, notices, tax_invoices, msg_templates
- **Frontend Cache**: API 응답을 메모리에 캐시하여 UI 성능 최적화

## Tech Stack
- **Backend**: Hono v4 (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + CSS (CDN: TailwindCSS not used, custom CSS)
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
- **Status**: Development (Sandbox)
- **Last Updated**: 2026-02-18
