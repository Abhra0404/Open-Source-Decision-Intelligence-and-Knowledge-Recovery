"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  LayoutDashboard,
  FolderGit2,
  FileCheck2,
  Sparkles,
  History,
  Network,
  MessagesSquare,
  Activity,
  Sliders,
  ArrowRight,
  CornerDownLeft,
} from "lucide-react";
import { AppView, Repository } from "../types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
  repositories: Repository[];
  onSelectRepo: (id: string) => void;
}

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  category: "Navigation" | "Repositories" | "Actions";
  action: () => void;
};

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  repositories,
  onSelectRepo,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build command list
  const commands: CommandItem[] = [
    {
      id: "nav-overview",
      title: "Overview Dashboard",
      subtitle: "High-level metrics and recent decisions",
      icon: <LayoutDashboard size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("overview");
        onClose();
      },
    },
    {
      id: "nav-repositories",
      title: "Repository Explorer",
      subtitle: "Manage and connect codebases",
      icon: <FolderGit2 size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("repositories");
        onClose();
      },
    },
    {
      id: "nav-decisions",
      title: "Engineering Decisions",
      subtitle: "Search and inspect recovered decisions",
      icon: <FileCheck2 size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("decisions");
        onClose();
      },
    },
    {
      id: "nav-intelligence",
      title: "AI Decision Intelligence",
      subtitle: "Grounded conversational assistant",
      icon: <Sparkles size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("intelligence");
        onClose();
      },
    },
    {
      id: "nav-evolution",
      title: "Decision Evolution Timeline",
      subtitle: "Chronological decision lineage",
      icon: <History size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("evolution");
        onClose();
      },
    },
    {
      id: "nav-knowledge-graph",
      title: "Interactive Knowledge Graph",
      subtitle: "Visual decision network, supersedes & depends_on links",
      icon: <Network size={16} color="var(--purple)" />,
      category: "Navigation",
      action: () => {
        onNavigate("knowledge-graph");
        onClose();
      },
    },
    {
      id: "nav-discussions",
      title: "Source Discussions",
      subtitle: "Browse raw issues, PRs and review comments",
      icon: <MessagesSquare size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("discussions");
        onClose();
      },
    },
    {
      id: "nav-diagnostics",
      title: "Pipeline Diagnostics",
      subtitle: "Token telemetry and thread validation logs",
      icon: <Activity size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("diagnostics");
        onClose();
      },
    },
    {
      id: "nav-model-config",
      title: "Model Configuration",
      subtitle: "View active provider and model parameters",
      icon: <Sliders size={16} color="var(--accent)" />,
      category: "Navigation",
      action: () => {
        onNavigate("model-config");
        onClose();
      },
    },
    // Repositories
    ...repositories.map((repo) => ({
      id: `repo-${repo.id}`,
      title: repo.full_name,
      subtitle: repo.description || "Switch repository context",
      icon: <FolderGit2 size={16} color="var(--success)" />,
      category: "Repositories" as const,
      action: () => {
        onSelectRepo(repo.id);
        onClose();
      },
    })),
  ];

  const filtered = commands.filter((c) => {
    const text = `${c.title} ${c.subtitle} ${c.category}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose} style={{ zIndex: 100, alignItems: "flex-start", paddingTop: "12vh", justifyContent: "center" }}>
      <div
        className="modal-box"
        style={{
          width: "580px",
          maxWidth: "92vw",
          background: "var(--card)",
          border: "1px solid var(--border-focus)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(107, 159, 255, 0.15)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "var(--surface)",
          }}
        >
          <Search size={18} color="var(--accent)" />
          <input
            ref={inputRef}
            placeholder="Type a command or jump to view (e.g. Decisions, Graph, Click)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: "14px",
              width: "100%",
              fontFamily: "inherit",
            }}
          />
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-dim)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "2px 6px",
            }}
          >
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          style={{
            maxHeight: "360px",
            overflowY: "auto",
            padding: "8px",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-dim)", fontSize: "13px" }}>
              No commands or views match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    cursor: "pointer",
                    background: isSelected ? "var(--surface)" : "transparent",
                    transition: "background 0.12s ease",
                    borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                    {item.icon}
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        color: "var(--text-dim)",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {item.category}
                    </span>
                    {isSelected && <CornerDownLeft size={13} color="var(--accent)" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border-light)",
            background: "var(--sidebar-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--text-dim)",
          }}
        >
          <div style={{ display: "flex", gap: "12px" }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>METIS Command Palette</span>
        </div>
      </div>
    </div>
  );
}
