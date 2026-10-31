import time
from uuid import UUID

from psycopg import Connection

from .config import settings
from .providers import AnswerResult, build_provider


def retrieve_evidence(conn: Connection, repository_id: UUID, question: str, limit: int = 8) -> list[dict[str, object]]:
    terms = question.strip()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT de.id AS evidence_id, d.id AS decision_id, d.status AS decision_status,
                   d.review_status, d.title AS decision_title, d.summary,
                   de.evidence_role, de.evidence_excerpt AS excerpt,
                   source.id AS discussion_id, source.source_type,
                   source.title AS source_title, source.source_url,
                   (d.review_status IN ('approved', 'valid')) AS is_trusted,
                   ts_rank(
                     to_tsvector('simple', concat_ws(' ', d.title, d.summary,
                       d.rationale::text, d.alternatives::text, d.tradeoffs::text,
                       source.title, source.body, de.evidence_excerpt)),
                     plainto_tsquery('simple', %s)
                   ) AS rank
            FROM decision_evidence de
            JOIN decisions d ON d.id = de.decision_id
            JOIN discussions source ON source.id = de.discussion_id
            WHERE d.repository_id = %s
              AND d.is_active = TRUE
              AND (
                to_tsvector('simple', concat_ws(' ', d.title, d.summary,
                  d.rationale::text, d.alternatives::text, d.tradeoffs::text,
                  source.title, source.body, de.evidence_excerpt))
                  @@ plainto_tsquery('simple', %s)
                OR LOWER(concat_ws(' ', d.title, d.summary, source.title, source.body)) LIKE %s
              )
            ORDER BY rank DESC, d.extracted_at DESC
            LIMIT %s
            """,
            (terms, repository_id, terms, f"%{terms.lower()}%", limit),
        )
        rows = cur.fetchall()
        cur.execute(
            """
            SELECT de.id AS evidence_id, rel.source_decision_id AS decision_id,
                   source_decision.status AS decision_status, source_decision.review_status,
                   rel.explanation AS summary, rel.relationship_type AS evidence_role,
                   de.evidence_excerpt AS excerpt, source.id AS discussion_id,
                   source.source_type, source.title AS source_title, source.source_url,
                   TRUE AS is_trusted
            FROM decision_relationships rel
            JOIN decisions source_decision ON source_decision.id = rel.source_decision_id
            JOIN LATERAL jsonb_array_elements_text(rel.evidence_ids) evidence_ref(value) ON TRUE
            JOIN decision_evidence de ON de.id = evidence_ref.value::uuid
            JOIN discussions source ON source.id = de.discussion_id
            WHERE rel.repository_id = %s
              AND rel.review_status IN ('approved', 'valid')
              AND LOWER(concat_ws(' ', rel.relationship_type, rel.explanation,
                  source_decision.title, source_decision.summary)) LIKE %s
            LIMIT %s
            """,
            (repository_id, f"%{terms.lower()}%", limit),
        )
        rows.extend(cur.fetchall())
    return [dict(row) for row in rows]


def validate_citations(conn: Connection, repository_id: UUID, retrieved: list[dict[str, object]], citations: list[str]) -> list[dict[str, object]]:
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
                "SELECT de.id FROM decision_evidence de JOIN decisions d ON d.id = de.decision_id WHERE de.id = %s AND d.repository_id = %s",
                (evidence_id, repository_id),
            )
            if not cur.fetchone():
                return []
    return [retrieved_by_id[citation] for citation in dict.fromkeys(citations)]


def answer_question(conn: Connection, repository_id: UUID, question: str, history: list[dict[str, str]], limit: int = 8) -> tuple[AnswerResult, list[dict[str, object]], int]:
    retrieval_started = time.monotonic()
    retrieved = retrieve_evidence(conn, repository_id, question, limit)
    retrieval_latency = int((time.monotonic() - retrieval_started) * 1000)
    context = [{
        "evidence_id": str(item["evidence_id"]),
        "decision_id": str(item["decision_id"]),
        "discussion_id": str(item["discussion_id"]),
        "source_type": item["source_type"],
        "source_title": item["source_title"],
        "source_url": item["source_url"],
        "excerpt": item["excerpt"],
        "evidence_role": item["evidence_role"],
        "decision_status": item["decision_status"],
        "review_status": item["review_status"],
        "is_trusted": item["is_trusted"],
        "summary": item["summary"],
    } for item in retrieved]
    provider = build_provider(
        settings.model_provider,
        settings.active_model_name,
        settings.active_base_url,
        settings.active_api_key,
        settings.active_timeout_seconds,
        groq_max_retries=settings.groq_max_retries,
    )
    return provider.answer_question(question, history, context), retrieved, retrieval_latency