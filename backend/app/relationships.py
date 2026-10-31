from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class RelationshipType(str, Enum):
    supersedes = "supersedes"
    refines = "refines"
    depends_on = "depends_on"
    contradicts = "contradicts"
    related_to = "related_to"


class RelationshipProposal(BaseModel):
    source_decision_id: UUID
    target_decision_id: UUID
    relationship_type: RelationshipType
    explanation: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[UUID] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


def validate_relationship(proposal: RelationshipProposal, repository_id: UUID, decisions: dict[UUID, dict[str, Any]], evidence_ids: set[UUID]) -> str | None:
    if proposal.source_decision_id == proposal.target_decision_id:
        return "a relationship cannot reference the same decision twice"
    source = decisions.get(proposal.source_decision_id)
    target = decisions.get(proposal.target_decision_id)
    if not source or not target:
        return "both decisions must belong to the requested repository"
    if source["repository_id"] != repository_id or target["repository_id"] != repository_id:
        return "both decisions must belong to the requested repository"
    if any(evidence_id not in evidence_ids for evidence_id in proposal.evidence_ids):
        return "every evidence reference must belong to one of the two decisions"
    if proposal.relationship_type == RelationshipType.supersedes and source["extracted_at"] <= target["extracted_at"]:
        return "a superseding decision must be newer than the decision it supersedes"
    if proposal.relationship_type == RelationshipType.refines and source["extracted_at"] <= target["extracted_at"]:
        return "a refining decision must be newer than the decision it refines"
    return None