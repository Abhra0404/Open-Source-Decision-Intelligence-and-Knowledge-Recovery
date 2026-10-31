import re
import unicodedata
from dataclasses import dataclass
from typing import Literal, Mapping
from uuid import UUID

from .extraction import ExtractedDecision


MatchType = Literal[
    "exact_duplicate",
    "semantic_equivalent",
    "distinct_same_discussion",
    "superseding",
    "ambiguous",
    "no_match",
]

_SUPERSEDING_PATTERN = re.compile(
    r"\b(?:supersed\w*|replac(?:e|es|ed|ing)|in place of|now use|switch(?:ed|ing)? to)\b",
    re.IGNORECASE,
)
_SEMANTIC_EQUIVALENCE_THRESHOLD = 0.82


@dataclass(frozen=True)
class DecisionMatch:
    match_type: MatchType
    matched_decision_id: UUID | None
    rationale: str
    similarity_score: float | None = None
    similarity_method: str | None = None
    matched_decision_title: str | None = None
    matched_decision_status: str | None = None
    matched_decision_review_status: str | None = None

    @property
    def requires_review(self) -> bool:
        return self.match_type in {"ambiguous", "superseding"}

    @property
    def is_duplicate(self) -> bool:
        return self.match_type in {"exact_duplicate", "semantic_equivalent"}


def match_candidate(
    candidate: ExtractedDecision,
    repository_id: UUID,
    evidence_ids: set[UUID],
    existing_decisions: list[Mapping[str, object]],
) -> DecisionMatch:
    if candidate.repository_id != repository_id:
        raise ValueError("candidate repository does not match extraction repository")

    comparisons: list[tuple[Mapping[str, object], float, float, float, bool]] = []
    for existing in existing_decisions:
        if existing.get("repository_id") != repository_id:
            continue
        existing_evidence = _uuid_set(existing.get("evidence_ids"))
        score = _text_similarity(_decision_text(candidate), _decision_text(existing))
        title_score = _text_similarity(candidate.title, str(existing.get("title") or ""))
        evidence_score = _jaccard(evidence_ids, existing_evidence)
        same_source = existing.get("source_discussion_id") == candidate.source_discussion_id
        comparisons.append((existing, score, title_score, evidence_score, same_source))

    if not comparisons:
        return DecisionMatch(
            "no_match",
            None,
            "No existing decisions in this repository were available for comparison.",
        )

    for existing, score, _, _, same_source in comparisons:
        if same_source and _exact_content_match(candidate, evidence_ids, existing):
            return _match(
                "exact_duplicate",
                existing,
                "Normalized title, summary, status, rationale, alternatives, trade-offs, "
                "source discussion, and evidence IDs all match.",
                score,
            )

    candidate_text = _decision_text(candidate)
    superseding_matches = [
        item for item in comparisons
        if _SUPERSEDING_PATTERN.search(candidate_text)
        and (item[3] > 0 or item[2] >= 0.4 or item[4])
    ]
    if superseding_matches:
        existing, score, _, _, _ = max(
            superseding_matches,
            key=lambda item: (item[3] > 0, item[2], item[1]),
        )
        return _match(
            "superseding",
            existing,
            "The candidate explicitly says it supersedes or replaces an existing decision. "
            "The existing record is preserved; human review is required before linking or "
            "changing its active status.",
            score,
        )

    semantic_matches = [
        item for item in comparisons
        if item[2] >= 0.6
        and item[0].get("status") == candidate.status
        and item[3] > 0
        and item[1] >= _SEMANTIC_EQUIVALENCE_THRESHOLD
    ]
    if semantic_matches:
        existing, score, _, _, _ = max(semantic_matches, key=lambda item: item[1])
        return _match(
            "semantic_equivalent",
            existing,
            "The normalized title and status align, verified evidence overlaps, and "
            f"token Jaccard similarity is at least {_SEMANTIC_EQUIVALENCE_THRESHOLD:.2f}.",
            score,
        )

    ambiguous_matches = [
        item for item in comparisons
        if item[2] == 1
        or (item[4] and item[3] >= 0.5)
        or (item[3] >= 0.5 and item[1] >= 0.2)
    ]
    if ambiguous_matches:
        existing, score, title_score, evidence_score, same_source = max(
            ambiguous_matches,
            key=lambda item: (item[2] == 1, item[3], item[1]),
        )
        matched_facts: list[str] = []
        if title_score == 1:
            matched_facts.append("normalized titles match")
        if evidence_score >= 0.5:
            matched_facts.append(f"verified evidence ID overlap is {evidence_score:.0%}")
        if same_source:
            matched_facts.append("source discussion IDs match")
        return _match(
            "ambiguous",
            existing,
            "The candidate shares "
            + " and ".join(matched_facts)
            + " with an existing decision, but does not meet the exact or "
            "semantic-equivalence threshold. Persist it for human review rather "
            "than silently discarding it.",
            score,
        )

    same_source_matches = [item for item in comparisons if item[4]]
    if same_source_matches:
        return DecisionMatch(
            "distinct_same_discussion",
            None,
            "An existing decision uses the same source discussion, but the candidate has "
            "different normalized content and no substantial evidence overlap. A shared "
            "discussion ID alone is not treated as a duplicate.",
            max(item[1] for item in same_source_matches),
            "token_jaccard_v1",
        )

    return DecisionMatch(
        "no_match",
        None,
        "No existing decision met the exact, equivalence, supersession, or ambiguity "
        "matching conditions.",
    )


