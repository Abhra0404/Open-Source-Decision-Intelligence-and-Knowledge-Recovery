import unittest
from uuid import uuid4

from backend.app.chat import validate_citations


class FakeCursor:
    def __init__(self, valid_ids: set[str]) -> None:
        self.valid_ids = valid_ids
        self.current_id = None

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.current_id = str(params[0])

    def fetchone(self) -> dict[str, str] | None:
        return {"id": self.current_id} if self.current_id in self.valid_ids else None


class FakeConnection:
    def __init__(self, valid_ids: set[str]) -> None:
        self.valid_ids = valid_ids

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.valid_ids)


class ChatTests(unittest.TestCase):
    def test_citations_must_be_retrieved_and_repository_owned(self) -> None:
        evidence_id = uuid4()
        repository_id = uuid4()
        retrieved = [{"evidence_id": evidence_id, "source_url": "https://github.com/x/y/issues/1"}]

        valid = validate_citations(FakeConnection({str(evidence_id)}), repository_id, retrieved, [str(evidence_id)])
        invalid = validate_citations(FakeConnection(set()), repository_id, retrieved, [str(evidence_id)])

        self.assertEqual(len(valid), 1)
        self.assertEqual(invalid, [])

    def test_unknown_citation_is_rejected_before_database_lookup(self) -> None:
        evidence_id = uuid4()
        result = validate_citations(FakeConnection(set()), uuid4(), [], [str(evidence_id)])
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()