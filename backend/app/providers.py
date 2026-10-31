import json
import re
import time
from dataclasses import dataclass
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from pydantic import ValidationError

from .extraction import DiscussionInput, ExtractedDecision, extract_candidate
from .relationships import RelationshipProposal


class ProviderError(RuntimeError):
    def __init__(self, message: str, stage: str = "provider") -> None:
        super().__init__(message)
        self.stage = stage


@dataclass(frozen=True)
class ProviderResult:
    candidate: ExtractedDecision | None
    provider: str
    model: str
    revision: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    latency_ms: int | None = None


@dataclass(frozen=True)
class AnswerResult:
    answer: str
    citations: list[str]
    provider: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    latency_ms: int | None = None


@dataclass(frozen=True)
class RelationshipResult:
    proposals: list[RelationshipProposal]
    provider: str
    model: str
    latency_ms: int | None = None


class ExtractionProvider(Protocol):
    def extract_decision(self, repository_id: UUID, records: list[DiscussionInput]) -> ProviderResult: ...
    def health_check(self) -> dict[str, object]: ...
    def get_model_info(self) -> dict[str, object]: ...
    def answer_question(self, question: str, history: list[dict[str, str]], context: list[dict[str, object]]) -> AnswerResult: ...
    def propose_relationships(self, decisions: list[dict[str, object]]) -> RelationshipResult: ...


