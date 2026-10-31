"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Network,
  Filter,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  Info,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { DecisionGraph, DecisionRelationship, DecisionStatus } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface KnowledgeGraphViewProps {
  repositoryId: string;
  onSelectDecision: (id: string) => void;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  supersedes: "#A78BFA",
  refines: "#38BDF8",
  depends_on: "#34D399",
  contradicts: "#F87171",
  related_to: "#60A5FA",
};

const STATUS_COLORS: Record<DecisionStatus, string> = {
  accepted: "#34D399",
  rejected: "#F87171",
  proposed: "#818CF8",
  unresolved: "#FBBF24",
};

export function KnowledgeGraphView({
  repositoryId,
  onSelectDecision,
}: KnowledgeGraphViewProps) {
  const [graphData, setGraphData] = useState<DecisionGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [relFilter, setRelFilter] = useState<string>("all");
  const [includePending, setIncludePending] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selection & Inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<DecisionRelationship | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Propose Relationships
  const [isProposing, setIsProposing] = useState(false);
  const [proposeMessage, setProposeMessage] = useState<string | null>(null);

  // Relationship Review
  const [isReviewingEdge, setIsReviewingEdge] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  // Canvas Transform (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Interactive Node Positions & Dragging
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Fetch graph data
  const loadGraph = useCallback(() => {
    if (!repositoryId) return;
    setLoading(true);

    const query = new URLSearchParams();
    query.set("include_pending", String(includePending));
    if (statusFilter !== "all") query.set("status", statusFilter);
    if (relFilter !== "all") query.set("relationship_type", relFilter);

    fetch(`${API}/repositories/${repositoryId}/decision-graph?${query}`)
      .then((res) => res.json())
      .then((data: DecisionGraph) => {
        setGraphData(data);
        initializePositions(data.nodes);
      })
      .catch(() => setGraphData(null))
      .finally(() => setLoading(false));
  }, [repositoryId, includePending, statusFilter, relFilter]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Initial layout calculation: circular/layered placement
  function initializePositions(nodes: DecisionGraph["nodes"]) {
    if (!nodes || nodes.length === 0) return;
    const positions: Record<string, { x: number; y: number }> = {};
    const width = 850;
    const height = 550;
    const centerX = width / 2;
    const centerY = height / 2;

    if (nodes.length === 1) {
      positions[nodes[0].id] = { x: centerX, y: centerY };
    } else {
      const radius = Math.min(centerX, centerY) * 0.72;
      nodes.forEach((node, idx) => {
        const angle = (idx / nodes.length) * 2 * Math.PI - Math.PI / 2;
        const jitter = (idx % 2 === 0 ? 1 : 0.82);
        positions[node.id] = {
          x: centerX + Math.cos(angle) * radius * jitter,
          y: centerY + Math.sin(angle) * radius * jitter,
        };
      });
    }
    setNodePositions(positions);
  }

  // Handle Proposing Relationships via LLM
  async function handleProposeRelationships() {
    if (!repositoryId || isProposing) return;
    setIsProposing(true);
    setProposeMessage(null);
    try {
      const res = await fetch(`${API}/repositories/${repositoryId}/decision-relationships/propose`, {
        method: "POST",
      });
      const data = await res.json();
      setProposeMessage(`Discovered ${data.total ?? 0} relationships using ${data.model ?? "Qwen 27B"}.`);
      loadGraph();
    } catch {
      setProposeMessage("Failed to propose relationships. Check model configuration.");
    } finally {
      setIsProposing(false);
    }
  }

  // Handle Relationship Review (approve, reject, request_review)
  async function handleReviewRelationship(action: "approve" | "reject" | "request_review") {
    if (!selectedEdge || isReviewingEdge) return;
    setIsReviewingEdge(true);
    try {
      const res = await fetch(`${API}/decision-relationships/${selectedEdge.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: reviewNote.trim() || undefined }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedEdge((prev) => (prev ? { ...prev, review_status: updated.review_status } : null));
        setReviewNote("");
        loadGraph();
      }
    } catch {
      // keep silent
    } finally {
      setIsReviewingEdge(false);
    }
  }

  // Pan and Zoom handlers
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.min(Math.max(prev * factor, 0.4), 2.8));
  }

  function handleMouseDownSvg(e: React.MouseEvent) {
    if (e.target === svgRef.current || (e.target as HTMLElement).tagName === "svg") {
      setIsPanning(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }

  function handleMouseMoveSvg(e: React.MouseEvent) {
    if (isPanning) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (draggingNodeId && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNodeId]: {
          x: mouseX - nodeDragOffset.x,
          y: mouseY - nodeDragOffset.y,
        },
      }));
    }
  }

  function handleMouseUpSvg() {
    setIsPanning(false);
    setDraggingNodeId(null);
  }

  function handleStartDragNode(nodeId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const pos = nodePositions[nodeId];
    if (!pos || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    setDraggingNodeId(nodeId);
    setNodeDragOffset({
      x: mouseX - pos.x,
      y: mouseY - pos.y,
    });
  }

  // Highlight matches
  const filteredNodes = useMemo(() => {
    if (!graphData?.nodes) return [];
    if (!searchQuery.trim()) return graphData.nodes;
    const q = searchQuery.toLowerCase();
    return graphData.nodes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q)
    );
  }, [graphData?.nodes, searchQuery]);

  const matchingNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const selectedNode = useMemo(() => {
    return graphData?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [graphData?.nodes, selectedNodeId]);

  return (
    <div className="view-container">
      {/* ── Graph Toolbar ────────────────────────────────────── */}
      <div
        className="panel"
        style={{
          padding: "12px 18px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Network size={16} color="var(--accent)" />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
            Knowledge Graph
          </span>
        </div>

        {/* Search */}
        <div style={{ position: "relative", minWidth: "220px", flex: 1, maxWidth: "340px" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dim)",
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: "32px", height: "34px", fontSize: "13px" }}
            placeholder="Search decisions or keywords…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filters */}
        <select
          className="repo-selector"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ height: "34px", fontSize: "12px" }}
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
          style={{ height: "34px", fontSize: "12px" }}
        >
          <option value="all">All Relationships</option>
          <option value="supersedes">Supersedes</option>
          <option value="refines">Refines</option>
          <option value="depends_on">Depends On</option>
          <option value="contradicts">Contradicts</option>
          <option value="related_to">Related To</option>
        </select>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: "var(--text-muted)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={includePending}
            onChange={(e) => setIncludePending(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Include Pending
        </label>

        {/* Propose Relationships action */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleProposeRelationships}
          disabled={isProposing}
          title="Run Groq/Qwen 27B model to discover new architectural relationships"
        >
          {isProposing ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />}
          <span>{isProposing ? "Proposing…" : "Propose Relationships"}</span>
        </button>

        {/* Zoom Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom((z) => Math.min(z * 1.15, 2.8))}
            title="Zoom In"
            style={{ padding: "6px" }}
          >
            <ZoomIn size={15} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom((z) => Math.max(z * 0.85, 0.4))}
            title="Zoom Out"
            style={{ padding: "6px" }}
          >
            <ZoomOut size={15} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Reset View"
            style={{ padding: "6px" }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {proposeMessage && (
        <div
          style={{
            marginBottom: "14px",
            padding: "8px 14px",
            background: "rgba(107, 159, 255, 0.1)",
            border: "1px solid rgba(107, 159, 255, 0.25)",
            borderRadius: "6px",
            fontSize: "13px",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{proposeMessage}</span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: "2px 6px", fontSize: "11px" }}
            onClick={() => setProposeMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Main Canvas & Inspector Layout ────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: selectedNode || selectedEdge ? "1fr 340px" : "1fr", gap: "16px" }}>
        {/* SVG Interactive Canvas */}
        <div
          className="panel"
          style={{
            position: "relative",
            minHeight: "560px",
            overflow: "hidden",
            cursor: isPanning ? "grabbing" : "grab",
            background: "radial-gradient(ellipse at 50% 50%, #151B27 0%, #090B10 100%)",
          }}
          onMouseDown={handleMouseDownSvg}
          onMouseMove={handleMouseMoveSvg}
          onMouseUp={handleMouseUpSvg}
          onWheel={handleWheel}
        >
          {loading ? (
            <div className="state-empty" style={{ height: "100%", minHeight: "480px" }}>
              <span className="spinner" style={{ width: "28px", height: "28px" }} />
              <div>Computing graph relationships…</div>
            </div>
          ) : !graphData || graphData.nodes.length === 0 ? (
            <div className="state-empty" style={{ height: "100%", minHeight: "480px" }}>
              <Network className="state-empty-icon" />
              <div className="state-empty-title">No graph data for this repository</div>
              <div className="state-empty-desc">
                Extract decisions or propose relationships to build an interactive engineering graph.
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width="100%"
              height="560"
              style={{ display: "block" }}
            >
              <defs>
                {/* Arrow markers for directed edges */}
                {Object.entries(RELATIONSHIP_COLORS).map(([type, color]) => (
                  <marker
                    key={type}
                    id={`arrow-${type}`}
                    viewBox="0 0 10 10"
                    refX="22"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={color} />
                  </marker>
                ))}
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* ── Relationship Edges ──────────────────────── */}
                {graphData.edges.map((edge) => {
                  const sourcePos = nodePositions[edge.source_decision_id];
                  const targetPos = nodePositions[edge.target_decision_id];
                  if (!sourcePos || !targetPos) return null;

                  const color = RELATIONSHIP_COLORS[edge.relationship_type] ?? "var(--border-strong)";
                  const isHovered = hoveredEdgeId === edge.id;
                  const isSelected = selectedEdge?.id === edge.id;
                  const strokeWidth = isSelected ? 3 : isHovered ? 2.5 : 1.6;
                  const strokeDasharray =
                    edge.relationship_type === "refines" || edge.relationship_type === "related_to"
                      ? "5 4"
                      : edge.relationship_type === "contradicts"
                      ? "3 3"
                      : undefined;

                  const midX = (sourcePos.x + targetPos.x) / 2;
                  const midY = (sourcePos.y + targetPos.y) / 2;

                  return (
                    <g key={edge.id}>
                      <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={targetPos.x}
                        y2={targetPos.y}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        strokeOpacity={isSelected ? 1 : isHovered ? 0.95 : 0.65}
                        markerEnd={`url(#arrow-${edge.relationship_type})`}
                        style={{ cursor: "pointer", transition: "stroke-width 0.15s ease" }}
                        onMouseEnter={() => setHoveredEdgeId(edge.id)}
                        onMouseLeave={() => setHoveredEdgeId(null)}
                        onClick={() => {
                          setSelectedEdge(edge);
                          setSelectedNodeId(null);
                        }}
                      />

                      {/* Edge relationship badge */}
                      <g
                        transform={`translate(${midX}, ${midY})`}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setSelectedEdge(edge);
                          setSelectedNodeId(null);
                        }}
                      >
                        <rect
                          x="-36"
                          y="-10"
                          width="72"
                          height="20"
                          rx="10"
                          fill="#0D1017"
                          stroke={color}
                          strokeWidth="1"
                          opacity={isSelected ? 1 : 0.9}
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fill={color}
                          fontSize="9"
                          fontWeight="700"
                          fontFamily="var(--font-mono)"
                        >
                          {edge.relationship_type}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* ── Decision Nodes ─────────────────────────── */}
                {graphData.nodes.map((node) => {
                  const pos = nodePositions[node.id];
                  if (!pos) return null;

                  const isSelected = selectedNodeId === node.id;
                  const isHovered = hoveredNodeId === node.id;
                  const isMatched = matchingNodeIds.has(node.id);
                  const statusColor = STATUS_COLORS[node.status] ?? "var(--accent)";

                  const opacity = searchQuery.trim() && !isMatched ? 0.35 : 1;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      opacity={opacity}
                      style={{ cursor: draggingNodeId === node.id ? "grabbing" : "grab" }}
                      onMouseDown={(e) => handleStartDragNode(node.id, e)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                        setSelectedEdge(null);
                      }}
                    >
                      {/* Outer pulse / glow for selected node */}
                      {isSelected && (
                        <circle
                          r="44"
                          fill="none"
                          stroke={statusColor}
                          strokeWidth="2"
                          strokeOpacity="0.4"
                          strokeDasharray="4 4"
                        />
                      )}

                      {/* Main node card body */}
                      <rect
                        x="-70"
                        y="-26"
                        width="140"
                        height="52"
                        rx="10"
                        fill="#121722"
                        stroke={isSelected ? statusColor : isHovered ? "var(--text-muted)" : "var(--border)"}
                        strokeWidth={isSelected ? 2 : 1.2}
                        filter="drop-shadow(0 4px 10px rgba(0,0,0,0.5))"
                      />

                      {/* Status indicator dot */}
                      <circle
                        cx="-54"
                        cy="0"
                        r="5"
                        fill={statusColor}
                      />

                      {/* Title label */}
                      <text
                        x="-42"
                        y="-4"
                        fill="var(--text)"
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="var(--font-sans)"
                      >
                        {node.title.length > 15 ? node.title.slice(0, 14) + "…" : node.title}
                      </text>

                      {/* Metadata label */}
                      <text
                        x="-42"
                        y="12"
                        fill="var(--text-dim)"
                        fontSize="9"
                        fontFamily="var(--font-mono)"
                      >
                        {node.status} · {node.confidence !== null ? `${Math.round(node.confidence * 100)}%` : "conf: —"}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Graph Legend overlay */}
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "14px",
              background: "rgba(13, 16, 23, 0.85)",
              backdropFilter: "blur(8px)",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              fontSize: "11px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
              Graph Legend
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLORS.accepted }} />
                Accepted
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLORS.rejected }} />
                Rejected
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLORS.proposed }} />
                Proposed
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
              {Object.entries(RELATIONSHIP_COLORS).map(([type, color]) => (
                <span key={type} style={{ display: "flex", alignItems: "center", gap: "4px", color }}>
                  <span style={{ width: "12px", height: "2px", background: color }} />
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Selection Detail Drawer / Inspector ───────────── */}
        {selectedNode && (
          <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ paddingBottom: "10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span className={`badge badge-${selectedNode.status}`}>{selectedNode.status}</span>
                  <span className={`badge badge-${selectedNode.review_status}`}>{selectedNode.review_status}</span>
                </div>
                <div className="panel-title" style={{ fontSize: "15px" }}>
                  {selectedNode.title}
                </div>
              </div>
            </div>

            <div className="panel-body" style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Summary
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {selectedNode.summary}
                </p>
              </div>

              {selectedNode.confidence !== null && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "4px" }}>
                    Confidence Score
                  </div>
                  <div style={{ fontSize: "14px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>
                    {Math.round(selectedNode.confidence * 100)}%
                  </div>
                </div>
              )}

              <div style={{ marginTop: "20px" }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: "100%" }}
                  onClick={() => onSelectDecision(selectedNode.id)}
                >
                  Inspect Full Decision & Evidence
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedEdge && (
          <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ paddingBottom: "10px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span
                    className="badge"
                    style={{
                      background: "rgba(167, 139, 250, 0.15)",
                      color: RELATIONSHIP_COLORS[selectedEdge.relationship_type] ?? "var(--purple)",
                      border: "1px solid rgba(167, 139, 250, 0.3)",
                    }}
                  >
                    {selectedEdge.relationship_type}
                  </span>
                  <span className={`badge badge-${selectedEdge.review_status}`}>
                    {selectedEdge.review_status}
                  </span>
                </div>
                <div className="panel-title" style={{ fontSize: "14px" }}>
                  Edge Relationship Audit
                </div>
              </div>
            </div>

            <div className="panel-body" style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Source Decision
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                  {selectedEdge.source_title ?? selectedEdge.source_decision_id}
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Target Decision
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                  {selectedEdge.target_title ?? selectedEdge.target_decision_id}
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Relationship Explanation
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {selectedEdge.explanation || "No explanation recorded."}
                </p>
              </div>

              {selectedEdge.confidence !== undefined && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "4px" }}>
                    Confidence
                  </div>
                  <div style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                    {Math.round(selectedEdge.confidence * 100)}%
                  </div>
                </div>
              )}

              {/* Maintainer Audit Actions */}
              <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "8px" }}>
                  Maintainer Review Audit
                </div>

                <input
                  className="input"
                  style={{ height: "32px", fontSize: "12px", marginBottom: "10px" }}
                  placeholder="Optional review note…"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  disabled={isReviewingEdge}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: "var(--success)" }}
                    onClick={() => handleReviewRelationship("approve")}
                    disabled={isReviewingEdge}
                  >
                    <CheckCircle2 size={13} />
                    Approve
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: "var(--danger)" }}
                    onClick={() => handleReviewRelationship("reject")}
                    disabled={isReviewingEdge}
                  >
                    <XCircle size={13} />
                    Reject
                  </button>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: "100%", marginTop: "6px" }}
                  onClick={() => handleReviewRelationship("request_review")}
                  disabled={isReviewingEdge}
                >
                  <HelpCircle size={13} />
                  Mark Needs Review
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
