CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_email, name)
);
CREATE TABLE movements (
  id UUID PRIMARY KEY,
  owner_email TEXT NOT NULL,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gasto', 'ingreso')),
  description TEXT NOT NULL,
  category TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  movement_date DATE NOT NULL,
  nit TEXT,
  supplier TEXT,
  subtotal_cents BIGINT,
  iva_cents BIGINT,
  withholding_cents BIGINT,
  cost_center TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX movements_owner_month ON movements(owner_email, profile_id, movement_date);
CREATE TABLE receipts (
  id UUID PRIMARY KEY,
  owner_email TEXT NOT NULL,
  movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
