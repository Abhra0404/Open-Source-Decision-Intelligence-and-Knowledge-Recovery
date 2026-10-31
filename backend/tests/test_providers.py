import unittest
from uuid import uuid4

from backend.app.extraction import DiscussionInput
from backend.app.providers import DeterministicProvider, OpenWeightLLMProvider, ProviderError


class StubOpenWeightProvider(OpenWeightLLMProvider):
    def __init__(self, response: dict[str, object]) -> None:
        super().__init__("http://model.test", "Qwen3-14B")
        self.response = response

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
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


if __name__ == "__main__":
    unittest.main()