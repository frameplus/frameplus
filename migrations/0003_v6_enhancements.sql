-- Frame Plus ERP v6 Schema Enhancements
-- notifications, pricedb extensions, approval workflow, dark mode prefs

-- ===== NOTIFICATIONS TABLE =====
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'info',       -- info, approval, alert, expense, payment, system
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  from_user TEXT DEFAULT '',
  to_user TEXT DEFAULT '',         -- target user id (empty = broadcast)
  related_type TEXT DEFAULT '',    -- project, expense, labor, order, etc.
  related_id TEXT DEFAULT '',
  status TEXT DEFAULT 'unread',    -- unread, read, archived
  priority TEXT DEFAULT 'normal',  -- low, normal, high, urgent
  action_url TEXT DEFAULT '',      -- deep link within app
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_to_user ON notifications(to_user);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- ===== PRICEDB EXTENSIONS =====
-- Add new columns to pricedb (avg price, last used price, image, usage count)
-- Using ALTER TABLE with IF NOT EXISTS pattern (D1 compatible)

-- Note: D1 doesn't support ALTER TABLE IF NOT EXISTS for columns
-- We use a new table approach for the extended price DB

CREATE TABLE IF NOT EXISTS pricedb_history (
  id TEXT PRIMARY KEY,
  price_id TEXT DEFAULT '',         -- references pricedb.id
  pid TEXT DEFAULT '',              -- project id where used
  used_date TEXT DEFAULT '',
  qty REAL DEFAULT 0,
  unit_price REAL DEFAULT 0,       -- total unit price at time of use
  mp REAL DEFAULT 0,               -- material price at time
  lp REAL DEFAULT 0,               -- labor price at time
  ep REAL DEFAULT 0,               -- expense price at time
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ph_price_id ON pricedb_history(price_id);
CREATE INDEX IF NOT EXISTS idx_ph_pid ON pricedb_history(pid);

-- ===== ESTIMATE TEMPLATES (enhanced) =====
-- work_presets already exists, add a more structured template table
CREATE TABLE IF NOT EXISTS estimate_template_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',         -- 기초공사, 마감공사, etc.
  tags TEXT DEFAULT '[]',
  items TEXT DEFAULT '[]',          -- JSON array of template items
  usage_count INTEGER DEFAULT 0,
  last_used_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ets_category ON estimate_template_sets(category);

-- ===== APPROVAL WORKFLOW =====
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT '',             -- expense, order, contract, payment
  related_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  requester TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  status TEXT DEFAULT '대기',       -- 대기, 승인, 반려, 취소
  request_date TEXT DEFAULT '',
  approve_date TEXT DEFAULT '',
  reject_reason TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_type ON approvals(type);
CREATE INDEX IF NOT EXISTS idx_approvals_requester ON approvals(requester);

-- ===== USER PREFERENCES =====
CREATE TABLE IF NOT EXISTS user_prefs (
  id TEXT PRIMARY KEY DEFAULT 'default',
  dark_mode INTEGER DEFAULT 0,
  sidebar_collapsed INTEGER DEFAULT 0,
  default_view TEXT DEFAULT 'dash',
  notification_enabled INTEGER DEFAULT 1,
  language TEXT DEFAULT 'ko',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
