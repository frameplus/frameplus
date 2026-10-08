-- JOBS 앱 핵심 테이블 (명세 04 데이터 모델) — src/jobs/schema.ts 의 JOBS_DDL 과 동일하게 유지
CREATE TABLE IF NOT EXISTS jobs_users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT '',
  biz_no TEXT DEFAULT '',
  default_tax_mode TEXT DEFAULT 'rate33',
  clock_out_time TEXT DEFAULT '18:00',
  notif_prefs TEXT DEFAULT '{}',
  status TEXT DEFAULT 'active',
  last_login DATETIME,
  deleted_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jobs_otp (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  sent_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_sessions_user ON jobs_sessions(user_id);

CREATE TABLE IF NOT EXISTS jobs_sites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  address TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  geo_radius INTEGER DEFAULT 150,
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  day_rate INTEGER DEFAULT 0,
  hour_rate INTEGER DEFAULT 0,
  overtime_rate INTEGER DEFAULT 0,
  settlement_rule TEXT NOT NULL,
  tax_mode TEXT NOT NULL,
  clock_out_time TEXT DEFAULT '',
  alarm_due INTEGER DEFAULT 1,
  alarm_clock_out INTEGER DEFAULT 1,
  archived INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_sites_user ON jobs_sites(user_id);

CREATE TABLE IF NOT EXISTS jobs_worklogs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  check_in_at TEXT DEFAULT '',
  check_out_at TEXT DEFAULT '',
  check_in_lat REAL,
  check_in_lng REAL,
  check_out_lat REAL,
  check_out_lng REAL,
  geo_distance_m INTEGER,
  attendance TEXT DEFAULT 'full',
  overtime_hours REAL DEFAULT 0,
  day_rate INTEGER DEFAULT 0,
  hour_rate INTEGER DEFAULT 0,
  tax_mode_override TEXT,
  gross INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  net INTEGER DEFAULT 0,
  edited_manually INTEGER DEFAULT 0,
  memo TEXT DEFAULT '',
  invoice_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, site_id, date)
);
CREATE INDEX IF NOT EXISTS idx_jobs_worklogs_user_date ON jobs_worklogs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_jobs_worklogs_invoice ON jobs_worklogs(invoice_id);

CREATE TABLE IF NOT EXISTS jobs_expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  worklog_id TEXT NOT NULL,
  type TEXT DEFAULT 'etc',
  name TEXT DEFAULT '',
  amount INTEGER DEFAULT 0,
  charge_to_client INTEGER DEFAULT 1,
  receipt_uri TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_expenses_worklog ON jobs_expenses(worklog_id);

CREATE TABLE IF NOT EXISTS jobs_photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  worklog_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  taken_at TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  label TEXT DEFAULT '',
  attach_to_invoice INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_photos_worklog ON jobs_photos(worklog_id);

CREATE TABLE IF NOT EXISTS jobs_quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT DEFAULT '',
  client_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  period_start TEXT DEFAULT '',
  period_end TEXT DEFAULT '',
  items TEXT DEFAULT '[]',
  vat_mode TEXT DEFAULT 'exclusive',
  total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  share_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs_invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  rows TEXT DEFAULT '[]',
  day_pays TEXT DEFAULT '[]',
  gross INTEGER DEFAULT 0,
  tax_mode TEXT NOT NULL,
  tax INTEGER DEFAULT 0,
  net INTEGER DEFAULT 0,
  due_date TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  paid_amount INTEGER DEFAULT 0,
  attach_photos INTEGER DEFAULT 0,
  edited_manually INTEGER DEFAULT 0,
  memo TEXT DEFAULT '',
  share_token TEXT,
  quote_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_invoices_user ON jobs_invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_invoices_token ON jobs_invoices(share_token);

CREATE TABLE IF NOT EXISTS jobs_sendlogs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  to_addr TEXT DEFAULT '',
  amount INTEGER DEFAULT 0,
  dunning_level TEXT DEFAULT '',
  sent_at TEXT NOT NULL,
  read_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_sendlogs_user ON jobs_sendlogs(user_id, sent_at);

CREATE TABLE IF NOT EXISTS jobs_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id TEXT,
  site_id TEXT,
  amount INTEGER NOT NULL,
  payer_name TEXT DEFAULT '',
  paid_at TEXT NOT NULL,
  method TEXT DEFAULT 'transfer',
  source TEXT DEFAULT 'manual',
  matched_by TEXT DEFAULT 'manual',
  excluded INTEGER DEFAULT 0,
  needs_review INTEGER DEFAULT 0,
  memo TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_payments_user ON jobs_payments(user_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_jobs_payments_invoice ON jobs_payments(invoice_id);

CREATE TABLE IF NOT EXISTS jobs_payer_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  site_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, payer_name)
);
