"use client";

import { FormEvent, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/* ── Types ──────────────────────────────────────────────── */

type Discussion = {
  id: string;
  source_type: string;
  title: string | null;
  body: string;
  source_url: string;
};

type Repository = { id: string; full_name: string; html_url: string };

type Decision = {
  id: string;
  title: string;
  summary: string;
  status: string;
  confidence: number | null;
  rationale: string[];
  alternatives: string[];
  tradeoffs: string[];
  evidence_count: number;
  review_status: string;
  review_reason?: string | null;
  repository_name?: string;
  extracted_at?: string;
  extraction_model?: string | null;
  extraction_version?: string;
};

type DecisionDetail = Decision & {
  evidence: Array<{
    discussion_id: string;
    source_type: string;
    author_login: string | null;
    evidence_role: string;
    excerpt: string | null;
    source_url: string;
    source_created_at: string | null;
  }>;
  review_history: Array<{
    id: string;
    previous_review_status: string | null;
    new_review_status: string;
    previous_decision_status: string | null;
    new_decision_status: string | null;
    reviewer_note: string | null;
    reviewer_identity: string | null;
    created_at: string;
  }>;
};

type ExtractionSummary = {
  records_processed: number;
  valid_threads: number;
  invalid_threads: number;
  unusable_threads: number;
  no_decision_signal: number;
  decisions_existing: number;
  threads_with_signals: number;
  candidates_generated: number;
  candidates_rejected: number;
  decisions_created: number;
};

type Diagnostic = {
  discussion_id: string;
  thread_number: number | null;
  source_type: string;
  title: string | null;
  associated_records: number;
  cleaned_content_length: number;
  usable: boolean;
  decision_signal_detected: boolean;
  matched_rule: string | null;
  candidate_generated: boolean;
  candidate_count: number;
  rejection_reason: string | null;
  outcome: string;
  detected_signals?: Array<{
    signal_type: string;
    discussion_id: string;
    source_type: string;
    source_url: string;
    author_role: string | null;
    excerpt: string;
  }>;
  candidate_title?: string | null;
  candidate_status?: string | null;
  candidate_summary?: string | null;
  evidence_references?: Array<{
    discussion_id: string;
    source_type: string;
    source_url: string;
    excerpt: string;
    role: string;
  }>;
  schema_validation_result?: string | null;
  semantic_validation_result?: string | null;
  validation_errors?: string[];
  persistence_result?: string | null;
};

type View = "overview" | "decisions" | "discussions" | "diagnostics";

/* ── Sidebar ────────────────────────────────────────────── */

function Sidebar({
  view,
  setView,
  counts,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { decisions: number; discussions: number; diagnostics: number };
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="mark">M</div>
        <h1>METIS</h1>
      </div>
      <nav className="sidebar-nav">
        <div className="group-label">Dashboard</div>
        <button
          className={`nav-item ${view === "overview" ? "active" : ""}`}
          onClick={() => setView("overview")}
        >
          <span className="nav-icon">◫</span>
          Overview
        </button>

        <div className="group-label">Data</div>
        <button
          className={`nav-item ${view === "discussions" ? "active" : ""}`}
          onClick={() => setView("discussions")}
        >
          <span className="nav-icon">☰</span>
          Source Discussions
          {counts.discussions > 0 && (
            <span className="nav-count">{counts.discussions}</span>
          )}
        </button>
        <button
          className={`nav-item ${view === "decisions" ? "active" : ""}`}
          onClick={() => setView("decisions")}
        >
          <span className="nav-icon">◆</span>
          Decisions
          {counts.decisions > 0 && (
            <span className="nav-count">{counts.decisions}</span>
          )}
        </button>
        <button
          className={`nav-item ${view === "diagnostics" ? "active" : ""}`}
          onClick={() => setView("diagnostics")}
        >
          <span className="nav-icon">⚙</span>
          Diagnostics
          {counts.diagnostics > 0 && (
            <span className="nav-count">{counts.diagnostics}</span>
          )}
        </button>
      </nav>
      <div className="sidebar-footer">
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
        >
          API Docs ↗
        </a>
      </div>
    </aside>
  );
}

/* ── Stat Card ──────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: number | string;
  sub?: string;
  variant?: string;
}) {
  return (
    <div className={`stat-card ${variant ?? ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ── Decisions Panel ────────────────────────────────────── */

function DecisionsPanel({ decisions, onRefresh }: { decisions: Decision[]; onRefresh: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [confidence, setConfidence] = useState("");
  const [extractedAfter, setExtractedAfter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = decisions.filter((decision) => {
    const text = `${decision.title} ${decision.summary}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) &&
      (status === "all" || decision.status === status) &&
      (reviewStatus === "all" || decision.review_status === reviewStatus) &&
      (!confidence || decision.confidence === null || decision.confidence >= Number(confidence)) &&
      (!extractedAfter || !decision.extracted_at || decision.extracted_at >= extractedAfter);
  });
  const pageSize = 10;
  const visibleDecisions = filtered.slice(page * pageSize, (page + 1) * pageSize);

  async function selectDecision(id: string) {
    setSelectedId(id);
    setLoading(true);
    try {
      const response = await fetch(`${API}/decisions/${id}`);
      if (!response.ok) throw new Error("Could not load decision details");
      setDetail(await response.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load decision details");
    } finally {
      setLoading(false);
    }
  }

  async function review(action: string) {
    if (!detail) return;
    if ((action === "approve" || action === "reject") && !window.confirm(`Confirm ${action} for this decision?`)) return;
    const note = window.prompt("Optional reviewer note:") ?? undefined;
    const response = await fetch(`${API}/decisions/${detail.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.detail?.error?.message ?? "Review action failed");
      return;
    }
    setMessage("Review recorded");
    await selectDecision(detail.id);
    onRefresh();
  }

  useEffect(() => {
    if (selectedId && !decisions.some((decision) => decision.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }, [decisions, selectedId]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Engineering Decisions</h2>
        <div className="panel-actions">
          <button className="btn btn-ghost btn-sm" onClick={onRefresh}>Refresh</button>
          <span className="panel-count">{decisions.length}</span>
        </div>
      </div>
      <div className="decision-toolbar">
        <input aria-label="Search decisions" placeholder="Search decisions" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Decision status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All classifications</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="proposed">Proposed</option><option value="unresolved">Unresolved</option>
        </select>
        <select aria-label="Review status" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}>
          <option value="all">All review states</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="needs_review">Needs review</option><option value="valid">Legacy valid</option>
        </select>
        <input aria-label="Minimum confidence" type="number" min="0" max="1" step="0.05" placeholder="Min confidence" value={confidence} onChange={(event) => setConfidence(event.target.value)} />
        <input aria-label="Extracted after" type="date" value={extractedAfter} onChange={(event) => setExtractedAfter(event.target.value)} />
      </div>
      <div className="stats-row decision-metrics">
        <StatCard label="Total" value={decisions.length} />
        <StatCard label="Accepted" value={decisions.filter((d) => d.status === "accepted").length} variant="green" />
        <StatCard label="Rejected" value={decisions.filter((d) => d.status === "rejected").length} variant="red" />
        <StatCard label="Proposed" value={decisions.filter((d) => d.status === "proposed").length} variant="blue" />
        <StatCard label="Pending reviews" value={decisions.filter((d) => ["pending", "needs_review", "valid"].includes(d.review_status)).length} variant="accent" />
      </div>
      <div className="panel-body">
        {loading && <div className="panel-empty"><span className="spinner" /> Loading decision detail...</div>}
        {!loading && filtered.length === 0 ? (
          <div className="panel-empty">
            <div className="empty-icon">◆</div>{decisions.length === 0 ? "No decisions have been extracted yet." : "No decisions match these filters."}
          </div>
        ) : (
          visibleDecisions.map((d) => (
            <button className={`list-item decision-row ${selectedId === d.id ? "selected" : ""}`} key={d.id} onClick={() => selectDecision(d.id)}>
              <div className="item-content">
                <div className="item-title">{d.title}</div>
                <div className="item-desc">{d.summary}</div>
                <div className="item-meta">
                  <span className={`badge badge-${d.status}`}>
                    {d.status}
                  </span>
                  <span className="badge badge-neutral">review: {d.review_status}</span>
                  <span className="badge-evidence">
                    {d.evidence_count} evidence source
                    {d.evidence_count !== 1 ? "s" : ""}
                  </span>
                  {d.confidence !== null && (
                    <span className="badge-evidence">
                      {Math.round(d.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
      {filtered.length > pageSize && <div className="decision-pagination"><button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(filtered.length / pageSize)}</span><button className="btn btn-ghost btn-sm" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
      {message && <div className="connect-status has-msg">{message}</div>}
      {detail && (
        <aside className="decision-detail">
          <div className="panel-header"><h2>Decision review</h2><button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>Close</button></div>
          <div className="panel-body padded">
            <h3>{detail.title}</h3>
            <p className="detail-summary">{detail.summary}</p>
            <div className="item-meta"><span className={`badge badge-${detail.status}`}>{detail.status}</span><span className="badge badge-neutral">review: {detail.review_status}</span><span className="badge-evidence">{detail.confidence === null ? "Confidence unavailable" : `${Math.round(detail.confidence * 100)}% confidence`}</span></div>
            <h4>Rationale</h4><ul>{detail.rationale?.length ? detail.rationale.map((item, index) => <li key={index}>{item}</li>) : <li>No rationale identified.</li>}</ul>
            <h4>Alternatives</h4><ul>{detail.alternatives?.length ? detail.alternatives.map((item, index) => <li key={index}>{item}</li>) : <li>No alternatives identified.</li>}</ul>
            <h4>Trade-offs</h4><ul>{detail.tradeoffs?.length ? detail.tradeoffs.map((item, index) => <li key={index}>{item}</li>) : <li>No trade-offs identified.</li>}</ul>
            <h4>Evidence</h4>
            {detail.evidence.map((evidence) => <div className="evidence-block" key={`${evidence.discussion_id}-${evidence.evidence_role}`}><span className="badge badge-neutral">{evidence.evidence_role}</span><span>{evidence.source_type} · {evidence.author_login ?? "author unavailable"}</span><p>{evidence.excerpt ?? "No excerpt available."}</p><a href={evidence.source_url} target="_blank" rel="noreferrer">Open GitHub source ↗</a><small>Discussion: {evidence.discussion_id}</small></div>)}
            <h4>Validation</h4><p>System review: {detail.review_status}. {detail.review_reason ?? "No validation warning recorded."}</p>
            <div className="action-row"><button className="btn btn-primary btn-sm" onClick={() => review("approve")}>Approve</button><button className="btn btn-ghost btn-sm" onClick={() => review("reject")}>Reject</button><button className="btn btn-ghost btn-sm" onClick={() => review("request_review")}>Request review</button><button className="btn btn-ghost btn-sm" onClick={() => review("mark_unresolved")}>Mark unresolved</button></div>
            <h4>Review history</h4>{detail.review_history?.length ? detail.review_history.map((entry) => <div className="history-row" key={entry.id}>{entry.new_review_status} · {entry.reviewer_identity ?? "anonymous"} · {entry.reviewer_note ?? "No note"}</div>) : <p>No review actions recorded.</p>}
          </div>
        </aside>
      )}
    </div>
  );
}

/* ── Discussions Panel ──────────────────────────────────── */

function DiscussionsPanel({ discussions }: { discussions: Discussion[] }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Source Discussions</h2>
        {discussions.length > 0 && (
          <span className="panel-count">{discussions.length}</span>
        )}
      </div>
      <div className="panel-body">
        {discussions.length === 0 ? (
          <div className="panel-empty">
            <div className="empty-icon">☰</div>
            Ingest a public repository to see evidence-backed source records.
          </div>
        ) : (
          discussions.map((d) => (
            <div className="list-item" key={d.id}>
              <div className="item-content">
                <div className="item-title">
                  {d.title || d.source_type}
                </div>
                <div className="item-desc">
                  {d.body.slice(0, 220) || "No body text"}
                </div>
                <div className="item-meta">
                  <span className="badge badge-neutral">{d.source_type}</span>
                </div>
              </div>
              <a
                className="item-link"
                href={d.source_url}
                target="_blank"
                rel="noreferrer"
              >
                Source ↗
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Diagnostics Panel ──────────────────────────────────── */

function DiagnosticsPanel({
  summary,
  diagnostics,
  candidate,
}: {
  summary: ExtractionSummary | null;
  diagnostics: Diagnostic[];
  candidate: Diagnostic | null;
}) {
  const [open, setOpen] = useState(false);

  if (!summary) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h2>Extraction Diagnostics</h2>
        </div>
        <div className="panel-empty">
          <div className="empty-icon">⚙</div>
          Run an extraction to see per-thread diagnostics.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Extraction Diagnostics</h2>
        <span className="panel-count">
          {summary.records_processed} records
        </span>
      </div>
      <div className="panel-body padded">
        <div className="stats-row" style={{ marginBottom: 0 }}>
          <StatCard
            label="Usable Threads"
            value={summary.valid_threads}
            variant="blue"
          />
          <StatCard
            label="Invalid Threads"
            value={summary.invalid_threads}
            sub={`${summary.no_decision_signal} no signal`}
          />
          <StatCard
            label="Signals Detected"
            value={summary.threads_with_signals}
            variant="accent"
          />
          <StatCard
            label="Candidates"
            value={summary.candidates_generated}
            sub={`${summary.candidates_rejected} rejected`}
          />
          <StatCard
            label="Decisions Created"
            value={summary.decisions_created}
            variant="green"
          />
        </div>
      </div>

      {candidate && (
        <div className="panel-body padded">
          <h3>Generated Candidate</h3>
          <p><strong>{candidate.candidate_title}</strong> · {candidate.candidate_status}</p>
          <p>{candidate.candidate_summary}</p>
          <p className="diag-detail">
            Schema: {candidate.schema_validation_result ?? "unknown"} · Semantic: {candidate.semantic_validation_result ?? "unknown"} · Persistence: {candidate.persistence_result ?? "unknown"}
          </p>
          {candidate.validation_errors && candidate.validation_errors.length > 0 && (
            <p className="diag-detail">Validation: {candidate.validation_errors.join("; ")}</p>
          )}
          {(candidate.detected_signals ?? []).map((signal, index) => (
            <p className="diag-detail" key={`${signal.discussion_id}-${index}`}>
              Signal: {signal.signal_type} · {signal.excerpt}
            </p>
          ))}
          {(candidate.evidence_references ?? []).map((evidence, index) => (
            <p className="diag-detail" key={`${evidence.discussion_id}-${index}`}>
              Evidence ({evidence.role}): {evidence.excerpt} · {evidence.source_url}
            </p>
          ))}
        </div>
      )}

      {diagnostics.length > 0 && (
        <>
          <button className="diag-toggle" onClick={() => setOpen(!open)}>
            <span className={`arrow ${open ? "open" : ""}`}>▶</span>
            {open ? "Hide" : "Show"} per-discussion outcomes ({diagnostics.length})
          </button>
          {open && (
            <div className="diag-list">
              {diagnostics.map((d) => (
                <div
                  className="diag-item"
                  key={d.discussion_id}
                >
                  <span
                    className={`badge badge-${d.outcome}`}
                    style={{ flexShrink: 0 }}
                  >
                    {d.outcome.replace(/_/g, " ")}
                  </span>
                  <span className="diag-title">
                    {d.title || `${d.source_type} ${d.thread_number ?? "source"}`}
                  </span>
                  <span className="diag-detail">
                    {d.matched_rule ? `${d.matched_rule}` : ""}
                    {d.rejection_reason ? ` · ${d.rejection_reason}` : ""}
                  </span>
                  <span className="diag-detail">
                    {d.associated_records} rec · {d.cleaned_content_length} chars
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */

export default function Home() {
  const [url, setUrl] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [repoName, setRepoName] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionSummary, setExtractionSummary] =
    useState<ExtractionSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [candidateDiagnostic, setCandidateDiagnostic] = useState<Diagnostic | null>(null);
  const [view, setView] = useState<View>("overview");

  useEffect(() => {
    fetch(`${API}/repositories`).then((response) => response.json()).then((data) => setRepositories(data.items ?? [])).catch(() => undefined);
  }, []);

  async function registerAndIngest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("Registering repository…");
    try {
      const registered = await fetch(`${API}/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository_url: url }),
      }).then((r) => r.json());
      if (!registered.id)
        throw new Error(
          registered.detail?.error?.message ?? "Could not register repository"
        );
      setRepositoryId(registered.id);
      setRepoName(registered.full_name ?? url.replace(/.*github\.com\//, ""));
      setRepositories((current) => [...current.filter((item) => item.id !== registered.id), { id: registered.id, full_name: registered.full_name, html_url: registered.html_url }]);
      setMessage("Starting ingestion…");
      const ingestion = await fetch(
        `${API}/repositories/${registered.id}/ingestions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ max_items: 10 }),
        }
      ).then((r) => r.json());
      if (!ingestion.ingestion_id)
        throw new Error("Could not start ingestion");
      setMessage(
        "Ingestion queued — discussions will appear in a few seconds."
      );
      window.setTimeout(() => loadDiscussions(registered.id), 5000);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Request failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadDiscussions(id?: string) {
    const rid = id ?? repositoryId;
    if (!rid) return;
    const response = await fetch(`${API}/repositories/${rid}/discussions`);
    const data = await response.json();
    setDiscussions(data.items ?? []);
  }

  async function loadDecisions(id?: string) {
    const rid = id ?? repositoryId;
    if (!rid) return;
    const response = await fetch(`${API}/repositories/${rid}/decisions?limit=100`);
    const data = await response.json();
    setDecisions(data.items ?? []);
  }

  async function extractDecisions() {
    if (!repositoryId) return;
    setExtracting(true);
    setMessage("Extracting evidence-backed decisions…");
    try {
      const started = await fetch(
        `${API}/repositories/${repositoryId}/extractions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      ).then((r) => r.json());
      if (!started.extraction_id)
        throw new Error(
          started.detail?.error?.message ?? "Could not start extraction"
        );

      let completed = false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await fetch(
          `${API}/extractions/${started.extraction_id}`
        ).then((r) => r.json());
        if (status.status === "completed") {
          completed = true;
          break;
        }
        if (status.status === "failed")
          throw new Error(status.error_message ?? "Extraction failed");
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      if (!completed)
        throw new Error(
          "Extraction is still running; refresh shortly for diagnostics."
        );

      const diagnosticResult = await fetch(
        `${API}/extractions/${started.extraction_id}/diagnostics`
      ).then((r) => r.json());
      setExtractionSummary(diagnosticResult.summary);
      setDiagnostics(diagnosticResult.items ?? []);
      setCandidateDiagnostic(diagnosticResult.candidate ?? null);

      await loadDecisions();
      setMessage(
        `Extraction complete — ${diagnosticResult.summary.decisions_created ?? 0} new decision(s) created${diagnosticResult.summary.decisions_existing ? `; ${diagnosticResult.summary.decisions_existing} already existed` : ""}.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Extraction failed"
      );
    } finally {
      setExtracting(false);
    }
  }

  const connected = !!repositoryId;

  /* What to show in the main area */
  function renderView() {
    switch (view) {
      case "decisions":
        return <DecisionsPanel decisions={decisions} onRefresh={loadDecisions} />;
      case "discussions":
        return <DiscussionsPanel discussions={discussions} />;
      case "diagnostics":
        return (
          <DiagnosticsPanel
            summary={extractionSummary}
            diagnostics={diagnostics}
            candidate={candidateDiagnostic}
          />
        );
      default:
        /* overview: show everything in summary form */
        return (
          <>
            {/* Stats row — visible once we have data */}
            {(connected || discussions.length > 0) && (
              <div className="stats-row">
                <StatCard
                  label="Discussions"
                  value={discussions.length}
                  variant="blue"
                />
                <StatCard
                  label="Decisions"
                  value={decisions.length}
                  variant="accent"
                />
                {extractionSummary && (
                  <>
                    <StatCard
                      label="Threads w/ Signals"
                      value={extractionSummary.threads_with_signals}
                      variant="green"
                    />
                    <StatCard
                      label="Rejected"
                      value={extractionSummary.candidates_rejected}
                      variant="red"
                    />
                  </>
                )}
              </div>
            )}

            <DecisionsPanel decisions={decisions} onRefresh={loadDecisions} />
            <DiscussionsPanel discussions={discussions} />
            {extractionSummary && (
              <DiagnosticsPanel
                summary={extractionSummary}
                diagnostics={diagnostics}
                candidate={candidateDiagnostic}
              />
            )}
          </>
        );
    }
  }

  const viewLabels: Record<View, string> = {
    overview: "Overview",
    decisions: "Engineering Decisions",
    discussions: "Source Discussions",
    diagnostics: "Extraction Diagnostics",
  };

  return (
    <div className="shell">
      <Sidebar
        view={view}
        setView={setView}
        counts={{
          decisions: decisions.length,
          discussions: discussions.length,
          diagnostics: diagnostics.length,
        }}
      />

      {/* Top bar */}
      <header className="topbar">
        <span className="topbar-title">
          {viewLabels[view]}
          {repoName ? ` · ${repoName}` : ""}
        </span>
        <div className="topbar-actions">
          {repositories.length > 0 && <select aria-label="Repository" value={repositoryId} onChange={(event) => { const repository = repositories.find((item) => item.id === event.target.value); setRepositoryId(event.target.value); setRepoName(repository?.full_name ?? ""); loadDiscussions(event.target.value); loadDecisions(event.target.value); }}><option value="">Select repository</option>{repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.full_name}</option>)}</select>}
          {connected && (
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => loadDiscussions()}
              >
                Refresh
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={extractDecisions}
                disabled={extracting}
              >
                {extracting && <span className="spinner" />}
                {extracting ? "Extracting…" : "Extract Decisions"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="main-content">
        {/* Connect panel — always visible at the top of overview, or when no repo */}
        {(view === "overview" || !connected) && (
          <div className="connect-panel">
            <h2>Connect a Repository</h2>
            <form className="connect-form" onSubmit={registerAndIngest}>
              <input
                aria-label="GitHub repository URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
              />
              <button className="btn btn-primary" disabled={busy}>
                {busy && <span className="spinner" />}
                {busy ? "Working…" : "Ingest"}
              </button>
            </form>
            {message && (
              <div className={`connect-status has-msg`}>{message}</div>
            )}
            {(busy || extracting) && (
              <div className="progress-bar indeterminate">
                <div className="progress-fill" />
              </div>
            )}
          </div>
        )}

        {renderView()}
      </main>
    </div>
  );
}
