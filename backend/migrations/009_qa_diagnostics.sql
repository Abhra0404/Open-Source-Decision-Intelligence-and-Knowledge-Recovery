BEGIN;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS qa_diagnostics JSONB;

COMMIT;
