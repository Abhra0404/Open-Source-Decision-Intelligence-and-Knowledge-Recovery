from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class DecisionStatus(str, Enum):
    accepted = "accepted"
    rejected = "rejected"
    proposed = "proposed"
    unresolved = "unresolved"


class RepositoryCreate(BaseModel):
    repository_url: HttpUrl


class RepositoryResponse(BaseModel):
    id: UUID
    full_name: str
    html_url: str
    status: str


class IngestionCreate(BaseModel):
    include_issues: bool = True
    include_pull_requests: bool = True
    include_reviews: bool = True
    include_discussions: bool = False
    max_items: int = Field(default=30, ge=1, le=100)


class IngestionResponse(BaseModel):
    ingestion_id: UUID
    repository_id: UUID
    status: str


class SearchRequest(BaseModel):
    repository_id: UUID | None = None
    query: str = Field(min_length=1, max_length=500)
    statuses: list[DecisionStatus] | None = None
    limit: int = Field(default=5, ge=1, le=100)


class ExtractionRequest(BaseModel):
    ingestion_id: UUID | None = None
    force_reprocess: bool = False


class ExtractionResponse(BaseModel):
    extraction_id: UUID
    repository_id: UUID
    status: str


class ReviewAction(str, Enum):
    approve = "approve"
    reject = "reject"
    request_review = "request_review"
    mark_unresolved = "mark_unresolved"


class ReviewRequest(BaseModel):
    action: ReviewAction
    note: str | None = Field(default=None, max_length=2000)


class Evidence(BaseModel):
    discussion_id: UUID
    source_type: str
    author_login: str | None
    evidence_role: str
    excerpt: str | None
    source_url: str
    source_created_at: datetime | None
