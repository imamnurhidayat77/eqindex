-- EQIndex canonical schema — Step 1
-- PRD §9 + extensions for scraping (FEI / Equipe / ESNZ / CSV)
-- Relasi inti: Horse -> Rider -> Event -> Performance (via classes.round_results)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============ USERS (PRD §5 roles) ============
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'PUBLIC'
    CHECK (role IN ('PUBLIC','RIDER','TRAINER','OWNER','BREEDER','ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ HORSES (PRD §7.1 + §9) ============
CREATE TABLE horses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  age INT CHECK (age IS NULL OR age BETWEEN 0 AND 40),
  breed TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('Mare','Gelding','Stallion','Filly','Colt','Mare/Other','Unknown')),
  sire TEXT,
  dam TEXT,
  breeder TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  fei_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX horses_normalized_name_idx ON horses (normalized_name);
CREATE INDEX horses_owner_idx ON horses (owner_id);
CREATE TRIGGER horses_updated_at BEFORE UPDATE ON horses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE horse_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_alias, source)
);
CREATE INDEX horse_aliases_horse_idx ON horse_aliases (horse_id);

-- Breeder alias (dari referensi equineintel: breeder-aliases)
CREATE TABLE breeder_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ RIDERS (PRD §7.2 + §9) ============
CREATE TABLE riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  region TEXT,
  fei_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX riders_normalized_name_idx ON riders (normalized_name);
CREATE TRIGGER riders_updated_at BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE rider_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_alias, source)
);
CREATE INDEX rider_aliases_rider_idx ON rider_aliases (rider_id);

-- ============ EVENTS (PRD §7.3 + §9) ============
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  venue TEXT NOT NULL,
  venue_country TEXT,
  region TEXT,
  arena_type TEXT,
  season TEXT NOT NULL, -- mis. '2025-2026', derived dari date_start
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL')),
  external_show_id TEXT,
  external_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (date_end >= date_start),
  UNIQUE (source, external_show_id, external_event_id)
);
CREATE INDEX events_season_idx ON events (season);
CREATE INDEX events_date_idx ON events (date_start);
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ CLASSES (pecahan Event; belum ada di PRD §9, wajib untuk scrape) ============
-- FEI: Competition | Equipe: Class
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- mis. 'CSI1*-W 140cm Jump Off'
  class_date DATE,
  height_cm INT CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 200),
  level TEXT, -- rule/article: 'FEI Art. 238.2.2', 'A2', 'AM5'
  field_size INT NOT NULL DEFAULT 0 CHECK (field_size >= 0),
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL')),
  external_class_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, external_class_id)
);
CREATE INDEX classes_event_idx ON classes (event_id);
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ RAW RESULTS (staging mentah, JSONB) ============
-- Semua hasil scrape/CSV/FEI masuk sini dulu sebelum cleaning (PRD §10).
CREATE TABLE raw_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL')),
  external_show_id TEXT,
  external_class_id TEXT,
  source_result_id TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cleaned','failed')),
  error TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_class_id, source_result_id)
);
CREATE INDEX raw_results_status_idx ON raw_results (status);

-- ============ ROUND RESULTS (PRD §9, tabel fakta utama) ============
CREATE TABLE round_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  horse_id UUID NOT NULL REFERENCES horses(id) ON DELETE RESTRICT,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  jump_faults NUMERIC NOT NULL DEFAULT 0,
  time_faults NUMERIC NOT NULL DEFAULT 0,
  total_faults NUMERIC NOT NULL DEFAULT 0,
  time_seconds NUMERIC,
  finish_place INT CHECK (finish_place IS NULL OR finish_place > 0), -- PRD: placing (placing = reserved keyword PG)
  clear_round BOOLEAN NOT NULL DEFAULT FALSE,
  height_cm INT CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 200),
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('FEI','EQUIPE','ESNZ','CSV','MANUAL')),
  source_result_id TEXT,
  raw_result_id UUID REFERENCES raw_results(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, horse_id, rider_id),
  UNIQUE (source, source_result_id)
);
CREATE INDEX round_results_event_idx ON round_results (event_id);
CREATE INDEX round_results_class_idx ON round_results (class_id);
CREATE INDEX round_results_horse_idx ON round_results (horse_id);
CREATE INDEX round_results_rider_idx ON round_results (rider_id);
CREATE INDEX round_results_partnership_idx ON round_results (horse_id, rider_id);
CREATE INDEX round_results_clear_idx ON round_results (clear_round);

-- ============ TRAINING RECORDS (PRD §7.4 + §9) ============
CREATE TABLE training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES riders(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL, -- flatwork, jumping, gridwork, etc.
  intensity TEXT CHECK (intensity IS NULL OR intensity IN ('Low','Medium','High')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX training_horse_date_idx ON training_records (horse_id, date);

-- ============ HEALTH RECORDS (PRD §7.4; stub agar tak bongkar skema di Step 7) ============
CREATE TABLE health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horse_id UUID NOT NULL REFERENCES horses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('VET','TREATMENT','FARRIER','VACCINATION','OTHER')),
  description TEXT NOT NULL,
  provider TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX health_horse_date_idx ON health_records (horse_id, date);
