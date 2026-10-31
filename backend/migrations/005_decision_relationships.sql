CREATE TABLE IF NOT EXISTS decision_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  target_decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('supersedes', 'refines', 'depends_on', 'contradicts', 'related_to')),
  explanation TEXT NOT NULL,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT chk_relationship_not_self CHECK (source_decision_id <> target_decision_id),
  CONSTRAINT uq_decision_relationship UNIQUE (source_decision_id, target_decision_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS decision_relationship_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES decision_relationships(id) ON DELETE CASCADE,
  previous_review_status TEXT,
  new_review_status TEXT NOT NULL,
  reviewer_note TEXT,
  reviewer_identity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_relationships_repository
  ON decision_relationships(repository_id, created_at DESC);