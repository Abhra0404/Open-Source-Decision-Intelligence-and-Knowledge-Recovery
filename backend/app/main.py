from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
import time
from uuid import UUID

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg import Connection
from psycopg.types.json import Jsonb

from .database import connection, get_connection, lock_repository, open_weight_model_lock
from .github import GitHubClient, GitHubError
from .cleaning import clean_discussion
from .chat import answer_question as generate_chat_answer, validate_citations
from .extraction import DiscussionInput, ExtractedDecision, ValidationOutcome, assess_candidate, detect_decision_signals
from .ingestion import ingest_repository, parse_repository_url
from .config import settings
from .deduplication import DecisionMatch, match_candidate
from .providers import ProviderError, build_provider
from .relationships import RelationshipProposal, validate_relationship
from .schemas import ChatMessageCreate, ConversationCreate, ExtractionRequest, ExtractionResponse, IngestionCreate, IngestionResponse, RelationshipReviewRequest, RepositoryCreate, RepositoryResponse, ReviewRequest, SearchRequest

app = FastAPI(title="METIS API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
executor = ThreadPoolExecutor(max_workers=2)


@dataclass(frozen=True)
class CandidatePersistence:
    disposition: str
    match: DecisionMatch
    decision_id: UUID | None = None


def _configured_provider():
    return build_provider(
        settings.model_provider,
        settings.active_model_name,
        settings.active_base_url,
        settings.active_api_key,
        settings.active_timeout_seconds,
        groq_max_retries=settings.groq_max_retries,
    )


@app.on_event("startup")
def validate_provider_configuration() -> None:
    _configured_provider()


def error(code: str, message: str, status_code: int) -> HTTPException:
    return HTTPException(status_code, detail={"error": {"code": code, "message": message, "details": None}})


@app.get("/health")
def health() -> dict[str, str]:
    with connection() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/api/v1/system/model-config")
def get_model_config() -> dict:
    provider = settings.model_provider
    return {
        "provider": provider,
        "model_name": settings.active_model_name,
        "base_url": settings.active_base_url or "(hosted provider default)",
        "timeout_seconds": settings.active_timeout_seconds,
        "groq_max_retries": settings.groq_max_retries,
        "status": "ready",
        "has_api_key": bool(settings.active_api_key),
        "capabilities": [
            "Decision Extraction",
            "Status Classification (Accepted, Rejected, Proposed, Unresolved)",
            "Independent Evidence Grounding",
            "Decision Relationship Proposal",
            "Evidence-Grounded Intelligence Q&A"
        ]
    }


@app.get("/api/v1/repositories")
def list_repositories(conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id, full_name, html_url, description, default_branch, is_private, created_at, updated_at FROM repositories ORDER BY full_name")
        items = cur.fetchall()
    return {"items": items, "total": len(items)}


@app.post("/api/v1/repositories/{repository_id}/chat/conversations")
def create_chat_conversation(repository_id: UUID, payload: ConversationCreate, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM repositories WHERE id = %s", (repository_id,))
        if not cur.fetchone():
            raise error("REPOSITORY_NOT_FOUND", "The repository is not registered.", 404)
        cur.execute(
            "INSERT INTO chat_conversations (repository_id, title) VALUES (%s, %s) RETURNING *",
            (repository_id, payload.title),
        )
        conversation = cur.fetchone()
    conn.commit()
    return conversation


@app.get("/api/v1/repositories/{repository_id}/chat/conversations")
def list_chat_conversations(repository_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM chat_conversations WHERE repository_id = %s ORDER BY updated_at DESC", (repository_id,))
        items = cur.fetchall()
    return {"items": items, "total": len(items)}


@app.get("/api/v1/chat/conversations/{conversation_id}")
def get_chat_conversation(conversation_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM chat_conversations WHERE id = %s", (conversation_id,))
        conversation = cur.fetchone()
        if not conversation:
            raise error("CONVERSATION_NOT_FOUND", "The conversation was not found.", 404)
        cur.execute("SELECT * FROM chat_messages WHERE conversation_id = %s ORDER BY created_at", (conversation_id,))
        messages = cur.fetchall()
        for message in messages:
            cur.execute(
                "SELECT de.id AS evidence_id, d.id AS decision_id, d.source_discussion_id, d.status AS decision_status, d.review_status, de.evidence_role, de.evidence_excerpt AS excerpt, source.source_url FROM chat_message_sources cms JOIN decision_evidence de ON de.id = cms.evidence_id JOIN decisions d ON d.id = de.decision_id JOIN discussions source ON source.id = de.discussion_id WHERE cms.message_id = %s",
                (message["id"],),
            )
            message["sources"] = cur.fetchall()
        conversation["messages"] = messages
    return conversation


@app.get("/api/v1/chat/conversations/{conversation_id}/messages")
def list_chat_messages(conversation_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM chat_conversations WHERE id = %s", (conversation_id,))
        if not cur.fetchone():
            raise error("CONVERSATION_NOT_FOUND", "The conversation was not found.", 404)
        cur.execute("SELECT * FROM chat_messages WHERE conversation_id = %s ORDER BY created_at", (conversation_id,))
        items = cur.fetchall()
        for message in items:
            cur.execute(
                "SELECT de.id AS evidence_id, de.evidence_role, de.evidence_excerpt AS excerpt, source.source_url FROM chat_message_sources cms JOIN decision_evidence de ON de.id = cms.evidence_id JOIN discussions source ON source.id = de.discussion_id WHERE cms.message_id = %s",
                (message["id"],),
            )
            message["sources"] = cur.fetchall()
    return {"items": items, "total": len(items)}


@app.post("/api/v1/chat/conversations/{conversation_id}/messages")
def create_chat_message(conversation_id: UUID, payload: ChatMessageCreate, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM chat_conversations WHERE id = %s FOR UPDATE", (conversation_id,))
        conversation = cur.fetchone()
        if not conversation:
            raise error("CONVERSATION_NOT_FOUND", "The conversation was not found.", 404)
        cur.execute("SELECT role, content FROM chat_messages WHERE conversation_id = %s ORDER BY created_at DESC LIMIT 6", (conversation_id,))
        history = list(reversed(cur.fetchall()))
    try:
        answer, retrieved, retrieval_latency = generate_chat_answer(
            conn, conversation["repository_id"], payload.content, history,
        )
        cited_sources = validate_citations(conn, conversation["repository_id"], retrieved, answer.citations)
        if answer.citations and len(cited_sources) != len(dict.fromkeys(answer.citations)):
            answer = answer.__class__(
                "I couldn't find sufficient evidence in this repository to answer that question.",
                [], answer.provider, answer.model, answer.prompt_tokens, answer.completion_tokens, answer.latency_ms,
            )
            cited_sources = []
        elif retrieved and not answer.citations:
            answer = answer.__class__(
                "I couldn't find sufficient evidence in this repository to answer that question.",
                [], answer.provider, answer.model, answer.prompt_tokens, answer.completion_tokens, answer.latency_ms,
            )
    except Exception as exc:
        conn.rollback()
        raise error("CHAT_GENERATION_FAILED", str(exc)[:500], 502) from exc
    with conn.cursor() as cur:
        cur.execute("INSERT INTO chat_messages (conversation_id, role, content) VALUES (%s, 'user', %s) RETURNING id", (conversation_id, payload.content))
        user_message_id = cur.fetchone()["id"]
        cur.execute(
            """
            INSERT INTO chat_messages
              (conversation_id, role, content, provider, model_name,
               retrieval_latency_ms, generation_latency_ms,
               retrieved_evidence_count, citation_count)
            VALUES (%s, 'assistant', %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (conversation_id, answer.answer, answer.provider, answer.model,
             retrieval_latency, answer.latency_ms, len(retrieved), len(cited_sources)),
        )
        assistant_message = cur.fetchone()
        for source in cited_sources:
            cur.execute("INSERT INTO chat_message_sources (message_id, evidence_id) VALUES (%s, %s)", (assistant_message["id"], source["evidence_id"]))
        cur.execute("UPDATE chat_conversations SET updated_at = NOW() WHERE id = %s", (conversation_id,))
    conn.commit()
    assistant_message["sources"] = cited_sources
    return {"user_message_id": user_message_id, "message": assistant_message, "sources": cited_sources}


@app.post("/api/v1/repositories", response_model=RepositoryResponse, status_code=201)
def register_repository(payload: RepositoryCreate, conn: Connection = Depends(get_connection)) -> RepositoryResponse:
    try:
        owner, name = parse_repository_url(str(payload.repository_url))
        client = GitHubClient()
        try:
            metadata = client.repository(owner, name)
        finally:
            client.close()
    except (ValueError, GitHubError) as exc:
        raise error("INVALID_REPOSITORY", str(exc), 400) from exc
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO repositories (github_id, owner, name, full_name, html_url, description, default_branch, is_private)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (full_name) DO UPDATE SET updated_at = NOW()
            RETURNING id, full_name, html_url
            """,
            (str(metadata["id"]), owner, name, metadata["full_name"], metadata["html_url"], metadata.get("description"),
             metadata.get("default_branch"), metadata.get("private", False)),
        )
        repository = cur.fetchone()
    conn.commit()
    return RepositoryResponse(**repository, status="registered")


def run_ingestion(ingestion_id: UUID, repository_id: UUID, owner: str, name: str, options: IngestionCreate) -> None:
    with connection() as conn:
        lock_repository(conn, repository_id)
        conn.execute("UPDATE ingestion_runs SET status = 'running', started_at = NOW() WHERE id = %s", (ingestion_id,))
        conn.commit()
        try:
            fetched, created, updated = ingest_repository(conn, repository_id, owner, name, options.max_items, options.include_reviews)
            conn.execute(
                "UPDATE ingestion_runs SET status = 'completed', records_fetched = %s, records_created = %s, records_updated = %s, completed_at = NOW() WHERE id = %s",
                (fetched, created, updated, ingestion_id),
            )
        except Exception as exc:
            conn.rollback()
            conn.execute("UPDATE ingestion_runs SET status = 'failed', error_message = %s, completed_at = NOW() WHERE id = %s", (str(exc)[:1000], ingestion_id))
        conn.commit()


@app.post("/api/v1/repositories/{repository_id}/ingestions", response_model=IngestionResponse, status_code=202)
def start_ingestion(repository_id: UUID, options: IngestionCreate, background_tasks: BackgroundTasks, conn: Connection = Depends(get_connection)) -> IngestionResponse:
    with conn.cursor() as cur:
        cur.execute("SELECT id, owner, name FROM repositories WHERE id = %s", (repository_id,))
        repository = cur.fetchone()
        if not repository:
            raise error("REPOSITORY_NOT_FOUND", "The repository is not registered.", 404)
        cur.execute("INSERT INTO ingestion_runs (repository_id) VALUES (%s) RETURNING id", (repository_id,))
        ingestion_id = cur.fetchone()["id"]
    conn.commit()
    background_tasks.add_task(run_ingestion, ingestion_id, repository_id, repository["owner"], repository["name"], options)
    return IngestionResponse(ingestion_id=ingestion_id, repository_id=repository_id, status="queued")


@app.get("/api/v1/ingestions/{ingestion_id}")
def get_ingestion(ingestion_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM ingestion_runs WHERE id = %s", (ingestion_id,))
        result = cur.fetchone()
    if not result:
        raise error("INGESTION_NOT_FOUND", "The ingestion run was not found.", 404)
    return result


@app.get("/api/v1/repositories/{repository_id}/discussions")
def list_discussions(repository_id: UUID, limit: int = Query(50, ge=1, le=100), conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id, source_type, title, body, author_login, source_url, source_created_at FROM discussions WHERE repository_id = %s ORDER BY source_created_at DESC NULLS LAST LIMIT %s", (repository_id, limit))
        items = cur.fetchall()
    return {"items": items, "total": len(items)}


def run_extraction(extraction_id: UUID, repository_id: UUID, force_reprocess: bool) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE extraction_runs SET status = 'waiting_for_model', queued_at = COALESCE(queued_at, created_at) WHERE id = %s AND status = 'queued' RETURNING id",
                (extraction_id,),
            )
            queued_run = cur.fetchone()
        conn.commit()
        if not queued_run:
            return
    try:
        if settings.model_provider in {"open_weight", "ollama"}:
            with open_weight_model_lock(settings.active_model_name, timeout_seconds=30) as lock_acquired_at:
                _run_extraction_body(extraction_id, repository_id, force_reprocess, lock_acquired_at)
        else:
            _run_extraction_body(extraction_id, repository_id, force_reprocess, None)
    except Exception as exc:
        with connection() as conn:
            conn.execute(
                "UPDATE extraction_runs SET status = 'failed', error_message = %s, failed_at = clock_timestamp(), completed_at = clock_timestamp(), queue_duration_ms = COALESCE(queue_duration_ms, (EXTRACT(EPOCH FROM (clock_timestamp() - COALESCE(queued_at, created_at))) * 1000)::integer) WHERE id = %s AND status IN ('queued', 'waiting_for_model', 'running')",
                (str(exc)[:1000], extraction_id),
            )
            conn.commit()


def _run_extraction_body(extraction_id: UUID, repository_id: UUID, force_reprocess: bool,
                         lock_acquired_at: datetime | None) -> None:
    with connection() as conn:
        lock_repository(conn, repository_id)
        inference_started: float | None = None
        model_calls_completed = 0
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        model_latency_ms = 0
        prompt_tokens_complete = True
        completion_tokens_complete = True
        total_tokens_complete = True
        model_retry_count = 0
        model_response_ids: list[str] = []
        model_revision = None
        try:
            provider = _configured_provider()
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE extraction_runs SET status = 'running', lock_acquired_at = %s, started_at = clock_timestamp(), queue_duration_ms = CASE WHEN %s::timestamptz IS NOT NULL THEN (EXTRACT(EPOCH FROM (%s::timestamptz - COALESCE(queued_at, created_at))) * 1000)::integer END WHERE id = %s AND status IN ('queued', 'waiting_for_model') RETURNING id",
                    (lock_acquired_at, lock_acquired_at, lock_acquired_at, extraction_id),
                )
                transitioned = cur.fetchone()
            if not transitioned:
                conn.rollback()
                return
            model_info = provider.get_model_info()
            conn.execute(
                "UPDATE extraction_runs SET model_provider = %s, model_name = %s, model_revision = %s WHERE id = %s",
                (model_info["provider"], model_info["model"], model_info.get("revision"), extraction_id),
            )
            conn.commit()
            inference_started = time.monotonic()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, source_type, title, COALESCE(cleaned_body, body) AS body,
                           author_login, source_url, source_created_at,
                           COALESCE(parent_number, (raw_payload->>'number')::integer) AS thread_number
                    FROM discussions
                    WHERE repository_id = %s
                    ORDER BY source_created_at ASC NULLS LAST, id ASC
                    """,
                    (repository_id,),
                )
                rows = cur.fetchall()
                total_records = len(rows)
                usable_rows = []
                all_thread_metadata: dict[str, dict[str, object]] = {}
                thread_rows: dict[str, list[dict]] = {}
                unusable_thread_keys: set[str] = set()
                for row in rows:
                    cleaned = clean_discussion(row["body"], row["author_login"])
                    cur.execute(
                        "UPDATE discussions SET cleaned_body = %s, is_usable = %s, cleaning_reason = %s WHERE id = %s",
                        (cleaned.body, cleaned.is_usable, cleaned.filter_reason, row["id"]),
                    )
                    thread_key = (
                        f"parent:{row['thread_number']}"
                        if row["thread_number"] is not None
                        else f"source:{row['id']}"
                    )
                    metadata = all_thread_metadata.setdefault(thread_key, {
                        "thread_number": row["thread_number"],
                        "discussion_id": row["id"],
                        "source_type": row["source_type"],
                        "title": row["title"],
                        "associated_records": 0,
                        "cleaned_content_length": 0,
                        "filter_reasons": [],
                    })
                    metadata["associated_records"] = int(metadata["associated_records"]) + 1
                    metadata["cleaned_content_length"] = int(metadata["cleaned_content_length"]) + len(cleaned.body)
                    thread_rows.setdefault(thread_key, []).append({
                        "discussion_id": row["id"],
                        "source_type": row["source_type"],
                        "title": row["title"],
                        "thread_number": row["thread_number"],
                        "cleaned_content_length": len(cleaned.body),
                    })
                    if cleaned.is_usable:
                        row["body"] = cleaned.body
                        usable_rows.append(row)
                    else:
                        unusable_thread_keys.add(thread_key)
                        cast_reasons = metadata["filter_reasons"]
                        if isinstance(cast_reasons, list) and cleaned.filter_reason:
                            cast_reasons.append(cleaned.filter_reason)
            grouped: dict[str, list[DiscussionInput]] = {}
            thread_metadata: dict[str, dict[str, object]] = all_thread_metadata
            for row in usable_rows:
                if row["thread_number"] is not None:
                    thread_key = f"parent:{row['thread_number']}"
                else:
                    thread_key = f"source:{row['id']}"
                record = DiscussionInput(
                    id=row["id"], source_type=row["source_type"], title=row["title"],
                    body=row["body"], author_login=row["author_login"],
                    source_url=row["source_url"], source_created_at=row["source_created_at"],
                )
                grouped.setdefault(thread_key, []).append(record)
            diagnostics: list[dict[str, object]] = []
            unusable_threads = len(unusable_thread_keys - set(grouped))
            for thread_key in sorted(unusable_thread_keys - set(grouped)):
                metadata = thread_metadata[thread_key]
                reasons = metadata.get("filter_reasons", [])
                reason = ", ".join(reasons) if isinstance(reasons, list) else "unusable_content"
                for row_metadata in thread_rows[thread_key]:
                    diagnostics.append(_diagnostic(
                        {**metadata, **row_metadata}, extraction_id, repository_id,
                        False, None, False, "invalid_thread", reason, usable=False,
                    ))
            valid_threads = len(grouped)
            threads_with_signals = 0
            no_decision_signal = 0
            candidates_generated = 0
            candidates_rejected = 0
            decisions_existing = 0
            created = 0
            for thread_key, records in grouped.items():
                if _extraction_cancelled(conn, extraction_id):
                    conn.rollback()
                    return
                lifecycle: dict[str, object] = {
                    "detected_signals": [],
                    "schema_validation_result": "not_run",
                    "semantic_validation_result": "not_run",
                    "validation_errors": [],
                    "persistence_result": "not_attempted",
                }
                signal_detected = False
                matched_rule = None
                try:
                    detected_signals = detect_decision_signals(records)
                    lifecycle["detected_signals"] = detected_signals
                    signal_detected = bool(detected_signals)
                    matched_rule = detected_signals[0]["signal_type"] if detected_signals else None
                    if signal_detected:
                        threads_with_signals += 1
                    provider_result = provider.extract_decision(repository_id, records)
                    model_calls_completed += 1
                    candidate = provider_result.candidate
                    model_retry_count += provider_result.retry_count
                    if provider_result.response_id:
                        model_response_ids.append(provider_result.response_id)
                    if provider_result.prompt_tokens is None:
                        prompt_tokens_complete = False
                    else:
                        prompt_tokens += provider_result.prompt_tokens
                    if provider_result.completion_tokens is None:
                        completion_tokens_complete = False
                    else:
                        completion_tokens += provider_result.completion_tokens
                    if provider_result.total_tokens is None:
                        total_tokens_complete = False
                    else:
                        total_tokens += provider_result.total_tokens
                    model_latency_ms += provider_result.latency_ms or 0
                    model_revision = model_revision or provider_result.revision
                    lifecycle.update({
                        "model_response_id": provider_result.response_id,
                        "input_tokens": provider_result.prompt_tokens,
                        "output_tokens": provider_result.completion_tokens,
                        "total_tokens": provider_result.total_tokens,
                        "retry_count": provider_result.retry_count,
                    })
                    if _extraction_cancelled(conn, extraction_id):
                        conn.rollback()
                        return
                except Exception as exc:
                    if getattr(exc, "model_call_completed", False):
                        model_calls_completed += 1
                        model_latency_ms += getattr(exc, "latency_ms", 0) or 0
                        error_prompt_tokens = getattr(exc, "prompt_tokens", None)
                        error_completion_tokens = getattr(exc, "completion_tokens", None)
                        error_total_tokens = getattr(exc, "total_tokens", None)
                        if error_prompt_tokens is None:
                            prompt_tokens_complete = False
                        else:
                            prompt_tokens += error_prompt_tokens
                        if error_completion_tokens is None:
                            completion_tokens_complete = False
                        else:
                            completion_tokens += error_completion_tokens
                        if error_total_tokens is None:
                            total_tokens_complete = False
                        else:
                            total_tokens += error_total_tokens
                        model_revision = model_revision or getattr(exc, "revision", None)
                    elif getattr(exc, "stage", None):
                        prompt_tokens_complete = False
                        completion_tokens_complete = False
                        total_tokens_complete = False
                        model_latency_ms += getattr(exc, "latency_ms", 0) or 0
                    model_retry_count += getattr(exc, "retry_count", 0)
                    error_response_id = getattr(exc, "response_id", None)
                    if error_response_id:
                        model_response_ids.append(error_response_id)
                    lifecycle.update({
                        "model_response_id": error_response_id,
                        "input_tokens": getattr(exc, "prompt_tokens", None),
                        "output_tokens": getattr(exc, "completion_tokens", None),
                        "total_tokens": getattr(exc, "total_tokens", None),
                        "retry_count": getattr(exc, "retry_count", 0),
                    })
                    lifecycle["validation_errors"] = [f"{getattr(exc, 'stage', 'extraction')}: {str(exc)[:1000]}"]
                    for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id, repository_id, signal_detected, matched_rule,
                            False, "extraction_error", str(exc)[:1000], details=lifecycle,
                        ))
                    continue
                if candidate is None:
                    lifecycle["schema_validation_result"] = "not_generated"
                    outcome_name = "no_decision_signal" if not signal_detected else "insufficient_evidence"
                    if not signal_detected:
                        no_decision_signal += 1
                    for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id, repository_id, signal_detected, matched_rule,
                            False, outcome_name, details=lifecycle,
                        ))
                    continue
                candidates_generated += 1
                lifecycle.update({
                    "candidate_title": candidate.title,
                    "candidate_status": candidate.status,
                    "candidate_summary": candidate.summary,
                    "candidate_source_discussion_id": str(candidate.source_discussion_id),
                    "candidate_rationale": candidate.rationale,
                    "candidate_alternatives": candidate.alternatives,
                    "candidate_tradeoffs": candidate.tradeoffs,
                    "evidence_references": _evidence_details(candidate),
                    "schema_validation_result": "passed",
                })
                try:
                    outcome = assess_candidate(candidate, records, repository_id)
                except Exception as exc:
                    candidates_rejected += 1
                    lifecycle["semantic_validation_result"] = "error"
                    lifecycle["validation_errors"] = [f"semantic_validation: {str(exc)[:1000]}"]
                    for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id, repository_id, signal_detected, matched_rule,
                            True, "extraction_error", str(exc)[:1000], details=lifecycle,
                        ))
                    continue
                candidate = outcome.candidate
                lifecycle["semantic_validation_result"] = outcome.review_status
                if outcome.review_reason:
                    lifecycle["validation_errors"] = [outcome.review_reason]
                if outcome.review_status == "invalid":
                    candidates_rejected += 1
                    for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id, repository_id, signal_detected, matched_rule,
                            True, "insufficient_evidence", outcome.review_reason, details=lifecycle,
                        ))
                    continue
                try:
                    persistence = _persist_candidate(
                        conn,
                        repository_id,
                        candidate,
                        outcome,
                        str(model_info["model"]),
                    )
                except Exception as exc:
                    conn.rollback()
                    candidates_rejected += 1
                    lifecycle["persistence_result"] = "failed"
                    lifecycle["validation_errors"] = [str(exc)[:1000]]
                    for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id, repository_id, signal_detected, matched_rule,
                            True, "extraction_error", str(exc)[:1000], details=lifecycle,
                        ))
                    continue
                lifecycle.update({
                        "duplicate_match_type": persistence.match.match_type,
                        "matched_decision_id": str(persistence.match.matched_decision_id)
                        if persistence.match.matched_decision_id else None,
                        "matched_decision_title": persistence.match.matched_decision_title,
                        "matched_decision_status": persistence.match.matched_decision_status,
                        "matched_decision_review_status": persistence.match.matched_decision_review_status,
                        "matching_rationale": persistence.match.rationale,
                        "similarity_score": persistence.match.similarity_score,
                        "similarity_method": persistence.match.similarity_method,
                        "candidate_disposition": persistence.disposition,
                })
                if persistence.disposition == "matched_existing":
                        decisions_existing += 1
                        for row_metadata in thread_rows[thread_key]:
                            diagnostics.append(_diagnostic(
                                {**thread_metadata[thread_key], **row_metadata},
                                extraction_id, repository_id, signal_detected, matched_rule,
                                True, "duplicate_candidate", persistence.match.rationale, details={
                                    **lifecycle, "persistence_result": "duplicate_skipped",
                                },
                            ))
                        continue
                created += 1
                for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id,
                            repository_id,
                            signal_detected,
                            matched_rule,
                            True,
                            "decision_created",
                            persistence.match.rationale
                            if persistence.match.requires_review else outcome.review_reason,
                            details={
                                **lifecycle,
                                "persistence_result": "decision_and_evidence_inserted",
                            },
                        ))
            with conn.cursor() as cur:
                for diagnostic in diagnostics:
                    cur.execute(
                        """
                        INSERT INTO extraction_diagnostics (
                          extraction_run_id, repository_id, discussion_id, thread_number,
                          source_type, title, associated_records, cleaned_content_length,
                          usable, decision_signal_detected, matched_rule, candidate_generated,
                          candidate_count, detected_signals, candidate_title, candidate_status,
                          candidate_summary, candidate_source_discussion_id, candidate_rationale,
                          candidate_alternatives, candidate_tradeoffs, evidence_references,
                          schema_validation_result,
                          semantic_validation_result, validation_errors, persistence_result,
                          duplicate_match_type, matched_decision_id, matching_rationale,
                          matched_decision_title, matched_decision_status,
                          matched_decision_review_status, similarity_score,
                          similarity_method, candidate_disposition,
                          rejection_reason, outcome, model_response_id, input_tokens,
                          output_tokens, total_tokens, retry_count
                        ) VALUES (
                          %(extraction_run_id)s, %(repository_id)s, %(discussion_id)s, %(thread_number)s,
                          %(source_type)s, %(title)s, %(associated_records)s, %(cleaned_content_length)s,
                          %(usable)s, %(decision_signal_detected)s, %(matched_rule)s, %(candidate_generated)s,
                          %(candidate_count)s, %(detected_signals)s, %(candidate_title)s, %(candidate_status)s,
                          %(candidate_summary)s, %(candidate_source_discussion_id)s, %(candidate_rationale)s,
                          %(candidate_alternatives)s, %(candidate_tradeoffs)s, %(evidence_references)s,
                          %(schema_validation_result)s,
                          %(semantic_validation_result)s, %(validation_errors)s, %(persistence_result)s,
                          %(duplicate_match_type)s, %(matched_decision_id)s, %(matching_rationale)s,
                          %(matched_decision_title)s, %(matched_decision_status)s,
                          %(matched_decision_review_status)s, %(similarity_score)s,
                          %(similarity_method)s, %(candidate_disposition)s,
                          %(rejection_reason)s, %(outcome)s, %(model_response_id)s, %(input_tokens)s,
                          %(output_tokens)s, %(total_tokens)s, %(retry_count)s
                        )
                        """,
                        {
                            **diagnostic,
                            "detected_signals": Jsonb(diagnostic["detected_signals"]),
                            "candidate_rationale": Jsonb(diagnostic["candidate_rationale"]),
                            "candidate_alternatives": Jsonb(diagnostic["candidate_alternatives"]),
                            "candidate_tradeoffs": Jsonb(diagnostic["candidate_tradeoffs"]),
                            "evidence_references": Jsonb(diagnostic["evidence_references"]),
                            "validation_errors": Jsonb(diagnostic["validation_errors"]),
                        },
                    )
            completion_update = conn.execute(
                """
                UPDATE extraction_runs
                SET status = 'completed', records_processed = %s,
                    decisions_created = %s, valid_threads = %s, unusable_threads = %s,
                    threads_with_signals = %s, candidates_generated = %s,
                    candidates_rejected = %s, invalid_threads = %s,
                    no_decision_signal = %s, decisions_existing = %s,
                    completed_at = clock_timestamp(),
                    queue_duration_ms = CASE WHEN lock_acquired_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (lock_acquired_at - COALESCE(queued_at, created_at))) * 1000)::integer END,
                    inference_duration_ms = %s,
                    model_calls_completed = %s, model_retry_count = %s,
                    model_response_ids = %s
                WHERE id = %s AND status = 'running'
                RETURNING id
                """,
                (total_records, created, valid_threads, unusable_threads,
                 threads_with_signals, candidates_generated, candidates_rejected,
                 unusable_threads + candidates_rejected, no_decision_signal,
                 decisions_existing,
                 int((time.monotonic() - inference_started) * 1000) if inference_started is not None else None,
                 model_calls_completed, model_retry_count, Jsonb(model_response_ids), extraction_id),
            )
            if not completion_update.fetchone():
                conn.rollback()
                return
            conn.execute(
                "UPDATE extraction_runs SET model_revision = %s, prompt_tokens = %s, completion_tokens = %s, model_total_tokens = %s, model_latency_ms = %s WHERE id = %s",
                (
                    model_revision,
                    prompt_tokens if model_calls_completed and prompt_tokens_complete else None,
                    completion_tokens if model_calls_completed and completion_tokens_complete else None,
                    total_tokens if model_calls_completed and total_tokens_complete else None,
                    model_latency_ms if model_calls_completed else None,
                    extraction_id,
                ),
            )
        except Exception as exc:
            conn.rollback()
            conn.execute(
                """
                UPDATE extraction_runs SET status = 'failed', error_message = %s,
                    failed_at = clock_timestamp(), completed_at = clock_timestamp(),
                    queue_duration_ms = CASE WHEN lock_acquired_at IS NOT NULL THEN
                      (EXTRACT(EPOCH FROM (lock_acquired_at - COALESCE(queued_at, created_at))) * 1000)::integer END,
                    inference_duration_ms = %s, model_calls_completed = %s,
                    model_retry_count = %s, model_response_ids = %s,
                    model_revision = %s, prompt_tokens = %s, completion_tokens = %s,
                    model_total_tokens = %s, model_latency_ms = %s
                WHERE id = %s
                """,
                (
                    str(exc)[:1000],
                    int((time.monotonic() - inference_started) * 1000) if inference_started is not None else None,
                    model_calls_completed, model_retry_count, Jsonb(model_response_ids), model_revision,
                    prompt_tokens if model_calls_completed and prompt_tokens_complete else None,
                    completion_tokens if model_calls_completed and completion_tokens_complete else None,
                    total_tokens if model_calls_completed and total_tokens_complete else None,
                    model_latency_ms if model_calls_completed else None,
                    extraction_id,
                ),
            )
        conn.commit()


def _extraction_cancelled(conn: Connection, extraction_id: UUID) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT status FROM extraction_runs WHERE id = %s", (extraction_id,))
        row = cur.fetchone()
    return bool(row and row["status"] == "cancelled")


def _persist_candidate(conn: Connection, repository_id: UUID, candidate: object,
                       outcome: object, extraction_model: str) -> CandidatePersistence:
    if not isinstance(candidate, ExtractedDecision) or not isinstance(outcome, ValidationOutcome):
        raise TypeError("candidate persistence requires a validated extraction result")
    if candidate.repository_id != repository_id:
        raise ValueError("candidate repository does not match extraction repository")
    source_discussion_id = candidate.source_discussion_id
    lock_repository(conn, repository_id)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.id, d.repository_id, d.source_discussion_id, d.title, d.summary,
                   d.status, d.rationale, d.alternatives, d.tradeoffs,
                   d.review_status, d.review_reason, d.is_active,
                   COALESCE(
                     array_agg(DISTINCT e.discussion_id)
                       FILTER (WHERE e.discussion_id IS NOT NULL),
                     ARRAY[]::uuid[]
                   ) AS evidence_ids
            FROM decisions d
            LEFT JOIN decision_evidence e ON e.decision_id = d.id
            WHERE d.repository_id = %s
            GROUP BY d.id
            """,
            (repository_id,),
        )
        existing_decisions = cur.fetchall()
        match = match_candidate(
            candidate,
            repository_id,
            {evidence.source_id for evidence in outcome.evidence},
            existing_decisions,
        )
        if match.is_duplicate:
            return CandidatePersistence("matched_existing", match)

        review_reason = outcome.review_reason
        review_status = "pending" if outcome.review_status == "valid" else "needs_review"
        disposition = "persisted" if review_status == "pending" else "persisted_for_review"
        if match.requires_review:
            review_status = "needs_review"
            review_reason = (
                f"{match.rationale} Matched existing decision "
                f"{match.matched_decision_id}."
            )
            disposition = "persisted_for_review"
        cur.execute(
            """
            INSERT INTO decisions (
              repository_id, source_discussion_id, title, summary, status,
              rationale, alternatives, tradeoffs, confidence,
              extraction_model, extraction_version, review_status, review_reason
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'prompt-v1', %s, %s)
            RETURNING id
            """,
            (repository_id, source_discussion_id, candidate.title, candidate.summary,
             candidate.status, Jsonb(candidate.rationale), Jsonb(candidate.alternatives),
             Jsonb(candidate.tradeoffs), candidate.confidence, extraction_model,
             review_status, review_reason),
        )
        decision_id = cur.fetchone()["id"]
        for evidence in outcome.evidence:
            cur.execute(
                """
                INSERT INTO decision_evidence
                  (decision_id, discussion_id, evidence_role, evidence_excerpt)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (decision_id, discussion_id, evidence_role) DO NOTHING
                """,
                (decision_id, evidence.source_id, evidence.evidence_role, evidence.quote),
            )
    return CandidatePersistence(disposition, match, decision_id)


def _diagnostic(metadata: dict[str, object], extraction_id: UUID, repository_id: UUID,
                signal_detected: bool, matched_rule: str | None,
                candidate_generated: bool, outcome: str,
                rejection_reason: str | None = None, usable: bool = True,
                details: dict[str, object] | None = None) -> dict[str, object]:
    return {
        "extraction_run_id": extraction_id,
        "repository_id": repository_id,
        "discussion_id": metadata.get("discussion_id"),
        "thread_number": metadata.get("thread_number"),
        "source_type": metadata.get("source_type"),
        "title": metadata.get("title"),
        "associated_records": metadata.get("associated_records", 0),
        "cleaned_content_length": metadata.get("cleaned_content_length", 0),
        "decision_signal_detected": signal_detected,
        "matched_rule": matched_rule,
        "candidate_generated": candidate_generated,
        "candidate_count": 1 if candidate_generated else 0,
        "detected_signals": (details or {}).get("detected_signals", []),
        "candidate_title": (details or {}).get("candidate_title"),
        "candidate_status": (details or {}).get("candidate_status"),
        "candidate_summary": (details or {}).get("candidate_summary"),
        "candidate_source_discussion_id": (details or {}).get("candidate_source_discussion_id"),
        "candidate_rationale": (details or {}).get("candidate_rationale", []),
        "candidate_alternatives": (details or {}).get("candidate_alternatives", []),
        "candidate_tradeoffs": (details or {}).get("candidate_tradeoffs", []),
        "evidence_references": (details or {}).get("evidence_references", []),
        "schema_validation_result": (details or {}).get("schema_validation_result"),
        "semantic_validation_result": (details or {}).get("semantic_validation_result"),
        "validation_errors": (details or {}).get("validation_errors", []),
        "persistence_result": (details or {}).get("persistence_result"),
        "duplicate_match_type": (details or {}).get("duplicate_match_type"),
        "matched_decision_id": (details or {}).get("matched_decision_id"),
        "matched_decision_title": (details or {}).get("matched_decision_title"),
        "matched_decision_status": (details or {}).get("matched_decision_status"),
        "matched_decision_review_status": (details or {}).get("matched_decision_review_status"),
        "matching_rationale": (details or {}).get("matching_rationale"),
        "similarity_score": (details or {}).get("similarity_score"),
        "similarity_method": (details or {}).get("similarity_method"),
        "candidate_disposition": (details or {}).get("candidate_disposition"),
        "model_response_id": (details or {}).get("model_response_id"),
        "input_tokens": (details or {}).get("input_tokens"),
        "output_tokens": (details or {}).get("output_tokens"),
        "total_tokens": (details or {}).get("total_tokens"),
        "retry_count": (details or {}).get("retry_count", 0),
        "rejection_reason": rejection_reason,
        "outcome": outcome,
        "usable": usable,
    }


def _evidence_details(candidate: object) -> list[dict[str, object]]:
    return [
        {
            "discussion_id": str(evidence.source_id),
            "source_type": evidence.source_type,
            "source_url": evidence.source_url,
            "excerpt": evidence.quote,
            "role": evidence.evidence_role,
        }
        for evidence in candidate.evidence
    ]


@app.post("/api/v1/repositories/{repository_id}/extractions", response_model=ExtractionResponse, status_code=202)
def start_extraction(repository_id: UUID, payload: ExtractionRequest, background_tasks: BackgroundTasks, conn: Connection = Depends(get_connection)) -> ExtractionResponse:
    lock_repository(conn, repository_id)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM repositories WHERE id = %s", (repository_id,))
        if not cur.fetchone():
            raise error("REPOSITORY_NOT_FOUND", "The repository is not registered.", 404)
        cur.execute("SELECT id FROM discussions WHERE repository_id = %s AND is_usable = TRUE LIMIT 1", (repository_id,))
        if not cur.fetchone():
            raise error("NO_DISCUSSIONS", "Ingest discussions before extracting decisions.", 400)
        cur.execute(
            """
            UPDATE extraction_runs
            SET status = 'failed', failed_at = clock_timestamp(), completed_at = clock_timestamp(),
                queue_duration_ms = CASE WHEN lock_acquired_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (lock_acquired_at - COALESCE(queued_at, created_at))) * 1000)::integer END,
                inference_duration_ms = CASE WHEN started_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000)::integer END,
                error_message = 'stale extraction recovered by a subsequent request'
            WHERE repository_id = %s
              AND status IN ('queued', 'waiting_for_model', 'running')
              AND COALESCE(started_at, queued_at, created_at) < NOW() - INTERVAL '10 minutes'
            """,
            (repository_id,),
        )
        cur.execute(
            "SELECT id FROM extraction_runs WHERE repository_id = %s AND status IN ('queued', 'waiting_for_model', 'running') ORDER BY created_at DESC LIMIT 1",
            (repository_id,),
        )
        active_run = cur.fetchone()
        if active_run:
            raise error("EXTRACTION_IN_PROGRESS", "An extraction is already running for this repository.", 409)
        cur.execute(
            "INSERT INTO extraction_runs (repository_id, status, prompt_version, model_provider, model_name, queued_at) VALUES (%s, 'queued', 'prompt-v1', %s, %s, clock_timestamp()) RETURNING id",
            (repository_id, settings.model_provider, settings.active_model_name),
        )
        extraction_id = cur.fetchone()["id"]
    conn.commit()
    background_tasks.add_task(run_extraction, extraction_id, repository_id, payload.force_reprocess)
    return ExtractionResponse(extraction_id=extraction_id, repository_id=repository_id, status="queued")


@app.get("/api/v1/repositories/{repository_id}/extractions")
def list_repository_extractions(repository_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM extraction_runs WHERE repository_id = %s ORDER BY created_at DESC LIMIT 20",
            (repository_id,),
        )
        items = cur.fetchall()
    return {"items": items, "total": len(items)}


@app.get("/api/v1/extractions/{extraction_id}")
def get_extraction(extraction_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM extraction_runs WHERE id = %s", (extraction_id,))
        result = cur.fetchone()
    if not result:
        raise error("EXTRACTION_NOT_FOUND", "The extraction run was not found.", 404)
    return result


@app.post("/api/v1/extractions/{extraction_id}/cancel")
def cancel_extraction(extraction_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE extraction_runs SET status = 'cancelled', completed_at = clock_timestamp(), queue_duration_ms = COALESCE(queue_duration_ms, (EXTRACT(EPOCH FROM (clock_timestamp() - COALESCE(queued_at, created_at))) * 1000)::integer), inference_duration_ms = CASE WHEN started_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000)::integer END, error_message = 'cancelled by request' WHERE id = %s AND status IN ('queued', 'waiting_for_model', 'running') RETURNING *",
            (extraction_id,),
        )
        result = cur.fetchone()
    if not result:
        raise error("EXTRACTION_NOT_CANCELLABLE", "The extraction was not found or is already terminal.", 409)
    conn.commit()
    return result


@app.get("/api/v1/extractions/{extraction_id}/diagnostics")
def get_extraction_diagnostics(extraction_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM extraction_runs WHERE id = %s", (extraction_id,))
        summary = cur.fetchone()
        if not summary:
            raise error("EXTRACTION_NOT_FOUND", "The extraction run was not found.", 404)
        cur.execute(
            "SELECT * FROM extraction_diagnostics WHERE extraction_run_id = %s ORDER BY thread_number NULLS LAST, created_at",
            (extraction_id,),
        )
        items = cur.fetchall()
        cur.execute(
            """
            SELECT outcome, COUNT(*) AS count
            FROM extraction_diagnostics
            WHERE extraction_run_id = %s
            GROUP BY outcome
            """,
            (extraction_id,),
        )
        outcome_counts = {row["outcome"]: row["count"] for row in cur.fetchall()}
    summary = dict(summary)
    total = len(items)
    warning = None
    if summary["status"] == "completed" and total != summary["records_processed"]:
        warning = {
            "code": "DIAGNOSTIC_PERSISTENCE_MISMATCH",
            "message": "The completed extraction does not have one diagnostic for every processed record.",
            "records_processed": summary["records_processed"],
            "total_diagnostics": total,
        }
    candidate_diagnostics = _unique_candidate_diagnostics(items)
    if "candidates_generated" not in summary:
        summary["candidates_generated"] = len(candidate_diagnostics)
    if "candidates_rejected" not in summary:
        summary["candidates_rejected"] = sum(
            1 for item in candidate_diagnostics
            if item.get("candidate_disposition") in {"rejected", "failed"}
            or item.get("semantic_validation_result") == "invalid"
        )
    if "decisions_created" not in summary:
        summary["decisions_created"] = sum(
            1 for item in candidate_diagnostics
            if item.get("candidate_disposition") in {"persisted", "persisted_for_review"}
            or item.get("outcome") == "decision_created"
        )
    return {
        "summary": summary,
        "outcome_counts": outcome_counts,
        "items": items,
        "candidate": candidate_diagnostics[0] if len(candidate_diagnostics) == 1 else None,
        "candidate_diagnostics": candidate_diagnostics,
        "total": total,
        "warning": warning,
    }


def _unique_candidate_diagnostics(items: list[dict]) -> list[dict]:
    candidates: dict[tuple[object, ...], dict] = {}
    for item in items:
        if not item.get("candidate_generated", False) and item.get("candidate_count", 0) <= 0:
            continue
        response_id = item.get("model_response_id")
        key = (
            item.get("thread_number"),
            response_id or item.get("candidate_title"),
            response_id is None,
        )
        candidates.setdefault(key, item)
    return list(candidates.values())


@app.post("/api/v1/repositories/{repository_id}/decision-relationships/propose")
def propose_decision_relationships(repository_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id, repository_id, title, summary, status, review_status, extracted_at FROM decisions WHERE repository_id = %s AND is_active = TRUE ORDER BY extracted_at DESC LIMIT 20", (repository_id,))
        decisions = cur.fetchall()
        for decision in decisions:
            cur.execute("SELECT id, evidence_excerpt, evidence_role FROM decision_evidence WHERE decision_id = %s", (decision["id"],))
            decision["evidence"] = cur.fetchall()
    provider = _configured_provider()
    result = provider.propose_relationships([{**decision, "id": str(decision["id"]), "repository_id": str(repository_id), "evidence": [{**evidence, "id": str(evidence["id"])} for evidence in decision["evidence"]]} for decision in decisions])
    decisions_by_id = {decision["id"]: decision for decision in decisions}
    evidence_by_decision = {decision["id"]: {evidence["id"] for evidence in decision["evidence"]} for decision in decisions}
    created = []
    with conn.cursor() as cur:
        for proposal in result.proposals:
            valid_evidence = evidence_by_decision.get(proposal.source_decision_id, set()) | evidence_by_decision.get(proposal.target_decision_id, set())
            reason = validate_relationship(proposal, repository_id, decisions_by_id, valid_evidence)
            if reason:
                continue
            cur.execute(
                """
                INSERT INTO decision_relationships
                  (repository_id, source_decision_id, target_decision_id, relationship_type,
                   explanation, evidence_ids, confidence, review_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
                ON CONFLICT (source_decision_id, target_decision_id, relationship_type) DO NOTHING
                RETURNING *
                """,
                (repository_id, proposal.source_decision_id, proposal.target_decision_id,
                 proposal.relationship_type.value, proposal.explanation, Jsonb([str(item) for item in proposal.evidence_ids]), proposal.confidence),
            )
            row = cur.fetchone()
            if row:
                created.append(row)
    conn.commit()
    return {"items": created, "total": len(created), "provider": result.provider, "model": result.model}


@app.get("/api/v1/repositories/{repository_id}/decision-timeline")
def get_decision_timeline(repository_id: UUID, date_from: str | None = None, date_to: str | None = None,
                          status: str | None = None, relationship_type: str | None = None,
                          limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                          conn: Connection = Depends(get_connection)) -> dict:
    conditions = ["d.repository_id = %s", "d.is_active = TRUE"]
    params: list[object] = [repository_id]
    if date_from:
        conditions.append("d.extracted_at >= %s")
        params.append(date_from)
    if date_to:
        conditions.append("d.extracted_at <= %s")
        params.append(date_to)
    if status:
        conditions.append("d.status = %s")
        params.append(status)
    if relationship_type:
        conditions.append("EXISTS (SELECT 1 FROM decision_relationships filter_rel WHERE filter_rel.repository_id = d.repository_id AND (filter_rel.source_decision_id = d.id OR filter_rel.target_decision_id = d.id) AND filter_rel.relationship_type = %s)")
        params.append(relationship_type)
    where = " AND ".join(conditions)
    with conn.cursor() as cur:
        cur.execute(f"SELECT d.*, r.full_name AS repository_name, (SELECT MIN(source.source_created_at) FROM decision_evidence timeline_evidence JOIN discussions source ON source.id = timeline_evidence.discussion_id WHERE timeline_evidence.decision_id = d.id) AS original_source_date FROM decisions d JOIN repositories r ON r.id = d.repository_id WHERE {where} ORDER BY d.extracted_at ASC LIMIT %s OFFSET %s", [*params, limit, offset])
        items = cur.fetchall()
        for item in items:
            cur.execute("SELECT rel.*, sd.title AS source_title, td.title AS target_title FROM decision_relationships rel JOIN decisions sd ON sd.id = rel.source_decision_id JOIN decisions td ON td.id = rel.target_decision_id WHERE rel.repository_id = %s AND (rel.source_decision_id = %s OR rel.target_decision_id = %s)", (repository_id, item["id"], item["id"]))
            item["relationships"] = cur.fetchall()
    return {"items": items, "total": len(items), "limit": limit, "offset": offset}


@app.get("/api/v1/repositories/{repository_id}/decision-graph")
def get_decision_graph(repository_id: UUID, include_pending: bool = False, status: str | None = None,
                       relationship_type: str | None = None, conn: Connection = Depends(get_connection)) -> dict:
    decision_conditions = ["repository_id = %s", "is_active = TRUE"]
    decision_params: list[object] = [repository_id]
    if status:
        decision_conditions.append("status = %s")
        decision_params.append(status)
    relationship_conditions = ["repository_id = %s"]
    relationship_params: list[object] = [repository_id]
    if not include_pending:
        relationship_conditions.append("review_status IN ('approved', 'valid')")
    if relationship_type:
        relationship_conditions.append("relationship_type = %s")
        relationship_params.append(relationship_type)
    with conn.cursor() as cur:
        cur.execute(f"SELECT id, title, summary, status, review_status, confidence, extracted_at FROM decisions WHERE {' AND '.join(decision_conditions)} ORDER BY extracted_at", decision_params)
        nodes = cur.fetchall()
        cur.execute(f"SELECT * FROM decision_relationships WHERE {' AND '.join(relationship_conditions)} ORDER BY created_at", relationship_params)
        edges = cur.fetchall()
    return {"nodes": nodes, "edges": edges, "total_nodes": len(nodes), "total_edges": len(edges)}


@app.post("/api/v1/decision-relationships/{relationship_id}/review")
def review_decision_relationship(relationship_id: UUID, payload: RelationshipReviewRequest, conn: Connection = Depends(get_connection)) -> dict:
    review_status = {"approve": "approved", "reject": "rejected", "request_review": "needs_review"}[payload.action]
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM decision_relationships WHERE id = %s FOR UPDATE", (relationship_id,))
        relationship = cur.fetchone()
        if not relationship:
            raise error("RELATIONSHIP_NOT_FOUND", "The decision relationship was not found.", 404)
        cur.execute("UPDATE decision_relationships SET review_status = %s, reviewed_at = NOW() WHERE id = %s RETURNING *", (review_status, relationship_id))
        result = cur.fetchone()
        cur.execute("INSERT INTO decision_relationship_review_history (relationship_id, previous_review_status, new_review_status, reviewer_note, reviewer_identity) VALUES (%s, %s, %s, %s, %s) RETURNING *", (relationship_id, relationship["review_status"], review_status, payload.note, "manual/anonymous"))
        result["review_history_entry"] = cur.fetchone()
    conn.commit()
    return result


@app.get("/api/v1/repositories/{repository_id}/decisions")
def list_decisions(repository_id: UUID, status: str | None = None,
                   review_status: str | None = None, search: str | None = None,
                   confidence_min: float | None = Query(None, ge=0, le=1),
                   confidence_max: float | None = Query(None, ge=0, le=1),
                   limit: int = Query(20, ge=1, le=100),
                   offset: int = Query(0, ge=0), conn: Connection = Depends(get_connection)) -> dict:
    conditions = ["d.repository_id = %s", "d.is_active = TRUE"]
    params: list[object] = [repository_id]
    if status:
        conditions.append("d.status = %s")
        params.append(status)
    if review_status:
        conditions.append("d.review_status = %s")
        params.append(review_status)
    if search:
        conditions.append("LOWER(d.title || ' ' || d.summary) LIKE %s")
        params.append(f"%{search.lower()}%")
    if confidence_min is not None:
        conditions.append("d.confidence >= %s")
        params.append(confidence_min)
    if confidence_max is not None:
        conditions.append("d.confidence <= %s")
        params.append(confidence_max)
    where = " AND ".join(conditions)
    query = f"SELECT d.*, r.full_name AS repository_name, COUNT(e.id) AS evidence_count FROM decisions d JOIN repositories r ON r.id = d.repository_id LEFT JOIN decision_evidence e ON e.decision_id = d.id WHERE {where} GROUP BY d.id, r.full_name ORDER BY d.extracted_at DESC LIMIT %s OFFSET %s"
    item_params = [*params, limit, offset]
    with conn.cursor() as cur:
        cur.execute(query, item_params)
        items = cur.fetchall()
        cur.execute(f"SELECT COUNT(*) AS total FROM decisions d WHERE {where}", params)
        total = cur.fetchone()["total"]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.get("/api/v1/decisions/{decision_id}")
def get_decision(decision_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT d.*, r.full_name FROM decisions d JOIN repositories r ON r.id = d.repository_id WHERE d.id = %s", (decision_id,))
        decision = cur.fetchone()
        if not decision:
            raise error("DECISION_NOT_FOUND", "The decision was not found.", 404)
        cur.execute("SELECT de.discussion_id, d.source_type, d.author_login, de.evidence_role, de.evidence_excerpt AS excerpt, d.source_url, d.source_created_at FROM decision_evidence de JOIN discussions d ON d.id = de.discussion_id WHERE de.decision_id = %s", (decision_id,))
        decision["evidence"] = cur.fetchall()
        cur.execute("SELECT * FROM decision_review_history WHERE decision_id = %s ORDER BY created_at DESC", (decision_id,))
        decision["review_history"] = cur.fetchall()
    return decision


@app.post("/api/v1/decisions/{decision_id}/review")
def review_decision(decision_id: UUID, payload: ReviewRequest, conn: Connection = Depends(get_connection)) -> dict:
    review_status = {
        "approve": "approved",
        "reject": "rejected",
        "request_review": "needs_review",
        "mark_unresolved": "approved",
    }[payload.action.value]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, repository_id, review_status, status FROM decisions WHERE id = %s FOR UPDATE",
            (decision_id,),
        )
        decision = cur.fetchone()
        if not decision:
            raise error("DECISION_NOT_FOUND", "The decision was not found.", 404)
        if payload.action.value == "mark_unresolved":
            cur.execute(
                "UPDATE decisions SET status = 'unresolved', review_status = %s, review_reason = %s, updated_at = NOW() WHERE id = %s RETURNING id, review_status, review_reason, status, is_active",
                (review_status, payload.note, decision_id),
            )
        else:
            cur.execute(
                "UPDATE decisions SET review_status = %s, review_reason = %s, updated_at = NOW() WHERE id = %s RETURNING id, review_status, review_reason, status, is_active",
                (review_status, payload.note, decision_id),
            )
        result = cur.fetchone()
        cur.execute(
            """
            INSERT INTO decision_review_history
              (decision_id, previous_review_status, new_review_status,
               previous_decision_status, new_decision_status, reviewer_note,
               reviewer_identity)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (decision_id, decision["review_status"], result["review_status"],
             decision["status"], result["status"], payload.note, "manual/anonymous"),
        )
        result["review_history_entry"] = cur.fetchone()
    conn.commit()
    return result


@app.get("/api/v1/decisions/{decision_id}/review-history")
def get_review_history(decision_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM decisions WHERE id = %s", (decision_id,))
        if not cur.fetchone():
            raise error("DECISION_NOT_FOUND", "The decision was not found.", 404)
        cur.execute("SELECT * FROM decision_review_history WHERE decision_id = %s ORDER BY created_at DESC", (decision_id,))
        items = cur.fetchall()
    return {"items": items, "total": len(items)}


@app.post("/api/v1/search")
def search(payload: SearchRequest, conn: Connection = Depends(get_connection)) -> dict:
    terms = [term for term in payload.query.lower().split() if len(term) > 2][:8]
    conditions = ["d.is_active = TRUE"]
    params: list[object] = []
    if payload.repository_id:
        conditions.append("d.repository_id = %s")
        params.append(payload.repository_id)
    if payload.statuses:
        conditions.append("d.status = ANY(%s)")
        params.append([status.value for status in payload.statuses])
    score = " + ".join(["CASE WHEN LOWER(d.title || ' ' || d.summary) LIKE %s THEN 1 ELSE 0 END"] * len(terms)) or "0"
    score_params = [f"%{term}%" for term in terms]
    query = f"SELECT d.id AS decision_id, d.title, d.summary, d.status, d.rationale, d.alternatives, ({score}) AS relevance_score FROM decisions d WHERE {' AND '.join(conditions)} ORDER BY relevance_score DESC, d.extracted_at DESC LIMIT %s"
    params = score_params + params + [payload.limit]
    with conn.cursor() as cur:
        cur.execute(query, params)
        results = cur.fetchall()
    return {"query": payload.query, "results": results, "total": len(results)}
