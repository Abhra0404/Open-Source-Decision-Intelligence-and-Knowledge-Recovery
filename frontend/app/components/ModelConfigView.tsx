"use client";

import React, { useState, useEffect } from "react";
import {
  Sliders,
  Cpu,
  ShieldCheck,
  Server,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { ModelConfig } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export function ModelConfigView() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/system/model-config`);
      if (!res.ok) throw new Error("Could not fetch model configuration");
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error loading config");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <div>
      {/* ── Model Overview Card ──────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Cpu size={16} color="var(--accent)" />
            Active Inference Architecture
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadConfig}>
            <RefreshCw size={13} className={loading ? "spinner" : ""} /> Refresh
          </button>
        </div>

        <div className="panel-body">
          {loading ? (
            <div className="state-empty">
              <span className="spinner" style={{ width: "24px", height: "24px" }} />
              <div>Fetching backend provider settings…</div>
            </div>
          ) : errorMsg ? (
            <div className="state-empty" style={{ color: "var(--error)" }}>
              <AlertCircle size={32} />
              <div>{errorMsg}</div>
            </div>
          ) : config ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    background: "var(--surface)",
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                    Active Provider
                  </span>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--accent)", marginTop: "4px" }}>
                    {config.provider.toUpperCase()}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {config.provider === "groq"
                      ? "High-throughput hosted open-weight inference"
                      : config.provider === "ollama"
                      ? "Local open-weight fallback"
                      : "Deterministic rule-based baseline"}
                  </span>
                </div>

                <div
                  style={{
                    background: "var(--surface)",
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                    Configured Model
                  </span>
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      marginTop: "4px",
                    }}
                  >
                    {config.model_name}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Open-weight weights evaluated for structured extraction
                  </span>
                </div>

                <div
                  style={{
                    background: "var(--surface)",
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                    Inference Base URL
                  </span>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      marginTop: "6px",
                      wordBreak: "break-all",
                    }}
                  >
                    {config.base_url}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Timeout: {config.timeout_seconds}s · Max retries: {config.groq_max_retries}
                  </span>
                </div>

                <div
                  style={{
                    background: "var(--surface)",
                    padding: "16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                    Authentication Status
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "6px",
                      color: config.has_api_key ? "var(--success)" : "var(--warning)",
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {config.has_api_key ? "Key Configured (.env)" : "Local / Unauthenticated"}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                    Secret keys are securely managed by the server
                  </span>
                </div>
              </div>

              {/* Supported Pipeline Capabilities */}
              <div
                style={{
                  background: "var(--surface)",
                  padding: "18px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: "10px" }}>
                  Supported Pipeline Capabilities
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {config.capabilities.map((cap, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "6px 12px",
                        background: "var(--card)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-light)",
                        fontSize: "12px",
                        color: "var(--text)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <CheckCircle2 size={13} color="var(--success)" />
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Security Transparency Notice ────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Lock size={16} color="var(--success)" />
            Security & Compliance Architecture
          </div>
        </div>
        <div className="panel-body">
          <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            METIS follows an air-gapped credential design. API keys (`GROQ_API_KEY`, `GITHUB_TOKEN`)
            are resolved exclusively on the server at startup and are never exposed in frontend bundles,
            HTTP response bodies, or client debugging tools.
          </p>
        </div>
      </div>
    </div>
  );
}
