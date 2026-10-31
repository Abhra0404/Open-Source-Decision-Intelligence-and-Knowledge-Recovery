"use client";

import React from "react";
import {
  LayoutDashboard,
  FolderGit2,
  FileCheck2,
  Sparkles,
  History,
  Network,
  MessagesSquare,
  Activity,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Home,
} from "lucide-react";
import { AppView } from "../types";

interface SidebarProps {
  view: AppView;
  setView: (v: AppView) => void;
  counts: {
    repositories: number;
    decisions: number;
    discussions: number;
    diagnostics: number;
  };
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGoToLanding: () => void;
}

export function Sidebar({
  view,
  setView,
  counts,
  collapsed,
  onToggleCollapse,
  onGoToLanding,
}: SidebarProps) {
  return (
    <aside className={`app-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <button className="brand-link" onClick={() => setView("overview")}>
          <img src="/logo.svg" alt="METIS" className="brand-logo-img" />
          {!collapsed && (
            <div className="brand-text">
              <span className="brand-title">METIS</span>
              <span className="brand-badge">Intelligence</span>
            </div>
          )}
        </button>

        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "4px" }}
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="sidebar-nav">
        {/* Workspace */}
        <div className="nav-group">
          {!collapsed && <div className="nav-group-label">Workspace</div>}
          <button
            className={`nav-link ${view === "overview" ? "active" : ""}`}
            onClick={() => setView("overview")}
            title="Overview Dashboard"
          >
            <LayoutDashboard className="nav-link-icon" size={17} />
            {!collapsed && <span>Overview</span>}
          </button>
          <button
            className={`nav-link ${view === "repositories" ? "active" : ""}`}
            onClick={() => setView("repositories")}
            title="Repository Explorer"
          >
            <FolderGit2 className="nav-link-icon" size={17} />
            {!collapsed && <span>Repositories</span>}
            {!collapsed && counts.repositories > 0 && (
              <span className="nav-pill">{counts.repositories}</span>
            )}
          </button>
        </div>

        {/* Intelligence */}
        <div className="nav-group">
          {!collapsed && <div className="nav-group-label">Intelligence</div>}
          <button
            className={`nav-link ${view === "decisions" ? "active" : ""}`}
            onClick={() => setView("decisions")}
            title="Engineering Decisions"
          >
            <FileCheck2 className="nav-link-icon" size={17} />
            {!collapsed && <span>Decisions</span>}
            {!collapsed && counts.decisions > 0 && (
              <span className="nav-pill">{counts.decisions}</span>
            )}
          </button>
          <button
            className={`nav-link ${view === "intelligence" ? "active" : ""}`}
            onClick={() => setView("intelligence")}
            title="Decision Intelligence AI Assistant"
          >
            <Sparkles className="nav-link-icon" size={17} />
            {!collapsed && <span>AI Assistant</span>}
          </button>
          <button
            className={`nav-link ${view === "evolution" ? "active" : ""}`}
            onClick={() => setView("evolution")}
            title="Decision Evolution Timeline"
          >
            <History className="nav-link-icon" size={17} />
            {!collapsed && <span>Evolution</span>}
          </button>
          <button
            className={`nav-link ${view === "knowledge-graph" ? "active" : ""}`}
            onClick={() => setView("knowledge-graph")}
            title="Interactive Knowledge Graph"
          >
            <Network className="nav-link-icon" size={17} />
            {!collapsed && <span>Knowledge Graph</span>}
          </button>
        </div>

        {/* Operations */}
        <div className="nav-group">
          {!collapsed && <div className="nav-group-label">Operations</div>}
          <button
            className={`nav-link ${view === "discussions" ? "active" : ""}`}
            onClick={() => setView("discussions")}
            title="Source Discussions"
          >
            <MessagesSquare className="nav-link-icon" size={17} />
            {!collapsed && <span>Discussions</span>}
            {!collapsed && counts.discussions > 0 && (
              <span className="nav-pill">{counts.discussions}</span>
            )}
          </button>
          <button
            className={`nav-link ${view === "diagnostics" ? "active" : ""}`}
            onClick={() => setView("diagnostics")}
            title="Extraction & Diagnostics"
          >
            <Activity className="nav-link-icon" size={17} />
            {!collapsed && <span>Diagnostics</span>}
            {!collapsed && counts.diagnostics > 0 && (
              <span className="nav-pill">{counts.diagnostics}</span>
            )}
          </button>
        </div>

        {/* Settings */}
        <div className="nav-group">
          {!collapsed && <div className="nav-group-label">Settings</div>}
          <button
            className={`nav-link ${view === "model-config" ? "active" : ""}`}
            onClick={() => setView("model-config")}
            title="Model Configuration"
          >
            <Sliders className="nav-link-icon" size={17} />
            {!collapsed && <span>Model Config</span>}
          </button>
        </div>
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          className="sidebar-footer-link"
          onClick={onGoToLanding}
          title="Return to Public Landing Page"
          style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
        >
          <Home size={15} />
          {!collapsed && <span>Landing Page</span>}
        </button>

        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          className="sidebar-footer-link"
          title="FastAPI Swagger Documentation"
        >
          <ExternalLink size={15} />
          {!collapsed && <span>API Docs ↗</span>}
        </a>
      </div>
    </aside>
  );
}
