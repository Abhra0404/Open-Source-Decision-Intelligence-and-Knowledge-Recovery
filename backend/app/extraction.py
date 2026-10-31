import re
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, Field

from .cleaning import CleanedDiscussion, clean_discussion


class EvidenceReference(BaseModel):
    source_id: UUID
    source_type: str
    source_url: str
    quote: str = Field(min_length=1, max_length=1000)
    author: str | None = None
    created_at: datetime | None = None
    evidence_role: str


class ExtractedDecision(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    summary: str = Field(min_length=1, max_length=2000)
    status: str
    rationale: list[str] = Field(default_factory=list)
    alternatives: list[str] = Field(default_factory=list)
    tradeoffs: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: list[EvidenceReference] = Field(default_factory=list)
    repository_id: UUID
    source_discussion_id: UUID


VALID_STATUSES = {"accepted", "rejected", "proposed", "unresolved"}
VALID_EVIDENCE_ROLES = {"proposal", "support", "objection", "acceptance", "rejection", "context"}
ReviewStatus = Literal["valid", "needs_review", "invalid"]
DECISION_RULES = {
    "accepted": r"\b(accepted|approved|agreed|we will use|let's use|adopt(?:ed)?|confirmed)\b",
    "rejected": r"\b(rejected|declined|do not use|won't use|will not use|abandon(?:ed)?|superseded)\b",
    "proposed": r"\b(propose|proposed|suggest|suggested|should we|could use|consider)\b",
    "unresolved": r"\b(no decision|no conclusion|still debating|unresolved|open question)\b",
}


@dataclass(frozen=True)
class ValidationOutcome:
    candidate: ExtractedDecision
    review_status: ReviewStatus
    review_reason: str | None
    evidence: tuple[EvidenceReference, ...]


@dataclass(frozen=True)
class DiscussionInput:
    id: UUID
    source_type: str
    title: str | None
    body: str
    author_login: str | None
    source_url: str
    source_created_at: datetime | None


def clean_records(records: list[DiscussionInput]) -> tuple[list[DiscussionInput], dict[str, int]]:
    usable: list[DiscussionInput] = []
    counts: dict[str, int] = {}
    for record in records:
        cleaned: CleanedDiscussion = clean_discussion(record.body, record.author_login)
        if not cleaned.is_usable:
            counts[cleaned.filter_reason or "filtered"] = counts.get(cleaned.filter_reason or "filtered", 0) + 1
            continue
        usable.append(DiscussionInput(**{**record.__dict__, "body": cleaned.body}))
    return usable, counts


def extract_candidate(repository_id: UUID, records: list[DiscussionInput]) -> ExtractedDecision | None:
    usable, _ = clean_records(records)
    if not usable:
        return None
    parent = next((record for record in usable if record.source_type in {"issue", "pull_request"}), usable[0])
    combined = "\n\n".join(record.body for record in usable)
    status = _classify_status(combined)
    if status is None:
        return None
    quote_record = _best_evidence(usable, status)
    title = parent.title or _title_from_body(parent.body)
    summary = _summary(parent.body, status)
    return ExtractedDecision(
        title=title,
        summary=summary,
        status=status,
        rationale=_sentences(combined, ("because", "since", "reason", "performance", "compatib", "trade-off")),
        alternatives=_sentences(combined, ("instead", "alternative", "rather than", "option")),
        tradeoffs=_sentences(combined, ("trade-off", "cost", "risk", "benefit", "downside")),
        confidence=0.72 if status in {"accepted", "rejected"} else 0.48,
        evidence=[EvidenceReference(
            source_id=quote_record.id,
            source_type=quote_record.source_type,
            source_url=quote_record.source_url,
            quote=quote_record.body[:1000],
            author=quote_record.author_login,
            created_at=quote_record.source_created_at,
            evidence_role="acceptance" if status == "accepted" else "rejection" if status == "rejected" else "proposal",
        )],
        repository_id=repository_id,
        source_discussion_id=parent.id,
    )


def detect_decision_signal(records: list[DiscussionInput]) -> tuple[bool, str | None]:
    signals = detect_decision_signals(records)
    if not signals:
        return False, None
    return True, signals[0]["signal_type"]


def detect_decision_signals(records: list[DiscussionInput]) -> list[dict[str, object]]:
    signals: list[dict[str, object]] = []
    for record in records:
        for rule, pattern in DECISION_RULES.items():
            match = re.search(pattern, record.body, re.IGNORECASE)
            if match:
                start = max(0, match.start() - 160)
                end = min(len(record.body), match.end() + 340)
                signals.append({
                    "signal_type": rule,
                    "discussion_id": str(record.id),
                    "source_type": record.source_type,
                    "source_url": record.source_url,
                    "author_role": None,
                    "excerpt": record.body[start:end],
                })
    return signals


def validate_candidate(candidate: ExtractedDecision, records: list[DiscussionInput], repository_id: UUID) -> ExtractedDecision:
    """Resolve model-like output against the exact records in one thread."""
    if candidate.repository_id != repository_id:
        raise ValueError("candidate repository does not match extraction repository")
    by_id = {record.id: record for record in records}
    if candidate.source_discussion_id not in by_id:
        raise ValueError("candidate parent source is outside the extraction thread")
    if candidate.status not in VALID_STATUSES:
        raise ValueError("candidate has an invalid decision status")
    outcome = assess_candidate(candidate, records, repository_id)
    if outcome.review_status == "invalid":
        raise ValueError(outcome.review_reason or "candidate failed provenance validation")
    return outcome.candidate


def assess_candidate(candidate: ExtractedDecision, records: list[DiscussionInput], repository_id: UUID) -> ValidationOutcome:
    if candidate.repository_id != repository_id:
        return ValidationOutcome(candidate, "invalid", "candidate repository does not match extraction repository", ())
    for evidence in candidate.evidence:
        if evidence.evidence_role not in VALID_EVIDENCE_ROLES:
            return ValidationOutcome(candidate, "invalid", f"unsupported evidence role: {evidence.evidence_role}", ())
    by_id = {record.id: record for record in records}
    if candidate.source_discussion_id not in by_id:
        return ValidationOutcome(candidate, "invalid", "candidate parent source is outside the extraction thread", ())
    if candidate.status not in VALID_STATUSES:
        return ValidationOutcome(candidate, "invalid", "candidate has an invalid decision status", ())
    seen: set[UUID] = set()
    resolved: list[EvidenceReference] = []
    for evidence in candidate.evidence:
        if evidence.source_id in seen:
            continue
        source = by_id.get(evidence.source_id)
        if source is None:
            return ValidationOutcome(candidate, "invalid", "evidence source is outside the extraction thread", tuple(resolved))
        if evidence.source_url != source.source_url:
            return ValidationOutcome(candidate, "invalid", "evidence URL does not match the source record", tuple(resolved))
        if not _quote_matches(evidence.quote, source.body):
            return ValidationOutcome(candidate, "invalid", "evidence quote is not present in the source record", tuple(resolved))
        resolved.append(evidence.model_copy(update={
            "source_type": source.source_type,
            "source_url": source.source_url,
            "author": source.author_login,
            "created_at": source.source_created_at,
        }))
        seen.add(evidence.source_id)
    if not resolved:
        return ValidationOutcome(candidate, "invalid", "candidate has no verifiable evidence", ())
    resolved_candidate = candidate.model_copy(update={"evidence": resolved})
    semantic_status, reason = _semantic_review(resolved_candidate, [by_id[e.source_id] for e in resolved])
    return ValidationOutcome(
        resolved_candidate.model_copy(update={"status": semantic_status}),
        "needs_review" if reason else "valid",
        reason,
        tuple(resolved),
    )


def _quote_matches(quote: str, body: str) -> bool:
    normalize = lambda value: re.sub(r"\s+", " ", clean_discussion(value).body).strip().lower()
    return normalize(quote) in normalize(body)


def _semantic_review(candidate: ExtractedDecision, sources: list[DiscussionInput]) -> tuple[str, str | None]:
    text = "\n".join(source.body for source in sources).lower()
    accepted = bool(re.search(r"\b(accepted|approved|agreed|we will use|let's use|adopt(?:ed)?|confirmed)\b", text))
    rejected = bool(re.search(r"\b(rejected|declined|do not use|won't use|will not use|abandon(?:ed)?|superseded)\b", text))
    proposed = bool(re.search(r"\b(propose|proposed|suggest|suggested|should we|could use|consider)\b", text))
    role_ok = all(_role_matches_content(evidence.evidence_role, evidence.quote) for evidence in candidate.evidence)
    if accepted and rejected:
        return "unresolved", "evidence contains both acceptance and rejection signals"
    if candidate.status == "accepted" and not accepted:
        return "unresolved", "acceptance is not explicitly supported by evidence"
    if candidate.status == "rejected" and not rejected:
        return "unresolved", "rejection is not explicitly supported by evidence"
    if candidate.status == "proposed" and (accepted or rejected):
        return "unresolved", "proposal has an explicit outcome that conflicts with proposed status"
    if candidate.status == "unresolved" and (accepted or rejected) and not (accepted and rejected):
        return "unresolved", "candidate status is unresolved despite an outcome signal"
    if not role_ok:
        return "unresolved", "evidence role does not match the cited source content"
    unrelated = _unrelated_topic(candidate.title + " " + candidate.summary, candidate.rationale + candidate.alternatives + candidate.tradeoffs)
    if unrelated:
        return "unresolved", f"field contains unrelated topic: {unrelated}"
    if not (accepted or rejected or proposed):
        return "unresolved", "evidence does not establish a decision outcome"
    return candidate.status, None


def _role_matches_content(role: str, quote: str) -> bool:
    lowered = quote.lower()
    markers = {
        "acceptance": ("accepted", "approved", "agreed", "adopt", "confirmed", "we will use"),
        "rejection": ("rejected", "declined", "do not use", "won't use", "abandon", "superseded"),
        "proposal": ("propose", "suggest", "should we", "could use", "consider"),
    }
    return role not in markers or any(marker in lowered for marker in markers[role])


def _unrelated_topic(decision_text: str, fields: list[str]) -> str | None:
    domains = ("billing", "streaming", "plugin", "memory-management", "memory management", "react", "agent", "parser")
    decision_lower = decision_text.lower()
    for domain in domains:
        if domain in decision_lower:
            continue
        if any(domain in field.lower() for field in fields):
            return domain
    return None


def _classify_status(text: str) -> str | None:
    lowered = text.lower()
    if re.search(r"\b(no decision|no conclusion|still debating|unresolved|open question)\b", lowered):
        return "unresolved"
    rejected = bool(re.search(r"\b(rejected|declined|do not use|won't use|will not use|abandon(?:ed)?)\b", lowered))
    accepted = bool(re.search(r"\b(accepted|approved|agreed|we will use|let's use|adopt(?:ed)?)\b", lowered))
    if re.search(r"\b(not accepted|not approved|not agreed|do not agree)\b", lowered):
        accepted = False
    proposed = bool(re.search(r"\b(propose|proposed|suggest|suggested|should we|could use|consider)\b", lowered))
    if rejected and accepted:
        return "unresolved"
    if rejected:
        return "rejected"
    if accepted:
        return "accepted"
    if proposed:
        return "proposed"
    return None


def _best_evidence(records: list[DiscussionInput], status: str) -> DiscussionInput:
    markers = {
        "accepted": ("accepted", "approved", "agreed", "adopt"),
        "rejected": ("rejected", "declined", "abandon", "do not use"),
        "proposed": ("propose", "suggest", "should we", "could use"),
        "unresolved": ("unresolved", "still debating", "open question"),
    }[status]
    return max(records, key=lambda record: sum(marker in record.body.lower() for marker in markers))


def _title_from_body(body: str) -> str:
    first = body.splitlines()[0].strip(" #:-")
    return first[:300] or "Engineering discussion"


def _summary(body: str, status: str) -> str:
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", " ".join(body.split())) if sentence.strip()]
    markers = {
        "accepted": ("accepted", "approved", "agreed", "adopt", "will use"),
        "rejected": ("rejected", "declined", "abandon", "do not use"),
        "proposed": ("propose", "suggest", "should we", "could use"),
        "unresolved": ("unresolved", "open question", "debating", "question"),
    }[status]
    relevant = [sentence for sentence in sentences if any(marker in sentence.lower() for marker in markers)]
    return " ".join((relevant or sentences[:1])[:2])[:2000]


def _sentences(text: str, markers: tuple[str, ...]) -> list[str]:
    found = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
        if any(marker in sentence.lower() for marker in markers)
    ]
    return list(dict.fromkeys(found))[:5]
