ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS model_total_tokens INTEGER;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS model_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS model_response_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS model_response_id TEXT;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS total_tokens INTEGER;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
