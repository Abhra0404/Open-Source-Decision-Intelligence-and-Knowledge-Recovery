"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  GitCommit,
  Filter,
  Calendar,
  ExternalLink,
  ArrowRight,
  GitBranch,
} from "lucide-react";
import { Decision } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface EvolutionViewProps {
  repositoryId: string;
  onSelectDecision: (id: string) => void;
}

type TimelineItem = Decision & {
  original_source_date?: string | null;
  relationships?: Array<{
    id: string;
    relationship_type: string;
    source_title: string;
    target_title: string;
    review_status: string;
  }>;
};

export function EvolutionView({ repositoryId, onSelectDecision }: EvolutionViewProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [relFilter, setRelFilter] = useState("all");

  useEffect(() => {
    if (!repositoryId) return;
    setLoading(true);

    const query = new URLSearchParams({ limit: "100" });
    if (statusFilter !== "all") query.set("status", statusFilter);
    if (relFilter !== "all") query.set("relationship_type", relFilter);

    fetch(`${API}/repositories/${repositoryId}/decision-timeline?${query}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [repositoryId, statusFilter, relFilter]);

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────── */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Filter size={15} color="var(--accent)" />
          <span style={{ fontSize: "13px", fontWeight: 600 }}>Timeline Filters:</span>
        </div>

        <select
          className="repo-selector"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Classifications</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="proposed">Proposed</option>
          <option value="unresolved">Unresolved</option>
        </select>

        <select
          className="repo-selector"
          value={relFilter}
          onChange={(e) => setRelFilter(e.target.value)}
        >
          <option value="all">All Relationships</option>
          <option value="supersedes">Supersedes</option>
          <option value="refines">Refines</option>
          <option value="depends_on">Depends On</option>
          <option value="contradicts">Contradicts</option>
          <option value="related_to">Related To</option>
        </select>
      </div>

      {/* ── Timeline Body ───────────────────────────────────── */}
      {loading ? (
        <div className="panel">
          <div className="state-empty">
            <span className="spinner" style={{ width: "24px", height: "24px" }} />
            <div>Loading chronological decision evolution…</div>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="panel">
          <div className="state-empty">
            <History className="state-empty-icon" />
            <div className="state-empty-title">No timeline records</div>
            <div className="state-empty-desc">
              Extract decisions to construct the chronological evolution of this codebase.
            </div>
          </div>
        </div>
      ) : (
        <div className="timeline-list">
          {items.map((item) => (
            <div key={item.id} className="timeline-node">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span className={`badge badge-${item.status}`}>{item.status}</span>
                    <span className={`badge badge-${item.review_status}`}>
                      {item.review_status}
                    </span>
                  </div>
                  <h3
                    style={{ fontSize: "16px", color: "var(--text)", cursor: "pointer" }}
                    onClick={() => onSelectDecision(item.id)}
                  >
                    {item.title}
                  </h3>
                </div>

                <div
                  style={{
                    textAlign: "right",
                    fontSize: "12px",
                    color: "var(--text-dim)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <div>
                    Extracted:{" "}
                    {item.extracted_at
                      ? new Date(item.extracted_at).toLocaleDateString()
                      : "—"}
                  </div>
                  {item.original_source_date && (
                    <div style={{ color: "var(--accent)" }}>
                      Source discussion: {new Date(item.original_source_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
                {item.summary}
              </p>

              {/* Connected relationships */}
              {item.relationships && item.relationships.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    paddingTop: "10px",
                    borderTop: "1px solid var(--border-light)",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                    Connected Lineage
                  </span>
                  {item.relationships.map((rel) => (
                    <div
                      key={rel.id}
                      style={{
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        color: "var(--text-muted)",
                      }}
                    >
                      <GitBranch size={13} color="var(--purple)" />
                      <strong style={{ color: "var(--purple)", textTransform: "capitalize" }}>
                        {rel.relationship_type.replace(/_/g, " ")}:
                      </strong>
                      <span>{rel.target_title}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "12px" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onSelectDecision(item.id)}
                >
                  Inspect Decision & Evidence
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
