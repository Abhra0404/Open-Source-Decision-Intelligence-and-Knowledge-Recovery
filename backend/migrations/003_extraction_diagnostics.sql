ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS valid_threads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS unusable_threads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS threads_with_signals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS candidates_generated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS candidates_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS invalid_threads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS no_decision_signal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS decisions_existing INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS extraction_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_run_id UUID NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  discussion_id UUID REFERENCES discussions(id) ON DELETE SET NULL,
  thread_number INTEGER,
  source_type TEXT,
  title TEXT,
  associated_records INTEGER NOT NULL DEFAULT 0,
  cleaned_content_length INTEGER NOT NULL DEFAULT 0,
  usable BOOLEAN NOT NULL DEFAULT FALSE,
  decision_signal_detected BOOLEAN NOT NULL DEFAULT FALSE,
  matched_rule TEXT,
  candidate_generated BOOLEAN NOT NULL DEFAULT FALSE,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  outcome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS candidate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS detected_signals JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS candidate_title TEXT;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS candidate_status TEXT;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS candidate_summary TEXT;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS schema_validation_result TEXT;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS semantic_validation_result TEXT;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE extraction_diagnostics ADD COLUMN IF NOT EXISTS persistence_result TEXT;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS model_revision TEXT;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS completion_tokens INTEGER;
ALTER TABLE extraction_runs ADD COLUMN IF NOT EXISTS model_latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_extraction_diagnostics_run
  ON extraction_diagnostics(extraction_run_id, created_at);

UPDATE decisions
SET review_status = 'needs_review',
    review_reason = CASE
      WHEN id = 'e9b66e8b-7dda-456d-afad-37a448539df8'
        THEN 'Historical record flagged: source and evidence discussion IDs require revalidation'
      WHEN id = '6ecfae01-7b44-48ff-b08a-8375ba61d446'
        THEN 'Historical record flagged: rejection classification requires revalidation'
      ELSE review_reason
    END,
    is_active = FALSE,
    updated_at = NOW()
WHERE id IN (
  'e9b66e8b-7dda-456d-afad-37a448539df8',
  '6ecfae01-7b44-48ff-b08a-8375ba61d446'
);

CREATE TABLE IF NOT EXISTS decision_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  previous_review_status TEXT,
  new_review_status TEXT NOT NULL,
  previous_decision_status decision_status,
  new_decision_status decision_status,
  reviewer_note TEXT,
  reviewer_identity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_review_history_decision
  ON decision_review_history(decision_id, created_at DESC);
