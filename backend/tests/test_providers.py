import json
import unittest
from uuid import uuid4
from unittest.mock import patch

import httpx
from backend.app.extraction import DiscussionInput
from backend.app.providers import (
    DeterministicProvider,
    GroqProvider,
    OpenWeightLLMProvider,
    ProviderError,
    build_provider,
)


class StubOpenWeightProvider(OpenWeightLLMProvider):
    def __init__(self, response: dict[str, object]) -> None:
        super().__init__("http://model.test", "Qwen3-14B")
        self.response = response

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        return self.response


class UnavailableProvider(OpenWeightLLMProvider):
    def __init__(self) -> None:
        super().__init__("http://model.test", "Qwen3-14B")

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        raise ProviderError("connection refused", "model_server")


def groq_response(repository_id, source, candidate=True):
    decision = {
        "title": "Use pooling",
        "summary": "The team agreed to use pooling.",
        "status": "accepted",
        "rationale": [],
        "alternatives": [],
        "tradeoffs": [],
        "confidence": 0.8,
        "repository_id": str(repository_id),
        "source_discussion_id": str(source.id),
        "evidence": [{
            "source_id": str(source.id),
            "source_type": source.source_type,
            "source_url": source.source_url,
            "quote": source.body,
            "evidence_role": "acceptance",
        }],
    }
    return {
        "id": "resp_groq_test",
        "system_fingerprint": "groq-fingerprint",
        "choices": [{
            "finish_reason": "stop",
            "message": {"content": __import__("json").dumps({"candidate": decision if candidate else None})},
        }],
        "usage": {"prompt_tokens": 15, "completion_tokens": 13, "total_tokens": 28},
    }


class StubGroqProvider(GroqProvider):
    def __init__(self, response: dict[str, object]) -> None:
        super().__init__("test-key", "qwen/qwen3.8-27b", "https://api.groq.test/openai/v1")
        self.response = response
        self.request_bodies = []

    def _request(self, method, path, body=None):
        self.request_bodies.append(body)
        return self.response


class ProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository_id = uuid4()
        self.source = DiscussionInput(
            id=uuid4(), source_type="issue", title="Pool", body="We agreed to use pooling.",
            author_login="developer", source_url="https://github.com/x/y/issues/1", source_created_at=None,
        )

    def test_deterministic_provider_remains_available(self) -> None:
        result = DeterministicProvider().extract_decision(self.repository_id, [self.source])
        self.assertEqual(result.provider, "deterministic")
        self.assertEqual(result.model, "rule-based-mvp")
        self.assertIsNotNone(result.candidate)

    def test_open_weight_provider_parses_structured_json(self) -> None:
        response = {
            "choices": [{"message": {"content": "{\"title\":\"Use pooling\",\"summary\":\"The team agreed to use pooling.\",\"status\":\"accepted\",\"rationale\":[],\"alternatives\":[],\"tradeoffs\":[],\"confidence\":0.8,\"repository_id\":\"%s\",\"source_discussion_id\":\"%s\",\"evidence\":[{\"source_id\":\"%s\",\"source_type\":\"issue\",\"source_url\":\"%s\",\"quote\":\"We agreed to use pooling.\",\"evidence_role\":\"acceptance\"}]}" % (self.repository_id, self.source.id, self.source.id, self.source.source_url)}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8},
        }
        result = StubOpenWeightProvider(response).extract_decision(self.repository_id, [self.source])
        self.assertEqual(result.provider, "open_weight")
        self.assertEqual(result.prompt_tokens, 12)
        self.assertEqual(result.candidate.status, "accepted")

    def test_invalid_open_weight_json_is_rejected(self) -> None:
        response = {"choices": [{"message": {"content": "not json"}}]}
        with self.assertRaises(ProviderError) as error:
            StubOpenWeightProvider(response).extract_decision(self.repository_id, [self.source])
        self.assertEqual(error.exception.stage, "schema_validation")
        self.assertTrue(error.exception.model_call_completed)

    def test_model_server_unavailability_is_reported_by_health_check(self) -> None:
        health = UnavailableProvider().health_check()
        self.assertFalse(health["ok"])
        self.assertEqual(health["error"], "connection refused")

    def test_groq_structured_inference_and_usage(self) -> None:
        provider = StubGroqProvider(groq_response(self.repository_id, self.source))
        result = provider.extract_decision(self.repository_id, [self.source])

        self.assertEqual(result.provider, "groq")
        self.assertEqual(result.model, "qwen/qwen3.8-27b")
        self.assertEqual(result.response_id, "resp_groq_test")
        self.assertEqual(result.prompt_tokens, 15)
        self.assertEqual(result.completion_tokens, 13)
        self.assertEqual(result.total_tokens, 28)
        self.assertEqual(result.candidate.evidence[0].source_id, self.source.id)
        response_format = provider.request_bodies[0]["response_format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertTrue(response_format["json_schema"]["strict"])
        self.assertNotIn("$ref", str(response_format["json_schema"]["schema"]))
        candidate_schema = response_format["json_schema"]["schema"]["properties"]["candidate"]["anyOf"][0]
        self.assertIn("title", candidate_schema["required"])
        self.assertIn("title", candidate_schema["properties"])

    def test_groq_can_return_no_candidate(self) -> None:
        result = StubGroqProvider(
            groq_response(self.repository_id, self.source, candidate=False)
        ).extract_decision(self.repository_id, [self.source])
        self.assertIsNone(result.candidate)

    def test_groq_rejects_empty_response(self) -> None:
        response = {
            "choices": [{"finish_reason": "stop", "message": {"content": ""}}],
            "usage": {},
        }
        with self.assertRaises(ProviderError) as error:
            StubGroqProvider(response).extract_decision(self.repository_id, [self.source])
        self.assertEqual(error.exception.stage, "empty_response")

    def test_groq_reports_refusal_and_truncated_output(self) -> None:
        for choice, expected_stage in (
            ({"finish_reason": "stop", "message": {"refusal": "refused"}}, "refusal"),
            ({"finish_reason": "length", "message": {"content": "{}"}}, "truncated_output"),
        ):
            with self.subTest(stage=expected_stage):
                with self.assertRaises(ProviderError) as error:
                    StubGroqProvider({"choices": [choice], "usage": {}}).extract_decision(
                        self.repository_id, [self.source],
                    )
                self.assertEqual(error.exception.stage, expected_stage)

    def test_groq_falls_back_to_json_object_only_for_unsupported_schema(self) -> None:
        test = self

        class UnsupportedStrictSchema(StubGroqProvider):
            def _request(self, method, path, body=None):
                self.request_bodies.append(body)
                if len(self.request_bodies) == 1:
                    raise ProviderError(
                        "Groq request failed with HTTP 400", "request",
                        status_code=400, response_error_code="unsupported_structured_output",
                    )
                return groq_response(test.repository_id, test.source)

        provider = UnsupportedStrictSchema({})
        result = provider.extract_decision(self.repository_id, [self.source])
        self.assertIsNotNone(result.candidate)
        self.assertEqual(
            provider.request_bodies[1]["response_format"],
            {"type": "json_object"},
        )

    def test_groq_requires_api_key(self) -> None:
        with self.assertRaises(ProviderError) as error:
            GroqProvider(None, "qwen/qwen3.8-27b", "https://api.groq.com/openai/v1")
        self.assertEqual(error.exception.stage, "configuration")

    def test_groq_retries_rate_limit_honoring_retry_after(self) -> None:
        provider = GroqProvider(
            "test-key", "qwen/qwen3.8-27b",
            "https://api.groq.test/openai/v1", max_retries=1,
        )
        request = httpx.Request("GET", "https://api.groq.test/openai/v1/models")
        rate_limit = httpx.Response(
            429,
            json={"error": {"message": "Rate limit", "type": "rate_limit_exceeded"}},
            headers={"Retry-After": "1"},
            request=request,
        )
        success = httpx.Response(200, json={"data": []}, request=request)
        with patch("backend.app.providers.httpx.request", side_effect=[rate_limit, success]) as request_mock:
            with patch("backend.app.providers.time.sleep") as sleep_mock:
                response = provider._request("GET", "/v1/models")
        self.assertEqual(request_mock.call_count, 2)
        self.assertEqual(response["_metis_retry_count"], 1)
        self.assertGreaterEqual(sleep_mock.call_args.args[0], 1)

    def test_groq_retries_server_errors_with_bounded_backoff(self) -> None:
        provider = GroqProvider(
            "test-key", "qwen/qwen3.8-27b",
            "https://api.groq.test/openai/v1", max_retries=1,
        )
        request = httpx.Request("GET", "https://api.groq.test/openai/v1/models")
        server_error = httpx.Response(503, json={"error": {"type": "server_error"}}, request=request)
        success = httpx.Response(200, json={"data": []}, request=request)
        with patch("backend.app.providers.httpx.request", side_effect=[server_error, success]) as request_mock:
            with patch("backend.app.providers.time.sleep") as sleep_mock:
                payload = provider._request("GET", "/v1/models")
        self.assertEqual(request_mock.call_count, 2)
        self.assertEqual(payload["_metis_retry_count"], 1)
        self.assertLessEqual(sleep_mock.call_args.args[0], 2.25)

    def test_groq_timeout_is_reported_without_api_key_leakage(self) -> None:
        provider = GroqProvider(
            "secret-test-key", "qwen/qwen3.8-27b",
            "https://api.groq.test/openai/v1", max_retries=0,
        )
        with patch("backend.app.providers.httpx.request", side_effect=httpx.TimeoutException("timed out")):
            with self.assertRaises(ProviderError) as error:
                provider._request("GET", "/v1/models")
        self.assertEqual(error.exception.stage, "timeout")
        self.assertNotIn("secret-test-key", str(error.exception))

    def test_groq_request_omits_ollama_only_options(self) -> None:
        provider = GroqProvider(
            "test-key", "qwen/qwen3.8-27b",
            "https://api.groq.test/openai/v1", max_retries=0,
        )
        success = httpx.Response(
            200,
            json={"data": []},
            request=httpx.Request("POST", "https://api.groq.test/openai/v1/chat/completions"),
        )
        with patch("backend.app.providers.httpx.request", return_value=success) as request_mock:
            provider._request("POST", "/v1/chat/completions", {"think": False, "model": "qwen"})
        self.assertNotIn("think", request_mock.call_args.kwargs["json"])

    def test_groq_handles_rate_limit_without_response_headers(self) -> None:
        provider = GroqProvider(
            "test-key", "qwen/qwen3.8-27b",
            "https://api.groq.test/openai/v1", max_retries=0,
        )
        rate_limit = httpx.Response(
            429,
            json={"error": {"type": "rate_limit_exceeded"}},
            request=httpx.Request("GET", "https://api.groq.test/openai/v1/models"),
        )
        with patch("backend.app.providers.httpx.request", return_value=rate_limit):
            with self.assertRaises(ProviderError) as error:
                provider._request("GET", "/v1/models")
        self.assertEqual(error.exception.stage, "rate_limit")

    def test_provider_selection_keeps_ollama_and_deterministic(self) -> None:
        ollama = build_provider("ollama", "qwen3:8b", "http://localhost:11434", None)
        deterministic = build_provider("deterministic", "unused", "", None)
        groq = build_provider(
            "groq", "qwen/qwen3.8-27b",
            "https://api.groq.com/openai/v1", "test-key",
        )
        self.assertEqual(ollama.get_model_info()["provider"], "ollama")
        self.assertEqual(deterministic.get_model_info()["model"], "rule-based-mvp")
        self.assertEqual(groq.get_model_info()["provider"], "groq")


if __name__ == "__main__":
    unittest.main()