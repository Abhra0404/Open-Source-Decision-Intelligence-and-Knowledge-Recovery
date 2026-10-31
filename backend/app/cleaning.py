import html
import re
from dataclasses import dataclass


_PREVIEW_MARKERS = (
    "docs preview",
    "__codspeed_performance_report_comment__",
    "open in codspeed",
)
_TAG_RE = re.compile(r"<([a-z][^>]*)>", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"[ \t]+\n")


@dataclass(frozen=True)
class CleanedDiscussion:
    body: str
    is_usable: bool
    filter_reason: str | None = None


def clean_discussion(body: str | None, author_login: str | None = None) -> CleanedDiscussion:
    original = html.unescape(body or "").replace("\r\n", "\n").replace("\r", "\n")
    normalized = _TAG_RE.sub("", original)
    normalized = re.sub(r"\n{3,}", "\n\n", _WHITESPACE_RE.sub("\n", normalized)).strip()
    lowered = normalized.lower()
    is_bot = bool(author_login and author_login.endswith("[bot]"))
    if not normalized:
        return CleanedDiscussion("", False, "empty_body")
    if is_bot and any(marker in lowered for marker in _PREVIEW_MARKERS):
        return CleanedDiscussion(normalized, False, "machine_generated_preview")
    if len(re.sub(r"[\W_]+", "", normalized)) < 20:
        return CleanedDiscussion(normalized, False, "near_empty_body")
    return CleanedDiscussion(normalized, True)
