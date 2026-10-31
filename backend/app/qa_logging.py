import json
import logging
from contextvars import ContextVar, Token


_request_id: ContextVar[str] = ContextVar("metis_request_id", default="non-http")
_logger = logging.getLogger("backend.app.qa")
_logger.setLevel(logging.INFO)


def bind_request_id(request_id: str) -> Token[str]:
    return _request_id.set(request_id)


def reset_request_id(token: Token[str]) -> None:
    _request_id.reset(token)


def current_request_id() -> str:
    return _request_id.get()


def log_qa_event(event: str, **fields: object) -> None:
    payload = {"event": event, "request_id": current_request_id(), **fields}
    _logger.info("%s", json.dumps(payload, sort_keys=True, default=str))
