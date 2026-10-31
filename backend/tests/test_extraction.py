import unittest
from uuid import uuid4

from backend.app.cleaning import clean_discussion
from backend.app.extraction import DiscussionInput, EvidenceReference, ExtractedDecision, assess_candidate, detect_decision_signal, detect_decision_signals, extract_candidate


class ExtractionTests(unittest.TestCase):
    def test_preview_bot_content_is_filtered(self) -> None:
        result = clean_discussion("## Docs preview\nGenerated page", "github-actions[bot]")
        self.assertFalse(result.is_usable)
        self.assertEqual(result.filter_reason, "machine_generated_preview")

    def test_markdown_and_code_are_preserved(self) -> None:
        result = clean_discussion("Use `pool.connect()`.\r\n\r\n```python\npool.close()\n```")
        self.assertTrue(result.is_usable)
        self.assertIn("`pool.connect()`", result.body)
        self.assertIn("```python", result.body)

    def test_proposal_requires_proposal_language(self) -> None:
        repository_id = uuid4()
        source_id = uuid4()
        result = extract_candidate(repository_id, [DiscussionInput(
            id=source_id,
            source_type="issue",
            title="Connection strategy",
            body="I propose using a shared connection pool because it reduces setup overhead.",
            author_login="developer",
            source_url="https://github.com/example/repo/issues/1",
            source_created_at=None,
        )])
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.status, "proposed")
        self.assertEqual(result.evidence[0].source_id, source_id)

    def test_no_decision_returns_none(self) -> None:
        result = extract_candidate(uuid4(), [DiscussionInput(
            id=uuid4(), source_type="issue", title="Question", body="What do you think?",
            author_login="developer", source_url="https://github.com/example/repo/issues/1",
            source_created_at=None,
        )])
        self.assertIsNone(result)

    def test_decision_signal_diagnostics_distinguish_signal_and_rule(self) -> None:
        record = DiscussionInput(
            id=uuid4(), source_type="issue", title="Question",
            body="The team agreed to adopt the connection pool.",
            author_login="developer", source_url="https://github.com/example/repo/issues/1",
            source_created_at=None,
        )
        self.assertEqual(detect_decision_signal([record]), (True, "accepted"))

    def test_detailed_signal_diagnostics_include_each_matching_rule(self) -> None:
        record = DiscussionInput(
            id=uuid4(), source_type="issue", title="Connection strategy",
            body="I propose pooling. The team agreed to adopt it.", author_login="developer",
            source_url="https://github.com/example/repo/issues/1", source_created_at=None,
        )

        signals = detect_decision_signals([record])

        self.assertEqual([signal["signal_type"] for signal in signals], ["accepted", "proposed"])
        self.assertEqual(signals[0]["discussion_id"], str(record.id))
        self.assertIn("agreed", signals[0]["excerpt"])
        self.assertEqual(signals[0]["source_url"], record.source_url)

    def test_unrelated_threads_are_not_combined(self) -> None:
        repository_id = uuid4()
        first = DiscussionInput(uuid4(), "pull_request", "Database pooling", "We agreed to adopt pooling because it reduces setup cost.", "a", "https://github.com/x/y/pull/1", None)
        second = DiscussionInput(uuid4(), "pull_request", "Logging", "I propose structured logging for debugging.", "b", "https://github.com/x/y/pull/2", None)
        first_result = extract_candidate(repository_id, [first])
        second_result = extract_candidate(repository_id, [second])
        self.assertEqual(first_result.status, "accepted")
        self.assertEqual(second_result.status, "proposed")
        self.assertNotIn("logging", first_result.summary.lower())

    def test_evidence_from_another_thread_is_rejected(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "pull_request", "Pooling", "We agreed to adopt pooling.", "a", "https://github.com/x/y/pull/1", None)
        other = DiscussionInput(uuid4(), "pull_request", "Logging", "We agreed to adopt logging.", "b", "https://github.com/x/y/pull/2", None)
        result = extract_candidate(repository_id, [source])
        assert result is not None
        forged = result.model_copy(update={"evidence": [result.evidence[0].model_copy(update={"source_id": other.id, "source_url": other.source_url, "quote": other.body})]})
        with self.assertRaises(ValueError):
            from backend.app.extraction import validate_candidate
            validate_candidate(forged, [source], repository_id)

    def test_merge_alone_does_not_accept(self) -> None:
        result = extract_candidate(uuid4(), [DiscussionInput(
            uuid4(), "pull_request", "Pin dependency", "This PR was merged after the change.", "a",
            "https://github.com/x/y/pull/1", None,
        )])
        self.assertIsNone(result)

    def test_proposal_is_not_accepted_by_negative_approval(self) -> None:
        result = extract_candidate(uuid4(), [DiscussionInput(
            uuid4(), "issue", "Dependency choice",
            "I propose using option A, but the team has not approved it.",
            "a", "https://github.com/x/y/issues/1", None,
        )])
        assert result is not None
        self.assertEqual(result.status, "proposed")

    def test_incorrect_source_url_is_rejected(self) -> None:
        from backend.app.extraction import validate_candidate
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "issue", "Pooling", "We agreed to adopt pooling.", "a", "https://github.com/x/y/issues/1", None)
        result = extract_candidate(repository_id, [source])
        assert result is not None
        forged = result.model_copy(update={"evidence": [result.evidence[0].model_copy(update={"source_url": "https://github.com/x/y/issues/999"})]})
        with self.assertRaises(ValueError):
            validate_candidate(forged, [source], repository_id)

    def test_duplicate_evidence_is_deduplicated(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "pull_request", "Pooling", "We agreed to adopt pooling.", "a", "https://github.com/x/y/pull/1", None)
        result = extract_candidate(repository_id, [source])
        assert result is not None
        duplicate = result.model_copy(update={"evidence": [result.evidence[0], result.evidence[0]]})
        from backend.app.extraction import validate_candidate
        validated = validate_candidate(duplicate, [source], repository_id)
        self.assertEqual(len(validated.evidence), 1)

    def test_implementation_description_is_not_rejection(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "pull_request", "Type billing error reasons", "Implemented billing error reasons per the proto service.", "a", "https://github.com/x/y/pull/1", None)
        candidate = ExtractedDecision(
            title=source.title, summary=source.body, status="rejected",
            rationale=["The implementation follows the proto service."], alternatives=[], tradeoffs=[],
            confidence=0.9, repository_id=repository_id, source_discussion_id=source.id,
            evidence=[EvidenceReference(source_id=source.id, source_type="pull_request", source_url=source.source_url, quote=source.body, evidence_role="rejection")],
        )
        outcome = assess_candidate(candidate, [source], repository_id)
        self.assertEqual(outcome.review_status, "needs_review")
        self.assertEqual(outcome.candidate.status, "unresolved")

    def test_explicit_rejection_is_valid(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "issue", "Connection option", "The team rejected option B because it increases latency.", "a", "https://github.com/x/y/issues/1", None)
        candidate = ExtractedDecision(
            title=source.title, summary=source.body, status="rejected", rationale=["It increases latency."],
            alternatives=["Option B"], tradeoffs=[], confidence=0.8, repository_id=repository_id,
            source_discussion_id=source.id,
            evidence=[EvidenceReference(source_id=source.id, source_type="issue", source_url=source.source_url, quote=source.body, evidence_role="rejection")],
        )
        self.assertEqual(assess_candidate(candidate, [source], repository_id).review_status, "valid")

    def test_correct_billing_decision_is_valid(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(
            uuid4(), "pull_request", "Type billing error reasons per proto service",
            "We agreed to adopt typed billing error reasons from the proto service.",
            "a", "https://github.com/x/y/pull/1", None,
        )
        candidate = ExtractedDecision(
            title=source.title, summary=source.body, status="accepted", rationale=["The proto service defines the shared contract."],
            alternatives=[], tradeoffs=[], confidence=0.8, repository_id=repository_id,
            source_discussion_id=source.id,
            evidence=[EvidenceReference(source_id=source.id, source_type="pull_request", source_url=source.source_url, quote=source.body, evidence_role="acceptance")],
        )
        self.assertEqual(assess_candidate(candidate, [source], repository_id).review_status, "valid")

    def test_missing_evidence_is_invalid(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "issue", "Connection option", "The team rejected option B.", "a", "https://github.com/x/y/issues/1", None)
        candidate = ExtractedDecision(
            title=source.title, summary=source.body, status="rejected", rationale=[], alternatives=[], tradeoffs=[],
            confidence=0.8, repository_id=repository_id, source_discussion_id=source.id, evidence=[],
        )
        self.assertEqual(assess_candidate(candidate, [source], repository_id).review_status, "invalid")

    def test_unrelated_field_needs_review(self) -> None:
        repository_id = uuid4()
        source = DiscussionInput(uuid4(), "pull_request", "ReAct parser", "We agreed to adopt the ReAct parser.", "a", "https://github.com/x/y/pull/1", None)
        candidate = ExtractedDecision(
            title=source.title, summary=source.body, status="accepted",
            rationale=["The billing service requires a separate implementation."], alternatives=[], tradeoffs=[],
            confidence=0.8, repository_id=repository_id, source_discussion_id=source.id,
            evidence=[EvidenceReference(source_id=source.id, source_type="pull_request", source_url=source.source_url, quote=source.body, evidence_role="acceptance")],
        )
        outcome = assess_candidate(candidate, [source], repository_id)
        self.assertEqual(outcome.review_status, "needs_review")


if __name__ == "__main__":
    unittest.main()
