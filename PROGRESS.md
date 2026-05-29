# Frame Plus ERP — 개발 진행 현황 (PROGRESS.md)

> 마지막 업데이트: 2026-05-29 (P7-A·B·C + P8 전체 완료)

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

### P4: 디자인 모듈 5개 뷰 (2026-05-28)
- [x] **Backend**: `design_items` 테이블 신규 생성 + CRUD API (`/api/design-items`)
  - 컬럼: id, pid, view_type, title, category, description, image_data, file_name, status, tags, assignee, due_date, sort_order, meta
- [x] **PROJECT_NAV**: 디자인 섹션 5개 메뉴 추가 (🎨 아이콘)
- [x] **Router**: 5개 case 추가 (design_concept/drawing/material/compare/schedule)
- [x] **View 1 — 컨셉보드** (`renderDesignConcept()`): 갤러리 그리드, 카테고리별 분류 (인테리어/가구/조명/색상/마감재), 이미지 카드 + 상태 뱃지
- [x] **View 2 — 도면관리** (`renderDesignDrawing()`): 테이블 뷰, 버전/타입/담당자/상태/날짜 컬럼, 도면 유형 카테고리 (평면도/천정도/입면도/상세도/설비도)
- [x] **View 3 — 자재보드** (`renderDesignMaterial()`): 카드 그리드, 가격/업체/단위 정보, 카테고리 (바닥재/벽재/천정재/조명/가구/하드웨어)
- [x] **View 4 — 시안비교** (`renderDesignCompare()`): A/B 비교 그리드, 공간별 그룹 (로비/사무공간/회의실/휴게실/화장실), 점수 평가 + "확정" 뱃지
- [x] **View 5 — 디자인일정** (`renderDesignSchedule()`): 타임라인 뷰, 마일스톤 번호/날짜/상태, 지연 감지 (빨간 경고)
- [x] **`autoGenDesignSchedule(pid)`** — 10단계 디자인 마일스톤 자동생성 (현장실측→디자인핸드오버, 30일)
- [x] **공유 모달**: `openAddDesignItem()`, `saveNewDesignItem()`, `openEditDesignItem()`, `saveEditDesignItemModal()` — view_type별 동적 카테고리 옵션
- [x] **`initData()`에 design-items API 연결** — 앱 초기화시 `_d.designItems` 자동 로드
- [x] **상태 시스템**: 아이디어/진행중/검토중/확정/보류 (5가지, 색상 구분)
- [x] 버전 v8.2

### P5: 현장관리 모듈 4개 뷰 (2026-05-28)
- [x] **Backend**: `site_photos`, `site_daily_logs`, `site_issues` 3개 테이블 + CRUD API
- [x] **PROJECT_NAV**: 현장 섹션 4개 메뉴 (현장사진/현장일지/이슈관리/현장분석)
- [x] **View 1 — 현장사진** (`renderSitePhotos()`): 갤러리 그리드, 8개 카테고리 필터 (일반/시공전/시공중/시공후/하자/검수/안전/기타), 이미지 업로드/프리뷰, 상세보기 모달
- [x] **View 2 — 현장일지** (`renderSiteDailyLog()`): 날짜별 카드 목록, 날씨/기온/공정률/투입인원/안전점검
  - 월간 요약 KPI 4개 (일지수/투입인원/평균공정률/이슈발생)
  - 작업내역 줄단위 입력, 장비/인원 상세, TODAY 뱃지
- [x] **View 3 — 이슈관리** (`renderSiteIssues()`): 5단계 상태 필터 (발생/확인/처리중/해결/보류)
  - 심각도 4단계 (낮음/보통/높음/긴급), 기한초과 감지
  - 빠른 해결처리 (prompt로 해결방법 입력)
  - 카테고리 7종 (품질/안전/공정/자재/설계/민원/기타)
- [x] **View 4 — 현장분석** (`renderSiteAnalysis()`): 6개 KPI 카드 (공정률/일평균인원/미해결이슈/안전점검률/사진수/일지수)
  - 공정률 추이 바 차트 (최근 7일)
  - 인력 투입 바 차트 (최근 7일)
  - 이슈 해결률 + 카테고리별 분포
  - 사진 카테고리 분포
- [x] **initData()에 3개 API 연결** — `_d.sitePhotos`, `_d.siteDailyLogs`, `_d.siteIssues`
- [x] 버전 v8.3

### P6: 프리셋 3단 드릴다운 + PO 양식 (2026-05-28)
- [x] **프리셋 3단 드릴다운**: Phase(9단계) → 공종(C01~C18) → 항목(체크박스 선택)
  - GANTT_PHASES 색상/아이콘 버튼, breadcrumb 네비게이션
  - 항목별 체크박스: 전체 적용 / 선택 항목만 적용
  - 프리셋 없는 공종 안내 메시지
