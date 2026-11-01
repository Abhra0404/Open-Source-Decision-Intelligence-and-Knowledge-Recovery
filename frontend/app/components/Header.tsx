"use client";

import React from "react";
import {
  RefreshCw,
  FolderGit2,
  Menu,
  Home,
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
  onGoHome?: () => void;
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
  onGoHome,
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
        {/* Home navigation button */}
        {onGoHome && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onGoHome}
            title="Return to Public Landing Page"
            style={{
              padding: "5px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--text)",
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <Home size={14} color="var(--accent)" />
            <span>Home</span>
          </button>
        )}

        {/* Backend health pill */}
        <div className="header-status">
          <div className={`status-dot ${isExtracting || isIngesting ? "busy" : ""}`} />
          <span>{isExtracting ? "Extracting" : isIngesting ? "Ingesting" : "Connected"}</span>
        </div>

        {selectedRepoId && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onRefresh}
            title="Refresh repository data"
            disabled={isExtracting || isIngesting}
          >
            <RefreshCw size={13} className={isExtracting || isIngesting ? "spinner" : ""} />
            Refresh
          </button>
        )}
      </div>
    </header>
  );
}
