"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { ExtractionRun, DiagnosticsResult, ExtractionDiagnostic } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface DiagnosticsViewProps {
  repositoryId: string;
  onRefresh: () => void;
}

export function DiagnosticsView({ repositoryId, onRefresh }: DiagnosticsViewProps) {
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [actionMsg, setActionMsg] = useState("");

  // Load runs for repository
  useEffect(() => {
    if (!repositoryId) return;
    fetch(`${API}/repositories/${repositoryId}/extractions`)
      .then((res) => res.json())
      .then((data) => {
        setRuns(data.items ?? []);
        if (data.items?.length > 0 && !selectedRunId) {
          setSelectedRunId(data.items[0].id);
        }
      })
      .catch(() => setRuns([]));
  }, [repositoryId]);

  // Load detailed diagnostics for selected run
  useEffect(() => {
    if (!selectedRunId) return;
    setLoading(true);
    fetch(`${API}/extractions/${selectedRunId}/diagnostics`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load diagnostics");
        return res.json();
      })
      .then((data) => setDiagnostics(data))
      .catch((err) => setActionMsg(err.message))
      .finally(() => setLoading(false));
  }, [selectedRunId]);

  async function handleCancel(runId: string) {
    try {
      const res = await fetch(`${API}/extractions/${runId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.error?.message ?? "Cancel failed");
      setActionMsg("Extraction run cancelled.");
      onRefresh();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Error cancelling extraction");
    }
  }

  const activeRun = runs.find((r) => r.id === selectedRunId) || diagnostics?.summary;

  return (
    <div>
      {/* ── Run Selector Tabs ───────────────────────────────── */}
      {runs.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            paddingBottom: "12px",
            marginBottom: "16px",
          }}
        >
          {runs.map((r, idx) => {
            const isSelected = r.id === selectedRunId;
            return (
              <button
                key={r.id}
                className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSelectedRunId(r.id)}
              >
                <span>Run #{runs.length - idx}</span>
                <span
                  className={`badge ${
                    r.status === "completed"
                      ? "badge-accepted"
                      : r.status === "failed"
                      ? "badge-rejected"
                      : "badge-proposed"
                  }`}
                  style={{ fontSize: "10px", padding: "1px 5px" }}
                >
                  {r.status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {actionMsg && (
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
          {actionMsg}
        </div>
      )}

      {/* ── Active Run Lifecycle & Telemetry ────────────────── */}
      {activeRun && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <Activity size={16} color="var(--accent)" />
                Extraction Run Telemetry
              </div>
              <div className="panel-description">
                Model: <strong>{activeRun.model_provider} / {activeRun.model_name}</strong> · ID: {activeRun.id}
              </div>
            </div>

            {(activeRun.status === "queued" ||
              activeRun.status === "waiting_for_model" ||
              activeRun.status === "running") && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleCancel(activeRun.id)}
              >
                Cancel Run
              </button>
            )}
          </div>

          <div className="panel-body">
            {/* KPI Telemetry row */}
            <div className="kpi-grid" style={{ marginBottom: "20px" }}>
              <div className="kpi-card">
                <div className="kpi-label">Records Processed</div>
                <div className="kpi-value">{activeRun.records_processed}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Signals Detected</div>
                <div className="kpi-value" style={{ color: "var(--accent)" }}>
                  {activeRun.threads_with_signals}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Candidates</div>
                <div className="kpi-value">
                  {activeRun.candidates_generated}
                </div>
                <div className="kpi-subtext" style={{ color: "var(--error)" }}>
                  {activeRun.candidates_rejected} rejected
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Decisions Created</div>
                <div className="kpi-value" style={{ color: "var(--success)" }}>
                  {activeRun.decisions_created}
                </div>
              </div>
            </div>

            {/* Model Observability details */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "14px",
                background: "var(--surface)",
                padding: "16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                fontSize: "13px",
              }}
            >
              <div>
                <span style={{ color: "var(--text-dim)", display: "block" }}>Tokens (Prompt / Completion):</span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>
                  {activeRun.prompt_tokens ?? "—"} / {activeRun.completion_tokens ?? "—"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-dim)", display: "block" }}>Total Tokens:</span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>
                  {activeRun.model_total_tokens ?? "—"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-dim)", display: "block" }}>Inference Latency:</span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>
                  {activeRun.inference_duration_ms
                    ? `${(activeRun.inference_duration_ms / 1000).toFixed(2)}s`
                    : "—"}
                </strong>
              </div>
              <div>
                <span style={{ color: "var(--text-dim)", display: "block" }}>Queue Duration:</span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>
                  {activeRun.queue_duration_ms
                    ? `${activeRun.queue_duration_ms}ms`
                    : "0ms"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Per-Thread Diagnostics Breakdown ────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Zap size={16} color="var(--accent)" />
            Per-Thread Extraction Outcomes ({diagnostics?.items.length ?? 0})
          </div>
        </div>

        <div className="panel-body no-padding">
          {loading ? (
            <div className="state-empty">
              <span className="spinner" style={{ width: "24px", height: "24px" }} />
              <div>Loading diagnostics…</div>
            </div>
          ) : !diagnostics || diagnostics.items.length === 0 ? (
            <div className="state-empty">
              <Activity className="state-empty-icon" />
              <div className="state-empty-title">No thread diagnostics available</div>
              <div className="state-empty-desc">
                Execute an extraction to inspect detailed thread validation decisions.
              </div>
            </div>
          ) : (
            <div>
              {diagnostics.items.map((item, idx) => {
                const isOpen = !!openItems[item.discussion_id || String(idx)];
                return (
                  <div
                    key={item.discussion_id || idx}
                    style={{ borderBottom: "1px solid var(--border-light)" }}
                  >
                    <div
                      style={{
                        padding: "12px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        background: isOpen ? "var(--surface)" : "transparent",
                      }}
                      onClick={() =>
                        setOpenItems((prev) => ({
                          ...prev,
                          [item.discussion_id || String(idx)]: !isOpen,
                        }))
                      }
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span
                          className={`badge ${
                            item.outcome === "decision_created"
                              ? "badge-accepted"
                              : item.outcome === "invalid_thread"
                              ? "badge-rejected"
                              : "badge-proposed"
                          }`}
                        >
                          {item.outcome.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: "13px" }}>
                          {item.title || `Thread #${item.thread_number ?? idx + 1}`}
                        </span>
                      </div>

                      <div style={{ fontSize: "12px", color: "var(--text-dim)", display: "flex", gap: "12px" }}>
                        {item.matched_rule && (
                          <span style={{ color: "var(--accent)" }}>
                            Rule: {item.matched_rule}
                          </span>
                        )}
                        <span>{item.associated_records} records</span>
                        <span>{item.cleaned_content_length} chars</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          padding: "16px 24px",
                          background: "var(--sidebar-bg)",
                          fontSize: "13px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {item.candidate_title && (
                          <div>
                            <strong style={{ color: "var(--text)" }}>Candidate:</strong>{" "}
                            {item.candidate_title} (
                            <span style={{ color: "var(--accent)" }}>{item.candidate_status}</span>)
                          </div>
                        )}
                        {item.candidate_source_discussion_id && (
                          <div>
                            <strong style={{ color: "var(--text)" }}>Source discussion:</strong>{" "}
                            {item.candidate_source_discussion_id}
                          </div>
                        )}
                        {item.candidate_summary && (
                          <p style={{ color: "var(--text-muted)", margin: 0 }}>
                            {item.candidate_summary}
                          </p>
                        )}
                        {item.duplicate_match_type && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                              padding: "10px 12px",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--surface)",
                            }}
                          >
                            <div>
                              <strong style={{ color: "var(--text)" }}>Reconciliation:</strong>{" "}
                              {item.duplicate_match_type.replace(/_/g, " ")}
                              {item.candidate_disposition && ` · ${item.candidate_disposition.replace(/_/g, " ")}`}
                            </div>
                            {item.matched_decision_id && (
                              <div>
                                <strong style={{ color: "var(--text)" }}>Matched decision:</strong>{" "}
                                {item.matched_decision_title} ({item.matched_decision_status} ·{" "}
                                {item.matched_decision_review_status}) · {item.matched_decision_id}
                              </div>
                            )}
                            {item.matching_rationale && (
                              <div style={{ color: "var(--text-muted)" }}>{item.matching_rationale}</div>
                            )}
                            {item.similarity_score != null && (
                              <div style={{ color: "var(--text-dim)" }}>
                                Text similarity: {(item.similarity_score * 100).toFixed(1)}%
                                {item.similarity_method && ` (${item.similarity_method})`}
                              </div>
                            )}
                          </div>
                        )}
                        {item.evidence_references && item.evidence_references.length > 0 && (
                          <div>
                            <strong style={{ color: "var(--text)" }}>Verified evidence:</strong>
                            <ul style={{ margin: "6px 0 0", paddingLeft: "20px", color: "var(--text-muted)" }}>
                              {item.evidence_references.map((evidence) => (
                                <li key={`${evidence.discussion_id}:${evidence.role}`}>
                                  <a href={evidence.source_url} target="_blank" rel="noreferrer">
                                    {evidence.discussion_id}
                                  </a>{" "}
                                  · {evidence.role}: “{evidence.excerpt}”
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.rejection_reason && (
                          <div style={{ color: "var(--error)" }}>
                            <strong>Rejection Reason:</strong> {item.rejection_reason}
                          </div>
                        )}
                        {item.validation_errors && item.validation_errors.length > 0 && (
                          <div style={{ color: "var(--warning)" }}>
                            <strong>Validation Notes:</strong> {item.validation_errors.join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
