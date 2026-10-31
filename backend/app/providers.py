import json
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from threading import BoundedSemaphore
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

import httpx
from pydantic import BaseModel, ValidationError

from .extraction import DiscussionInput, ExtractedDecision, extract_candidate
from .relationships import RelationshipProposal


class ProviderError(RuntimeError):
    def __init__(self, message: str, stage: str = "provider", *, model_call_completed: bool = False,
                 latency_ms: int | None = None, prompt_tokens: int | None = None,
                 completion_tokens: int | None = None, revision: str | None = None,
                 total_tokens: int | None = None, response_id: str | None = None,
                 retry_count: int = 0, status_code: int | None = None,
                 response_error_code: str | None = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.model_call_completed = model_call_completed
        self.latency_ms = latency_ms
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.revision = revision
        self.total_tokens = total_tokens
        self.response_id = response_id
        self.retry_count = retry_count
        self.status_code = status_code
        self.response_error_code = response_error_code


@dataclass(frozen=True)
class ProviderResult:
    candidate: ExtractedDecision | None
    provider: str
    model: str
    revision: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    latency_ms: int | None = None
    total_tokens: int | None = None
    response_id: str | None = None
    retry_count: int = 0


class GroqExtractionEnvelope(BaseModel):
    candidate: ExtractedDecision | None


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
    provider_name = "open_weight"

    def __init__(self, base_url: str, model: str, api_key: str | None = None,
                 timeout_seconds: float = 180, provider_name: str | None = None) -> None:
        if not base_url:
            raise ProviderError("MODEL_BASE_URL is required for the open_weight provider", "configuration")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        if provider_name is not None:
            self.provider_name = provider_name

    def get_model_info(self) -> dict[str, object]:
        return {"provider": self.provider_name, "model": self.model, "revision": None, "base_url": self.base_url}

    def health_check(self) -> dict[str, object]:
        try:
            payload = self._request("GET", "/v1/models")
            return {"ok": True, **self.get_model_info(), "available_models": payload.get("data", [])}
        except ProviderError as exc:
            return {"ok": False, **self.get_model_info(), "error": str(exc)}

    def extract_decision(self, repository_id: UUID, records: list[DiscussionInput]) -> ProviderResult:
        prompt = self._prompt(repository_id, records) + self._extraction_prompt_suffix()
        started = time.monotonic()
        response = self._request("POST", "/v1/chat/completions", {
            "model": self.model,
            "temperature": 0,
            "max_tokens": 1400,
            "think": False,
            "response_format": self._extraction_response_format(),
            "messages": [
                {"role": "system", "content": "You extract engineering decisions. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
        })
        usage = response.get("usage", {})
        latency_ms = int((time.monotonic() - started) * 1000)
        revision = response.get("system_fingerprint")
        try:
            choice = response["choices"][0]
            message = choice["message"]
            if message.get("refusal"):
                raise ProviderError(
                    f"{self.provider_name} refused the extraction request",
                    "refusal", model_call_completed=True, latency_ms=latency_ms,
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"), total_tokens=usage.get("total_tokens"),
                    revision=revision, response_id=response.get("id"),
                    retry_count=response.get("_metis_retry_count", 0),
                )
            if choice.get("finish_reason") in {"length", "max_tokens"}:
                raise ProviderError(
                    f"{self.provider_name} extraction response was truncated",
                    "truncated_output", model_call_completed=True, latency_ms=latency_ms,
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"), total_tokens=usage.get("total_tokens"),
                    revision=revision, response_id=response.get("id"),
                    retry_count=response.get("_metis_retry_count", 0),
                )
            content = message["content"]
            if not isinstance(content, str) or not content.strip():
                raise ProviderError(
                    f"{self.provider_name} returned empty content",
                    "empty_response", model_call_completed=True, latency_ms=latency_ms,
                    prompt_tokens=usage.get("prompt_tokens"),
                    completion_tokens=usage.get("completion_tokens"), total_tokens=usage.get("total_tokens"),
                    revision=revision, response_id=response.get("id"),
                    retry_count=response.get("_metis_retry_count", 0),
                )
            payload = self._parse_json(content)
            candidate = self._parse_extraction_payload(payload)
        except ProviderError:
            raise
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError, ValidationError) as exc:
            raise ProviderError(
                f"{self.provider_name} response was not valid extraction JSON: {exc}",
                "schema_validation", model_call_completed=True, latency_ms=latency_ms,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"), total_tokens=usage.get("total_tokens"),
                revision=revision, response_id=response.get("id"),
                retry_count=response.get("_metis_retry_count", 0),
            ) from exc
        return ProviderResult(
            candidate=candidate,
            provider=self.provider_name,
            model=self.model,
            revision=revision,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            latency_ms=latency_ms,
            total_tokens=usage.get("total_tokens"),
            response_id=response.get("id"),
            retry_count=response.get("_metis_retry_count", 0),
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
        return AnswerResult(answer, citations, self.provider_name, self.model, usage.get("prompt_tokens"), usage.get("completion_tokens"), int((time.monotonic() - started) * 1000))

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
        return RelationshipResult(proposals, self.provider_name, self.model, int((time.monotonic() - started) * 1000))

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

    def _extraction_response_format(self) -> dict[str, object]:
        return {"type": "json_object"}

    def _extraction_prompt_suffix(self) -> str:
        return ""

    def _parse_extraction_payload(self, payload: dict[str, object]) -> ExtractedDecision | None:
        return ExtractedDecision.model_validate(payload)

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


_GROQ_REQUEST_SEMAPHORE = BoundedSemaphore(2)


class GroqProvider(OpenWeightLLMProvider):
    provider_name = "groq"

    def __init__(self, api_key: str | None, model: str, base_url: str,
                 timeout_seconds: float = 60, max_retries: int = 2) -> None:
        if not api_key or not api_key.strip():
            raise ProviderError("GROQ_API_KEY is required when MODEL_PROVIDER=groq", "configuration")
        if not 0 <= max_retries <= 5:
            raise ProviderError("GROQ_MAX_RETRIES must be between 0 and 5", "configuration")
        super().__init__(base_url, model, api_key, timeout_seconds, "groq")
        self.max_retries = max_retries
        self._json_object_fallback = False

    def _extraction_response_format(self) -> dict[str, object]:
        if self._json_object_fallback:
            return {"type": "json_object"}
        return {
            "type": "json_schema",
            "json_schema": {
                "name": "metis_decision",
                "strict": True,
                "schema": _strict_json_schema(GroqExtractionEnvelope.model_json_schema()),
            },
        }

    def _extraction_prompt_suffix(self) -> str:
        return (
            "\n\nThe response format for this provider is a JSON object with exactly one key, "
            "\"candidate\". Set candidate to null when no supported engineering decision exists. "
            "Otherwise set it to the complete decision object matching the fields above. This "
            "wrapper instruction supersedes the earlier direct-object response shape."
        )

    def _parse_extraction_payload(self, payload: dict[str, object]) -> ExtractedDecision | None:
        return GroqExtractionEnvelope.model_validate(payload).candidate

    def extract_decision(self, repository_id: UUID, records: list[DiscussionInput]) -> ProviderResult:
        try:
            return super().extract_decision(repository_id, records)
        except ProviderError as exc:
            if exc.response_error_code != "unsupported_structured_output":
                raise
            self._json_object_fallback = True
            try:
                return super().extract_decision(repository_id, records)
            finally:
                self._json_object_fallback = False

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        if not _GROQ_REQUEST_SEMAPHORE.acquire(timeout=self.timeout_seconds):
            raise ProviderError("Groq request concurrency limit timed out", "concurrency_limit")
        started = time.monotonic()
        retry_count = 0
        try:
            for attempt in range(self.max_retries + 1):
                endpoint_path = path
                if self.base_url.endswith("/openai/v1") and path.startswith("/v1/"):
                    endpoint_path = path.removeprefix("/v1")
                headers = {
                    "Accept": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                    "User-Agent": "METIS/0.1.0",
                }
                request_body = None
                if body is not None:
                    request_body = dict(body)
                    request_body.pop("think", None)
                try:
                    response = httpx.request(
                        method,
                        self.base_url + endpoint_path,
                        headers=headers,
                        json=request_body,
                        timeout=self.timeout_seconds,
                    )
                    if response.status_code >= 400:
                        retryable = response.status_code == 429 or 500 <= response.status_code <= 599
                        response_error_code = _groq_response_error_code(response)
                        if retryable and attempt < self.max_retries:
                            retry_count += 1
                            time.sleep(_retry_delay(attempt, response.headers.get("Retry-After")))
                            continue
                        status_code = response.status_code
                        stage = "rate_limit" if status_code == 429 else "server_error" if status_code >= 500 else "request"
                        raise ProviderError(
                            f"Groq request failed with HTTP {status_code}",
                            stage,
                            latency_ms=int((time.monotonic() - started) * 1000),
                            retry_count=retry_count,
                            status_code=status_code,
                            response_error_code=response_error_code,
                        )
                    payload = response.json()
                    if not isinstance(payload, dict):
                        raise ProviderError("Groq returned a non-object response", "invalid_response")
                    payload["_metis_retry_count"] = retry_count
                    return payload
                except (httpx.TransportError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                    timeout = isinstance(exc, (TimeoutError, httpx.TimeoutException)) or isinstance(
                        getattr(exc, "reason", None), TimeoutError
                    )
                    if attempt < self.max_retries:
                        retry_count += 1
                        time.sleep(_retry_delay(attempt, None))
                        continue
                    stage = "timeout" if timeout else "invalid_response" if isinstance(exc, json.JSONDecodeError) else "network"
                    raise ProviderError(
                        f"Groq request failed ({stage})",
                        stage,
                        latency_ms=int((time.monotonic() - started) * 1000),
                        retry_count=retry_count,
                    ) from exc
            raise ProviderError(
                "Groq request exhausted its bounded retry budget",
                "retries_exhausted",
                retry_count=retry_count,
            )
        finally:
            _GROQ_REQUEST_SEMAPHORE.release()


def _strict_json_schema(schema: dict[str, object]) -> dict[str, object]:
    definitions = schema.get("$defs", {})

    def normalize(value: object) -> object:
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if not isinstance(value, dict):
            return value
        reference = value.get("$ref")
        if isinstance(reference, str) and reference.startswith("#/$defs/") and isinstance(definitions, dict):
            definition = definitions.get(reference.removeprefix("#/$defs/"))
            if isinstance(definition, dict):
                return normalize(definition)
        normalized: dict[str, object] = {}
        for key, item in value.items():
            if key == "properties" and isinstance(item, dict):
                normalized[key] = {
                    property_name: normalize(property_schema)
                    for property_name, property_schema in item.items()
                }
            elif key not in {
                "$defs", "$schema", "$ref", "default", "title", "format",
                "minLength", "maxLength", "minimum", "maximum",
            }:
                normalized[key] = normalize(item)
        if normalized.get("type") == "object":
            properties = normalized.get("properties", {})
            if isinstance(properties, dict):
                normalized["required"] = list(properties)
            normalized["additionalProperties"] = False
        return normalized

    result = normalize(schema)
    if not isinstance(result, dict):
        raise ProviderError("Pydantic produced a non-object JSON schema", "configuration")
    return result


def _retry_delay(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        delay: float | None = None
        try:
            delay = float(retry_after)
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(retry_after)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                delay = (retry_at - datetime.now(timezone.utc)).total_seconds()
            except (TypeError, ValueError, OverflowError):
                pass
        if delay is not None:
            return min(max(delay, 0.0) + random.uniform(0.0, 0.25), 30.0)
    return min(2.0 ** attempt, 8.0) + random.uniform(0.0, 0.25)


def _groq_response_error_code(response: httpx.Response) -> str | None:
    try:
        payload = response.json()
        if not isinstance(payload, dict):
            return None
        detail = payload.get("error", {})
        if not isinstance(detail, dict):
            detail = {}
        code = detail.get("code") or detail.get("type")
        message = str(detail.get("message", "")).lower()
        code = code or payload.get("error_code")
        if response.status_code == 400 and any(token in message for token in ("json_schema", "response_format", "structured output", "schema is not supported")):
            return "unsupported_structured_output"
        return str(code) if code is not None else None
    except (AttributeError, UnicodeDecodeError, ValueError, TypeError):
        return None


def build_provider(provider: str, model: str, base_url: str, api_key: str | None,
                   timeout_seconds: float = 180, *, groq_max_retries: int = 2) -> ExtractionProvider:
    if provider == "deterministic":
        return DeterministicProvider()
    if provider in {"open_weight", "ollama"}:
        return OpenWeightLLMProvider(
            base_url, model, api_key, timeout_seconds,
            "ollama" if provider == "ollama" else "open_weight",
        )
    if provider == "groq":
        return GroqProvider(api_key, model, base_url, timeout_seconds, groq_max_retries)
    raise ProviderError(f"Unsupported MODEL_PROVIDER: {provider}", "configuration")