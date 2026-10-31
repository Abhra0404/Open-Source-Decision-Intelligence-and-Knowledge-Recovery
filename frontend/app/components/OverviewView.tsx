"use client";

import React, { useState } from "react";
import {
  FolderGit2,
  FileCheck2,
  MessagesSquare,
  ShieldCheck,
  Clock,
  Network,
  ExternalLink,
  Zap,
  ArrowRight,
  GitPullRequest,
  Sparkles,
} from "lucide-react";
import {
  Repository,
  Decision,
  Discussion,
  ExtractionRun,
  AppView,
} from "../types";

interface OverviewViewProps {
  repositories: Repository[];
  selectedRepo: Repository | null;
  decisions: Decision[];
  discussions: Discussion[];
  relationshipCount: number;
  recentExtractions: ExtractionRun[];
  onSelectDecision: (id: string) => void;
  onNavigate: (view: AppView) => void;
  onConnectRepo: (url: string) => Promise<void>;
  isIngesting: boolean;
  statusMessage: string;
}

export function OverviewView({
  repositories,
  selectedRepo,
  decisions,
  discussions,
  relationshipCount,
  recentExtractions,
  onSelectDecision,
  onNavigate,
  onConnectRepo,
  isIngesting,
  statusMessage,
}: OverviewViewProps) {
  const [repoUrl, setRepoUrl] = useState("");

  const approvedDecisions = decisions.filter(
    (d) => d.review_status === "approved" || d.review_status === "valid"
  );
  const pendingReviews = decisions.filter(
    (d) => d.review_status === "pending" || d.review_status === "needs_review"
  );

  // Status breakdown calculations
  const totalDecisions = decisions.length;
  const acceptedCount = decisions.filter((d) => d.status === "accepted").length;
  const rejectedCount = decisions.filter((d) => d.status === "rejected").length;
  const proposedCount = decisions.filter((d) => d.status === "proposed").length;
  const unresolvedCount = decisions.filter((d) => d.status === "unresolved").length;

  const acceptedPct = totalDecisions > 0 ? (acceptedCount / totalDecisions) * 100 : 0;
  const rejectedPct = totalDecisions > 0 ? (rejectedCount / totalDecisions) * 100 : 0;
  const proposedPct = totalDecisions > 0 ? (proposedCount / totalDecisions) * 100 : 0;
  const unresolvedPct = totalDecisions > 0 ? (unresolvedCount / totalDecisions) * 100 : 0;

  // Average confidence calculation
  const confScores = decisions.map((d) => d.confidence).filter((c): c is number => c !== null);
  const avgConfidence =
    confScores.length > 0
      ? Math.round((confScores.reduce((a, b) => a + b, 0) / confScores.length) * 100)
      : null;

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    await onConnectRepo(repoUrl.trim());
    setRepoUrl("");
  }

  return (
    <div>
      {/* ── KPI Grid ────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => onNavigate("repositories")} style={{ cursor: "pointer" }}>
          <div className="kpi-card-header">
            <span className="kpi-label">Repositories</span>
            <FolderGit2 className="kpi-icon" />
          </div>
          <div className="kpi-value">{repositories.length}</div>
          <div className="kpi-subtext">Connected codebases</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate("discussions")} style={{ cursor: "pointer" }}>
          <div className="kpi-card-header">
            <span className="kpi-label">Discussions</span>
            <MessagesSquare className="kpi-icon" />
          </div>
          <div className="kpi-value">{discussions.length}</div>
          <div className="kpi-subtext">Issues, PRs & reviews analyzed</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate("decisions")} style={{ cursor: "pointer" }}>
          <div className="kpi-card-header">
            <span className="kpi-label">Decisions Recovered</span>
            <FileCheck2 className="kpi-icon" />
          </div>
          <div className="kpi-value" style={{ color: "var(--accent)" }}>
            {decisions.length}
          </div>
          <div className="kpi-subtext">Evidence-backed records</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Verified</span>
            <ShieldCheck className="kpi-icon" />
          </div>
          <div className="kpi-value" style={{ color: "var(--success)" }}>
            {approvedDecisions.length}
          </div>
          <div className="kpi-subtext">Human approved or valid</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Pending Reviews</span>
            <Clock className="kpi-icon" />
          </div>
          <div className="kpi-value" style={{ color: "var(--warning)" }}>
            {pendingReviews.length}
          </div>
          <div className="kpi-subtext">Awaiting maintainer audit</div>
        </div>

        <div className="kpi-card" onClick={() => onNavigate("evolution")} style={{ cursor: "pointer" }}>
          <div className="kpi-card-header">
            <span className="kpi-label">Relationships</span>
            <Network className="kpi-icon" />
          </div>
          <div className="kpi-value" style={{ color: "var(--purple)" }}>
            {relationshipCount}
          </div>
          <div className="kpi-subtext">Supersedes, refines & links</div>
        </div>
      </div>

      {/* ── Active Repository Context Banner ──────────────────── */}
      {selectedRepo ? (
        <div
          className="panel"
          style={{
            padding: "14px 20px",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            borderLeft: "3px solid var(--accent)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <FolderGit2 size={20} color="var(--accent)" />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)" }}>
                  {selectedRepo.full_name}
                </span>
                {selectedRepo.default_branch && (
                  <span className="badge badge-neutral" style={{ fontSize: "11px" }}>
                    branch: {selectedRepo.default_branch}
                  </span>
                )}
                {selectedRepo.extraction_status && (
                  <span className={`badge badge-${selectedRepo.extraction_status}`}>
                    {selectedRepo.extraction_status}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>
                {decisions.length} decisions · {discussions.length} discussions ·{" "}
                {avgConfidence !== null ? `${avgConfidence}% avg confidence` : "unrated"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("intelligence")}
            >
              <Sparkles size={13} color="var(--accent)" />
              Ask Questions
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate("knowledge-graph")}
            >
              <Network size={13} color="var(--purple)" />
              Knowledge Graph
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Decision Knowledge Distribution Bar ──────────────── */}
      {totalDecisions > 0 && (
        <div className="panel" style={{ marginBottom: "16px", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text)" }}>
                Recovered Architectural Knowledge Distribution
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>
                Breakdown of accepted, rejected, proposed, and unresolved engineering choices
              </div>
            </div>
            {avgConfidence !== null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                  {avgConfidence}%
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>Mean Confidence</div>
              </div>
            )}
          </div>

          {/* Segmented Progress Bar */}
          <div
            style={{
              height: "10px",
              borderRadius: "5px",
              overflow: "hidden",
              display: "flex",
              background: "#1E2533",
              marginBottom: "12px",
            }}
          >
            {acceptedPct > 0 && (
              <div
                style={{ width: `${acceptedPct}%`, background: "var(--success)" }}
                title={`Accepted: ${acceptedCount} (${acceptedPct.toFixed(1)}%)`}
              />
            )}
            {rejectedPct > 0 && (
              <div
                style={{ width: `${rejectedPct}%`, background: "var(--danger)" }}
                title={`Rejected: ${rejectedCount} (${rejectedPct.toFixed(1)}%)`}
              />
            )}
            {proposedPct > 0 && (
              <div
                style={{ width: `${proposedPct}%`, background: "var(--accent)" }}
                title={`Proposed: ${proposedCount} (${proposedPct.toFixed(1)}%)`}
              />
            )}
            {unresolvedPct > 0 && (
              <div
                style={{ width: `${unresolvedPct}%`, background: "var(--warning)" }}
                title={`Unresolved: ${unresolvedCount} (${unresolvedPct.toFixed(1)}%)`}
              />
            )}
          </div>

          {/* Legend and Shortcuts */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px" }}>
            <span
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
              onClick={() => onNavigate("decisions")}
            >
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }} />
              <strong>{acceptedCount}</strong> Accepted ({acceptedPct.toFixed(0)}%)
            </span>
            <span
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
              onClick={() => onNavigate("decisions")}
            >
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--danger)" }} />
              <strong>{rejectedCount}</strong> Rejected ({rejectedPct.toFixed(0)}%)
            </span>
            <span
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
              onClick={() => onNavigate("decisions")}
            >
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} />
              <strong>{proposedCount}</strong> Proposed ({proposedPct.toFixed(0)}%)
            </span>
            <span
              style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
              onClick={() => onNavigate("decisions")}
            >
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--warning)" }} />
              <strong>{unresolvedCount}</strong> Unresolved ({unresolvedPct.toFixed(0)}%)
            </span>
          </div>
        </div>
      )}

      {/* ── Connect / Ingest Panel ───────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-title">
              <GitPullRequest size={16} color="var(--accent)" />
              Connect GitHub Repository
            </div>
            <div className="panel-description">
              Ingest issues, pull requests, and review comments to recover architectural decisions.
            </div>
          </div>
        </div>
        <div className="panel-body">
          <form onSubmit={handleConnect} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: "280px" }}
              placeholder="https://github.com/owner/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isIngesting}
            />
            <button className="btn btn-primary" type="submit" disabled={isIngesting}>
              {isIngesting && <span className="spinner" />}
              {isIngesting ? "Ingesting…" : "Ingest Repository"}
            </button>
          </form>

          {statusMessage && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Zap size={14} color="var(--accent)" />
              {statusMessage}
            </div>
          )}
        </div>
      </div>

      {/* ── Two Column Layout for Activity & Recent Decisions ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>
        {/* Recent Decisions Table */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                <FileCheck2 size={16} color="var(--accent)" />
                Recent Recovered Decisions
              </div>
              <div className="panel-description">
                {selectedRepo
                  ? `Decisions for ${selectedRepo.full_name}`
                  : "Latest engineering decisions across all repositories"}
              </div>
            </div>
            {decisions.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onNavigate("decisions")}
              >
                View all ({decisions.length})
                <ArrowRight size={13} />
              </button>
            )}
          </div>
          <div className="panel-body no-padding">
            {decisions.length === 0 ? (
              <div className="state-empty">
                <FileCheck2 className="state-empty-icon" />
                <div className="state-empty-title">No decisions extracted yet</div>
                <div className="state-empty-desc">
                  Connect a repository and click &ldquo;Extract Decisions&rdquo; in the top bar to run the extraction pipeline.
                </div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Decision</th>
                      <th>Status</th>
                      <th>Review</th>
                      <th>Confidence</th>
                      <th>Evidence</th>
                      <th>Extracted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.slice(0, 8).map((decision) => (
                      <tr key={decision.id}>
                        <td style={{ maxWidth: "340px" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "var(--text)",
                              cursor: "pointer",
                            }}
                            onClick={() => onSelectDecision(decision.id)}
                          >
                            {decision.title}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-dim)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              marginTop: "2px",
                            }}
                          >
                            {decision.summary}
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-${decision.status}`}>
                            {decision.status}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${decision.review_status}`}>
                            {decision.review_status}
                          </span>
                        </td>
                        <td>
                          {decision.confidence !== null ? (
                            <span style={{ fontFamily: "var(--font-mono)" }}>
                              {Math.round(decision.confidence * 100)}%
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-dim)" }}>—</span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: "var(--text-muted)" }}>
                            {decision.evidence_count} source{decision.evidence_count !== 1 ? "s" : ""}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                            {decision.extracted_at
                              ? new Date(decision.extracted_at).toLocaleDateString()
                              : "—"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => onSelectDecision(decision.id)}
                          >
                            Inspect
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

        {/* Extraction Runs Activity */}
        {recentExtractions.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">
                  <Zap size={16} color="var(--accent)" />
                  Extraction Activity
                </div>
                <div className="panel-description">
                  Audit logs of inference models, token usage, and candidates generated.
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onNavigate("diagnostics")}
              >
                Diagnostics
                <ArrowRight size={13} />
              </button>
            </div>
            <div className="panel-body no-padding">
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Provider / Model</th>
                      <th>Records Processed</th>
                      <th>Decisions Created</th>
                      <th>Candidates</th>
                      <th>Inference Latency</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentExtractions.slice(0, 5).map((run) => (
                      <tr key={run.id}>
                        <td>
                          <span
                            className={`badge ${
                              run.status === "completed"
                                ? "badge-accepted"
                                : run.status === "failed"
                                ? "badge-rejected"
                                : "badge-proposed"
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 500, color: "var(--text)" }}>
                            {run.model_provider}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-dim)",
                              display: "block",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {run.model_name}
                          </span>
                        </td>
                        <td>{run.records_processed}</td>
                        <td>
                          <strong style={{ color: "var(--success)" }}>
                            {run.decisions_created}
                          </strong>
                        </td>
                        <td>
                          {run.candidates_generated} (
                          {run.candidates_rejected} rejected)
                        </td>
                        <td>
                          {run.inference_duration_ms
                            ? `${(run.inference_duration_ms / 1000).toFixed(2)}s`
                            : "—"}
                        </td>
                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                            {run.completed_at
                              ? new Date(run.completed_at).toLocaleTimeString()
                              : "In progress"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
