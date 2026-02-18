-- 인건비(노무비) 지급명세서 테이블
CREATE TABLE IF NOT EXISTS labor_costs (
  id TEXT PRIMARY KEY,
  pid TEXT DEFAULT '',
  date TEXT DEFAULT '',
  worker_name TEXT DEFAULT '',
  worker_type TEXT DEFAULT '',
  daily_rate REAL DEFAULT 0,
  days REAL DEFAULT 0,
  total REAL DEFAULT 0,
  meal_cost REAL DEFAULT 0,
  transport_cost REAL DEFAULT 0,
  overtime_cost REAL DEFAULT 0,
  deduction REAL DEFAULT 0,
  net_amount REAL DEFAULT 0,
  paid INTEGER DEFAULT 0,
  paid_date TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 지출결의서 테이블
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  pid TEXT DEFAULT '',
  date TEXT DEFAULT '',
  category TEXT DEFAULT '',
  title TEXT NOT NULL,
  amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  vendor TEXT DEFAULT '',
  payment_method TEXT DEFAULT '',
  receipt_type TEXT DEFAULT '',
  receipt_no TEXT DEFAULT '',
  receipt_image TEXT DEFAULT '',
  requester TEXT DEFAULT '',
  approver TEXT DEFAULT '',
  status TEXT DEFAULT '대기',
  approved_date TEXT DEFAULT '',
  reject_reason TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 견적 품목 이미지 테이블
CREATE TABLE IF NOT EXISTS item_images (
  id TEXT PRIMARY KEY,
  item_id TEXT DEFAULT '',
  pid TEXT DEFAULT '',
  image_data TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 공종 프리셋 테이블
CREATE TABLE IF NOT EXISTS work_presets (
  id TEXT PRIMARY KEY,
  cid TEXT DEFAULT '',
  name TEXT NOT NULL,
  items TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_labor_pid ON labor_costs(pid);
CREATE INDEX IF NOT EXISTS idx_labor_date ON labor_costs(date);
CREATE INDEX IF NOT EXISTS idx_expenses_pid ON expenses(pid);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_item_images_pid ON item_images(pid);
