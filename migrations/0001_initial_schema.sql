-- Frame Plus ERP v5 Schema
-- All data stored in D1 for multi-device sync

CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT DEFAULT 'Frame Plus',
  name_ko TEXT DEFAULT '프레임플러스',
  addr TEXT DEFAULT '',
  email TEXT DEFAULT '',
  tel TEXT DEFAULT '',
  mobile TEXT DEFAULT '',
  biz_no TEXT DEFAULT '',
  ceo TEXT DEFAULT '김승환',
  specialty TEXT DEFAULT 'Office Specialist',
  website TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  dept TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  nm TEXT NOT NULL,
  client TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  email TEXT DEFAULT '',
  loc TEXT DEFAULT '',
  mgr TEXT DEFAULT '',
  date TEXT DEFAULT '',
  status TEXT DEFAULT '작성중',
  area REAL DEFAULT 0,
  profit REAL DEFAULT 10,
  round_unit TEXT DEFAULT '십만원',
  manual_total REAL DEFAULT 0,
  target_amt REAL DEFAULT 0,
  memo TEXT DEFAULT '',
  region TEXT DEFAULT '',
  contract_status TEXT DEFAULT '미생성',
  contract_date TEXT DEFAULT '',
  contract_note TEXT DEFAULT '',
  contract_clauses TEXT DEFAULT '[]',
  payments TEXT DEFAULT '[]',
  gantt_tasks TEXT DEFAULT '[]',
  items TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  nm TEXT NOT NULL,
  cid TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  addr TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  rating INTEGER DEFAULT 3,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT DEFAULT '',
  time TEXT DEFAULT '',
  client TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  loc TEXT DEFAULT '',
  status TEXT DEFAULT '예정',
  pid TEXT DEFAULT '',
  assignee TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pricedb (
  id TEXT PRIMARY KEY,
  cid TEXT DEFAULT '',
  nm TEXT NOT NULL,
  spec TEXT DEFAULT '',
  unit TEXT DEFAULT 'm²',
  mp REAL DEFAULT 0,
  lp REAL DEFAULT 0,
  ep REAL DEFAULT 0,
  cmp REAL DEFAULT 0,
  clp REAL DEFAULT 0,
  cep REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders_manual (
  id TEXT PRIMARY KEY,
  pid TEXT DEFAULT '',
  cid TEXT DEFAULT '',
  status TEXT DEFAULT '대기',
  order_date TEXT DEFAULT '',
  deliv_date TEXT DEFAULT '',
  vendor TEXT DEFAULT '',
  tax_invoice INTEGER DEFAULT 0,
  paid INTEGER DEFAULT 0,
  memo TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  items TEXT DEFAULT '[]',
  assignee TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS as_list (
  id TEXT PRIMARY KEY,
  pid TEXT DEFAULT '',
  date TEXT DEFAULT '',
  content TEXT DEFAULT '',
  priority TEXT DEFAULT '보통',
  assignee TEXT DEFAULT '',
  status TEXT DEFAULT '접수',
  done_date TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  pinned INTEGER DEFAULT 0,
  date TEXT DEFAULT '',
  read_by TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tax_invoices (
  id TEXT PRIMARY KEY,
  pid TEXT DEFAULT '',
  date TEXT DEFAULT '',
  supply_amt REAL DEFAULT 0,
  tax_amt REAL DEFAULT 0,
  buyer_biz TEXT DEFAULT '',
  status TEXT DEFAULT '미발행',
  item TEXT DEFAULT '공사',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS msg_templates (
  id TEXT PRIMARY KEY,
  cat TEXT DEFAULT '',
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_date ON projects(date);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_orders_pid ON orders_manual(pid);
CREATE INDEX IF NOT EXISTS idx_pricedb_cid ON pricedb(cid);
CREATE INDEX IF NOT EXISTS idx_vendors_cid ON vendors(cid);