class DeterministicProvider:
    def extract_decision(self, repository_id: UUID, records: list[DiscussionInput]) -> ProviderResult:
        started = time.monotonic()
        candidate = extract_candidate(repository_id, records)
        return ProviderResult(
            candidate=candidate,
            provider="deterministic",
            model="rule-based-mvp",
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    def health_check(self) -> dict[str, object]:
        return {"ok": True, "provider": "deterministic", "model": "rule-based-mvp"}

    def get_model_info(self) -> dict[str, object]:
        return {"provider": "deterministic", "model": "rule-based-mvp", "revision": None}

    def answer_question(self, question: str, history: list[dict[str, str]], context: list[dict[str, object]]) -> AnswerResult:
        started = time.monotonic()
        if not context:
            answer = "I couldn't find sufficient evidence in this repository to answer that question."
            citations: list[str] = []
        else:
            lines = [f"Based on the retrieved repository evidence, {item['summary']} [{item['evidence_id']}]" for item in context[:3]]
            answer = " ".join(lines)
            citations = [str(item["evidence_id"]) for item in context[:3]]
        return AnswerResult(answer, citations, "deterministic", "rule-based-mvp", latency_ms=int((time.monotonic() - started) * 1000))

    def propose_relationships(self, decisions: list[dict[str, object]]) -> RelationshipResult:
        return RelationshipResult([], "deterministic", "rule-based-mvp", 0)


class OpenWeightLLMProvider:
    def __init__(self, base_url: str, model: str, api_key: str | None = None, timeout_seconds: float = 60) -> None:
        if not base_url:
            raise ProviderError("MODEL_BASE_URL is required for the open_weight provider", "configuration")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def get_model_info(self) -> dict[str, object]:
        return {"provider": "open_weight", "model": self.model, "revision": None, "base_url": self.base_url}

    def health_check(self) -> dict[str, object]:
        try:
            payload = self._request("GET", "/v1/models")
            return {"ok": True, **self.get_model_info(), "available_models": payload.get("data", [])}
        except ProviderError as exc:
            return {"ok": False, **self.get_model_info(), "error": str(exc)}

    def extract_decision(self, repository_id: UUID, records: list[DiscussionInput]) -> ProviderResult:
        prompt = self._prompt(repository_id, records)
        started = time.monotonic()
        response = self._request("POST", "/v1/chat/completions", {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 800,
            "think": False,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "You extract engineering decisions. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
        })
        try:
            content = response["choices"][0]["message"]["content"]
            payload = self._parse_json(content)
            candidate = ExtractedDecision.model_validate(payload)
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as exc:
            raise ProviderError(f"open-weight response was not valid extraction JSON: {exc}", "schema_validation") from exc
        usage = response.get("usage", {})
        return ProviderResult(
            candidate=candidate,
            provider="open_weight",
            model=self.model,
            revision=response.get("system_fingerprint"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    def answer_question(self, question: str, history: list[dict[str, str]], context: list[dict[str, object]]) -> AnswerResult:
        started = time.monotonic()
        prompt = {
            "question": question,
            "history": history[-6:],
            "evidence": context,
            "rules": [
                "Use only the supplied evidence.",
                "Cite factual claims with evidence_id values from the supplied evidence.",
                "If evidence is insufficient, say exactly: I couldn't find sufficient evidence in this repository to answer that question.",
                "Return JSON with exactly answer (string) and citations (array of evidence_id strings).",
            ],
        }
        response = self._request("POST", "/v1/chat/completions", {
            "model": self.model, "max_tokens": 600, "think": False,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": "You answer repository-history questions using only cited evidence."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=True)},
            ],
        })
        try:
            content = response["choices"][0]["message"]["content"]
            payload = self._parse_json(content)
            answer = payload["answer"]
            citations = payload["citations"]
            if not isinstance(answer, str) or not isinstance(citations, list) or not all(isinstance(item, str) for item in citations):
                raise ValueError("answer must be a string and citations must be string IDs")
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as exc:
            raise ProviderError(f"open-weight answer was not valid JSON: {exc}", "qa_schema_validation") from exc
        usage = response.get("usage", {})
        return AnswerResult(answer, citations, "open_weight", self.model, usage.get("prompt_tokens"), usage.get("completion_tokens"), int((time.monotonic() - started) * 1000))

    def propose_relationships(self, decisions: list[dict[str, object]]) -> RelationshipResult:
        started = time.monotonic()
        prompt = {
            "decisions": decisions,
            "rules": [
                "Propose only relationships supported by supplied decision evidence.",
                "Do not infer supersession from shared technology or timestamps alone.",
                "Return JSON with a relationships array; each item must contain source_decision_id, target_decision_id, relationship_type, explanation, evidence_ids, confidence.",
            ],
        }
        response = self._request("POST", "/v1/chat/completions", {
            "model": self.model, "temperature": 0, "max_tokens": 600, "think": False, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": "You propose evidence-grounded decision relationships. Return JSON only."}, {"role": "user", "content": json.dumps(prompt, ensure_ascii=True)}],
        })
        try:
            content = response["choices"][0]["message"]["content"]
            payload = self._parse_json(content)
            proposals = [RelationshipProposal.model_validate(item) for item in payload.get("relationships", [])]
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError, ValueError) as exc:
            raise ProviderError(f"open-weight relationship output was invalid: {exc}", "relationship_schema_validation") from exc
        return RelationshipResult(proposals, "open_weight", self.model, int((time.monotonic() - started) * 1000))

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        request = Request(self.base_url + path, method=method)
        request.add_header("Accept", "application/json")
        if body is not None:
            request.add_header("Content-Type", "application/json")
            request.data = json.dumps(body).encode("utf-8")
        if self.api_key:
            request.add_header("Authorization", f"Bearer {self.api_key}")
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ProviderError(f"open-weight model server request failed: {exc}", "model_server") from exc

    @staticmethod
    def _parse_json(content: str) -> dict[str, object]:
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
        value = json.loads(cleaned)
        if not isinstance(value, dict):
            raise json.JSONDecodeError("expected a JSON object", cleaned, 0)
        return value

    @staticmethod
    def _prompt(repository_id: UUID, records: list[DiscussionInput]) -> str:
        sources = []
        remaining_chars = 9000
        for record in records:
            if remaining_chars <= 0:
                break
            body = record.body[:min(2400, remaining_chars)]
            sources.append({
                "discussion_id": str(record.id),
                "source_type": record.source_type,
                "title": record.title,
                "body": body,
                "author_login": record.author_login,
                "source_url": record.source_url,
            })
            remaining_chars -= len(body)
        return (
            "Extract one candidate from this exact discussion thread. Every evidence item must copy "
            "a discussion_id, source_url, and quote from the supplied sources. Do not invent claims, "
            "URLs, authors, or evidence. Use status accepted only with explicit acceptance, rejected "
            "only with explicit rejection, otherwise proposed or unresolved. Return fields title, summary, "
            "status, rationale, alternatives, tradeoffs, confidence, evidence, repository_id, "
            "source_discussion_id. Evidence roles are proposal, support, objection, acceptance, rejection, context. "
            "Use arrays for rationale, alternatives, and tradeoffs, even when empty. Evidence keys must be "
            "exactly source_id, source_type, source_url, quote, author, created_at, evidence_role; do not use "
            "discussion_id or role. Use UUID strings for source_id and repository_id, and null for unknown author "
            "or created_at. Return exactly this shape: {title: string, summary: string, status: accepted|rejected|proposed|unresolved, "
            "rationale: [], alternatives: [], tradeoffs: [], confidence: number|null, evidence: [{source_id: UUID, "
            "source_type: string, source_url: string, quote: string, author: string|null, created_at: string|null, "
            "evidence_role: string}], repository_id: UUID, source_discussion_id: UUID}.\n\n"
            f"repository_id: {repository_id}\nSOURCES:\n{json.dumps(sources, ensure_ascii=True)}"
        )


def build_provider(provider: str, model: str, base_url: str, api_key: str | None) -> ExtractionProvider:
    if provider == "deterministic":
        return DeterministicProvider()
    if provider == "open_weight":
        return OpenWeightLLMProvider(base_url, model, api_key)
    raise ProviderError(f"Unsupported MODEL_PROVIDER: {provider}", "configuration")