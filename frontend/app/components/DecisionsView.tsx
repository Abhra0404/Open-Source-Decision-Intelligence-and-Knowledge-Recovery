"use client";

import React, { useState, useEffect } from "react";
import {
  FileCheck2,
  Search,
  Filter,
  ExternalLink,
  ShieldCheck,
  Check,
  X,
  AlertCircle,
  Clock,
  History,
  FileCode2,
  FolderGit2,
  LayoutGrid,
  List,
  GitBranch,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Decision, DecisionDetail, Repository } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface DecisionsViewProps {
  decisions: Decision[];
  repositories?: Repository[];
  selectedDecisionId: string | null;
  onSelectDecision: (id: string | null) => void;
  onRefresh: () => void;
}

export function DecisionsView({
  decisions,
  repositories = [],
  selectedDecisionId,
  onSelectDecision,
  onRefresh,
}: DecisionsViewProps) {
  const [search, setSearch] = useState("");
  const [repoFilter, setRepoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [minConfidence, setMinConfidence] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  // Fetch full details when selectedDecisionId changes
  useEffect(() => {
    if (!selectedDecisionId) {
      setDetail(null);
      return;
    }
    let isMounted = true;
    setLoadingDetail(true);
    fetch(`${API}/decisions/${selectedDecisionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load decision");
        return res.json();
      })
      .then((data) => {
        if (isMounted) setDetail(data);
      })
      .catch((err) => {
        if (isMounted) setActionMessage(err.message);
      })
      .finally(() => {
        if (isMounted) setLoadingDetail(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDecisionId]);

  // Review action with confirmation dialog
  async function handleReview(action: "approve" | "reject" | "request_review" | "mark_unresolved") {
    if (!detail) return;
    const confirmPrompt =
      action === "approve"
        ? "Approve this decision as an active engineering decision?"
        : action === "reject"
        ? "Reject this decision candidate?"
        : action === "mark_unresolved"
        ? "Mark this decision as unresolved debate?"
        : "Request maintainer review on this decision?";

    if (!window.confirm(confirmPrompt)) return;

    const note = window.prompt(`Optional reviewer note for ${action}:`) ?? undefined;
    try {
      const res = await fetch(`${API}/decisions/${detail.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.error?.message ?? "Review failed");
      setActionMessage(`Review recorded: ${action}`);
      // Refresh details and parent list
      const refreshed = await fetch(`${API}/decisions/${detail.id}`).then((r) => r.json());
      setDetail(refreshed);
      onRefresh();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Review action failed");
    }
  }

  // Multi-criteria filtering
  const filtered = decisions.filter((d) => {
    const text = `${d.title} ${d.summary}`.toLowerCase();
    const matchSearch = !search || text.includes(search.toLowerCase());
    const matchRepo = repoFilter === "all" || d.repository_id === repoFilter;
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchReview = reviewFilter === "all" || d.review_status === reviewFilter;
    const matchConfidence =
      !minConfidence || (d.confidence !== null && d.confidence >= Number(minConfidence));
    return matchSearch && matchRepo && matchStatus && matchReview && matchConfidence;
  });

  // Split evidence into supporting vs rejecting
  const supportingEvidence =
    detail?.evidence?.filter(
      (e) => !e.evidence_role.toLowerCase().includes("reject") && !e.evidence_role.toLowerCase().includes("alternative")
    ) ?? [];
  const rejectingEvidence =
    detail?.evidence?.filter(
      (e) => e.evidence_role.toLowerCase().includes("reject") || e.evidence_role.toLowerCase().includes("alternative")
    ) ?? [];

  return (
    <div>
      {/* ── Filter Toolbar ──────────────────────────────────── */}
      <div
        className="panel"
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: "10px", flex: 1, minWidth: "260px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
            <Search
              size={15}
              color="var(--text-dim)"
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              className="input"
              style={{ paddingLeft: "32px" }}
              placeholder="Search decisions by title, summary, or keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Repository Filter */}
          {repositories.length > 0 && (
            <select
              className="repo-selector"
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              aria-label="Filter by repository"
            >
              <option value="all">All Repositories</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          )}

          <select
            className="repo-selector"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by decision status"
          >
            <option value="all">All Classifications</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="proposed">Proposed</option>
            <option value="unresolved">Unresolved</option>
          </select>

          <select
            className="repo-selector"
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
            aria-label="Filter by review status"
          >
            <option value="all">All Review States</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="needs_review">Needs Review</option>
            <option value="valid">Legacy Valid</option>
          </select>

          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            placeholder="Min confidence"
            className="input"
            style={{ width: "130px" }}
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value)}
          />
        </div>

        {/* View mode toggle */}
        <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "3px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
          <button
            className={`btn btn-sm ${viewMode === "table" ? "btn-secondary" : "btn-ghost"}`}
            style={{ padding: "4px 8px" }}
            onClick={() => setViewMode("table")}
            title="Table View"
          >
            <List size={14} />
          </button>
          <button
            className={`btn btn-sm ${viewMode === "cards" ? "btn-secondary" : "btn-ghost"}`}
            style={{ padding: "4px 8px" }}
            onClick={() => setViewMode("cards")}
            title="Card Grid View"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            marginBottom: "16px",
            fontSize: "13px",
            color: "var(--accent)",
            padding: "8px 14px",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* ── Main Decisions Content (Table or Cards) ─────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <FileCheck2 size={16} color="var(--accent)" />
            Decisions ({filtered.length})
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh}>
            Refresh
          </button>
        </div>

        <div className="panel-body no-padding">
          {filtered.length === 0 ? (
            <div className="state-empty">
              <FileCheck2 className="state-empty-icon" />
              <div className="state-empty-title">No matching decisions found</div>
              <div className="state-empty-desc">
                {decisions.length === 0
                  ? "Extract decisions from ingested discussions to see them here."
                  : "Try clearing your search query or relaxing your filter selections."}
              </div>
            </div>
          ) : viewMode === "table" ? (
            /* Table View */
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Decision Title</th>
                    <th>Classification</th>
                    <th>Review State</th>
                    <th>Confidence</th>
                    <th>Evidence Sources</th>
                    <th>Extracted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.id}
                      style={{
                        background: selectedDecisionId === d.id ? "var(--card-hover)" : "transparent",
                      }}
                    >
                      <td style={{ maxWidth: "380px" }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--text)",
                            cursor: "pointer",
                          }}
                          onClick={() => onSelectDecision(d.id)}
                        >
                          {d.title}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-dim)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginTop: "3px",
                          }}
                        >
                          {d.summary}
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${d.status}`}>{d.status}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${d.review_status}`}>
                          {d.review_status}
                        </span>
                      </td>
                      <td>
                        {d.confidence !== null ? (
                          <span style={{ fontFamily: "var(--font-mono)" }}>
                            {Math.round(d.confidence * 100)}%
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <span style={{ color: "var(--text-muted)" }}>
                          {d.evidence_count} source{d.evidence_count !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                          {d.extracted_at
                            ? new Date(d.extracted_at).toLocaleDateString()
                            : "—"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectDecision(d.id)}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Card Grid View */
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "16px",
                padding: "20px",
              }}
            >
              {filtered.map((d) => (
                <div
                  key={d.id}
                  className="editorial-card"
                  style={{
                    padding: "20px",
                    cursor: "pointer",
                    borderColor: selectedDecisionId === d.id ? "var(--accent)" : "var(--border)",
                  }}
                  onClick={() => onSelectDecision(d.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <span className={`badge badge-${d.status}`}>{d.status}</span>
                    <span className={`badge badge-${d.review_status}`}>{d.review_status}</span>
                  </div>

                  <h3 style={{ fontSize: "15px", color: "var(--text)", lineHeight: 1.3 }}>
                    {d.title}
                  </h3>

                  <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, maxHeight: "54px", overflow: "hidden" }}>
                    {d.summary}
                  </p>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-dim)", paddingTop: "8px", borderTop: "1px solid var(--border-light)" }}>
                    <span>
                      {d.confidence !== null ? `${Math.round(d.confidence * 100)}% conf` : ""} · {d.evidence_count} evidence
                    </span>
                    <span style={{ color: "var(--accent)" }}>Inspect ↗</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-Out Decision Detail Drawer ────────────────── */}
      {selectedDecisionId && (
        <div className="drawer-backdrop" onClick={() => onSelectDecision(null)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            {loadingDetail ? (
              <div className="state-empty" style={{ margin: "auto" }}>
                <span className="spinner" style={{ width: "24px", height: "24px" }} />
                <div>Loading decision details…</div>
              </div>
            ) : detail ? (
              <>
                <div className="drawer-header">
                  <div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <span className={`badge badge-${detail.status}`}>{detail.status}</span>
                      <span className={`badge badge-${detail.review_status}`}>
                        Review: {detail.review_status}
                      </span>
                      {detail.confidence !== null && (
                        <span className="badge badge-neutral">
                          {Math.round(detail.confidence * 100)}% Confidence
                        </span>
                      )}
                    </div>
                    <h2 style={{ fontSize: "20px", color: "var(--text)" }}>{detail.title}</h2>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onSelectDecision(null)}
                  >
                    ✕
                  </button>
                </div>
                <div className="drawer-body">

                {/* Original GitHub Discussion Context */}
                {detail.source_discussion && (
                  <div
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                        Source Discussion Thread
                      </span>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginTop: "2px" }}>
                        {detail.source_discussion.title || `${detail.source_discussion.source_type} discussion`}
                      </div>
                      {detail.source_discussion.author_login && (
                        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          Author: @{detail.source_discussion.author_login}
                        </span>
                      )}
                    </div>
                    <a
                      href={detail.source_discussion.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      GitHub Source ↗
                    </a>
                  </div>
                )}

                {/* Summary */}
                <div className="drawer-section">
                  <div className="drawer-section-title">Decision Summary</div>
                  <p style={{ fontSize: "14px", color: "var(--text)", lineHeight: 1.6 }}>
                    {detail.summary}
                  </p>
                </div>

                {/* Rationale */}
                <div className="drawer-section">
                  <div className="drawer-section-title">Key Rationale</div>
                  {detail.rationale && detail.rationale.length > 0 ? (
                    <ul style={{ paddingLeft: "18px", color: "var(--text-muted)", fontSize: "13px" }}>
                      {detail.rationale.map((r, i) => (
                        <li key={i} style={{ marginBottom: "6px" }}>
                          {r}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>
                      No explicit rationale extracted.
                    </p>
                  )}
                </div>

                {/* Alternatives */}
                <div className="drawer-section">
                  <div className="drawer-section-title" style={{ color: "var(--error)" }}>
                    Rejected Alternatives
                  </div>
                  {detail.alternatives && detail.alternatives.length > 0 ? (
                    <ul style={{ paddingLeft: "18px", color: "var(--text-muted)", fontSize: "13px" }}>
                      {detail.alternatives.map((alt, i) => (
                        <li key={i} style={{ marginBottom: "6px" }}>
                          {alt}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>
                      No alternative proposals recorded.
                    </p>
                  )}
                </div>

                {/* Trade-offs */}
                {detail.tradeoffs && detail.tradeoffs.length > 0 && (
                  <div className="drawer-section">
                    <div className="drawer-section-title" style={{ color: "var(--warning)" }}>
                      Engineering Trade-offs
                    </div>
                    <ul style={{ paddingLeft: "18px", color: "var(--text-muted)", fontSize: "13px" }}>
                      {detail.tradeoffs.map((t, i) => (
                        <li key={i} style={{ marginBottom: "6px" }}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Supporting Evidence */}
                <div className="drawer-section">
                  <div className="drawer-section-title" style={{ color: "var(--success)" }}>
                    Supporting Evidence ({supportingEvidence.length})
                  </div>
                  {supportingEvidence.length > 0 ? (
                    supportingEvidence.map((ev, i) => (
                      <div key={i} className="evidence-card">
                        <div className="evidence-header">
                          <span className="badge badge-accepted">{ev.evidence_role}</span>
                          <span style={{ color: "var(--text-dim)" }}>
                            {ev.source_type} · @{ev.author_login || "contributor"}
                          </span>
                        </div>
                        <div className="evidence-quote">
                          &ldquo;{ev.excerpt || "No excerpt recorded"}&rdquo;
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="evidence-link"
                          >
                            Inspect citation on GitHub
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>
                      No separate supporting evidence records.
                    </p>
                  )}
                </div>

                {/* Rejecting Evidence */}
                {rejectingEvidence.length > 0 && (
                  <div className="drawer-section">
                    <div className="drawer-section-title" style={{ color: "var(--error)" }}>
                      Rejecting / Alternative Evidence ({rejectingEvidence.length})
                    </div>
                    {rejectingEvidence.map((ev, i) => (
                      <div key={i} className="evidence-card">
                        <div className="evidence-header">
                          <span className="badge badge-rejected">{ev.evidence_role}</span>
                          <span style={{ color: "var(--text-dim)" }}>
                            {ev.source_type} · @{ev.author_login || "contributor"}
                          </span>
                        </div>
                        <div className="evidence-quote">
                          &ldquo;{ev.excerpt || "No excerpt recorded"}&rdquo;
                        </div>
                        <a
                          href={ev.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="evidence-link"
                        >
                          Inspect citation on GitHub
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Related Decisions */}
                {detail.related_decisions && detail.related_decisions.length > 0 && (
                  <div className="drawer-section">
                    <div className="drawer-section-title" style={{ color: "var(--purple)" }}>
                      Related Decisions ({detail.related_decisions.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {detail.related_decisions.map((rel) => (
                        <div
                          key={rel.id}
                          style={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "10px 14px",
                            cursor: "pointer",
                          }}
                          onClick={() => onSelectDecision(rel.related_decision_id)}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span className="badge badge-unresolved" style={{ fontSize: "10px" }}>
                              {rel.relationship_type.replace(/_/g, " ")}
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                              {Math.round(rel.confidence * 100)}% confidence
                            </span>
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                            {rel.related_decision_title}
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                            {rel.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Maintainer Review Controls */}
                <div
                  className="drawer-section"
                  style={{
                    paddingTop: "16px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div className="drawer-section-title">Maintainer Review Action</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "var(--success)" }}
                      onClick={() => handleReview("approve")}
                    >
                      <Check size={14} /> Approve Decision
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "var(--error)" }}
                      onClick={() => handleReview("reject")}
                    >
                      <X size={14} /> Reject Candidate
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "var(--warning)" }}
                      onClick={() => handleReview("request_review")}
                    >
                      <AlertCircle size={14} /> Request Re-review
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ color: "var(--accent)" }}
                      onClick={() => handleReview("mark_unresolved")}
                    >
                      <Clock size={14} /> Mark Unresolved
                    </button>
                  </div>
                </div>

                {/* Audit History */}
                {detail.review_history && detail.review_history.length > 0 && (
                  <div className="drawer-section">
                    <div className="drawer-section-title">Audit History</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {detail.review_history.map((hist) => (
                        <div
                          key={hist.id}
                          style={{
                            fontSize: "12px",
                            padding: "8px 10px",
                            background: "var(--card)",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-light)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text)" }}>
                            <span>
                              Status changed to <strong>{hist.new_review_status}</strong>
                            </span>
                            <span style={{ color: "var(--text-dim)" }}>
                              {new Date(hist.created_at).toLocaleString()}
                            </span>
                          </div>
                          {hist.reviewer_note && (
                            <div style={{ color: "var(--text-muted)", marginTop: "4px" }}>
                              Note: {hist.reviewer_note}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>{/* drawer-body */}
              </>
            ) : (
              <div className="state-empty">Decision not found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
