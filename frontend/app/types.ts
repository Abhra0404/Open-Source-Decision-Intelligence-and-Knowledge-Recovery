export type Repository = {
  id: string;
  full_name: string;
  html_url: string;
  description?: string | null;
  default_branch?: string | null;
  is_private?: boolean;
  created_at?: string;
  updated_at?: string;
  discussions_count?: number;
  decisions_count?: number;
  last_ingested_at?: string | null;
  extraction_status?: string | null;
};

export type DecisionStatus = "accepted" | "rejected" | "proposed" | "unresolved";
export type ReviewStatus = "pending" | "approved" | "rejected" | "needs_review" | "valid";

export type DecisionEvidence = {
  discussion_id: string;
  source_type: string;
  author_login: string | null;
  evidence_role: string;
  excerpt: string | null;
  source_url: string;
  source_created_at: string | null;
};

export type ReviewHistoryEntry = {
  id: string;
  previous_review_status: string | null;
  new_review_status: string;
  previous_decision_status: string | null;
  new_decision_status: string | null;
  reviewer_note: string | null;
  reviewer_identity: string | null;
  created_at: string;
};

export type RelatedDecision = {
  id: string;
  relationship_type: string;
  explanation: string;
  confidence: number;
  review_status: string;
  related_decision_id: string;
  related_decision_title: string;
  direction: "outgoing" | "incoming";
};

export type Decision = {
  id: string;
  repository_id?: string;
  repository_name?: string;
  source_discussion_id?: string | null;
  title: string;
  summary: string;
  status: DecisionStatus;
  confidence: number | null;
  rationale: string[];
  alternatives: string[];
  tradeoffs?: string[];
  evidence_count: number;
  review_status: ReviewStatus;
  review_reason?: string | null;
  extraction_model?: string | null;
  extraction_version?: string;
  extracted_at: string;
};

export type DecisionDetail = Decision & {
  evidence: DecisionEvidence[];
  review_history: ReviewHistoryEntry[];
  related_decisions?: RelatedDecision[];
  source_discussion?: {
    id: string;
    source_type: string;
    title: string | null;
    source_url: string;
    author_login: string | null;
    source_created_at: string | null;
  } | null;
};

export type Discussion = {
  id: string;
  source_type: string;
  title: string | null;
  body: string;
  author_login?: string | null;
  source_url: string;
  source_created_at?: string | null;
};

export type ChatMessageSource = {
  evidence_id: string;
  decision_id?: string;
  decision_title?: string;
  decision_status?: DecisionStatus;
  review_status?: ReviewStatus;
  review_reason?: string | null;
  decision_is_active?: boolean;
  evidence_role: string;
  excerpt: string | null;
  source_title?: string | null;
  source_url: string;
};

export type QADiagnostics = {
  repository_id: string;
  original_question: string;
  normalized_query: string;
  candidate_decisions_retrieved: number;
  decisions_remaining_after_filtering: number;
  evidence_records_retrieved: number;
  evidence_records_passing_validation: number;
  retrieval_strategy: string;
  relevance_scores: Array<{ decision_id: string; score: number }>;
  minimum_relevance_threshold: number;
  llm_invoked: boolean;
  fallback_reason: string | null;
  llm_error_stage?: string | null;
  llm_error_code?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  provider?: string | null;
  model_name?: string | null;
  retrieval_latency_ms?: number | null;
  generation_latency_ms?: number | null;
  retrieved_evidence_count?: number | null;
  citation_count?: number | null;
  qa_diagnostics?: QADiagnostics | null;
  sources?: ChatMessageSource[];
};

export type ChatConversation = {
  id: string;
  repository_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
};

export type DecisionRelationship = {
  id: string;
  repository_id: string;
  source_decision_id: string;
  target_decision_id: string;
  relationship_type: "supersedes" | "refines" | "depends_on" | "contradicts" | "related_to";
  explanation: string;
  evidence_ids: string[];
  confidence: number;
  review_status: "pending" | "approved" | "rejected" | "needs_review" | "valid";
  source_title?: string;
  target_title?: string;
  created_at?: string;
};

export type DecisionGraph = {
  nodes: Array<{
    id: string;
    title: string;
    summary: string;
    status: DecisionStatus;
    review_status: ReviewStatus;
    confidence: number | null;
    extracted_at: string;
  }>;
  edges: DecisionRelationship[];
  total_nodes: number;
  total_edges: number;
};

export type ExtractionRun = {
  id: string;
  repository_id: string;
  status: "queued" | "waiting_for_model" | "running" | "completed" | "failed" | "cancelled";
  records_processed: number;
  decisions_created: number;
  valid_threads: number;
  unusable_threads: number;
  threads_with_signals: number;
  candidates_generated: number;
  candidates_rejected: number;
  invalid_threads: number;
  no_decision_signal: number;
  decisions_existing: number;
  model_provider: string;
  model_name: string;
  model_revision?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  model_total_tokens?: number | null;
  model_latency_ms?: number | null;
  queue_duration_ms?: number | null;
  inference_duration_ms?: number | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ExtractionDiagnostic = {
  id?: string;
  discussion_id: string;
  thread_number: number | null;
  source_type: string;
  title: string | null;
  associated_records: number;
  cleaned_content_length: number;
  usable: boolean;
  decision_signal_detected: boolean;
  matched_rule: string | null;
  candidate_generated: boolean;
  candidate_count: number;
  rejection_reason: string | null;
  outcome: string;
  candidate_title?: string | null;
  candidate_status?: string | null;
  candidate_summary?: string | null;
  candidate_source_discussion_id?: string | null;
  candidate_rationale?: string[];
  candidate_alternatives?: string[];
  candidate_tradeoffs?: string[];
  detected_signals?: Array<{
    signal_type: string;
    discussion_id: string;
    source_type: string;
    source_url: string;
    author_role: string | null;
    excerpt: string;
  }>;
  evidence_references?: Array<{
    discussion_id: string;
    source_type: string;
    source_url: string;
    excerpt: string;
    role: string;
  }>;
  schema_validation_result?: string | null;
  semantic_validation_result?: string | null;
  validation_errors?: string[];
  persistence_result?: string | null;
  duplicate_match_type?: string | null;
  matched_decision_id?: string | null;
  matched_decision_title?: string | null;
  matched_decision_status?: string | null;
  matched_decision_review_status?: string | null;
  matching_rationale?: string | null;
  similarity_score?: number | null;
  similarity_method?: string | null;
  candidate_disposition?: string | null;
  model_response_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  retry_count?: number;
};

export type DiagnosticsResult = {
  summary: ExtractionRun;
  outcome_counts: Record<string, number>;
  items: ExtractionDiagnostic[];
  candidate?: ExtractionDiagnostic | null;
  candidate_diagnostics: ExtractionDiagnostic[];
  total: number;
  warning?: {
    code: string;
    message: string;
    records_processed: number;
    total_diagnostics: number;
  } | null;
};

export type ModelConfig = {
  provider: string;
  model_name: string;
  base_url: string;
  timeout_seconds: number;
  groq_max_retries: number;
  status: string;
  has_api_key: boolean;
  capabilities: string[];
};

export type AppView =
  | "overview"
  | "repositories"
  | "decisions"
  | "intelligence"
  | "evolution"
  | "discussions"
  | "diagnostics"
  | "model-config";
