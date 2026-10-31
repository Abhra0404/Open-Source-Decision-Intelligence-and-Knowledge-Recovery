import re
import time
from dataclasses import dataclass
from uuid import UUID

from psycopg import Connection

from .config import settings
from .providers import AnswerResult, ProviderError, build_provider
from .qa_logging import log_qa_event


_MIN_RELEVANCE_SCORE = 0.3
_INSUFFICIENT_EVIDENCE = "I couldn't find sufficient evidence in this repository to answer that question."
_QUERY_STOP_WORDS = {
    "a", "about", "after", "all", "an", "and", "are", "as", "at", "be", "been",
    "before", "between", "but", "by", "can", "could", "did", "do", "does", "for",
    "from", "has", "have", "how", "i", "in", "into", "is", "it", "its", "of",
    "on", "or", "our", "please", "should", "that", "the", "their", "them", "there",
    "these", "this", "those", "to", "was", "we", "were", "what", "when", "where",
    "which", "who", "why", "will", "with", "would", "click", "discussion",
    "decision", "decisions", "discussions", "issue", "issues", "me", "pr", "pull",
    "repo", "repository", "request", "requests", "say", "source", "tell",
}


@dataclass(frozen=True)
class RetrievalResult:
    evidence: list[dict[str, object]]
    diagnostics: dict[str, object]


class QAGenerationError(RuntimeError):
    def __init__(self, provider_error: ProviderError, diagnostics: dict[str, object]) -> None:
        super().__init__(str(provider_error))
        self.provider_error = provider_error
        self.diagnostics = diagnostics


def _normalize_query(question: str) -> tuple[str, str]:
    tokens = re.findall(r"[^\W_]+", question.casefold(), flags=re.UNICODE)
    searchable_tokens = list(dict.fromkeys(token for token in tokens if token not in _QUERY_STOP_WORDS))
    if not searchable_tokens:
        searchable_tokens = list(dict.fromkeys(tokens))
    normalized_query = " ".join(searchable_tokens)
    tsquery = " | ".join(f"{token}:*" for token in searchable_tokens)
    return normalized_query, tsquery


def _validated_retrieval_rows(
    rows: list[dict[str, object]],
    repository_id: UUID,
) -> tuple[list[dict[str, object]], int]:
    retrieved_count = 0
    validated: list[dict[str, object]] = []
    seen_evidence: set[str] = set()
    for row in rows:
        evidence_id = row.get("evidence_id")
        if evidence_id is None:
            continue
        retrieved_count += 1
        evidence_key = str(evidence_id)
        excerpt = row.get("excerpt")
        if (
            row.get("repository_id") != repository_id
            or row.get("source_repository_id") != repository_id
            or not isinstance(excerpt, str)
            or not excerpt.strip()
            or not isinstance(row.get("source_url"), str)
            or not row["source_url"].strip()
            or evidence_key in seen_evidence
        ):
            continue
        seen_evidence.add(evidence_key)
        validated.append(dict(row))
    return validated, retrieved_count


