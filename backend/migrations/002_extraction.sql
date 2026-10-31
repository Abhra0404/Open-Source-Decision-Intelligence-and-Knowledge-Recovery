ALTER TABLE discussions ADD COLUMN IF NOT EXISTS cleaned_body TEXT;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS cleaning_reason TEXT;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS is_usable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS tradeoffs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS source_discussion_id UUID REFERENCES discussions(id) ON DELETE SET NULL;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'valid';
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS review_reason TEXT;

CREATE TABLE IF NOT EXISTS extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  records_processed INTEGER NOT NULL DEFAULT 0,
  decisions_created INTEGER NOT NULL DEFAULT 0,
  prompt_version TEXT NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_repository ON extraction_runs(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_active
  ON extraction_runs(repository_id, status)
  WHERE status IN ('queued', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_decision_source
  ON decisions(repository_id, source_discussion_id, extraction_version)
  WHERE is_active = TRUE AND source_discussion_id IS NOT NULL;

UPDATE decisions
SET review_status = 'needs_review',
    review_reason = COALESCE(review_reason, 'Created before evidence validation was enabled'),
    is_active = FALSE,
    updated_at = NOW()
WHERE source_discussion_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM decision_evidence evidence
     WHERE evidence.decision_id = decisions.id
   );
