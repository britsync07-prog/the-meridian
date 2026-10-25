-- Migration: Reports table for OPS-22 and OPS-23
-- Stores flagged sources and factual error reports in review queue

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('flag', 'error')),
  story_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected')),
  data TEXT NOT NULL,  -- JSON containing all submission fields
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT
);

-- Index for pending report reviews
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_story ON reports(story_slug);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

-- Usage log table for audit worker (OPS-02)
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  resource TEXT NOT NULL,
  value INTEGER NOT NULL,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_log_date ON usage_log(date);