def _match(
    match_type: MatchType,
    existing: Mapping[str, object],
    rationale: str,
    score: float,
) -> DecisionMatch:
    decision_id = existing.get("id")
    if not isinstance(decision_id, UUID):
        decision_id = UUID(str(decision_id))
    return DecisionMatch(
        match_type=match_type,
        matched_decision_id=decision_id,
        rationale=rationale,
        similarity_score=round(score, 4),
        similarity_method="token_jaccard_v1",
        matched_decision_title=str(existing.get("title") or ""),
        matched_decision_status=str(existing.get("status") or ""),
        matched_decision_review_status=str(existing.get("review_status") or ""),
    )


def _exact_content_match(
    candidate: ExtractedDecision,
    candidate_evidence: set[UUID],
    existing: Mapping[str, object],
) -> bool:
    return (
        _normalize(candidate.title) == _normalize(existing.get("title"))
        and _normalize(candidate.summary) == _normalize(existing.get("summary"))
        and _normalize(candidate.status) == _normalize(existing.get("status"))
        and _normalize_list(candidate.rationale) == _normalize_list(existing.get("rationale"))
        and _normalize_list(candidate.alternatives) == _normalize_list(existing.get("alternatives"))
        and _normalize_list(candidate.tradeoffs) == _normalize_list(existing.get("tradeoffs"))
        and candidate_evidence == _uuid_set(existing.get("evidence_ids"))
    )


def _decision_text(decision: ExtractedDecision | Mapping[str, object]) -> str:
    if isinstance(decision, ExtractedDecision):
        fields: list[object] = [
            decision.title,
            decision.summary,
            decision.rationale,
            decision.alternatives,
            decision.tradeoffs,
        ]
    else:
        fields = [
            decision.get("title"),
            decision.get("summary"),
            decision.get("rationale"),
            decision.get("alternatives"),
            decision.get("tradeoffs"),
        ]
    return " ".join(
        _flatten_text(value)
        for value in fields
        if value is not None
    )


def _flatten_text(value: object) -> str:
    if isinstance(value, (list, tuple)):
        return " ".join(_flatten_text(item) for item in value)
    return str(value)


def _normalize(value: object) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return " ".join(re.findall(r"\w+", normalized))


def _normalize_list(value: object) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(sorted(_normalize(item) for item in value))


def _uuid_set(value: object) -> set[UUID]:
    if not isinstance(value, (list, tuple, set)):
        return set()
    result: set[UUID] = set()
    for item in value:
        try:
            result.add(item if isinstance(item, UUID) else UUID(str(item)))
        except (ValueError, TypeError, AttributeError):
            continue
    return result


def _jaccard(left: set[object], right: set[object]) -> float:
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def _text_similarity(left: str, right: str) -> float:
    return _jaccard(set(_normalize(left).split()), set(_normalize(right).split()))
