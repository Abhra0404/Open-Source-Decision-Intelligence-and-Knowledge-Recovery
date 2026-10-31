from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg import Connection
from psycopg.types.json import Jsonb

from .database import connection, get_connection, lock_repository
from .github import GitHubClient, GitHubError
from .cleaning import clean_discussion
from .extraction import DiscussionInput, assess_candidate, detect_decision_signals
from .ingestion import ingest_repository, parse_repository_url
from .config import settings
from .providers import ProviderError, build_provider
from .schemas import ExtractionRequest, ExtractionResponse, IngestionCreate, IngestionResponse, RepositoryCreate, RepositoryResponse, ReviewRequest, SearchRequest

app = FastAPI(title="METIS API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
executor = ThreadPoolExecutor(max_workers=2)


def error(code: str, message: str, status_code: int) -> HTTPException:
    return HTTPException(status_code, detail={"error": {"code": code, "message": message, "details": None}})


@app.get("/health")
def health() -> dict[str, str]:
    with connection() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/api/v1/repositories")
def list_repositories(conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT id, full_name, html_url FROM repositories ORDER BY full_name")
        items = cur.fetchall()
    return {"items": items, "total": len(items)}


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
        lock_repository(conn, repository_id)
        conn.execute("UPDATE extraction_runs SET status = 'running', started_at = NOW() WHERE id = %s", (extraction_id,))
        conn.commit()
        try:
            provider = build_provider(settings.model_provider, settings.model_name, settings.model_base_url, settings.model_api_key)
            model_info = provider.get_model_info()
            conn.execute(
                "UPDATE extraction_runs SET model_provider = %s, model_name = %s, model_revision = %s WHERE id = %s",
                (model_info["provider"], model_info["model"], model_info.get("revision"), extraction_id),
            )
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
            prompt_tokens = 0
            completion_tokens = 0
            model_latency_ms = 0
            model_revision = None
            for thread_key, records in grouped.items():
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
                    candidate = provider_result.candidate
                    prompt_tokens += provider_result.prompt_tokens or 0
                    completion_tokens += provider_result.completion_tokens or 0
                    model_latency_ms += provider_result.latency_ms or 0
                    model_revision = model_revision or provider_result.revision
                except Exception as exc:
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
                source_discussion_id = (
                    candidate.source_discussion_id
                    if candidate.source_discussion_id in {record.id for record in records}
                    else None
                )
                try:
                    persistence = _persist_candidate(
                        conn, repository_id, candidate, outcome, force_reprocess,
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
                if persistence == "existing":
                    decisions_existing += 1
                    for row_metadata in thread_rows[thread_key]:
                        diagnostics.append(_diagnostic(
                            {**thread_metadata[thread_key], **row_metadata},
                            extraction_id, repository_id, signal_detected, matched_rule,
                            True, "insufficient_evidence", "active_decision_exists", details={
                                **lifecycle, "persistence_result": "skipped_existing",
                            },
                        ))
                    continue
                created += 1
                for row_metadata in thread_rows[thread_key]:
                    diagnostics.append(_diagnostic(
                        {**thread_metadata[thread_key], **row_metadata},
                        extraction_id, repository_id, signal_detected, matched_rule,
                        True, "decision_created", outcome.review_reason, details={
                            **lifecycle, "persistence_result": "decision_and_evidence_inserted",
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
                          candidate_summary, evidence_references, schema_validation_result,
                          semantic_validation_result, validation_errors, persistence_result,
                          rejection_reason, outcome
                        ) VALUES (
                          %(extraction_run_id)s, %(repository_id)s, %(discussion_id)s, %(thread_number)s,
                          %(source_type)s, %(title)s, %(associated_records)s, %(cleaned_content_length)s,
                          %(usable)s, %(decision_signal_detected)s, %(matched_rule)s, %(candidate_generated)s,
                          %(candidate_count)s, %(detected_signals)s, %(candidate_title)s, %(candidate_status)s,
                          %(candidate_summary)s, %(evidence_references)s, %(schema_validation_result)s,
                          %(semantic_validation_result)s, %(validation_errors)s, %(persistence_result)s,
                          %(rejection_reason)s, %(outcome)s
                        )
                        """,
                        {
                            **diagnostic,
                            "detected_signals": Jsonb(diagnostic["detected_signals"]),
                            "evidence_references": Jsonb(diagnostic["evidence_references"]),
                            "validation_errors": Jsonb(diagnostic["validation_errors"]),
                        },
                    )
            conn.execute(
                """
                UPDATE extraction_runs
                SET status = 'completed', records_processed = %s,
                    decisions_created = %s, valid_threads = %s, unusable_threads = %s,
                    threads_with_signals = %s, candidates_generated = %s,
                    candidates_rejected = %s, invalid_threads = %s,
                    no_decision_signal = %s, decisions_existing = %s,
                    completed_at = NOW()
                WHERE id = %s
                """,
                (total_records, created, valid_threads, unusable_threads,
                 threads_with_signals, candidates_generated, candidates_rejected,
                 unusable_threads + candidates_rejected, no_decision_signal,
                 decisions_existing,
                 extraction_id),
            )
            conn.execute(
                "UPDATE extraction_runs SET model_revision = %s, prompt_tokens = %s, completion_tokens = %s, model_latency_ms = %s WHERE id = %s",
                (model_revision, prompt_tokens or None, completion_tokens or None, model_latency_ms or None, extraction_id),
            )
        except Exception as exc:
            conn.rollback()
            conn.execute(
                "UPDATE extraction_runs SET status = 'failed', error_message = %s, completed_at = NOW() WHERE id = %s",
                (str(exc)[:1000], extraction_id),
            )
        conn.commit()


def _persist_candidate(conn: Connection, repository_id: UUID, candidate: object,
                       outcome: object, force_reprocess: bool) -> str:
    with conn.cursor() as cur:
        source_discussion_id = candidate.source_discussion_id
        if not force_reprocess:
            cur.execute(
                "SELECT 1 FROM decisions WHERE repository_id = %s AND source_discussion_id = %s AND extraction_version = 'prompt-v1' AND is_active = TRUE",
                (repository_id, source_discussion_id),
            )
            if cur.fetchone():
                return "existing"
        else:
            cur.execute(
                "UPDATE decisions SET is_active = FALSE, updated_at = NOW() WHERE repository_id = %s AND source_discussion_id = %s AND extraction_version = 'prompt-v1' AND is_active = TRUE",
                (repository_id, source_discussion_id),
            )
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
             Jsonb(candidate.tradeoffs), candidate.confidence, "deterministic-provider",
                         "pending" if outcome.review_status == "valid" else "needs_review",
                         outcome.review_reason),
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
    return "created"


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
        "evidence_references": (details or {}).get("evidence_references", []),
        "schema_validation_result": (details or {}).get("schema_validation_result"),
        "semantic_validation_result": (details or {}).get("semantic_validation_result"),
        "validation_errors": (details or {}).get("validation_errors", []),
        "persistence_result": (details or {}).get("persistence_result"),
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
            "SELECT id FROM extraction_runs WHERE repository_id = %s AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1",
            (repository_id,),
        )
        active_run = cur.fetchone()
        if active_run:
            raise error("EXTRACTION_IN_PROGRESS", "An extraction is already running for this repository.", 409)
        cur.execute(
            "INSERT INTO extraction_runs (repository_id, status, prompt_version, model_provider, model_name) VALUES (%s, 'queued', 'prompt-v1', %s, %s) RETURNING id",
            (repository_id, settings.model_provider, settings.model_name),
        )
        extraction_id = cur.fetchone()["id"]
    conn.commit()
    background_tasks.add_task(run_extraction, extraction_id, repository_id, payload.force_reprocess)
    return ExtractionResponse(extraction_id=extraction_id, repository_id=repository_id, status="queued")


@app.get("/api/v1/extractions/{extraction_id}")
def get_extraction(extraction_id: UUID, conn: Connection = Depends(get_connection)) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM extraction_runs WHERE id = %s", (extraction_id,))
        result = cur.fetchone()
    if not result:
        raise error("EXTRACTION_NOT_FOUND", "The extraction run was not found.", 404)
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
    unusable_count = sum(1 for item in items if not item["usable"])
    candidate_count = sum(item["candidate_count"] for item in items)
    rejected_count = sum(
        item["candidate_count"]
        for item in items
        if item["outcome"] != "decision_created"
    )
    summary.update({
        "valid_threads": len(items) - unusable_count,
        "unusable_threads": unusable_count,
        "threads_with_signals": sum(1 for item in items if item["decision_signal_detected"]),
        "candidates_generated": candidate_count,
        "candidates_rejected": rejected_count,
        "invalid_threads": outcome_counts.get("invalid_thread", 0),
        "no_decision_signal": outcome_counts.get("no_decision_signal", 0),
        "decisions_created": outcome_counts.get("decision_created", 0),
    })
    total = len(items)
    warning = None
    if summary["status"] == "completed" and total != summary["records_processed"]:
        warning = {
            "code": "DIAGNOSTIC_PERSISTENCE_MISMATCH",
            "message": "The completed extraction does not have one diagnostic for every processed record.",
            "records_processed": summary["records_processed"],
            "total_diagnostics": total,
        }
    candidate_diagnostics = [
        item for item in items if item["candidate_generated"]
    ]
    return {
        "summary": summary,
        "outcome_counts": outcome_counts,
        "items": items,
        "candidate": candidate_diagnostics[0] if len(candidate_diagnostics) == 1 else None,
        "candidate_diagnostics": candidate_diagnostics,
        "total": total,
        "warning": warning,
    }


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
