import unittest
from unittest.mock import patch
from uuid import uuid4

from backend.app.chat import (
    QAGenerationError,
    RetrievalResult,
    _normalize_query,
    _validated_retrieval_rows,
    answer_question,
    retrieve_evidence,
    validate_citations,
)
from backend.app.providers import AnswerResult, ProviderError


class FakeCursor:
    def __init__(self, rows: list[dict[str, object]], valid_ids: set[str]) -> None:
        self.rows = rows
        self.valid_ids = valid_ids
        self.current_id: str | None = None
        self.query = ""
        self.params: tuple[object, ...] = ()

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.query = query
        self.params = params
        if "SELECT de.id" in query:
            self.current_id = str(params[0])

    def fetchall(self) -> list[dict[str, object]]:
        return self.rows

    def fetchone(self) -> dict[str, str] | None:
        return {"id": self.current_id} if self.current_id in self.valid_ids else None


class FakeConnection:
    def __init__(
        self,
        rows: list[dict[str, object]] | None = None,
        valid_ids: set[str] | None = None,
    ) -> None:
        self.rows = rows or []
        self.valid_ids = valid_ids or set()
        self.last_cursor: FakeCursor | None = None

    def cursor(self) -> FakeCursor:
        self.last_cursor = FakeCursor(self.rows, self.valid_ids)
        return self.last_cursor


