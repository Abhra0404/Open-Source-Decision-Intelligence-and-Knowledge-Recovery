"use client";

import React, { useState } from "react";
import {
  MessagesSquare,
  Search,
  ExternalLink,
  GitPullRequest,
  AlertCircle,
  MessageCircle,
} from "lucide-react";
import { Discussion } from "../types";

interface DiscussionsViewProps {
  discussions: Discussion[];
  onRefresh: () => void;
}

export function DiscussionsView({ discussions, onRefresh }: DiscussionsViewProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = discussions.filter((d) => {
    const text = `${d.title || ""} ${d.body || ""}`.toLowerCase();
    const matchSearch = !search || text.includes(search.toLowerCase());
    const matchType = typeFilter === "all" || d.source_type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div>
      {/* ── Filter Toolbar ──────────────────────────────────── */}
      <div
        className="panel"
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "240px" }}>
          <Search
            size={15}
            color="var(--text-dim)"
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: "32px" }}
            placeholder="Search discussion threads and comments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="repo-selector"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Discussion Types</option>
          <option value="issue">Issues</option>
          <option value="pull_request">Pull Requests</option>
          <option value="review">Reviews</option>
          <option value="issue_comment">Issue Comments</option>
          <option value="review_comment">Review Comments</option>
          <option value="discussion">Discussions</option>
        </select>

        <button className="btn btn-ghost btn-sm" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {/* ── Discussions List ────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <MessagesSquare size={16} color="var(--accent)" />
            Source Discussions ({filtered.length})
          </div>
        </div>

        <div className="panel-body no-padding">
          {filtered.length === 0 ? (
            <div className="state-empty">
              <MessagesSquare className="state-empty-icon" />
              <div className="state-empty-title">No discussions ingested</div>
              <div className="state-empty-desc">
                Connect a GitHub repository to fetch issues, PRs, and discussion threads.
              </div>
            </div>
          ) : (
            filtered.map((d) => (
              <div key={d.id} className="data-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span className="badge badge-neutral">{d.source_type}</span>
                    {d.author_login && (
                      <span style={{ fontSize: "12px", color: "var(--accent)" }}>
                        @{d.author_login}
                      </span>
                    )}
                    {d.source_created_at && (
                      <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                        {new Date(d.source_created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text)", marginBottom: "4px" }}>
                    {d.title || `${d.source_type} record`}
                  </div>

                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      maxHeight: "80px",
                      overflow: "hidden",
                    }}
                  >
                    {d.body ? d.body.slice(0, 300) : "No body text available."}
                  </p>
                </div>

                <a
                  href={d.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: "flex-start", flexShrink: 0 }}
                >
                  GitHub ↗
                </a>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