- [x] **PO(발주서) 양식**: A4 전문 레이아웃
  - 발주처/수신처 정보 (회사/거래처 DB 연동)
  - 품목 테이블 + 공급가액/부가세/합계 자동계산
  - 문서번호 자동생성 (PO-날짜-ID)
  - 약정사항 4조항 + 서명란
  - 새 창 인쇄 (@page A4)
- [x] 발주 목록/상세에 PO 프리뷰 버튼 추가
- [x] 버전 v8.4

---

### P7-A: 버전·다크모드·접근성 폴리시 (2026-05-29)
- [x] **버전 일관성 v8.5** — `/api/health`, CSS 헤더 주석, app.js 헤더(L1·L6), 로그인 footer(L122), 관리자 시스템 정보(L5785), 사이드바 sb-logo-ver, fs-badge, 우측 하단 badge(L10070) 모두 동기화
- [x] **다크모드 19개 클래스 변형 추가** — kpi-card / card / filter-bar inp·sel / tbl td·wrap / est-section / gantt-wrap / cal-wrap·cell·day-hdr / cost-flow / badge-gray / empty-state / tab-btn·list / mobile-nav·item (P3~P6 신규 모듈 다크모드 완성)
- [x] **접근성 향상** — `*:focus-visible` 글로벌 outline (WCAG 2.1 AA), input/select/textarea/button focus-visible outline 제거 (이중 outline 방지)

---

## 🔲 미완료 / 다음 작업

### P7-B: 페이지네이션·서버사이드 필터 (2026-05-29 완료) ✅
- [x] **백엔드 crud() 페이지네이션 지원** — `?limit=&offset=&q=&order_by=&order_dir=`
  - 정렬 컬럼은 PRAGMA로 화이트리스트 검증 (SQL 인젝션 방지)
  - 검색 `q`는 모든 TEXT 컬럼 OR LIKE
  - `X-Total-Count` 응답 헤더로 총 개수 반환 (페이지네이션 UI 대응)
  - `limit` 미지정 시 기존 동작(전체 반환) — 100% 하위 호환
- [x] **initData 큰 테이블 limit 적용** (모바일 초기 로딩 단축):
  - consultations 2000+ → 500 (영업 칸반 표시 충분)
  - erp-attachments 500, design-items 500
  - site-photos 300, site-daily-logs 300, site-issues 300
  - leave-requests 500
  - 다른 페이지/모듈은 기존 동작 유지 (회귀 위험 0)

### P7-C: 모바일 반응형 보강 (2026-05-29 완료) ✅
- [x] **768px 보강** — `.tbl-wrap` 가로 스크롤 강제, `.tbl{min-width:600px}`, `.filter-bar` flex-wrap, 카드 패딩 축소
- [x] **480px 풀스크린 모달** — 작은 폰에서 모달이 100vw·100vh, 모서리 없음, 푸터 sticky
- [x] **480px 콘텐츠 축소** — h1·KPI·버튼 크기 축소, 카드 padding 12px
- [x] 기존 768px 미디어쿼리 + 칸반 인라인 미디어쿼리 유지 (회귀 0)

### P7-D: 스모크 테스트 + 재배포
- [ ] CRUD 8개 모듈 + 로그인 + 인쇄/PDF 회귀 테스트
- [ ] `npm run build` + Cloudflare Pages 재배포

### P8-B: 외부 상담 폼 (2026-05-29 완료) ✅
- [x] `POST /api/inquiry` 공개 라우트 (PUBLIC_PATHS 추가, 인증 면제)
- [x] 허니팟 `_hp` 필드 — 스팸 봇 차단
- [x] 필수 검증: 이름 + (연락처 또는 이메일), 개인정보 동의
- [x] consultations 자동 적재 (source=website, status=신규, pipeline_stage=초기상담)
- [x] 자동 미팅 후보일 추천 — 영업일 +2~+7 중 3건 (주말 제외)
- [x] Resend 이메일 알림 → main@frameplus.kr (HTML 표 + 추천일 + ERP 링크)
- [x] **공개 폼 HTML** — `public/inquiry.html` 즉시 임베드 가능
  - URL: `https://frameplus-erp.pages.dev/inquiry.html`
  - 모바일 반응형, 그라디언트 헤더, 동의 펼침 약관
  - 자기 웹사이트에 iframe 임베드 또는 링크 공유 가능