class FakeProvider:
    def __init__(self, result: AnswerResult | None = None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.context: list[dict[str, object]] | None = None

    def answer_question(
        self,
        question: str,
        history: list[dict[str, str]],
        context: list[dict[str, object]],
    ) -> AnswerResult:
        self.context = context
        if self.error:
            raise self.error
        assert self.result is not None
        return self.result


def _evidence_row(repository_id, evidence_id=None, **changes) -> dict[str, object]:
    row: dict[str, object] = {
        "candidate_decisions_retrieved": 1,
        "decisions_remaining_after_filtering": 1,
        "decision_id": uuid4(),
        "repository_id": repository_id,
        "decision_title": "Document pager interruption behavior",
        "summary": "Keep the pager interruption guidance concise.",
        "decision_status": "unresolved",
        "review_status": "needs_review",
        "review_reason": "The cited evidence does not establish a final outcome.",
        "is_active": True,
        "rationale": ["The discussion favors concise documentation."],
        "alternatives": ["Keep detailed technical explanations."],
        "tradeoffs": ["Readability versus completeness."],
        "relevance_score": 0.75,
        "retrieval_method": "full_text_or",
        "evidence_id": evidence_id or uuid4(),
        "evidence_role": "objection",
        "excerpt": "This feels too verbose; it can be shortened to a couple sentences.",
        "discussion_id": uuid4(),
        "source_repository_id": repository_id,
        "source_type": "issue_comment",
        "source_title": "Document pager interruption behavior",
        "source_url": "https://github.com/example/project/pull/42",
        "source_body": "The discussion favors concise documentation.",
    }
    row.update(changes)
    row["candidate_relevance_scores"] = [{
        "decision_id": str(row["decision_id"]),
        "score": row["relevance_score"],
    }]
    return row


class ChatTests(unittest.TestCase):
    def test_query_normalization_builds_safe_or_terms(self) -> None:
        normalized, tsquery = _normalize_query(
            "Why was the `less` Ctrl+C interruption behavior simplified?"
        )
        self.assertEqual(normalized, "less ctrl c interruption behavior simplified")
        self.assertEqual(
            tsquery,
            "less:* | ctrl:* | c:* | interruption:* | behavior:* | simplified:*",
        )

    def test_retrieval_is_repository_scoped_and_keeps_review_states(self) -> None:
        repository_id = uuid4()
        conn = FakeConnection([_evidence_row(repository_id)])

        result = retrieve_evidence(conn, repository_id, "Why pager interruption behavior?")

        self.assertEqual(len(result.evidence), 1)
        self.assertEqual(result.evidence[0]["review_status"], "needs_review")
        self.assertEqual(result.evidence[0]["decision_status"], "unresolved")
        assert conn.last_cursor is not None
        self.assertIn("d.repository_id = %s", conn.last_cursor.query)
        self.assertIn("source.repository_id = d.repository_id", conn.last_cursor.query)
        self.assertIn("to_tsquery('simple'", conn.last_cursor.query)
        self.assertNotIn("plainto_tsquery", conn.last_cursor.query)
        self.assertNotIn("review_status IN", conn.last_cursor.query)
        self.assertEqual(conn.last_cursor.params[3], repository_id)

    def test_exact_phrase_score_and_diagnostics_are_reported(self) -> None:
        repository_id = uuid4()
        row = _evidence_row(repository_id, relevance_score=1.0, retrieval_method="exact_phrase")
        result = retrieve_evidence(FakeConnection([row]), repository_id, "Document pager interruption")

        self.assertEqual(result.diagnostics["candidate_decisions_retrieved"], 1)
        self.assertEqual(result.diagnostics["decisions_remaining_after_filtering"], 1)
        self.assertEqual(result.diagnostics["evidence_records_retrieved"], 1)
        self.assertEqual(result.diagnostics["evidence_records_passing_validation"], 1)
        self.assertTrue(result.diagnostics["retrieval_strategy"].startswith("exact_phrase"))
        self.assertEqual(result.diagnostics["relevance_scores"][0]["score"], 1.0)
        self.assertFalse(result.diagnostics["llm_invoked"])

    def test_cross_repository_and_missing_provenance_evidence_are_filtered(self) -> None:
        repository_id = uuid4()
        rows = [
            _evidence_row(repository_id),
            _evidence_row(repository_id, source_repository_id=uuid4()),
            _evidence_row(repository_id, excerpt=" "),
            _evidence_row(repository_id, source_url=""),
        ]

        validated, retrieved_count = _validated_retrieval_rows(rows, repository_id)

        self.assertEqual(retrieved_count, 4)
        self.assertEqual(len(validated), 1)

    def test_no_matching_decisions_returns_fallback_without_calling_llm(self) -> None:
        repository_id = uuid4()
        row = {
            "candidate_decisions_retrieved": 0,
            "decisions_remaining_after_filtering": 0,
            "decision_id": None,
            "evidence_id": None,
        }
        with patch("backend.app.chat.build_provider") as build_provider:
            answer, retrieved, _, diagnostics = answer_question(
                FakeConnection([row]), repository_id, "unsupported question", []
            )

        build_provider.assert_not_called()
        self.assertEqual(retrieved, [])
        self.assertEqual(
            answer.answer,
            "I couldn't find sufficient evidence in this repository to answer that question.",
        )
        self.assertEqual(diagnostics["fallback_reason"], "no_matching_decisions")
        self.assertFalse(diagnostics["llm_invoked"])

    def test_matching_decision_without_evidence_returns_distinct_fallback(self) -> None:
        repository_id = uuid4()
        row = {
            "candidate_decisions_retrieved": 1,
            "decisions_remaining_after_filtering": 1,
            "decision_id": uuid4(),
            "repository_id": repository_id,
            "relevance_score": 0.7,
            "retrieval_method": "full_text_or",
            "evidence_id": None,
        }
        with patch("backend.app.chat.build_provider") as build_provider:
            answer, retrieved, _, diagnostics = answer_question(
                FakeConnection([row]), repository_id, "decision with no evidence", []
            )

        build_provider.assert_not_called()
        self.assertEqual(retrieved, [])
        self.assertEqual(diagnostics["fallback_reason"], "decision_has_no_evidence")
        self.assertEqual(diagnostics["candidate_decisions_retrieved"], 1)

    def test_low_relevance_candidate_uses_threshold_fallback_without_llm(self) -> None:
        repository_id = uuid4()
        diagnostics: dict[str, object] = {
            "repository_id": str(repository_id),
            "original_question": "a question with one incidental overlap",
            "normalized_query": "rust runtime",
            "candidate_decisions_retrieved": 1,
            "decisions_remaining_after_filtering": 0,
            "evidence_records_retrieved": 0,
            "evidence_records_passing_validation": 0,
            "retrieval_strategy": "below_relevance_threshold",
            "relevance_scores": [],
            "minimum_relevance_threshold": 0.3,
            "llm_invoked": False,
            "fallback_reason": None,
        }
        with (
            patch(
                "backend.app.chat.retrieve_evidence",
                return_value=RetrievalResult([], diagnostics),
            ),
            patch("backend.app.chat.build_provider") as build_provider,
        ):
            answer, _, _, result_diagnostics = answer_question(
                FakeConnection(), repository_id, "a question with one incidental overlap", []
            )

        build_provider.assert_not_called()
        self.assertEqual(result_diagnostics["fallback_reason"], "below_relevance_threshold")
        self.assertEqual(
            answer.answer,
            "I couldn't find sufficient evidence in this repository to answer that question.",
        )

    def test_answer_context_preserves_decision_uncertainty_and_evidence(self) -> None:
        repository_id = uuid4()
        evidence_id = uuid4()
        row = _evidence_row(repository_id, evidence_id=evidence_id)
        provider = FakeProvider(AnswerResult(
            "The discussion favors concise documentation [evidence].",
            [str(evidence_id)],
            "test",
            "test-model",
        ))
        with patch("backend.app.chat.build_provider", return_value=provider):
            answer, retrieved, _, diagnostics = answer_question(
                FakeConnection([row]), repository_id, "Why simplify pager documentation?", []
            )

        self.assertEqual(answer.citations, [str(evidence_id)])
        self.assertEqual(len(retrieved), 1)
        assert provider.context is not None
        self.assertEqual(provider.context[0]["decision_status"], "unresolved")
        self.assertEqual(provider.context[0]["review_status"], "needs_review")
        self.assertEqual(provider.context[0]["alternatives"], row["alternatives"])
        self.assertIn("source_url", provider.context[0])
        self.assertTrue(diagnostics["llm_invoked"])
        self.assertIsNone(diagnostics["fallback_reason"])

    def test_empty_or_uncited_model_answer_uses_explained_fallback(self) -> None:
        repository_id = uuid4()
        row = _evidence_row(repository_id)
        cases = [
            (AnswerResult("", [], "test", "test-model"), "llm_returned_empty_response"),
            (AnswerResult("An uncited answer.", [], "test", "test-model"), "llm_returned_no_citations"),
            (AnswerResult("Unsupported citation.", [str(uuid4())], "test", "test-model"),
             "llm_cited_unretrieved_evidence"),
        ]
        for model_answer, reason in cases:
            with self.subTest(reason=reason):
                provider = FakeProvider(model_answer)
                with patch("backend.app.chat.build_provider", return_value=provider):
                    answer, _, _, diagnostics = answer_question(
                        FakeConnection([row]), repository_id, "pager documentation", []
                    )
                self.assertEqual(
                    answer.answer,
                    "I couldn't find sufficient evidence in this repository to answer that question.",
                )
                self.assertEqual(diagnostics["fallback_reason"], reason)

    def test_llm_failure_is_not_converted_to_success_shaped_fallback(self) -> None:
        repository_id = uuid4()
        provider = FakeProvider(error=ProviderError("model unavailable", "network"))
        with patch("backend.app.chat.build_provider", return_value=provider):
            with self.assertRaisesRegex(QAGenerationError, "model unavailable") as raised:
                answer_question(
                    FakeConnection([_evidence_row(repository_id)]),
                    repository_id,
                    "pager documentation",
                    [],
                )
        self.assertTrue(raised.exception.diagnostics["llm_invoked"])
        self.assertEqual(raised.exception.diagnostics["llm_error_stage"], "network")
        self.assertIsNone(raised.exception.diagnostics["fallback_reason"])

    def test_citations_must_be_retrieved_and_repository_owned(self) -> None:
        evidence_id = uuid4()
        repository_id = uuid4()
        retrieved = [{
            "evidence_id": evidence_id,
            "source_url": "https://github.com/x/y/issues/1",
        }]

        valid = validate_citations(
            FakeConnection(valid_ids={str(evidence_id)}),
            repository_id,
            retrieved,
            [str(evidence_id)],
        )
        invalid = validate_citations(
            FakeConnection(valid_ids=set()),
            repository_id,
            retrieved,
            [str(evidence_id)],
        )

        self.assertEqual(len(valid), 1)
        self.assertEqual(invalid, [])

    def test_unknown_citation_is_rejected_before_database_lookup(self) -> None:
        evidence_id = uuid4()
        conn = FakeConnection(valid_ids=set())
        result = validate_citations(conn, uuid4(), [], [str(evidence_id)])
        self.assertEqual(result, [])
        self.assertIsNone(conn.last_cursor)


if __name__ == "__main__":
    unittest.main()
