import argparse
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from backend.app.config import settings
from backend.app.extraction import DiscussionInput, assess_candidate
from backend.app.providers import ProviderError, build_provider


def _load_dataset(path: Path) -> list[dict[str, Any]]:
    examples = []
    for line_number, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = json.loads(line)
        if not item.get("expected_outcome"):
            raise ValueError(f"{path}:{line_number}: expected_outcome requires manual annotation")
        for field in ("discussion_id", "source_url", "source_type", "body"):
            if not item.get(field):
                raise ValueError(f"{path}:{line_number}: missing {field}")
        examples.append(item)
    if not examples:
        raise ValueError(f"{path} contains no manually annotated examples")
    return examples


def export_candidates(output: Path, limit: int = 25) -> None:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, source_url, source_type, title, body, author_login, source_created_at
            FROM discussions
            ORDER BY source_created_at ASC NULLS LAST, id
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    with output.open("w") as stream:
        for row in rows:
            stream.write(json.dumps({
                "discussion_id": str(row["id"]),
                "source_url": row["source_url"],
                "source_type": row["source_type"],
                "title": row["title"],
                "body": row["body"],
                "author_login": row["author_login"],
                "source_created_at": row["source_created_at"].isoformat() if row["source_created_at"] else None,
                "expected_outcome": None,
                "evidence": [],
                "notes": "MANUALLY REVIEW THIS REAL DISCUSSION BEFORE EVALUATION",
            }) + "\n")
    print(f"Exported {len(rows)} real discussions to {output}; labels and evidence still require manual review.")


def _discussion(item: dict[str, Any]) -> DiscussionInput:
    created_at = item.get("source_created_at")
    return DiscussionInput(
        id=UUID(item["discussion_id"]), source_type=item["source_type"], title=item.get("title"),
        body=item["body"], author_login=item.get("author_login"), source_url=item["source_url"],
        source_created_at=datetime.fromisoformat(created_at) if created_at else None,
    )


def _score(example: dict[str, Any], result: Any, record: DiscussionInput) -> dict[str, Any]:
    expected = example["expected_outcome"]
    candidate = result.candidate
    predicted = candidate is not None
    expected_decision = expected != "no_decision"
    validation = None
    if candidate is not None:
        validation = assess_candidate(candidate, [record], candidate.repository_id)
    evidence_valid = bool(validation and validation.review_status != "invalid")
    expected_evidence = {
        (item["discussion_id"], item["source_url"], item["quote"])
        for item in example.get("evidence", [])
    }
    predicted_evidence = {
        (str(item.source_id), item.source_url, item.quote)
        for item in candidate.evidence
    } if candidate else set()
    evidence_reference_correct = predicted_evidence == expected_evidence
    return {
        "expected_outcome": expected,
        "predicted_status": candidate.status if candidate else None,
        "decision_detected": predicted,
        "decision_detection_correct": predicted == expected_decision,
        "status_correct": bool(candidate and candidate.status == expected),
        "evidence_valid": evidence_valid,
        "evidence_reference_correct": evidence_reference_correct,
        "unsupported_claim": bool(candidate and not evidence_valid),
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "prompt_tokens": result.prompt_tokens,
        "completion_tokens": result.completion_tokens,
    }


def evaluate(dataset: Path, output: Path) -> None:
    examples = _load_dataset(dataset)
    providers = [build_provider("deterministic", "rule-based-mvp", "", None)]
    if settings.model_provider == "open_weight":
        providers.append(build_provider(settings.model_provider, settings.model_name, settings.model_base_url, settings.model_api_key))
    repository_id = UUID("00000000-0000-0000-0000-000000000000")
    report: dict[str, Any] = {"dataset": str(dataset), "examples": len(examples), "providers": {}}
    for provider in providers:
        rows = []
        for example in examples:
            record = _discussion(example)
            started = time.monotonic()
            try:
                result = provider.extract_decision(repository_id, [record])
                row = _score(example, result, record)
                row["structured_output_valid"] = True
            except ProviderError as exc:
                row = {"provider": provider.get_model_info()["provider"], "model": provider.get_model_info()["model"], "structured_output_valid": False, "error_stage": exc.stage, "error": str(exc), "latency_ms": int((time.monotonic() - started) * 1000)}
            rows.append(row)
        detected = [row for row in rows if "decision_detection_correct" in row]
        expected_positive = sum(row["expected_outcome"] != "no_decision" for row in detected)
        predicted_positive = sum(row["decision_detected"] for row in detected)
        true_positive = sum(row["decision_detected"] and row["expected_outcome"] != "no_decision" for row in detected)
        report["providers"][provider.get_model_info()["provider"]] = {
            "metrics": {
                "decision_detection_precision": true_positive / predicted_positive if predicted_positive else 0,
                "decision_detection_recall": true_positive / expected_positive if expected_positive else 0,
                "status_classification_accuracy": sum(row["status_correct"] for row in detected) / len(detected) if detected else 0,
                "evidence_reference_accuracy": sum(row["evidence_reference_correct"] for row in detected) / len(detected) if detected else 0,
                "unsupported_claim_rate": sum(row["unsupported_claim"] for row in detected) / len(detected) if detected else 0,
                "structured_output_validity": sum(row["structured_output_valid"] for row in rows) / len(rows),
                "average_latency_ms": sum(row["latency_ms"] for row in rows) / len(rows),
            },
            "rows": rows,
        }
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote evaluation results to {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate METIS extraction providers without fabricating labels.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    export = subparsers.add_parser("export-candidates")
    export.add_argument("--output", type=Path, required=True)
    export.add_argument("--limit", type=int, default=25)
    run = subparsers.add_parser("evaluate")
    run.add_argument("--dataset", type=Path, required=True)
    run.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "export-candidates":
        export_candidates(args.output, args.limit)
    else:
        evaluate(args.dataset, args.output)


if __name__ == "__main__":
    main()