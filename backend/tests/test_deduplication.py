import unittest
from uuid import uuid4
from unittest.mock import patch

from backend.app.extraction import EvidenceReference, ExtractedDecision, ValidationOutcome
from backend.app.deduplication import match_candidate
from backend.app.main import _persist_candidate


class PersistenceCursor:
    def __init__(self, existing: list[dict[str, object]]) -> None:
        self.existing = existing
        self.statements: list[tuple[str, object]] = []
        self.inserted_id = uuid4()

    def __enter__(self) -> "PersistenceCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, params: object = None) -> None:
        self.statements.append((query, params))

    def fetchall(self) -> list[dict[str, object]]:
        return self.existing

    def fetchone(self) -> dict[str, object]:
        return {"id": self.inserted_id}


class PersistenceConnection:
    def __init__(self, existing: list[dict[str, object]]) -> None:
        self.cursor_instance = PersistenceCursor(existing)

    def cursor(self) -> PersistenceCursor:
        return self.cursor_instance


class CandidateDeduplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository_id = uuid4()
        self.source_id = uuid4()
        self.evidence_id = uuid4()

    def candidate(self, **updates: object) -> ExtractedDecision:
        values: dict[str, object] = {
            "title": "Use connection pooling",
            "summary": "The team selected connection pooling to reduce setup overhead.",
            "status": "accepted",
            "rationale": ["Reduce per-request connection setup overhead."],
            "alternatives": ["Create a connection for every request."],
            "tradeoffs": ["Pooling requires connection lifecycle management."],
            "confidence": 0.8,
            "evidence": [],
            "repository_id": self.repository_id,
            "source_discussion_id": self.source_id,
        }
        values.update(updates)
        return ExtractedDecision(**values)

    def existing(self, **updates: object) -> dict[str, object]:
        values: dict[str, object] = {
            "id": uuid4(),
            "repository_id": self.repository_id,
            "source_discussion_id": self.source_id,
            "title": "Use connection pooling",
            "summary": "The team selected connection pooling to reduce setup overhead.",
            "status": "accepted",
            "rationale": ["Reduce per-request connection setup overhead."],
            "alternatives": ["Create a connection for every request."],
            "tradeoffs": ["Pooling requires connection lifecycle management."],
            "evidence_ids": [self.evidence_id],
            "review_status": "approved",
            "is_active": True,
        }
        values.update(updates)
        return values

    def test_exact_duplicate_matches_all_content_and_evidence(self) -> None:
        result = match_candidate(
            self.candidate(),
            self.repository_id,
            {self.evidence_id},
            [self.existing()],
        )

        self.assertEqual(result.match_type, "exact_duplicate")
        self.assertTrue(result.is_duplicate)
        self.assertIsNotNone(result.matched_decision_id)

    def test_different_decision_in_same_discussion_is_not_a_duplicate(self) -> None:
        candidate = self.candidate(
            title="Document connection failure recovery",
            summary="The team will retry failed connections after a network interruption.",
            rationale=["Retries recover from transient network failures."],
        )

        result = match_candidate(
            candidate,
            self.repository_id,
            {uuid4()},
            [self.existing()],
        )

        self.assertEqual(result.match_type, "distinct_same_discussion")
        self.assertFalse(result.is_duplicate)
        self.assertIsNone(result.matched_decision_id)
        self.assertIn("alone is not treated as a duplicate", result.rationale)

    def test_same_title_with_different_rationale_requires_review(self) -> None:
        existing = self.existing()
        candidate = self.candidate(
            summary="Use pooling to isolate slow consumers.",
            rationale=["Prevent one consumer from delaying other consumers."],
        )

        result = match_candidate(
            candidate,
            self.repository_id,
            {self.evidence_id},
            [existing],
        )

        self.assertEqual(result.match_type, "ambiguous")
        self.assertTrue(result.requires_review)
        self.assertEqual(result.matched_decision_id, existing["id"])

    def test_high_text_overlap_with_same_status_is_semantically_equivalent(self) -> None:
        existing = self.existing(
            summary="Team selected connection pooling to reduce connection setup overhead."
        )
        candidate = self.candidate(
            summary="The team selected connection pooling to reduce connection setup overhead."
        )

        result = match_candidate(
            candidate,
            self.repository_id,
            {self.evidence_id},
            [existing],
        )

        self.assertEqual(result.match_type, "semantic_equivalent")
        self.assertTrue(result.is_duplicate)
        self.assertGreaterEqual(result.similarity_score or 0, 0.82)
        self.assertEqual(result.similarity_method, "token_jaccard_v1")

    def test_explicit_superseding_candidate_requires_review(self) -> None:
        existing = self.existing()
        candidate = self.candidate(
            summary=(
                "This decision supersedes the earlier pooling choice and replaces it "
                "with a bounded connection pool."
            ),
        )

        result = match_candidate(
            candidate,
            self.repository_id,
            {self.evidence_id},
            [existing],
        )

        self.assertEqual(result.match_type, "superseding")
        self.assertTrue(result.requires_review)
        self.assertEqual(result.matched_decision_id, existing["id"])

    def test_negated_superseding_language_is_not_classified_as_superseding(self) -> None:
        candidate = self.candidate(
            summary="The new proposal does not replace the existing pooling decision.",
        )

        result = match_candidate(
            candidate,
            self.repository_id,
            {self.evidence_id},
            [self.existing()],
        )

        self.assertNotEqual(result.match_type, "superseding")

    def test_shared_evidence_without_equivalence_is_ambiguous(self) -> None:
        candidate = self.candidate(
            title="Use a connection timeout",
            summary="Set a timeout so stalled connections do not block requests.",
            rationale=["Bound the wait for unresponsive peers."],
        )

        result = match_candidate(
            candidate,
            self.repository_id,
            {self.evidence_id},
            [self.existing()],
        )

        self.assertEqual(result.match_type, "ambiguous")
        self.assertTrue(result.requires_review)

    def test_cross_repository_candidate_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "candidate repository"):
            match_candidate(
                self.candidate(repository_id=uuid4()),
                self.repository_id,
                {self.evidence_id},
                [self.existing()],
            )

    def test_historical_duplicate_is_matched_without_mutating_history(self) -> None:
        historical = self.existing(is_active=False, review_status="rejected")
        before = historical.copy()

        result = match_candidate(
            self.candidate(),
            self.repository_id,
            {self.evidence_id},
            [historical],
        )

        self.assertEqual(result.match_type, "exact_duplicate")
        self.assertEqual(historical, before)

    def test_decisions_from_another_repository_are_not_matches(self) -> None:
        result = match_candidate(
            self.candidate(),
            self.repository_id,
            {self.evidence_id},
            [self.existing(repository_id=uuid4())],
        )

        self.assertEqual(result.match_type, "no_match")
        self.assertIsNone(result.matched_decision_id)

    def test_exact_historical_match_is_preserved_without_mutation(self) -> None:
        evidence = EvidenceReference(
            source_id=self.evidence_id,
            source_type="issue",
            source_url="https://github.com/example/project/issues/1",
            quote="We agreed to use pooling.",
            evidence_role="acceptance",
        )
        candidate = self.candidate(evidence=[evidence])
        outcome = ValidationOutcome(candidate, "valid", None, (evidence,))
        historical = self.existing(is_active=False, review_status="rejected")
        connection = PersistenceConnection([historical.copy()])

        with patch("backend.app.main.lock_repository"):
            result = _persist_candidate(
                connection, self.repository_id, candidate, outcome, "test-model",
            )

        self.assertEqual(result.disposition, "matched_existing")
        self.assertEqual(result.match.match_type, "exact_duplicate")
        self.assertEqual(historical["is_active"], False)
        self.assertFalse(any("UPDATE decisions" in query for query, _ in connection.cursor_instance.statements))
        self.assertFalse(any("INSERT INTO decisions" in query for query, _ in connection.cursor_instance.statements))

    def test_ambiguous_candidate_is_persisted_for_review_without_replacing_history(self) -> None:
        evidence = EvidenceReference(
            source_id=self.evidence_id,
            source_type="issue",
            source_url="https://github.com/example/project/issues/1",
            quote="We agreed to use pooling.",
            evidence_role="acceptance",
        )
        candidate = self.candidate(
            summary="Use pooling to isolate slow consumers.",
            rationale=["Prevent one consumer from delaying other consumers."],
            evidence=[evidence],
        )
        outcome = ValidationOutcome(candidate, "valid", None, (evidence,))
        historical = self.existing()
        connection = PersistenceConnection([historical.copy()])

        with patch("backend.app.main.lock_repository"):
            result = _persist_candidate(
                connection, self.repository_id, candidate, outcome, "test-model",
            )

        self.assertEqual(result.disposition, "persisted_for_review")
        self.assertEqual(result.match.match_type, "ambiguous")
        statements = connection.cursor_instance.statements
        self.assertFalse(any("UPDATE decisions" in query for query, _ in statements))
        inserted = next(params for query, params in statements if "INSERT INTO decisions" in query)
        self.assertEqual(inserted[-2], "needs_review")
        self.assertIn(str(historical["id"]), inserted[-1])


if __name__ == "__main__":
    unittest.main()