def retrieve_evidence(
    conn: Connection,
    repository_id: UUID,
    question: str,
    limit: int = 8,
) -> RetrievalResult:
    normalized_query, tsquery = _normalize_query(question)
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH query_input AS (
              SELECT to_tsquery('simple', %s) AS ts_query,
                     %s::text AS normalized_phrase,
                     string_to_array(%s::text, ' ') AS query_terms
            ),
            decision_documents AS (
              SELECT d.id AS decision_id, d.repository_id, d.title AS decision_title,
                     d.summary, d.status AS decision_status, d.review_status,
                     d.review_reason, d.is_active, d.rationale, d.alternatives,
                     d.tradeoffs,
                     concat_ws(' ', d.title, d.summary, d.rationale::text,
                       d.alternatives::text, d.tradeoffs::text,
                       string_agg(DISTINCT source.title, ' '),
                       string_agg(DISTINCT source.body, ' ') FILTER (WHERE source.id IS NOT NULL),
                       string_agg(DISTINCT de.evidence_excerpt, ' ') FILTER (WHERE source.id IS NOT NULL),
                       string_agg(DISTINCT source.source_url, ' ') FILTER (WHERE source.id IS NOT NULL))
                       AS searchable_text
              FROM decisions d
              LEFT JOIN decision_evidence de ON de.decision_id = d.id
              LEFT JOIN discussions source
                ON source.id = de.discussion_id
               AND source.repository_id = d.repository_id
              WHERE d.repository_id = %s
              GROUP BY d.id
            ),
            scored AS (
              SELECT doc.*,
                     to_tsvector('simple', doc.searchable_text) AS search_vector,
                     ts_rank_cd(
                       to_tsvector('simple', doc.searchable_text),
                       query_input.ts_query,
                       32
                     ) AS full_text_score,
                     (
                       SELECT count(*)::real / NULLIF(cardinality(query_input.query_terms), 0)
                       FROM unnest(query_input.query_terms) AS term
                       WHERE term = ANY(
                         regexp_split_to_array(lower(doc.searchable_text), '[^[:alnum:]]+')
                       )
                     ) AS token_coverage_score,
                     (
                       query_input.normalized_phrase <> ''
                       AND position(
                         query_input.normalized_phrase IN
                         regexp_replace(
                           regexp_replace(lower(doc.searchable_text),
                             '[^[:alnum:]]+', ' ', 'g'),
                           '[[:space:]]+', ' ', 'g'
                         )
                       ) > 0
                     ) AS exact_phrase_match
              FROM decision_documents doc
              CROSS JOIN query_input
            ),
            matched AS (
              SELECT scored.*,
                     CASE WHEN exact_phrase_match THEN 1.0::real
                          ELSE token_coverage_score END AS relevance_score,
                     CASE WHEN exact_phrase_match THEN 'exact_phrase'
                          ELSE 'full_text_or' END AS retrieval_method
              FROM scored
              CROSS JOIN query_input
              WHERE search_vector @@ query_input.ts_query
                 OR exact_phrase_match
            ),
            thresholded AS (
              SELECT *
              FROM matched
              WHERE relevance_score >= %s
            ),
            eligible AS (
              SELECT *
              FROM thresholded
              ORDER BY relevance_score DESC, full_text_score DESC,
                       is_active DESC, decision_title
              LIMIT %s
            ),
            counts AS (
              SELECT (SELECT count(DISTINCT decision_id) FROM matched)
                       AS candidate_decisions_retrieved,
                     (SELECT count(DISTINCT decision_id) FROM thresholded)
                       AS decisions_remaining_after_filtering,
                     (
                       SELECT COALESCE(
                         jsonb_agg(jsonb_build_object(
                           'decision_id', scored_candidates.decision_id,
                           'score', scored_candidates.relevance_score
                         )),
                         '[]'::jsonb
                       )
                       FROM (
                         SELECT decision_id, relevance_score
                         FROM (
                           SELECT DISTINCT ON (decision_id)
                                  decision_id, relevance_score
                           FROM matched
                           ORDER BY decision_id, relevance_score DESC
                         ) candidate_scores
                         ORDER BY relevance_score DESC, decision_id
                         LIMIT 20
                       ) scored_candidates
                     ) AS candidate_relevance_scores
            )
            SELECT counts.candidate_decisions_retrieved,
                   counts.decisions_remaining_after_filtering,
                   counts.candidate_relevance_scores,
                   eligible.decision_id, eligible.repository_id,
                   eligible.decision_title, eligible.summary,
                   eligible.decision_status, eligible.review_status,
                   eligible.review_reason, eligible.is_active,
                   eligible.rationale, eligible.alternatives, eligible.tradeoffs,
                   eligible.relevance_score, eligible.retrieval_method,
                   de.id AS evidence_id, de.evidence_role,
                   de.evidence_excerpt AS excerpt,
                   source.id AS discussion_id, source.repository_id AS source_repository_id,
                   source.source_type, source.title AS source_title, source.source_url,
                   source.body AS source_body
            FROM counts
            LEFT JOIN eligible ON TRUE
            LEFT JOIN decision_evidence de ON de.decision_id = eligible.decision_id
            LEFT JOIN discussions source
              ON source.id = de.discussion_id
             AND source.repository_id = eligible.repository_id
            ORDER BY eligible.relevance_score DESC, eligible.is_active DESC,
                     eligible.decision_title, source.source_created_at NULLS LAST,
                     de.id
            """,
            (tsquery, normalized_query, normalized_query, repository_id, _MIN_RELEVANCE_SCORE, limit),
        )
        rows = [dict(row) for row in cur.fetchall()]

    first_row = rows[0] if rows else {}
    candidate_count = int(first_row.get("candidate_decisions_retrieved") or 0)
    filtered_count = int(first_row.get("decisions_remaining_after_filtering") or 0)
    log_qa_event(
        "qa.retrieval_query_executed",
        repository_id=str(repository_id),
        raw_row_count=len(rows),
        raw_decision_count=candidate_count,
    )
    log_qa_event(
        "qa.decisions_remaining_after_filters",
        repository_id=str(repository_id),
        candidate_decision_count=candidate_count,
        remaining_decision_count=filtered_count,
    )
    evidence, retrieved_evidence_count = _validated_retrieval_rows(rows, repository_id)
    log_qa_event(
        "qa.evidence_validation",
        repository_id=str(repository_id),
        evidence_records_retrieved=retrieved_evidence_count,
        evidence_records_passing_validation=len(evidence),
        evidence_records_rejected=retrieved_evidence_count - len(evidence),
    )
    methods: set[str] = set()
    for row in rows:
        if row.get("decision_id") is None:
            continue
        methods.add(str(row["retrieval_method"]))
    relevance_scores = first_row.get("candidate_relevance_scores") or []
    diagnostics: dict[str, object] = {
        "repository_id": str(repository_id),
        "original_question": question,
        "normalized_query": normalized_query,
        "candidate_decisions_retrieved": candidate_count,
        "decisions_remaining_after_filtering": filtered_count,
        "evidence_records_retrieved": retrieved_evidence_count,
        "evidence_records_passing_validation": len(evidence),
        "retrieval_strategy": (
            "+".join(sorted(methods)) + "+token_coverage_v1"
            if methods
            else "below_relevance_threshold"
            if candidate_count
            else "no_match"
        ),
        "relevance_scores": relevance_scores,
        "minimum_relevance_threshold": _MIN_RELEVANCE_SCORE,
        "llm_invoked": False,
        "fallback_reason": None,
    }
    return RetrievalResult(evidence, diagnostics)


def _make_fallback(answer: AnswerResult) -> AnswerResult:
    return AnswerResult(
        _INSUFFICIENT_EVIDENCE,
        [],
        answer.provider,
        answer.model,
        answer.prompt_tokens,
        answer.completion_tokens,
        answer.latency_ms,
    )


def validate_citations(
    conn: Connection,
    repository_id: UUID,
    retrieved: list[dict[str, object]],
    citations: list[str],
) -> list[dict[str, object]]:
    retrieved_by_id = {str(item["evidence_id"]): item for item in retrieved}
    if any(citation not in retrieved_by_id for citation in citations):
        return []
    with conn.cursor() as cur:
        for citation in dict.fromkeys(citations):
            try:
                evidence_id = UUID(citation)
            except ValueError:
                return []
            cur.execute(
                """
                SELECT de.id
                FROM decision_evidence de
                JOIN decisions d ON d.id = de.decision_id
                JOIN discussions source ON source.id = de.discussion_id
                WHERE de.id = %s
                  AND d.repository_id = %s
                  AND source.repository_id = d.repository_id
                  AND NULLIF(BTRIM(de.evidence_excerpt), '') IS NOT NULL
                  AND NULLIF(BTRIM(source.source_url), '') IS NOT NULL
                """,
                (evidence_id, repository_id),
            )
            if not cur.fetchone():
                return []
    return [retrieved_by_id[citation] for citation in dict.fromkeys(citations)]


def answer_question(
    conn: Connection,
    repository_id: UUID,
    question: str,
    history: list[dict[str, str]],
    limit: int = 8,
) -> tuple[AnswerResult, list[dict[str, object]], int, dict[str, object]]:
    retrieval_started = time.monotonic()
    retrieval = retrieve_evidence(conn, repository_id, question, limit)
    retrieval_latency = int((time.monotonic() - retrieval_started) * 1000)
    diagnostics = retrieval.diagnostics
    candidate_count = int(diagnostics["candidate_decisions_retrieved"])
    filtered_count = int(diagnostics["decisions_remaining_after_filtering"])
    retrieved_evidence_count = int(diagnostics["evidence_records_retrieved"])
    if not retrieval.evidence:
        if diagnostics["candidate_decisions_retrieved"] == 0:
            fallback_reason = "no_matching_decisions"
        elif diagnostics["decisions_remaining_after_filtering"] == 0:
            fallback_reason = "below_relevance_threshold"
        elif diagnostics["evidence_records_retrieved"] == 0:
            fallback_reason = "decision_has_no_evidence"
        else:
            fallback_reason = "evidence_provenance_validation_failed"
        diagnostics["fallback_reason"] = fallback_reason
        log_qa_event(
            "qa.fallback_triggered",
            reason=fallback_reason,
            repository_id=str(repository_id),
            candidate_decision_count=candidate_count,
            remaining_decision_count=filtered_count,
            evidence_records_retrieved=retrieved_evidence_count,
            evidence_records_passing_validation=len(retrieval.evidence),
            llm_invoked=False,
        )
        answer = AnswerResult(
            _INSUFFICIENT_EVIDENCE,
            [],
            settings.model_provider,
            settings.active_model_name,
        )
        return answer, [], retrieval_latency, diagnostics

    context = [{
        "evidence_id": str(item["evidence_id"]),
        "decision_id": str(item["decision_id"]),
        "decision_title": item["decision_title"],
        "decision_summary": item["summary"],
        "summary": item["summary"],
        "decision_status": item["decision_status"],
        "review_status": item["review_status"],
        "review_reason": item["review_reason"],
        "decision_is_active": item["is_active"],
        "rationale": item["rationale"],
        "alternatives": item["alternatives"],
        "tradeoffs": item["tradeoffs"],
        "discussion_id": str(item["discussion_id"]),
        "source_type": item["source_type"],
        "source_title": item["source_title"],
        "source_url": item["source_url"],
        "source_body": str(item["source_body"] or "")[:4000],
        "excerpt": item["excerpt"],
        "evidence_role": item["evidence_role"],
        "relevance_score": item["relevance_score"],
    } for item in retrieval.evidence]
    log_qa_event(
        "qa.context_assembled",
        repository_id=str(repository_id),
        context_record_count=len(context),
        context_decision_count=len({str(item["decision_id"]) for item in context}),
    )
    provider = build_provider(
        settings.model_provider,
        settings.active_model_name,
        settings.active_base_url,
        settings.active_api_key,
        settings.active_timeout_seconds,
        groq_max_retries=settings.groq_max_retries,
    )
    diagnostics["llm_invoked"] = True
    invocation_event = (
        "qa.groq_invocation_started"
        if settings.model_provider == "groq"
        else "qa.model_invocation_started"
    )
    response_event = (
        "qa.groq_response_received"
        if settings.model_provider == "groq"
        else "qa.model_response_received"
    )
    log_qa_event(
        invocation_event,
        provider=settings.model_provider,
        model=settings.active_model_name,
        context_record_count=len(context),
    )
    try:
        answer = provider.answer_question(question, history, context)
    except ProviderError as exc:
        diagnostics["llm_error_stage"] = exc.stage
        diagnostics["llm_error_code"] = exc.response_error_code
        log_qa_event(
            "qa.groq_invocation_failed" if settings.model_provider == "groq" else "qa.model_invocation_failed",
            provider=settings.model_provider,
            model=settings.active_model_name,
            error_stage=exc.stage,
            error_code=exc.response_error_code,
        )
        raise QAGenerationError(exc, diagnostics) from exc
    log_qa_event(
        response_event,
        provider=answer.provider,
        model=answer.model,
        response_contains_text=bool(answer.answer.strip()),
        citation_count=len(answer.citations),
        latency_ms=answer.latency_ms,
    )
    retrieved_ids = {str(item["evidence_id"]) for item in retrieval.evidence}
    if not answer.answer.strip():
        diagnostics["fallback_reason"] = "llm_returned_empty_response"
        log_qa_event("qa.fallback_triggered", reason=diagnostics["fallback_reason"], llm_invoked=True)
        answer = _make_fallback(answer)
    elif answer.answer.strip().casefold() == _INSUFFICIENT_EVIDENCE.casefold():
        diagnostics["fallback_reason"] = "llm_reported_insufficient_evidence"
        log_qa_event("qa.fallback_triggered", reason=diagnostics["fallback_reason"], llm_invoked=True)
        answer = _make_fallback(answer)
    elif not answer.citations:
        diagnostics["fallback_reason"] = "llm_returned_no_citations"
        log_qa_event("qa.fallback_triggered", reason=diagnostics["fallback_reason"], llm_invoked=True)
        answer = _make_fallback(answer)
    elif any(citation not in retrieved_ids for citation in answer.citations):
        diagnostics["fallback_reason"] = "llm_cited_unretrieved_evidence"
        log_qa_event("qa.fallback_triggered", reason=diagnostics["fallback_reason"], llm_invoked=True)
        answer = _make_fallback(answer)
    return answer, retrieval.evidence, retrieval_latency, diagnostics
