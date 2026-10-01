CREATE TABLE profiles (
  id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id, owner_email)
);

CREATE TABLE movements (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('gasto','ingreso')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  category TEXT,
  movement_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE commitments (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  kind TEXT NOT NULL CHECK(kind IN ('recurrente','impuesto','cumple')),
  day_of_month INTEGER,
  due_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE savings (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  saved_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE budgets (
  owner_email TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (owner_email, profile_id, year, month)
);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_movements_owner_profile_date ON movements(owner_email, profile_id, movement_date DESC);
CREATE INDEX idx_commitments_owner_profile ON commitments(owner_email, profile_id);
CREATE INDEX idx_savings_owner_profile ON savings(owner_email, profile_id, saved_on DESC);
CREATE INDEX idx_receipts_movement ON receipts(movement_id);
