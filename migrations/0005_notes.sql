-- Frame Plus ERP v8.7 — 메모장(전자 필기장) 모듈
-- 노트북(분류) / 노트(페이지) / 공유 / 버전이력 / 동시편집 표시

-- ===== 노트북 (OneNote의 전자 필기장 단위) =====
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📓',
  color TEXT DEFAULT '#DC2626',
  owner_id TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  scope TEXT DEFAULT 'private',      -- private(나만) | team(전사 공개)
  team_perm TEXT DEFAULT 'read',     -- scope=team 일 때 팀원 권한: read | edit
  pid TEXT DEFAULT '',               -- 연결 프로젝트(선택)
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== 노트(페이지) =====
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',           -- 서식 있는 HTML
  plain TEXT DEFAULT '',             -- 검색·미리보기용 평문
  tags TEXT DEFAULT '[]',
  pid TEXT DEFAULT '',               -- 연결 프로젝트(선택)
  owner_id TEXT DEFAULT '',
  owner_name TEXT DEFAULT '',
  scope TEXT DEFAULT 'private',      -- private | team
  team_perm TEXT DEFAULT 'read',     -- scope=team 일 때 팀원 권한
  pinned INTEGER DEFAULT 0,
  color TEXT DEFAULT '',
  archived INTEGER DEFAULT 0,
  rev INTEGER DEFAULT 1,             -- 충돌 감지용 리비전
  updated_by TEXT DEFAULT '',
  updated_by_name TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== 공유 (노트 단위 또는 노트북 단위) =====
CREATE TABLE IF NOT EXISTS note_shares (
  id TEXT PRIMARY KEY,
  note_id TEXT DEFAULT '',           -- 비어 있으면 노트북 전체 공유
  notebook_id TEXT DEFAULT '',
  target_id TEXT DEFAULT '',         -- users.id
  target_name TEXT DEFAULT '',
  permission TEXT DEFAULT 'edit',    -- read | edit
  granted_by TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== 버전 이력 (되돌리기·충돌 복구) =====
CREATE TABLE IF NOT EXISTS note_revisions (
  id TEXT PRIMARY KEY,
  note_id TEXT DEFAULT '',
  rev INTEGER DEFAULT 0,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  editor_id TEXT DEFAULT '',
  editor_name TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ===== 동시 편집 표시(누가 지금 보고 있는지) =====
CREATE TABLE IF NOT EXISTS note_presence (
  id TEXT PRIMARY KEY,               -- note_id + ':' + user_id
  note_id TEXT DEFAULT '',
  user_id TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  editing INTEGER DEFAULT 0,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_pid ON notes(pid);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_note_shares_note ON note_shares(note_id, target_id);
CREATE INDEX IF NOT EXISTS idx_note_shares_nb ON note_shares(notebook_id, target_id);
CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id, rev);
CREATE INDEX IF NOT EXISTS idx_note_presence_note ON note_presence(note_id, last_seen);
