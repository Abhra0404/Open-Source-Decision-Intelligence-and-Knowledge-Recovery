"use client";

import React, { useState, useEffect } from "react";
import {
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { DecisionGraph, DecisionRelationship } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface KnowledgeGraphViewProps {
  repositoryId: string;
  onSelectDecision: (id: string) => void;
}

export function KnowledgeGraphView({
  repositoryId,
  onSelectDecision,
}: KnowledgeGraphViewProps) {
  const [graph, setGraph] = useState<DecisionGraph | null>(null);
  const [includePending, setIncludePending] = useState(true);
  const [relTypeFilter, setRelTypeFilter] = useState("all");
  const [selectedEdge, setSelectedEdge] = useState<DecisionRelationship | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(1);

  async function loadGraph() {
    if (!repositoryId) return;
    setLoading(true);
    const params = new URLSearchParams({ include_pending: String(includePending) });
    if (relTypeFilter !== "all") params.set("relationship_type", relTypeFilter);

    try {
      const res = await fetch(`${API}/repositories/${repositoryId}/decision-graph?${params}`);
      const data = await res.json();
      setGraph(data);
    } catch (err) {
      setMessage("Failed to load knowledge graph");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGraph();
  }, [repositoryId, includePending, relTypeFilter]);

  async function handleProposeRelationships() {
    if (!repositoryId || proposing) return;
    setProposing(true);
    setMessage("Analyzing decisions to infer architectural relationships…");
    try {
      const res = await fetch(
        `${API}/repositories/${repositoryId}/decision-relationships/propose`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.error?.message ?? "Relationship proposal failed");
      setMessage(`Generated ${data.total ?? 0} relationship proposals.`);
      loadGraph();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error proposing relationships");
    } finally {
      setProposing(false);
    }
  }

  async function handleReviewEdge(action: "approve" | "reject" | "request_review") {
    if (!selectedEdge) return;
    const note = window.prompt(`Optional note for relationship ${action}:`) ?? undefined;
    try {
      const res = await fetch(`${API}/decision-relationships/${selectedEdge.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) throw new Error("Review action failed");
      setSelectedEdge(null);
      loadGraph();
    } catch (err) {
      setMessage("Failed to record relationship review");
    }
  }

  // Calculate layout coordinates for nodes
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  // Radial / grid node positioning
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, idx) => {
    const cols = 4;
    const x = 140 + (idx % cols) * 230;
    const y = 100 + Math.floor(idx / cols) * 160;
    positions.set(node.id, { x, y });
  });

  const svgWidth = Math.max(960, 200 + 4 * 230);
  const svgHeight = Math.max(540, 160 + Math.ceil(nodes.length / 4) * 160);

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div
        className="panel"
        style={{
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Network size={16} color="var(--purple)" />
            <span style={{ fontSize: "13px", fontWeight: 600 }}>Graph Filters:</span>
          </div>

          <label
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={includePending}
              onChange={(e) => setIncludePending(e.target.checked)}
            />
            Include Pending Review
          </label>

          <select
            className="repo-selector"
            value={relTypeFilter}
            onChange={(e) => setRelTypeFilter(e.target.value)}
          >
            <option value="all">All Relationship Types</option>
            <option value="supersedes">Supersedes</option>
            <option value="refines">Refines</option>
            <option value="depends_on">Depends On</option>
            <option value="contradicts">Contradicts</option>
            <option value="related_to">Related To</option>
          </select>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={handleProposeRelationships}
          disabled={proposing || !repositoryId}
        >
          {proposing ? <span className="spinner" /> : <Sparkles size={14} />}
          {proposing ? "Inference Running…" : "Propose Relationships"}
        </button>
      </div>

      {message && (
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
          {message}
        </div>
      )}

      {/* ── Interactive Graph Canvas ────────────────────────── */}
      <div className="graph-canvas-container">
        {/* Controls Overlay */}
        <div className="graph-controls-overlay">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom(1)}
            title="Reset Zoom"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Legend Overlay */}
        <div className="graph-legend-overlay">
          <span style={{ color: "var(--purple)" }}>― Supersedes</span>
          <span style={{ color: "var(--accent)" }}>― Refines</span>
          <span style={{ color: "var(--warning)" }}>┄ Pending</span>
          <span style={{ color: "var(--success)" }}>● Accepted</span>
          <span style={{ color: "var(--error)" }}>● Rejected</span>
        </div>

        {loading ? (
          <div className="state-empty" style={{ margin: "140px auto" }}>
            <span className="spinner" style={{ width: "24px", height: "24px" }} />
            <div>Rendering topological knowledge graph…</div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="state-empty" style={{ margin: "140px auto" }}>
            <Network size={36} color="var(--purple)" />
            <div className="state-empty-title">Graph is empty</div>
            <div className="state-empty-desc">
              Extract decisions and click &ldquo;Propose Relationships&rdquo; to build
              an evidence-grounded architectural dependency network.
            </div>
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
            <svg
              style={{
                width: svgWidth,
                height: svgHeight,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                transition: "transform 0.15s ease",
              }}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="36"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B9FFF" />
                </marker>
              </defs>

              {/* Render edges */}
              {edges.map((edge) => {
                const src = positions.get(edge.source_decision_id);
                const tgt = positions.get(edge.target_decision_id);
                if (!src || !tgt) return null;

                const isSelected = selectedEdge?.id === edge.id;
                const strokeColor =
                  edge.relationship_type === "supersedes"
                    ? "#A78BFA"
                    : edge.relationship_type === "refines"
                    ? "#6B9FFF"
                    : "#E5AE55";

                return (
                  <g
                    key={edge.id}
                    onClick={() => setSelectedEdge(edge)}
                    style={{ cursor: "pointer" }}
                  >
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3.5 : 2}
                      strokeDasharray={edge.review_status === "pending" ? "5,4" : undefined}
                      markerEnd="url(#arrow)"
                    />
                    <rect
                      x={(src.x + tgt.x) / 2 - 40}
                      y={(src.y + tgt.y) / 2 - 12}
                      width="80"
                      height="18"
                      rx="4"
                      fill="#121722"
                      stroke="#252D3B"
                    />
                    <text
                      x={(src.x + tgt.x) / 2}
                      y={(src.y + tgt.y) / 2 + 1}
                      fill="var(--text-muted)"
                      fontSize="10"
                      textAnchor="middle"
                      style={{ textTransform: "capitalize" }}
                    >
                      {edge.relationship_type.replace(/_/g, " ")}
                    </text>
                  </g>
                );
              })}

              {/* Render nodes */}
              {nodes.map((node) => {
                const pt = positions.get(node.id);
                if (!pt) return null;

                const statusColor =
                  node.status === "accepted"
                    ? "#39B980"
                    : node.status === "rejected"
                    ? "#E16B75"
                    : "#6B9FFF";

                return (
                  <g
                    key={node.id}
                    onClick={() => onSelectDecision(node.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="28"
                      fill="#151B27"
                      stroke={statusColor}
                      strokeWidth="2.5"
                    />
                    <text
                      x={pt.x}
                      y={pt.y + 4}
                      fill="#E8EDF5"
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      D
                    </text>
                    <text
                      x={pt.x}
                      y={pt.y + 42}
                      fill="var(--text)"
                      fontSize="11"
                      textAnchor="middle"
                      style={{
                        paintOrder: "stroke",
                        stroke: "#090B10",
                        strokeWidth: 3,
                      }}
                    >
                      {node.title.length > 24 ? node.title.slice(0, 24) + "…" : node.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* ── Selected Edge Inspector Drawer ──────────────────── */}
      {selectedEdge && (
        <div className="panel" style={{ marginTop: "20px" }}>
          <div className="panel-header">
            <div className="panel-title">
              <Network size={16} color="var(--purple)" />
              Relationship Audit: {selectedEdge.relationship_type.toUpperCase()}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedEdge(null)}
            >
              ✕
            </button>
          </div>
          <div className="panel-body">
            <p style={{ fontSize: "14px", color: "var(--text)", marginBottom: "12px", lineHeight: 1.6 }}>
              {selectedEdge.explanation}
            </p>

            <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-dim)", marginBottom: "16px" }}>
              <span>
                Confidence: <strong>{Math.round(selectedEdge.confidence * 100)}%</strong>
              </span>
              <span>
                Review status: <span className={`badge badge-${selectedEdge.review_status}`}>{selectedEdge.review_status}</span>
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: "var(--success)" }}
                onClick={() => handleReviewEdge("approve")}
              >
                <Check size={14} /> Approve Edge
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: "var(--error)" }}
                onClick={() => handleReviewEdge("reject")}
              >
                <X size={14} /> Reject Edge
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: "var(--warning)" }}
                onClick={() => handleReviewEdge("request_review")}
              >
                <AlertCircle size={14} /> Request Maintainer Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
