-- 0005: 인사이트 피드(PART A) · 공고 레이더(PART B)
-- 설계서 v1.2 기준. 운영 DB는 src/radar.ts ensureRadarTables()가 동일 DDL을 IF NOT EXISTS로 자동 적용한다.

-- ===== PART A. 인사이트 피드 =====
CREATE TABLE IF NOT EXISTS news_sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('rss','reddit','hn','github_atom','github_search','page_diff','email','youtube','threads')),
  topic_hint TEXT,
  url TEXT NOT NULL UNIQUE,
  interval_min INTEGER DEFAULT 60,
  enabled INTEGER DEFAULT 1,
  last_fetch_at TEXT, last_error TEXT, fail_count INTEGER DEFAULT 0,
  last_hash TEXT                                  -- page_diff: 직전 페이지 텍스트 해시
);
CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES news_sources(id),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  author TEXT, published_at TEXT,
  raw_excerpt TEXT,
  summary_ko TEXT, why_relevant TEXT,
  score INTEGER,
  tags TEXT,
  bookmarked INTEGER DEFAULT 0, read_at TEXT,
  memo_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_topic_pub ON news_items(topic, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created ON news_items(created_at DESC);

-- 메모장(링크 메모). 북마크 → 메모 자동 생성
CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  body TEXT,
  source TEXT,                                    -- 'insight' | 'manual'
  pid TEXT DEFAULT '',                            -- 현장 연결(북마크 메모는 비움)
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ===== PART B. 공고 레이더 =====
CREATE TABLE IF NOT EXISTS bid_sources (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  tier TEXT CHECK(tier IN ('T1','T2','T3','T4','T5','T6','T7')),
  group_name TEXT,
  branch_level TEXT DEFAULT 'hq' CHECK(branch_level IN ('hq','branch')),  -- 금융 2단: 본점·중앙회 / 지점·조합
  url TEXT NOT NULL UNIQUE,
  method TEXT CHECK(method IN ('api','crawl','chrome','discovery')),
  needs_login INTEGER DEFAULT 0,
  selector_json TEXT,
  interval_hours INTEGER DEFAULT 24,
  status TEXT DEFAULT 'approved' CHECK(status IN ('candidate','approved','rejected')),
  expected_month INTEGER,
  last_notice_at TEXT,
  discovered_from TEXT,                           -- candidate 발견 근거 공고 URL
  enabled INTEGER DEFAULT 1, last_fetch_at TEXT, last_error TEXT
);
CREATE TABLE IF NOT EXISTS org_dictionary (
  name TEXT PRIMARY KEY, tier TEXT, group_name TEXT, domain TEXT, source_list TEXT
);
CREATE INDEX IF NOT EXISTS idx_orgdict_domain ON org_dictionary(domain);
CREATE TABLE IF NOT EXISTS search_queries (
  id INTEGER PRIMARY KEY, query TEXT NOT NULL,
  channel TEXT CHECK(channel IN ('google_alerts','google_cse','naver','kakao')),
  enabled INTEGER DEFAULT 1, last_run_at TEXT, hits_30d INTEGER DEFAULT 0,
  UNIQUE(query, channel)
);
CREATE TABLE IF NOT EXISTS bid_notices (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES bid_sources(id),
  origin TEXT DEFAULT 'crawl' CHECK(origin IN ('api','crawl','chrome','discovery')),
  org TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, url_hash TEXT UNIQUE,
  kind TEXT CHECK(kind IN ('vendor_reg','interior_bid','maintenance_rate','other')),
  posted_at TEXT, deadline TEXT,
  budget_krw INTEGER, region TEXT,
  requirements_json TEXT,
  fit_score INTEGER, fit_verdict TEXT CHECK(fit_verdict IN ('충족','부분','미달','판정불가')),
  fit_reason TEXT,
  summary_ko TEXT,
  body_text TEXT,
  status TEXT DEFAULT '검토' CHECK(status IN ('검토','참여','불참','제출','결과')),
  pipeline_id TEXT,
  memo TEXT,
  notified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bids_deadline ON bid_notices(deadline);
CREATE INDEX IF NOT EXISTS idx_bids_created ON bid_notices(created_at DESC);
CREATE TABLE IF NOT EXISTS company_profile (key TEXT PRIMARY KEY, value TEXT);

-- 수집 실행 로그(소스 검증·크론 결과)
CREATE TABLE IF NOT EXISTS radar_logs (
  id INTEGER PRIMARY KEY,
  job TEXT NOT NULL, detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
