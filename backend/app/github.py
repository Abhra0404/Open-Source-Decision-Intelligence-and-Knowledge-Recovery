from typing import Any

import httpx

from .config import settings


class GitHubError(RuntimeError):
    pass


class GitHubClient:
    def __init__(self) -> None:
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        self.client = httpx.Client(base_url=settings.github_api_url, headers=headers, timeout=30)

    def close(self) -> None:
        self.client.close()

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        response = self.client.get(path, params=params)
        if response.status_code >= 400:
            detail = response.json().get("message", response.text)[:300]
            raise GitHubError(f"GitHub API returned {response.status_code}: {detail}")
        return response.json()

    def repository(self, owner: str, name: str) -> dict[str, Any]:
        return self.get(f"/repos/{owner}/{name}")

    def issues(self, owner: str, name: str, max_items: int) -> list[dict[str, Any]]:
        return self.get(f"/repos/{owner}/{name}/issues", {"state": "all", "per_page": min(max_items, 100)})

    def comments(self, owner: str, name: str, number: int, is_pull_request: bool) -> list[dict[str, Any]]:
        endpoint = "issues" if not is_pull_request else "issues"
        return self.get(f"/repos/{owner}/{name}/{endpoint}/{number}/comments", {"per_page": 100})

    def reviews(self, owner: str, name: str, number: int) -> list[dict[str, Any]]:
        return self.get(f"/repos/{owner}/{name}/pulls/{number}/reviews", {"per_page": 100})
