import unittest
from importlib.util import find_spec
from uuid import uuid4

HAS_BACKEND_DEPENDENCIES = find_spec("psycopg") is not None
if HAS_BACKEND_DEPENDENCIES:
    from backend.app.main import get_extraction_diagnostics


class FakeCursor:
    def __init__(self, summary: dict, items: list[dict]) -> None:
        self.summary = summary
        self.items = items
        self.query_count = 0

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.query_count += 1

    def fetchone(self) -> dict:
        return self.summary

    def fetchall(self) -> list[dict]:
        if self.query_count == 2:
            return self.items
        counts: dict[str, int] = {}
        for item in self.items:
            counts[item["outcome"]] = counts.get(item["outcome"], 0) + 1
        return [{"outcome": outcome, "count": count} for outcome, count in counts.items()]


class FakeConnection:
    def __init__(self, summary: dict, items: list[dict]) -> None:
        self.cursor_instance = FakeCursor(summary, items)

    def cursor(self) -> FakeCursor:
        return self.cursor_instance


@unittest.skipUnless(HAS_BACKEND_DEPENDENCIES, "backend dependencies are not installed")
class DiagnosticsTests(unittest.TestCase):
    def test_completed_run_exposes_persisted_counts_and_mismatch_warning(self) -> None:
        extraction_id = uuid4()
        summary = {
            "id": extraction_id,
            "status": "completed",
            "records_processed": 3,
        }
        items = [
            {
                "usable": True,
                "decision_signal_detected": True,
                "candidate_count": 1,
                "outcome": "decision_created",
                "candidate_title": "Use pooling",
                "candidate_status": "accepted",
                "candidate_summary": "The team agreed to use pooling.",
                "detected_signals": [{"signal_type": "accepted", "excerpt": "agreed"}],
                "evidence_references": [{"role": "acceptance", "excerpt": "agreed"}],
                "schema_validation_result": "passed",
                "semantic_validation_result": "valid",
                "validation_errors": [],
                "persistence_result": "decision_and_evidence_inserted",
            },
            {
                "usable": True,
                "decision_signal_detected": False,
                "candidate_count": 0,
                "outcome": "no_decision_signal",
            },
        ]

        result = get_extraction_diagnostics(extraction_id, FakeConnection(summary, items))

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["outcome_counts"], {
            "decision_created": 1,
            "no_decision_signal": 1,
        })
        self.assertEqual(result["summary"]["decisions_created"], 1)
        self.assertEqual(result["summary"]["candidates_generated"], 1)
        self.assertEqual(result["candidate"]["candidate_title"], "Use pooling")
        self.assertEqual(result["candidate"]["evidence_references"][0]["role"], "acceptance")
        self.assertEqual(result["warning"]["code"], "DIAGNOSTIC_PERSISTENCE_MISMATCH")


if __name__ == "__main__":
    unittest.main()