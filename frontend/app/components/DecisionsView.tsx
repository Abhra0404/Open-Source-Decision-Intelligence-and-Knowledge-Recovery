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
} from "lucide-react";
import { Decision, DecisionDetail, DecisionStatus, ReviewStatus } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface DecisionsViewProps {
  decisions: Decision[];
  selectedDecisionId: string | null;
  onSelectDecision: (id: string | null) => void;
  onRefresh: () => void;
}

export function DecisionsView({
  decisions,
  selectedDecisionId,
  onSelectDecision,
  onRefresh,
}: DecisionsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [minConfidence, setMinConfidence] = useState<string>("");

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

  // Review action
  async function handleReview(action: "approve" | "reject" | "request_review" | "mark_unresolved") {
    if (!detail) return;
    const note = window.prompt(`Optional note for ${action}:`) ?? undefined;
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

  // Filtering
  const filtered = decisions.filter((d) => {
    const text = `${d.title} ${d.summary}`.toLowerCase();
    const matchSearch = !search || text.includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchReview = reviewFilter === "all" || d.review_status === reviewFilter;
    const matchConfidence =
      !minConfidence || (d.confidence !== null && d.confidence >= Number(minConfidence));
    return matchSearch && matchStatus && matchReview && matchConfidence;
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
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
          <Search
            size={15}
            color="var(--text-dim)"
            style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: "32px" }}
            placeholder="Search decisions by keyword or summary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
          step="0.1"
          placeholder="Min conf (e.g. 0.8)"
          className="input"
          style={{ width: "140px" }}
          value={minConfidence}
          onChange={(e) => setMinConfidence(e.target.value)}
        />
      </div>

      {actionMessage && (
        <div
          style={{
            marginBottom: "16px",
            fontSize: "13px",
            color: "var(--accent)",
            padding: "8px 12px",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* ── Decisions Table ─────────────────────────────────── */}
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
              <div className="state-empty-title">No matching decisions</div>
              <div className="state-empty-desc">
                {decisions.length === 0
                  ? "Extract decisions from ingested discussions to see them here."
                  : "Try clearing your search query or relaxing filter criteria."}
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Decision Title</th>
                    <th>Classification</th>
                    <th>Review State</th>
                    <th>Confidence</th>
                    <th>Evidence Sources</th>
                    <th>Date</th>
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
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

                {/* Summary */}
                <div className="drawer-section">
                  <div className="drawer-section-title">Summary</div>
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
                      No alternatives recorded for this decision.
                    </p>
                  )}
                </div>

                {/* Evidence Citations */}
                <div className="drawer-section">
                  <div className="drawer-section-title">Supporting Evidence ({detail.evidence?.length ?? 0})</div>
                  {detail.evidence && detail.evidence.length > 0 ? (
                    detail.evidence.map((ev, i) => (
                      <div key={i} className="evidence-card">
                        <div className="evidence-header">
                          <span className="badge badge-neutral">{ev.evidence_role}</span>
                          <span style={{ color: "var(--text-dim)" }}>
                            {ev.source_type} · @{ev.author_login || "unknown"}
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
                            Inspect original discussion on GitHub
                            <ExternalLink size={12} />
                          </a>
                          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                            {ev.source_created_at
                              ? new Date(ev.source_created_at).toLocaleDateString()
                              : ""}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>
                      No linked evidence items.
                    </p>
                  )}
                </div>

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
