BEGIN;

DROP INDEX IF EXISTS uq_active_decision_source;

CREATE INDEX IF NOT EXISTS idx_decisions_repository_source_active
  ON decisions(repository_id, source_discussion_id, is_active);

ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS candidate_source_discussion_id UUID
    REFERENCES discussions(id) ON DELETE SET NULL;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS candidate_rationale JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS candidate_alternatives JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS candidate_tradeoffs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS duplicate_match_type TEXT
    CHECK (duplicate_match_type IN (
      'exact_duplicate', 'semantic_equivalent', 'distinct_same_discussion',
      'superseding', 'ambiguous', 'no_match'
    ));
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS matched_decision_id UUID
    REFERENCES decisions(id) ON DELETE SET NULL;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS matched_decision_title TEXT;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS matched_decision_status TEXT;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS matched_decision_review_status TEXT;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS matching_rationale TEXT;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS similarity_score NUMERIC(5, 4)
    CHECK (similarity_score IS NULL OR (similarity_score >= 0 AND similarity_score <= 1));
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS similarity_method TEXT;
ALTER TABLE extraction_diagnostics
  ADD COLUMN IF NOT EXISTS candidate_disposition TEXT
    CHECK (candidate_disposition IN (
      'matched_existing', 'persisted_for_review', 'persisted'
    ));

COMMIT;
