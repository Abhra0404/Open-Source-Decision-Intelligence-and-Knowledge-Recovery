import json
import unittest
from uuid import UUID

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.qa_logging import bind_request_id, log_qa_event, reset_request_id


class QALoggingTests(unittest.TestCase):
    def test_structured_qa_events_include_request_id(self) -> None:
        request_id = "d1f6b55e-5306-4e51-8337-7de7e4c4a0d4"
        token = bind_request_id(request_id)
        try:
            with self.assertLogs("backend.app.qa", level="INFO") as captured:
                log_qa_event("qa.test_event", result_count=2)
        finally:
            reset_request_id(token)

        payload = json.loads(captured.records[0].getMessage())
        self.assertEqual(payload["event"], "qa.test_event")
        self.assertEqual(payload["request_id"], request_id)
        self.assertEqual(payload["result_count"], 2)

    def test_request_id_is_returned_and_127_loopback_origin_is_allowed(self) -> None:
        request_id = "7ab16e74-2a06-4a63-a47d-e2f039ece1c6"
        client = TestClient(app)
        preflight = client.options(
            "/api/v1/repositories",
            headers={
                "Origin": "http://127.0.0.1:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        response = client.get(
            "/openapi.json",
            headers={"Origin": "http://127.0.0.1:3000", "X-Request-ID": request_id},
        )

        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers["access-control-allow-origin"], "http://127.0.0.1:3000")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://127.0.0.1:3000")
        self.assertIn("x-request-id", response.headers.get("access-control-expose-headers", "").lower())
        self.assertEqual(str(UUID(response.headers["x-request-id"])), request_id)


if __name__ == "__main__":
    unittest.main()
