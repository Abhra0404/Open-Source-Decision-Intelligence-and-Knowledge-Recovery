import unittest
from datetime import datetime, timezone
from uuid import uuid4

from backend.app.relationships import RelationshipProposal, RelationshipType, validate_relationship


class RelationshipValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository_id = uuid4()
        self.source_id = uuid4()
        self.target_id = uuid4()
        self.evidence_id = uuid4()
        self.decisions = {
            self.source_id: {"repository_id": self.repository_id, "extracted_at": datetime(2026, 2, 1, tzinfo=timezone.utc)},
            self.target_id: {"repository_id": self.repository_id, "extracted_at": datetime(2026, 1, 1, tzinfo=timezone.utc)},
        }

    def proposal(self, **updates: object) -> RelationshipProposal:
        values = {
            "source_decision_id": self.source_id,
            "target_decision_id": self.target_id,
            "relationship_type": RelationshipType.supersedes,
            "explanation": "The later decision explicitly replaces the earlier approach.",
            "evidence_ids": [self.evidence_id],
            "confidence": 0.8,
        }
        values.update(updates)
        return RelationshipProposal(**values)

    def test_valid_newer_supersession(self) -> None:
        self.assertIsNone(validate_relationship(self.proposal(), self.repository_id, self.decisions, {self.evidence_id}))

    def test_self_reference_is_rejected(self) -> None:
        proposal = self.proposal(target_decision_id=self.source_id)
        self.assertIn("same decision", validate_relationship(proposal, self.repository_id, self.decisions, {self.evidence_id}))

    def test_cross_repository_reference_is_rejected(self) -> None:
        other_repository = uuid4()
        decisions = {**self.decisions, self.target_id: {"repository_id": other_repository, "extracted_at": datetime(2026, 1, 1, tzinfo=timezone.utc)}}
        self.assertIn("requested repository", validate_relationship(self.proposal(), self.repository_id, decisions, {self.evidence_id}))

    def test_evidence_from_outside_relationship_is_rejected(self) -> None:
        self.assertIn("evidence reference", validate_relationship(self.proposal(), self.repository_id, self.decisions, set()))


if __name__ == "__main__":
    unittest.main()