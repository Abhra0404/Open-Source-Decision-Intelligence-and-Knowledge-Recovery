"use client";

import React, { useState } from "react";
import {
  FolderGit2,
  ExternalLink,
  Search,
  Plus,
  GitBranch,
  MessagesSquare,
  FileCheck2,
  Calendar,
  Lock,
  Globe,
  Zap,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Repository } from "../types";

interface RepositoriesViewProps {
  repositories: Repository[];
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
  onConnectRepo: (url: string) => Promise<void>;
  isIngesting: boolean;
  statusMessage: string;
}

type SortOption = "name" | "decisions" | "discussions" | "recent";

export function RepositoriesView({
  repositories,
  selectedRepoId,
  onSelectRepo,
  onConnectRepo,
  isIngesting,
  statusMessage,
}: RepositoriesViewProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("decisions");
  const [filterBy, setFilterBy] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const DEFAULT_REPO = "pallets/click";
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);

  const filtered = repositories
    .filter((repo) => {
      const matchesSearch = repo.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(search.toLowerCase()));
      if (!matchesSearch) return false;

      if (filterBy === "with_decisions") return (repo.decisions_count ?? 0) > 0;
      if (filterBy === "with_discussions") return (repo.discussions_count ?? 0) > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "decisions") return (b.decisions_count ?? 0) - (a.decisions_count ?? 0);
      if (sortBy === "discussions") return (b.discussions_count ?? 0) - (a.discussions_count ?? 0);
      if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
      if (sortBy === "recent") {
        const dateA = a.last_ingested_at || a.created_at || "";
        const dateB = b.last_ingested_at || b.created_at || "";
        return dateB.localeCompare(dateA);
      }
      return 0;
    });

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    await onConnectRepo(repoUrl.trim());
    setRepoUrl(DEFAULT_REPO);
    setModalOpen(false);
  }

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
        <div style={{ display: "flex", gap: "10px", flex: 1, minWidth: "260px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: "240px", flex: 1 }}>
            <Search
              size={15}
              color="var(--text-dim)"
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              className="input"
              style={{ paddingLeft: "32px" }}
              placeholder="Search repositories by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ArrowUpDown size={14} color="var(--text-dim)" />
            <select
              className="repo-selector"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort repositories"
            >
              <option value="decisions">Sort: Most Decisions</option>
              <option value="discussions">Sort: Most Discussions</option>
              <option value="name">Sort: Name (A-Z)</option>
              <option value="recent">Sort: Recently Ingested</option>
            </select>
          </div>

          <select
            className="repo-selector"
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value)}
            aria-label="Filter repositories"
          >
            <option value="all">All Repositories</option>
            <option value="with_decisions">Has Recovered Decisions</option>
            <option value="with_discussions">Has Ingested Discussions</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} />
          Connect Repository
        </button>
      </div>

      {statusMessage && (
        <div
          style={{
            marginBottom: "16px",
            fontSize: "13px",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 14px",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <Zap size={14} />
          {statusMessage}
        </div>
      )}

      {/* ── Connect Modal ───────────────────────────────────── */}
      {modalOpen && (
        <div className="drawer-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="modal-box"
            style={{
              width: "480px",
              maxWidth: "92vw",
              margin: "auto",
              background: "var(--card)",
              border: "1px solid var(--border-focus)",
              borderRadius: "var(--radius)",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-header">
              <div className="panel-title">
                <FolderGit2 size={16} color="var(--accent)" />
                Connect New Repository
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="panel-body">
              <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    GitHub Repository URL or Slug
                  </label>
                  <input
                    className="input"
                    placeholder="https://github.com/pallets/click or owner/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    required
                  />
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  METIS will register this repository and begin indexing public issues, pull requests,
                  and code review threads for evidence-grounded decision extraction.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isIngesting}>
                    {isIngesting ? <span className="spinner" /> : <Plus size={14} />}
                    {isIngesting ? "Connecting…" : "Connect & Ingest"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Repositories Grid ────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="panel">
          <div className="state-empty">
            <FolderGit2 className="state-empty-icon" />
            <div className="state-empty-title">No repositories found</div>
            <div className="state-empty-desc">
              Connect a GitHub repository to begin recovering engineering decisions.
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} /> Connect Repository
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "16px",
          }}
        >
          {filtered.map((repo) => {
            const isSelected = repo.id === selectedRepoId;
            return (
              <div
                key={repo.id}
                className="panel"
                style={{
                  marginBottom: 0,
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                  boxShadow: isSelected ? "0 0 16px rgba(107, 159, 255, 0.15)" : "none",
                  transition: "all 0.18s var(--ease-out)",
                }}
              >
                <div className="panel-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                    {repo.is_private ? (
                      <Lock size={15} color="var(--warning)" style={{ flexShrink: 0 }} />
                    ) : (
                      <Globe size={15} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={repo.full_name}
                    >
                      {repo.full_name}
                    </span>
                  </div>
                  {isSelected ? (
                    <span className="badge badge-accepted" style={{ flexShrink: 0 }}>Active Context</span>
                  ) : repo.extraction_status ? (
                    <span
                      className={`badge ${
                        repo.extraction_status === "completed"
                          ? "badge-accepted"
                          : repo.extraction_status === "failed"
                          ? "badge-rejected"
                          : "badge-proposed"
                      }`}
                      style={{ flexShrink: 0 }}
                    >
                      {repo.extraction_status}
                    </span>
                  ) : null}
                </div>

                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                      minHeight: "40px",
                    }}
                  >
                    {repo.description || "No repository description provided on GitHub."}
                  </p>

                  {/* Real Stats Metrics */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                      background: "var(--surface)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                        Discussions
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <MessagesSquare size={13} color="var(--accent)" />
                        {repo.discussions_count ?? 0}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                        Decisions
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <FileCheck2 size={13} />
                        {repo.decisions_count ?? 0}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      fontSize: "11px",
                      color: "var(--text-dim)",
                      flexWrap: "wrap",
                    }}
                  >
                    {repo.default_branch && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <GitBranch size={12} />
                        <span>{repo.default_branch}</span>
                      </div>
                    )}
                    {repo.last_ingested_at ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} />
                        <span>Synced {new Date(repo.last_ingested_at).toLocaleDateString()}</span>
                      </div>
                    ) : repo.created_at ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Calendar size={12} />
                        <span>Added {new Date(repo.created_at).toLocaleDateString()}</span>
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "12px",
                      borderTop: "1px solid var(--border-light)",
                    }}
                  >
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: "4px 8px" }}
                    >
                      GitHub
                      <ExternalLink size={12} />
                    </a>

                    <button
                      className={`btn btn-sm ${isSelected ? "btn-secondary" : "btn-primary"}`}
                      onClick={() => onSelectRepo(repo.id)}
                    >
                      {isSelected ? "Active Context" : "Select Context"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
