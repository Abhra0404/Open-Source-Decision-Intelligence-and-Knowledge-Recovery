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

export function RepositoriesView({
  repositories,
  selectedRepoId,
  onSelectRepo,
  onConnectRepo,
  isIngesting,
  statusMessage,
}: RepositoriesViewProps) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  const filtered = repositories.filter((repo) =>
    repo.full_name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    await onConnectRepo(repoUrl.trim());
    setRepoUrl("");
    setModalOpen(false);
  }

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", minWidth: "260px", flex: 1, maxWidth: "420px" }}>
          <Search
            size={15}
            color="var(--text-dim)"
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            className="input"
            style={{ paddingLeft: "36px" }}
            placeholder="Search connected repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
            className="panel"
            style={{
              width: "480px",
              maxWidth: "92vw",
              margin: "auto",
              position: "relative",
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
                    GitHub Repository URL
                  </label>
                  <input
                    className="input"
                    placeholder="https://github.com/facebook/react or pallets/flask"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    required
                  />
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                  METIS will register this repository and begin indexing public issues, PRs, and discussion threads.
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
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
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
                  transition: "all 0.15s ease",
                }}
              >
                <div className="panel-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {repo.is_private ? (
                      <Lock size={15} color="var(--warning)" />
                    ) : (
                      <Globe size={15} color="var(--text-dim)" />
                    )}
                    <span style={{ fontWeight: 600, fontSize: "15px", color: "var(--text)" }}>
                      {repo.full_name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="badge badge-accepted">Active Context</span>
                  )}
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

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      fontSize: "12px",
                      color: "var(--text-dim)",
                      flexWrap: "wrap",
                    }}
                  >
                    {repo.default_branch && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <GitBranch size={13} />
                        <span>{repo.default_branch}</span>
                      </div>
                    )}
                    {repo.created_at && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Calendar size={13} />
                        <span>{new Date(repo.created_at).toLocaleDateString()}</span>
                      </div>
                    )}
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
                      {isSelected ? "Selected" : "Set Active"}
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
