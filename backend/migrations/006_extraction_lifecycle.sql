ALTER TABLE extraction_runs DROP CONSTRAINT IF EXISTS extraction_runs_status_check;
ALTER TABLE extraction_runs ADD CONSTRAINT extraction_runs_status_check
  CHECK (status IN ('queued', 'waiting_for_model', 'running', 'completed', 'failed', 'cancelled'));
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS lock_acquired_at TIMESTAMPTZ;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS queue_duration_ms INTEGER;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS inference_duration_ms INTEGER;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS model_calls_completed INTEGER NOT NULL DEFAULT 0;
UPDATE extraction_runs SET queued_at = COALESCE(queued_at, created_at) WHERE queued_at IS NULL;