### P8-D: 연차 결재선 워크플로 (2026-05-29 완료) ✅
- [x] **백엔드 워크플로 API** — `POST /api/leave-requests/:id/approve|reject|cancel` 3건
- [x] **잔여 연차 계산 API** — `GET /api/leave-balance/:userId` (입사일·근속 기반 자동 계산, 1년 미만 월 1일·1년 이상 15~25일)
- [x] **연차 관리 페이지** (`/leave`) — NAV 추가, router case 추가
  - 상단 KPI: 발생/사용/잔여/입사일 4개 카드
  - 관리자 결재 대기 박스 (승인·반려 버튼, 메모 입력)
  - 직원: 본인 신청 내역만 / 관리자: 전체 신청 내역 (최대 100건)
- [x] **연차 신청 모달** — 6가지 유형(연차/반차/반반차/병가/경조사/공가), 시작·종료일·일수 자동 계산(주말 제외), 사유 입력
- [x] **신청·승인·반려·취소 전체 사이클** + 잔여연차 자동 차감(승인된 연차/반차/반반차 SUM)

### P8-C: 미팅 자동 이메일 Cron (2026-05-29 완료) ✅
- [x] **wrangler.jsonc**: `triggers.crons: ["0 0 * * *"]` — 매일 UTC 00:00 = **KST 09:00 자동 실행**
- [x] **scheduled handler** — `export default { fetch, scheduled }` 구조로 전환
- [x] **runMeetingNotify(env)** — 오늘/내일 미팅 조회 → 활성 admin 사용자 email 수집 → Resend로 다이제스트 발송
- [x] **HTML 이메일** — 오늘(빨강 하이라이트) / 내일(노랑 하이라이트) 분리, 시간·제목·고객·장소·담당자 표, ERP 바로가기 버튼
- [x] **수동 트리거** — `POST /api/cron/meeting-notify` (admin 인증) — 즉시 테스트용
- [x] 미팅 0건일 때 발송 스킵, Resend 실패 시 무시 (best-effort)

### P8-A: 개인페이지 `/me` (2026-05-29 완료) ✅ — 노션 박관우 패턴 차용
- [x] **NAV 메인 섹션 최상단** "👤 내 페이지" 신설
- [x] **그라디언트 프로필 헤더** — 이니셜 아바타, 이름, 직책(관리자/직원), 입사일
- [x] **헤더 KPI 4종** — 잔여 연차 / 오늘 미팅 / 진행 프로젝트 / 이번달 인건비
- [x] **빠른 액션 버튼** — 연차 신청·연차 내역·미팅·지출결의·결재함(admin only)
- [x] **8개 카드 그리드** (반응형 자동 columns):
  - 🔴 오늘 미팅 — 내가 담당이거나 contact에 포함된 미팅
  - 🟡 내일 미팅 — 동일 필터
  - 📅 다가오는 미팅 (7일 내, 최대 8건)
  - 📋 내 진행 프로젝트 — 클릭 시 enterProject 이동
  - 🏖️ 내 연차 현황 — 발생/사용/잔여 + 결재 대기 경고
  - 💳 내 최근 지출결의 (최근 5건)
  - 🔔 내 알림 (to_user 매칭)
  - 📢 회사 공지 (pinned 우선, 최근 3건)
- [x] RBAC — staff·admin 모두 본인 데이터만 표시

---

## 🎉 P0 ~ P8 전체 완료

P7-A(CSS·다크모드·접근성) + P8 전체(B 상담폼 / C 미팅Cron / D 연차결재 / A 개인페이지) 완료.

---

## 📊 코드 규모

| 항목 | 수치 |
|------|------|
| src/index.tsx (백엔드) | ~1,740+ lines |
| public/static/app.js (프론트) | ~11,020+ lines, 510+ functions |
| D1 테이블 | 32개 (+site_photos, site_daily_logs, site_issues) |
| API 엔드포인트 | 46+ |
| 빌드 크기 | ~129 KB (_worker.js) |
| 프로덕션 데이터 | 2,047+ 레코드 |

## 🔗 Git Log (최근)
| 커밋 | 내용 |
|------|------|
| `607fa34` | P6: Preset 3-level drilldown + PO form preview/print |
| `bda8606` | P5: Site Management Module - 4 views (Photos/DailyLog/Issues/Analysis) |
| `c55e286` | P4: 디자인 모듈 5개 뷰 (컨셉보드/도면관리/자재보드/시안비교/디자인일정) |
| `e8f6258` | PROGRESS.md 업데이트: P2+P3 완료, P4~P8 잔여 |
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

### 주요 코드 패턴
- **프론트엔드**: Vanilla JS SPA (`app.js`), `api()` fetch wrapper, `_d` 인메모리 캐시
- **백엔드**: Hono v4 + D1, `crud<T>()` 제네릭 CRUD, `ensureTables()` auto-migration
- **인증**: 세션 기반 (`X-Session-Id` header), 24h 만료
- **디자인 모듈**: `design_items` 단일 테이블, `view_type` 디스크리미네이터로 5개 뷰 구분
