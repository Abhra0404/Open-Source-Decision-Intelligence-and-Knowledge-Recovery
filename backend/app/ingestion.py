from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from .github import GitHubClient


def parse_repository_url(repository_url: str) -> tuple[str, str]:
    value = repository_url.rstrip("/").removesuffix(".git")
    parts = value.split("/")
    if len(parts) < 2 or parts[-3] != "github.com":
        raise ValueError("repository_url must be a GitHub repository URL")
    owner, name = parts[-2], parts[-1]
    if not owner or not name or any(char in owner + name for char in "?#"):
        raise ValueError("repository_url must identify a GitHub repository")
    return owner, name


def parse_timestamp(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def normalize_discussion(
    repository_id: UUID,
    source_type: str,
    payload: dict[str, Any],
    parent_number: int | None = None,
) -> dict[str, Any]:
    html_url = payload.get("html_url", "")
    return {
        "repository_id": repository_id,
        "source_type": source_type,
        "github_node_id": payload.get("node_id"),
        "github_database_id": str(payload["id"]) if payload.get("id") is not None else None,
        "parent_number": parent_number,
        "parent_github_node_id": None,
        "title": payload.get("title"),
        "body": payload.get("body") or "",
        "author_login": (payload.get("user") or payload.get("author") or {}).get("login"),
        "source_url": html_url,
        "source_created_at": parse_timestamp(payload.get("created_at")),
        "source_updated_at": parse_timestamp(payload.get("updated_at")),
        "raw_payload": Jsonb(payload),
    }


def ingest_repository(
    conn: psycopg.Connection,
    repository_id: UUID,
    owner: str,
    name: str,
    max_items: int,
    include_reviews: bool,
) -> tuple[int, int, int]:
    client = GitHubClient()
    fetched = created = updated = 0
    try:
        for issue in client.issues(owner, name, max_items):
            is_pr = "pull_request" in issue
            source_type = "pull_request" if is_pr else "issue"
            records = [normalize_discussion(repository_id, source_type, issue, issue["number"])]
            comments = client.comments(owner, name, issue["number"], is_pr)
            records.extend(normalize_discussion(repository_id, "issue_comment", comment, issue["number"]) for comment in comments)
            if is_pr and include_reviews:
                reviews = client.reviews(owner, name, issue["number"])
                records.extend(normalize_discussion(repository_id, "review", review, issue["number"]) for review in reviews)
            for record in records:
                fetched += 1
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO discussions (
                          repository_id, source_type, github_node_id, github_database_id,
                          parent_number, parent_github_node_id, title, body, author_login,
                          source_url, source_created_at, source_updated_at, raw_payload
                        ) VALUES (
                          %(repository_id)s, %(source_type)s, %(github_node_id)s, %(github_database_id)s,
                          %(parent_number)s, %(parent_github_node_id)s, %(title)s, %(body)s, %(author_login)s,
                          %(source_url)s, %(source_created_at)s, %(source_updated_at)s, %(raw_payload)s
                        )
                        ON CONFLICT (repository_id, source_type, github_node_id)
                        DO UPDATE SET body = EXCLUDED.body, source_updated_at = EXCLUDED.source_updated_at,
                          raw_payload = EXCLUDED.raw_payload, updated_at = NOW()
                        RETURNING (xmax = 0) AS inserted
                        """,
                        record,
                    )
                    if cur.fetchone()["inserted"]:
                        created += 1
                    else:
                        updated += 1
        conn.commit()
        return fetched, created, updated
    finally:
        client.close()
