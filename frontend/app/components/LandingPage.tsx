"use client";

import React from "react";
import {
  ArrowRight,
  GitBranch,
  Search,
  CheckCircle2,
  Database,
  Cpu,
  ShieldCheck,
  FileCode2,
  Sparkles,
  Layers,
  History,
  ExternalLink,
  Code2,
  BookOpen,
} from "lucide-react";

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface LandingPageProps {
  onLaunchApp: () => void;
}

export function LandingPage({ onLaunchApp }: LandingPageProps) {
  return (
    <div className="landing-wrap">
      {/* ── Sticky Navigation Bar ────────────────────────────── */}
      <nav className="landing-nav">
        <div className="brand-link" onClick={onLaunchApp}>
          <img src="/logo.svg" alt="METIS" className="brand-logo-img" />
          <div className="brand-text">
            <span className="brand-title">METIS</span>
            <span className="brand-badge">Decision Intelligence</span>
          </div>
        </div>

        <div className="landing-nav-links">
          <a href="#features" className="landing-nav-link">
            Features
          </a>
          <a href="#how-it-works" className="landing-nav-link">
            How It Works
          </a>
          <a href="#architecture" className="landing-nav-link">
            Architecture
          </a>
          <a href="#open-source" className="landing-nav-link">
            Open Source
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a
            href="https://github.com/Abhra0404/Open-Source-Decision-Intelligence-and-Knowledge-Recovery"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <GithubIcon size={16} />
            GitHub
          </a>
          <button onClick={onLaunchApp} className="btn btn-primary btn-sm">
            Launch Dashboard
            <ArrowRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero Section ────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-badge">
          <Sparkles size={14} />
          Open Source Engineering Decision Intelligence
        </div>

        <h1 className="hero-title">
          Your code has a history. <br />
          Make it searchable.
        </h1>

        <p className="hero-desc">
          METIS recovers the architectural decisions, rejected alternatives,
          and engineering reasoning hidden inside GitHub discussions. Remember
          the <em>why</em> behind your codebase.
        </p>

        <div className="hero-actions">
          <button onClick={onLaunchApp} className="btn btn-primary btn-lg">
            Explore METIS Dashboard
            <ArrowRight size={16} />
          </button>
          <a
            href="https://github.com/Abhra0404/Open-Source-Decision-Intelligence-and-Knowledge-Recovery"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary btn-lg"
          >
            <GithubIcon size={16} />
            View on GitHub
          </a>
        </div>

        {/* ── Realistic Hero Product Preview ──────────────────── */}
        <div className="hero-preview">
          <div className="hero-preview-topbar">
            <div className="window-dots">
              <div className="window-dot" style={{ background: "#E16B75" }} />
              <div className="window-dot" style={{ background: "#E5AE55" }} />
              <div className="window-dot" style={{ background: "#39B980" }} />
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginLeft: "12px",
                fontFamily: "var(--font-mono)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FileCode2 size={13} color="var(--accent)" />
              fastapi/fastapi · recovered_decisions.metis
            </div>
          </div>

          <div className="hero-preview-body">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "16px",
              }}
            >
              <div>
                <span className="badge badge-accepted" style={{ marginBottom: "8px" }}>
                  Accepted Decision
                </span>
                <h3 style={{ fontSize: "18px", color: "var(--text)" }}>
                  Adopt AnyIO as the Unified Async Concurrency Backend
                </h3>
              </div>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                94% confidence · prompt-v1
              </span>
            </div>

            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "18px" }}>
              Standardize async event loops and background worker thread execution
              across Starlette and ASGI handlers using AnyIO rather than custom asyncio threading wrappers.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  background: "var(--surface)",
                  padding: "14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--accent)",
                    marginBottom: "6px",
                  }}
                >
                  Key Rationale
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  • Transparent compatibility between asyncio and Trio event loops.
                  <br />
                  • Eliminates deadlock risks in custom threadpool executors.
                </div>
              </div>

              <div
                style={{
                  background: "var(--surface)",
                  padding: "14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--error)",
                    marginBottom: "6px",
                  }}
                >
                  Rejected Alternatives
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  • <em>Maintain custom asyncio wrapper</em>: High maintenance overhead across Python 3.8-3.13.
                </div>
              </div>
            </div>

            {/* Evidence quote */}
            <div
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 16px",
                borderLeft: "3px solid var(--accent)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "var(--text-dim)",
                  marginBottom: "4px",
                }}
              >
                <span>EVIDENCE · PULL REQUEST #842</span>
                <span style={{ color: "var(--accent)" }}>@tiangolo (Maintainer)</span>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  margin: 0,
                }}
              >
                &ldquo;By migrating to AnyIO, we preserve full native Trio compatibility while removing
                our flaky synchronous-to-asynchronous thread bridge.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem Section ─────────────────────────────────── */}
      <section className="section-container" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-header">
          <div className="section-eyebrow">The Context Gap</div>
          <h2 className="section-title">
            Engineering knowledge gets lost in conversations.
          </h2>
          <p className="section-subtitle">
            A pull request shows <em>what</em> code changed. The issue comments,
            reviews, and design debates hold the reasoning. When context is lost, codebases rot.
          </p>
        </div>

        <div className="cards-grid-3">
          <div className="editorial-card">
            <span className="editorial-num">01 / DISPERSION</span>
            <h3 className="editorial-title">
              Architectural reasoning gets buried in discussions
            </h3>
            <p className="editorial-desc">
              Crucial design trade-offs are scattered across hundreds of GitHub issues,
              PR reviews, and stale threads. Developers have no central index of <em>why</em>
              an architecture was picked.
            </p>
          </div>

          <div className="editorial-card">
            <span className="editorial-num">02 / DUPLICATION</span>
            <h3 className="editorial-title">
              New contributors repeat previously rejected approaches
            </h3>
            <p className="editorial-desc">
              Without access to past debates, teams repeatedly open issues proposing
              ideas that were already vetted, debated, and intentionally discarded months
              or years earlier.
            </p>
          </div>

          <div className="editorial-card">
            <span className="editorial-num">03 / DRIFT</span>
            <h3 className="editorial-title">
              Technical decisions become disconnected from original evidence
            </h3>
            <p className="editorial-desc">
              As original maintainers move on, institutional knowledge degrades into
              folklore. Engineers hesitate to refactor code because nobody knows what
              historical constraints were protecting it.
            </p>
          </div>
        </div>
      </section>

      {/* ── Solution & Workflow ─────────────────────────────── */}
      <section id="how-it-works" className="section-container" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-header">
          <div className="section-eyebrow">The Pipeline</div>
          <h2 className="section-title">
            Turn engineering history into usable intelligence.
          </h2>
          <p className="section-subtitle">
            METIS extracts verifiable, evidence-grounded decisions through an
            auditable multi-stage pipeline.
          </p>
        </div>

        <div className="workflow-row">
          <div className="workflow-step">
            <div className="workflow-step-num">1</div>
            <GitBranch size={20} color="var(--accent)" />
            <div className="workflow-step-title">GitHub Ingestion</div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Issues, PRs & reviews normalized
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step-num">2</div>
            <Cpu size={20} color="var(--accent)" />
            <div className="workflow-step-title">Decision Extraction</div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Open-weight LLM reasoning
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step-num">3</div>
            <ShieldCheck size={20} color="var(--success)" />
            <div className="workflow-step-title">Evidence Validation</div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Quotes verified against thread
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step-num">4</div>
            <CheckCircle2 size={20} color="var(--warning)" />
            <div className="workflow-step-title">Human Review</div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Approve, reject or flag status
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step-num">5</div>
            <Search size={20} color="var(--accent)" />
            <div className="workflow-step-title">Decision Intelligence</div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Grounded conversational Q&A
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step-num">6</div>
            <History size={20} color="var(--warning)" />
            <div className="workflow-step-title">Decision Evolution</div>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Trace reviewed changes in technical direction
            </p>
          </div>
        </div>
      </section>

      {/* ── Feature Showcase ────────────────────────────────── */}
      <section id="features" className="section-container" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-header">
          <div className="section-eyebrow">Capabilities</div>
          <h2 className="section-title">Engineered for technical precision.</h2>
          <p className="section-subtitle">
            Not just a generic LLM wrapper. METIS treats engineering decisions as first-class structured entities.
          </p>
        </div>

        <div className="cards-grid-3">
          <div className="editorial-card">
            <Layers size={24} color="var(--accent)" />
            <h3 className="editorial-title">Decision Extraction</h3>
            <p className="editorial-desc">
              Identifies technical proposals and categorizes their status as{" "}
              <strong>Accepted</strong>, <strong>Rejected</strong>,{" "}
              <strong>Proposed</strong>, or <strong>Unresolved</strong> with strict Pydantic schemas.
            </p>
          </div>

          <div className="editorial-card">
            <ShieldCheck size={24} color="var(--success)" />
            <h3 className="editorial-title">Independent Evidence Grounding</h3>
            <p className="editorial-desc">
              Every claim must cite real comments and author identities. The system
              never hallucinates references—every citation is validated against the raw thread.
            </p>
          </div>

          <div className="editorial-card">
            <Sparkles size={24} color="var(--accent)" />
            <h3 className="editorial-title">Decision Intelligence AI</h3>
            <p className="editorial-desc">
              Ask deep technical questions about why specific libraries or patterns were chosen.
              Receive concise answers that link directly back to the original GitHub discussions.
            </p>
          </div>

          <div className="editorial-card">
            <History size={24} color="var(--warning)" />
            <h3 className="editorial-title">Decision Evolution</h3>
            <p className="editorial-desc">
              Chronologically visualize how technical direction shifted over releases.
              Trace decisions that supersedes, refines, or contradicts earlier architectural choices.
            </p>
          </div>

          <div className="editorial-card">
            <History size={24} color="var(--warning)" />
            <h3 className="editorial-title">Decision Evolution</h3>
            <p className="editorial-desc">
              Follow chronological decision history and inspect reviewed relationships such as
              superseding, refining, and contradicting choices.
            </p>
          </div>

          <div className="editorial-card">
            <Code2 size={24} color="var(--accent)" />
            <h3 className="editorial-title">Open-Weight Inference</h3>
            <p className="editorial-desc">
              Powered by high-throughput open-weight models (Groq-hosted Qwen 27B) with local Ollama
              and deterministic rule-based fallbacks.
            </p>
          </div>
        </div>
      </section>

      {/* ── Architecture Section ────────────────────────────── */}
      <section id="architecture" className="section-container" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-header">
          <div className="section-eyebrow">Under The Hood</div>
          <h2 className="section-title">The METIS System Architecture</h2>
          <p className="section-subtitle">
            A production-ready stack designed for deterministic auditability and high-throughput decision extraction.
          </p>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "36px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "24px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <GitBranch size={16} color="var(--accent)" />
                <h4 style={{ fontSize: "14px", color: "var(--text)" }}>1. GitHub Ingestion</h4>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Normalizes issues, pull requests, and review comments. Preserves original author logins,
                timestamps, and permanent URLs.
              </p>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Database size={16} color="var(--accent)" />
                <h4 style={{ fontSize: "14px", color: "var(--text)" }}>2. PostgreSQL + pgvector</h4>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Relational schema stores decisions, evidence links, and review audits.
                Vector embeddings enable semantic similarity queries.
              </p>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Cpu size={16} color="var(--accent)" />
                <h4 style={{ fontSize: "14px", color: "var(--text)" }}>3. Fast Inference</h4>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Hosted Groq API with Qwen 27B open-weight model. Exponential backoff, jitter,
                and structured output schema validation.
              </p>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Layers size={16} color="var(--accent)" />
                <h4 style={{ fontSize: "14px", color: "var(--text)" }}>4. Next.js 15 UI</h4>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Dark-first dashboard shell with responsive sidebar, decision evolution timeline,
                real-time diagnostics, and audit workflow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Open Source Section ─────────────────────────────── */}
      <section id="open-source" className="section-container" style={{ borderTop: "1px solid var(--border)" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "40px",
            textAlign: "center",
          }}
        >
          <div className="section-eyebrow">Community & Transparency</div>
          <h2 style={{ fontSize: "28px", color: "var(--text)", marginBottom: "12px" }}>
            Free, Open Source, and Apache 2.0 Licensed
          </h2>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-muted)",
              maxWidth: "600px",
              margin: "0 auto 24px",
              lineHeight: 1.6,
            }}
          >
            METIS is built on open standards, transparent open-weight models,
            and an auditable architecture. No proprietary lock-in.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <button onClick={onLaunchApp} className="btn btn-primary">
              Launch App
              <ArrowRight size={14} />
            </button>
            <a
              href="https://github.com/Abhra0404/Open-Source-Decision-Intelligence-and-Knowledge-Recovery"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              <GithubIcon size={15} />
              Contribute on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="brand-link" onClick={onLaunchApp}>
              <img src="/logo.svg" alt="METIS" className="brand-logo-img" />
              <span className="brand-title">METIS</span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", maxWidth: "280px" }}>
              Remember the Why. Understand the Evolution.
            </p>
            <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Licensed under Apache License 2.0
            </span>
          </div>

          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
              Product
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
              <span style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={onLaunchApp}>
                Dashboard Overview
              </span>
              <span style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={onLaunchApp}>
                Decision Explorer
              </span>
              <span style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={onLaunchApp}>
                AI Assistant
              </span>
              <span style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={onLaunchApp}>
                Decision Evolution
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
              Team Dot
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
              <span>Abhra Jaiswal</span>
              <span>Ahmad Ibni Shafi</span>
              <span>Shreyas Hemant Mohite</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>
              Developers
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)" }}>
                FastAPI Swagger Docs ↗
              </a>
              <a href="https://github.com/Abhra0404/Open-Source-Decision-Intelligence-and-Knowledge-Recovery" target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)" }}>
                GitHub Repository ↗
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
