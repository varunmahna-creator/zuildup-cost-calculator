-- Add tier enum + column
DO $$ BEGIN
  CREATE TYPE lead_tier AS ENUM ('A','B','C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tier lead_tier;

-- Round-robin counter
CREATE TABLE IF NOT EXISTS assignment_counters (
  source text PRIMARY KEY,
  next_index integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO assignment_counters(source, next_index) VALUES ('referral', 0)
ON CONFLICT (source) DO NOTHING;

-- Atomic round-robin function
-- NOTE: pool = users with role IN ('spoc','director') — Varun's call 2026-05-30
CREATE OR REPLACE FUNCTION next_sales_assignee(p_source text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  pool uuid[];
  pool_len int;
  prev_idx int;
  pick_idx int;
  picked uuid;
BEGIN
  SELECT array_agg(u.id ORDER BY u.id) INTO pool
  FROM users u WHERE u.role IN ('spoc','director');

  pool_len := COALESCE(array_length(pool, 1), 0);
  IF pool_len = 0 THEN
    RETURN NULL;
  END IF;

  -- Read-and-increment atomically. We pick the CURRENT next_index, then bump it.
  INSERT INTO assignment_counters(source, next_index) VALUES (p_source, 0)
    ON CONFLICT (source) DO NOTHING;

  UPDATE assignment_counters
    SET next_index = (next_index + 1) % pool_len,
        updated_at = now()
    WHERE source = p_source
    RETURNING ((next_index + pool_len - 1) % pool_len) INTO prev_idx;

  pick_idx := prev_idx;  -- the value we just consumed
  picked := pool[pick_idx + 1]; -- 1-indexed
  RETURN picked;
END $$;
