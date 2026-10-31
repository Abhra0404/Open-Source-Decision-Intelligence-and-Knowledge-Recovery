"use client";

import React from "react";
import {
  RefreshCw,
  Zap,
  FolderGit2,
  Menu,
  Search,
} from "lucide-react";
import { Repository, AppView } from "../types";

interface HeaderProps {
  view: AppView;
  repositories: Repository[];
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
  onRefresh: () => void;
  onExtract: () => void;
  isExtracting: boolean;
  isIngesting: boolean;
  onToggleMobileNav?: () => void;
  onOpenCommandPalette?: () => void;
}

const VIEW_TITLES: Record<AppView, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "High-level metrics and recent decision activity",
  },
  repositories: {
    title: "Repositories",
    subtitle: "Manage and connect GitHub source repositories",
  },
  decisions: {
    title: "Engineering Decisions",
    subtitle: "Recovered architectural decisions, rationale, and evidence",
  },
  intelligence: {
    title: "Decision Intelligence",
    subtitle: "Evidence-grounded conversational assistant",
  },
  evolution: {
    title: "Decision Evolution",
    subtitle: "Chronological decision lineage and superseded paths",
  },
  "knowledge-graph": {
    title: "Knowledge Graph",
    subtitle: "Visual network of engineering decisions, dependencies, and lineage",
  },
  discussions: {
    title: "Source Discussions",
    subtitle: "Normalized GitHub issues, pull requests, and review comments",
  },
  diagnostics: {
    title: "Extraction & Diagnostics",
    subtitle: "Pipeline monitoring, token counts, and thread outcomes",
  },
  "model-config": {
    title: "Model Configuration",
    subtitle: "Inference provider settings and model capabilities",
  },
};

export function Header({
  view,
  repositories,
  selectedRepoId,
  onSelectRepo,
  onRefresh,
  onExtract,
  isExtracting,
  isIngesting,
  onToggleMobileNav,
  onOpenCommandPalette,
}: HeaderProps) {
  const meta = VIEW_TITLES[view] ?? { title: "Dashboard", subtitle: "" };

  return (
    <header className="app-header">
      <div className="header-left">
        {onToggleMobileNav && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onToggleMobileNav}
            style={{ display: "none" }}
          >
            <Menu size={18} />
          </button>
        )}

        <div>
          <div className="page-title">{meta.title}</div>
        </div>

        {/* Repository Context Selector */}
        {repositories.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px" }}>
            <FolderGit2 size={15} color="var(--accent)" />
            <select
              className="repo-selector"
              value={selectedRepoId}
              onChange={(e) => onSelectRepo(e.target.value)}
              aria-label="Active repository context"
            >
              <option value="">Select repository context...</option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="header-right">
        {/* Quick jump command palette trigger */}
        {onOpenCommandPalette && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onOpenCommandPalette}
            title="Open Command Palette (⌘K or Ctrl+K)"
            style={{
              padding: "5px 10px",
              color: "var(--text-muted)",
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <Search size={13} color="var(--accent)" />
            <span style={{ fontSize: "12px" }}>Quick Jump</span>
            <kbd
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "1px 5px",
                color: "var(--text-dim)",
              }}
            >
              ⌘K
            </kbd>
          </button>
        )}

        {/* Backend health pill */}
        <div className="header-status">
          <div className={`status-dot ${isExtracting || isIngesting ? "busy" : ""}`} />
          <span>{isExtracting ? "Extracting" : isIngesting ? "Ingesting" : "Connected"}</span>
        </div>

        {selectedRepoId && (
          <>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onRefresh}
              title="Refresh repository data"
              disabled={isExtracting || isIngesting}
            >
              <RefreshCw size={13} className={isExtracting || isIngesting ? "spinner" : ""} />
              Refresh
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={onExtract}
              disabled={isExtracting}
              title="Trigger evidence-backed decision extraction"
            >
              <Zap size={13} />
              {isExtracting ? "Extracting…" : "Extract Decisions"}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
