"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LandingPage } from "./components/LandingPage";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { OverviewView } from "./components/OverviewView";
import { RepositoriesView } from "./components/RepositoriesView";
import { DecisionsView } from "./components/DecisionsView";
import { IntelligenceView } from "./components/IntelligenceView";
import { EvolutionView } from "./components/EvolutionView";
import { KnowledgeGraphView } from "./components/KnowledgeGraphView";
import { DiscussionsView } from "./components/DiscussionsView";
import { DiagnosticsView } from "./components/DiagnosticsView";
import { ModelConfigView } from "./components/ModelConfigView";
import { CommandPalette } from "./components/CommandPalette";
import {
  Repository,
  Decision,
  Discussion,
  ExtractionRun,
  AppView,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const VALID_VIEWS: AppView[] = [
  "overview",
  "repositories",
  "decisions",
  "intelligence",
  "evolution",
  "knowledge-graph",
  "discussions",
  "diagnostics",
  "model-config",
];

export default function Home() {
  // Mode: "landing" | "app"
  const [isLanding, setIsLanding] = useState<boolean>(true);
  const [currentView, setCurrentView] = useState<AppView>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Core Data
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [recentExtractions, setRecentExtractions] = useState<ExtractionRun[]>([]);
  const [relationshipCount, setRelationshipCount] = useState<number>(0);

  // Selected Decision for modal/drawer inspection
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);

  // Async States
  const [isIngesting, setIsIngesting] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Synchronize URL and handle back/forward browser navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    function applyUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get("view") as AppView | null;
      const modeParam = params.get("mode");

      if (viewParam && VALID_VIEWS.includes(viewParam)) {
        setIsLanding(false);
        setCurrentView(viewParam);
      } else if (modeParam === "app" || modeParam === "dashboard") {
        setIsLanding(false);
      } else {
        setIsLanding(true);
      }
    }

    applyUrlParams();
    window.addEventListener("popstate", applyUrlParams);
    return () => window.removeEventListener("popstate", applyUrlParams);
  }, []);

  // Global keyboard shortcut for Command Palette: ⌘K or Ctrl+K or /
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigateToView = useCallback((newView: AppView) => {
    setCurrentView(newView);
    setIsLanding(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", newView);
      url.searchParams.delete("mode");
      window.history.pushState({ view: newView }, "", url.toString());
    }
  }, []);

  const openApp = useCallback(() => {
    setIsLanding(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", currentView || "overview");
      window.history.pushState({ view: currentView || "overview" }, "", url.toString());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentView]);

  const returnToLanding = useCallback(() => {
    setIsLanding(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("mode");
      window.history.pushState(null, "", url.pathname);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // Fetch repositories on mount
  useEffect(() => {
    loadRepositories();
  }, []);

  async function loadRepositories() {
    try {
      const res = await fetch(`${API}/repositories`);
      if (!res.ok) return;
      const data = await res.json();
      const items: Repository[] = data.items ?? [];
      setRepositories(items);
      if (items.length > 0 && !selectedRepoId) {
        setSelectedRepoId(items[0].id);
      }
    } catch {
      // Backend warming up
    }
  }

  // Load repository specific data whenever selectedRepoId changes
  useEffect(() => {
    if (!selectedRepoId) {
      setDecisions([]);
      setDiscussions([]);
      setRecentExtractions([]);
      setRelationshipCount(0);
      return;
    }

    loadDiscussions(selectedRepoId);
    loadDecisions(selectedRepoId);
    loadExtractions(selectedRepoId);
    loadRelationships(selectedRepoId);
  }, [selectedRepoId]);

  async function loadDiscussions(repoId: string) {
    try {
      const res = await fetch(`${API}/repositories/${repoId}/discussions?limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      setDiscussions(data.items ?? []);
    } catch {
      setDiscussions([]);
    }
  }

  async function loadDecisions(repoId: string) {
    try {
      const res = await fetch(`${API}/repositories/${repoId}/decisions?limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      setDecisions(data.items ?? []);
    } catch {
      setDecisions([]);
    }
  }

  async function loadExtractions(repoId: string) {
    try {
      const res = await fetch(`${API}/repositories/${repoId}/extractions`);
      if (!res.ok) return;
      const data = await res.json();
      setRecentExtractions(data.items ?? []);
    } catch {
      setRecentExtractions([]);
    }
  }

  async function loadRelationships(repoId: string) {
    try {
      const res = await fetch(
        `${API}/repositories/${repoId}/decision-graph?include_pending=true`
      );
      if (!res.ok) return;
      const data = await res.json();
      setRelationshipCount(data.total_edges ?? 0);
    } catch {
      setRelationshipCount(0);
    }
  }

  function handleRefresh() {
    if (!selectedRepoId) {
      loadRepositories();
      return;
    }
    loadDiscussions(selectedRepoId);
    loadDecisions(selectedRepoId);
    loadExtractions(selectedRepoId);
    loadRelationships(selectedRepoId);
  }

  // Connect and Ingest Repository
  async function handleConnectRepo(url: string) {
    setIsIngesting(true);
    setStatusMessage("Registering repository with GitHub API…");
    try {
      const registerRes = await fetch(`${API}/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository_url: url }),
      });
      const registered = await registerRes.json();
      if (!registerRes.ok || !registered.id) {
        throw new Error(registered.detail?.error?.message ?? "Failed to register repository");
      }

      await loadRepositories();
      setSelectedRepoId(registered.id);

      setStatusMessage("Starting discussion ingestion (issues, PRs, review comments)…");
      const ingestRes = await fetch(`${API}/repositories/${registered.id}/ingestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_items: 20 }),
      });
      const ingestion = await ingestRes.json();
      if (!ingestRes.ok || !ingestion.ingestion_id) {
        throw new Error(ingestion.detail?.error?.message ?? "Failed to queue ingestion");
      }

      setStatusMessage("Ingestion queued. Discussions will appear shortly.");
      setTimeout(() => {
        loadDiscussions(registered.id);
        setStatusMessage("");
      }, 5000);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Repository connection failed");
    } finally {
      setIsIngesting(false);
    }
  }

  // Extract Decisions Pipeline
  async function handleExtractDecisions() {
    if (!selectedRepoId || isExtracting) return;
    setIsExtracting(true);
    setStatusMessage("Running open-weight model extraction pipeline…");

    try {
      const res = await fetch(`${API}/repositories/${selectedRepoId}/extractions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const started = await res.json();
      if (!res.ok || !started.extraction_id) {
        throw new Error(started.detail?.error?.message ?? "Could not trigger extraction");
      }

      // Poll extraction status
      let completed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 800));
        const statusRes = await fetch(`${API}/extractions/${started.extraction_id}`);
        const statusData = await statusRes.json();

        if (statusData.status === "completed") {
          completed = true;
          break;
        }
        if (statusData.status === "failed") {
          throw new Error(statusData.error_message ?? "Extraction failed");
        }
        if (statusData.status === "cancelled") {
          throw new Error("Extraction cancelled");
        }
      }

      if (!completed) {
        throw new Error("Extraction is taking longer than expected. Check diagnostics shortly.");
      }

      // Refresh data
      await loadDecisions(selectedRepoId);
      await loadExtractions(selectedRepoId);
      await loadRelationships(selectedRepoId);

      setStatusMessage("Extraction completed. Decisions and evidence updated.");
      setTimeout(() => setStatusMessage(""), 4000);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setIsExtracting(false);
    }
  }

  // Public Landing Page view
  if (isLanding) {
    return (
      <div className="mode-fade">
        <LandingPage onLaunchApp={openApp} />
      </div>
    );
  }

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId) || null;

  return (
    <div className={`app-shell mode-fade ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* ── Persistent Sidebar Navigation ────────────────────── */}
      <Sidebar
        view={currentView}
        setView={navigateToView}
        counts={{
          repositories: repositories.length,
          decisions: decisions.length,
          discussions: discussions.length,
          diagnostics: recentExtractions.length,
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onGoToLanding={returnToLanding}
      />

      {/* ── Main Application Shell ───────────────────────────── */}
      <div className="app-main">
        <Header
          view={currentView}
          repositories={repositories}
          selectedRepoId={selectedRepoId}
          onSelectRepo={setSelectedRepoId}
          onRefresh={handleRefresh}
          onExtract={handleExtractDecisions}
          isExtracting={isExtracting}
          isIngesting={isIngesting}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        <main className="workspace-content">
          <div key={currentView} className="view-container">
            {currentView === "overview" && (
              <OverviewView
                repositories={repositories}
                selectedRepo={selectedRepo}
                decisions={decisions}
                discussions={discussions}
                relationshipCount={relationshipCount}
                recentExtractions={recentExtractions}
                onSelectDecision={(id) => setSelectedDecisionId(id)}
                onNavigate={navigateToView}
                onConnectRepo={handleConnectRepo}
                isIngesting={isIngesting}
                statusMessage={statusMessage}
              />
            )}

            {currentView === "repositories" && (
              <RepositoriesView
                repositories={repositories}
                selectedRepoId={selectedRepoId}
                onSelectRepo={(id) => setSelectedRepoId(id)}
                onConnectRepo={handleConnectRepo}
                isIngesting={isIngesting}
                statusMessage={statusMessage}
              />
            )}

            {currentView === "decisions" && (
              <DecisionsView
                decisions={decisions}
                selectedDecisionId={selectedDecisionId}
                onSelectDecision={setSelectedDecisionId}
                onRefresh={() => selectedRepoId && loadDecisions(selectedRepoId)}
              />
            )}

            {currentView === "intelligence" && (
              <IntelligenceView repositoryId={selectedRepoId} />
            )}

            {currentView === "evolution" && (
              <EvolutionView
                repositoryId={selectedRepoId}
                onSelectDecision={(id) => {
                  setSelectedDecisionId(id);
                  navigateToView("decisions");
                }}
              />
            )}

            {currentView === "knowledge-graph" && (
              <KnowledgeGraphView
                repositoryId={selectedRepoId}
                onSelectDecision={(id) => {
                  setSelectedDecisionId(id);
                  navigateToView("decisions");
                }}
              />
            )}

            {currentView === "discussions" && (
              <DiscussionsView
                discussions={discussions}
                onRefresh={() => selectedRepoId && loadDiscussions(selectedRepoId)}
              />
            )}

            {currentView === "diagnostics" && (
              <DiagnosticsView
                repositoryId={selectedRepoId}
                onRefresh={() => selectedRepoId && loadExtractions(selectedRepoId)}
              />
            )}

            {currentView === "model-config" && <ModelConfigView />}
          </div>
        </main>
      </div>

      {/* ── Command Palette (⌘K) ─────────────────────────────── */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={navigateToView}
        repositories={repositories}
        onSelectRepo={(id) => {
          setSelectedRepoId(id);
          setIsCommandPaletteOpen(false);
        }}
      />
    </div>
  );
}
