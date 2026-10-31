CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  provider TEXT,
  model_name TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'qa-v1',
  retrieval_latency_ms INTEGER,
  generation_latency_ms INTEGER,
  retrieved_evidence_count INTEGER NOT NULL DEFAULT 0,
  citation_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_message_sources (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES decision_evidence(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_repository
  ON chat_conversations(repository_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at);