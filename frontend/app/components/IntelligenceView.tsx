"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  Plus,
  MessagesSquare,
  ExternalLink,
  Cpu,
  Clock,
  ShieldCheck,
  Copy,
  Check,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  X,
  Trash2,
  Terminal,
  HelpCircle,
  Bot,
  User,
  ArrowDown,
} from "lucide-react";
import { ChatConversation, ChatMessage, QADiagnostics } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface IntelligenceViewProps {
  repositoryId: string;
}

const CATEGORIZED_PROMPTS = [
  {
    category: "Architecture",
    query: "Why was this architecture selected?",
  },
  {
    category: "Alternatives",
    query: "Which alternatives were rejected and why?",
  },
  {
    category: "Trade-offs",
    query: "What technical trade-offs were discussed around concurrency?",
  },
  {
    category: "Evolution",
    query: "What decisions were superseded over time?",
  },
  {
    category: "Unresolved",
    query: "What decisions are still marked unresolved?",
  },
];

const FOLLOW_UP_PILLS = [
  "Why was this selected?",
  "Rejected alternatives?",
  "Concurrency trade-offs",
  "Superseded decisions",
  "Unresolved points",
];

export function IntelligenceView({ repositoryId }: IntelligenceViewProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversation | null>(null);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  function handleScroll() {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 80;
    setShowScrollBottom(isUp);
  }

  function scrollToBottom(smooth = true) {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setShowScrollBottom(false);
    }
  }

  // Smooth scroll to bottom on message update ONLY if user is already at the bottom
  useEffect(() => {
    if (!showScrollBottom && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [activeConv?.messages?.length, isLoading, showScrollBottom]);

  // Auto-resize textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputQuestion]);

  // Load conversations
  useEffect(() => {
    if (!repositoryId) return;
    fetch(`${API}/repositories/${repositoryId}/chat/conversations`)
      .then((res) => res.json())
      .then((data) => {
        setConversations(data.items ?? []);
        if (data.items?.length > 0) {
          loadConversation(data.items[0].id);
        } else {
          setActiveConv(null);
        }
      })
      .catch((err) => setErrorMsg(err.message));
  }, [repositoryId]);

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`${API}/chat/conversations/${id}`);
      const data = await res.json();
      setActiveConv(data);
      setShowScrollBottom(false);
      setTimeout(() => scrollToBottom(false), 60);
    } catch {
      setErrorMsg("Failed to load conversation");
    }
  }

  async function handleNewConversation(initialQuery?: string) {
    if (!repositoryId) return;
    try {
      const res = await fetch(`${API}/repositories/${repositoryId}/chat/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: initialQuery ? initialQuery.slice(0, 36) : "New Inquiry",
        }),
      });
      const conv = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveConv({ ...conv, messages: [] });

      if (initialQuery) {
        await sendMessage(conv.id, initialQuery);
      }
    } catch {
      setErrorMsg("Could not create conversation");
    }
  }

  async function handleDeleteConversation(convId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this chat inquiry?")) return;
    try {
      const res = await fetch(`${API}/chat/conversations/${convId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not delete inquiry");
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConv?.id === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          loadConversation(remaining[0].id);
        } else {
          setActiveConv(null);
        }
      }
    } catch {
      setErrorMsg("Failed to delete conversation");
    }
  }

  async function sendMessage(convId: string, text: string) {
    if (!text.trim() || isLoading) return;
    setIsLoading(true);
    setErrorMsg("");

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };

    setActiveConv((prev) =>
      prev ? { ...prev, messages: [...(prev.messages || []), tempUserMsg] } : prev
    );
    setInputQuestion("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "38px";
    }
    setShowScrollBottom(false);
    setTimeout(() => scrollToBottom(true), 40);

    try {
      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail?.error?.message ?? "Chat response failed");
      }

      // Reload full conversation to obtain validated citations
      await loadConversation(convId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error answering question");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFormSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!inputQuestion.trim() || isLoading) return;
    if (!activeConv) {
      handleNewConversation(inputQuestion);
    } else {
      sendMessage(activeConv.id, inputQuestion);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit();
    }
  }

  function handleCopy(id: string, text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function handleFeedback(id: string, type: "up" | "down") {
    setFeedbackMap((prev) => ({
      ...prev,
      [id]: prev[id] === type ? undefined! : type,
    }));
  }

  return (
    <div className="chat-container">
      {/* ── Left Sidebar: Conversations ─────────────────────────── */}
      <div className="chat-conversations">
        <div className="chat-conv-header">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <MessagesSquare size={15} color="var(--accent)" />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
              Inquiries
            </span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleNewConversation()}
            disabled={!repositoryId}
            title="Start new inquiry"
            style={{ padding: "4px 8px", fontSize: "11px" }}
          >
            <Plus size={13} /> New
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div
              style={{
                padding: "30px 16px",
                textAlign: "center",
                color: "var(--text-dim)",
                fontSize: "12px",
              }}
            >
              No past inquiries. Ask a question to begin.
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`chat-conv-item ${activeConv?.id === c.id ? "active" : ""}`}
                onClick={() => loadConversation(c.id)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "6px" }}>
                  <span
                    style={{
                      color: activeConv?.id === c.id ? "var(--accent)" : "var(--text)",
                      fontWeight: activeConv?.id === c.id ? 600 : 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1,
                    }}
                  >
                    {c.title}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{
                      padding: "2px 4px",
                      color: "var(--text-dim)",
                      opacity: activeConv?.id === c.id ? 0.9 : 0.4,
                      height: "auto",
                      border: "none",
                    }}
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    title="Delete inquiry"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                  {new Date(c.updated_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main Chat Area ────────────────────────────────────── */}
      <div className="chat-main">
        {/* Chat Header Bar */}
        <div className="chat-header-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--success)",
                boxShadow: "0 0 6px rgba(57, 185, 128, 0.6)",
              }}
            />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
              {activeConv ? activeConv.title : "Decision Intelligence Assistant"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="badge"
              style={{
                background: "rgba(107, 159, 255, 0.12)",
                color: "var(--accent)",
                border: "1px solid rgba(107, 159, 255, 0.3)",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Cpu size={12} />
              Qwen 2.5 27B · Groq
            </span>

            {activeConv && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDeleteConversation(activeConv.id)}
                title="Delete this inquiry"
                style={{ color: "var(--error)", padding: "4px 8px", fontSize: "12px" }}
              >
                <Trash2 size={13} />
                Delete Chat
              </button>
            )}

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleNewConversation()}
              title="Start a fresh chat"
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              <Plus size={13} />
              New Chat
            </button>
          </div>
        </div>

        {/* Messages List / Empty State */}
        {!activeConv || !activeConv.messages || activeConv.messages.length === 0 ? (
          <div className="state-empty" style={{ margin: "auto", maxWidth: "620px", padding: "40px 24px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "rgba(107, 159, 255, 0.12)",
                border: "1px solid rgba(107, 159, 255, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <Sparkles size={28} color="var(--accent)" />
            </div>

            <div className="state-empty-title" style={{ fontSize: "18px", fontWeight: 700 }}>
              Grounded Decision Intelligence
            </div>

            <div className="state-empty-desc" style={{ maxWidth: "480px", lineHeight: 1.6 }}>
              Query architectural choices, rejected alternatives, and trade-offs.
              Every response is strictly validated against ingested GitHub discussions.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                width: "100%",
                marginTop: "24px",
                textAlign: "left",
              }}
            >
              {CATEGORIZED_PROMPTS.map((item, i) => (
                <div
                  key={i}
                  className="card"
                  style={{
                    padding: "12px 14px",
                    cursor: "pointer",
                    transition: "all 0.18s var(--ease-out)",
                    background: "var(--surface)",
                  }}
                  onClick={() => {
                    if (!activeConv) {
                      handleNewConversation(item.query);
                    } else {
                      sendMessage(activeConv.id, item.query);
                    }
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: "4px",
                    }}
                  >
                    {item.category}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--text)" }}>
                    {item.query}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages" ref={messagesContainerRef} onScroll={handleScroll}>
            {activeConv.messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                <div className="chat-meta">
                  <span
                    style={{
                      fontWeight: 600,
                      color: msg.role === "user" ? "var(--accent)" : "var(--text)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {msg.role === "user" ? (
                      <>
                        <User size={13} />
                        Developer Inquiry
                      </>
                    ) : (
                      <>
                        <Bot size={13} color="var(--accent)" />
                        METIS Intelligence
                      </>
                    )}
                  </span>

                  {msg.provider && (
                    <span style={{ color: "var(--text-dim)" }}>
                      · {msg.provider} / {msg.model_name}
                    </span>
                  )}

                  {msg.generation_latency_ms && (
                    <span style={{ color: "var(--text-dim)" }}>
                      · {(msg.generation_latency_ms / 1000).toFixed(2)}s
                    </span>
                  )}

                  {msg.role === "assistant" && (
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                      {/* Copy Action */}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "3px 7px", fontSize: "11px", height: "auto" }}
                        onClick={() => handleCopy(msg.id, msg.content)}
                        title="Copy answer to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check size={12} color="var(--success)" />
                            <span style={{ color: "var(--success)" }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {/* Helpful thumbs feedback */}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{
                          padding: "3px 6px",
                          height: "auto",
                          color: feedbackMap[msg.id] === "up" ? "var(--success)" : "var(--text-dim)",
                        }}
                        onClick={() => handleFeedback(msg.id, "up")}
                        title="Helpful response"
                      >
                        <ThumbsUp size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{
                          padding: "3px 6px",
                          height: "auto",
                          color: feedbackMap[msg.id] === "down" ? "var(--danger)" : "var(--text-dim)",
                        }}
                        onClick={() => handleFeedback(msg.id, "down")}
                        title="Needs more detail"
                      >
                        <ThumbsDown size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Formatted Markdown Content */}
                <FormattedMessageContent content={msg.content} />

                {/* Evidence Citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="chat-citations">
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <ShieldCheck size={13} color="var(--success)" />
                      Verified Discussion Citations ({msg.sources.length})
                    </div>

                    <div style={{ display: "grid", gap: "6px" }}>
                      {msg.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="chat-citation-card"
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span
                                className="badge badge-neutral"
                                style={{
                                  fontSize: "10px",
                                  textTransform: "capitalize",
                                  background: "rgba(255,255,255,0.06)",
                                }}
                              >
                                {src.evidence_role}
                              </span>
                              <strong style={{ fontSize: "12px", color: "var(--text)" }}>
                                {src.decision_title ?? "Decision Record"}
                              </strong>
                              {src.decision_status && (
                                <span className={`badge badge-${src.decision_status}`} style={{ fontSize: "10px" }}>
                                  {src.decision_status}
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: "11.5px", color: "var(--text-dim)" }}>
                              {src.source_title ?? src.source_url}
                            </div>

                            {src.excerpt && (
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "var(--text-muted)",
                                  fontStyle: "italic",
                                  borderLeft: "2px solid var(--border)",
                                  paddingLeft: "8px",
                                  marginTop: "2px",
                                }}
                              >
                                &ldquo;{src.excerpt.length > 140 ? `${src.excerpt.slice(0, 140)}…` : src.excerpt}&rdquo;
                              </div>
                            )}
                          </div>

                          <ExternalLink size={13} color="var(--accent)" style={{ marginLeft: "8px", flexShrink: 0 }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagnostics details if present */}
                {msg.qa_diagnostics && (
                  <QADiagnosticsDetails diagnostics={msg.qa_diagnostics} />
                )}
              </div>
            ))}

            {/* Thinking / Analyzing Indicator */}
            {isLoading && (
              <div className="chat-bubble assistant">
                <div className="chat-meta">
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Bot size={13} />
                    METIS Intelligence · Analyzing Evidence
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 0",
                    color: "var(--text-muted)",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ display: "flex", gap: "4px" }}>
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                  <span>Grounded inference in progress: retrieving discussions and validating claims…</span>
                </div>
              </div>
            )}

            {showScrollBottom && (
              <button
                type="button"
                className="chat-scroll-bottom"
                onClick={() => scrollToBottom(true)}
                title="Scroll to latest messages"
              >
                <ArrowDown size={14} color="var(--accent)" />
                <span>Latest messages</span>
              </button>
            )}
          </div>
        )}

        {/* Error message banner */}
        {errorMsg && (
          <div
            style={{
              padding: "10px 20px",
              background: "var(--error-bg)",
              color: "var(--error)",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(225, 107, 117, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--error)", padding: "2px 6px" }}
              onClick={() => setErrorMsg("")}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Modern Composer with Auto-Resize & Follow-up Pills ── */}
        <div className="chat-composer-wrap">
          {/* Quick Follow-up Pills */}
          <div className="quick-pill-strip">
            {FOLLOW_UP_PILLS.map((pill, idx) => (
              <button
                key={idx}
                type="button"
                className="quick-pill"
                onClick={() => {
                  if (!activeConv) {
                    handleNewConversation(pill);
                  } else {
                    sendMessage(activeConv.id, pill);
                  }
                }}
              >
                <Sparkles size={11} color="var(--accent)" />
                {pill}
              </button>
            ))}
          </div>

          {/* Textarea Input Box */}
          <div className="chat-textarea-box">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Ask an architectural question, query rejected alternatives, or inspect trade-offs…"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || !repositoryId}
              rows={1}
            />

            <div className="chat-composer-footer">
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Press <strong style={{ color: "var(--text-muted)" }}>↵ Enter</strong> to send ·{" "}
                <strong style={{ color: "var(--text-muted)" }}>Shift + Enter</strong> for new line
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {inputQuestion && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "4px 8px", color: "var(--text-dim)" }}
                    onClick={() => {
                      setInputQuestion("");
                      if (textareaRef.current) {
                        textareaRef.current.style.height = "38px";
                      }
                    }}
                    title="Clear input"
                  >
                    <X size={13} />
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleFormSubmit()}
                  disabled={isLoading || !inputQuestion.trim() || !repositoryId}
                  style={{
                    padding: "6px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isLoading ? <span className="spinner" /> : <Send size={14} />}
                  <span>Ask</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Markdown Content Formatter with Code Copy ─────────────────
function FormattedMessageContent({ content }: { content: string }) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const isInsufficientEvidence =
    content.toLowerCase().includes("could not find enough evidence") ||
    content.toLowerCase().includes("insufficient evidence");

  function copyCode(code: string, idx: number) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCodeIndex(idx);
      setTimeout(() => setCopiedCodeIndex(null), 2000);
    }
  }

  // Split into code blocks vs markdown prose
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="formatted-chat-content" style={{ fontSize: "14px", lineHeight: 1.6 }}>
      {isInsufficientEvidence && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            background: "rgba(229, 174, 85, 0.12)",
            border: "1px solid rgba(229, 174, 85, 0.3)",
            borderRadius: "6px",
            fontSize: "13px",
            color: "var(--warning)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={16} />
          <span>
            <strong>Grounding Notice:</strong> The ingested discussions do not contain verified
            evidence directly answering this inquiry. No unsupported claims were fabricated.
          </span>
        </div>
      )}

      {parts.map((part, index) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).trim().split("\n");
          const firstLine = lines[0].trim();
          const hasLang = !firstLine.includes(" ") && firstLine.length < 15;
          const lang = hasLang ? firstLine : "text";
          const code = hasLang ? lines.slice(1).join("\n") : lines.join("\n");

          return (
            <div
              key={index}
              style={{
                margin: "12px 0",
                background: "#080A0E",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 12px",
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "11px",
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>{lang}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 6px", fontSize: "11px", height: "auto" }}
                  onClick={() => copyCode(code, index)}
                >
                  {copiedCodeIndex === index ? (
                    <>
                      <Check size={11} color="var(--success)" />
                      <span style={{ color: "var(--success)" }}>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  fontSize: "12.5px",
                  lineHeight: 1.5,
                  overflowX: "auto",
                  fontFamily: "var(--font-mono)",
                  color: "#D4D4D8",
                }}
              >
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Render prose with markdown helpers
        return (
          <div key={index}>
            {part.split("\n\n").map((para, pIdx) => {
              const trimmed = para.trim();
              if (!trimmed) return null;

              // Headers
              if (trimmed.startsWith("### ")) {
                return (
                  <h4 key={pIdx} style={{ fontSize: "14px", fontWeight: 700, margin: "14px 0 6px", color: "var(--text)" }}>
                    {renderInline(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <h3 key={pIdx} style={{ fontSize: "15px", fontWeight: 700, margin: "16px 0 8px", color: "var(--text)" }}>
                    {renderInline(trimmed.slice(3))}
                  </h3>
                );
              }

              // List items
              const lines = trimmed.split("\n");
              const isList = lines.every((l) => /^\s*([*\-]|\d+\.)\s/.test(l));
              if (isList) {
                return (
                  <ul key={pIdx} style={{ margin: "8px 0", paddingLeft: "20px" }}>
                    {lines.map((l, lIdx) => (
                      <li key={lIdx} style={{ marginBottom: "4px" }}>
                        {renderInline(l.replace(/^\s*([*\-]|\d+\.)\s/, ""))}
                      </li>
                    ))}
                  </ul>
                );
              }

              // Normal paragraph
              return (
                <p key={pIdx} style={{ margin: "8px 0" }}>
                  {lines.map((l, lIdx) => (
                    <React.Fragment key={lIdx}>
                      {renderInline(l)}
                      {lIdx < lines.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Parse inline `code` and **bold**
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, i) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--border)",
            padding: "2px 5px",
            borderRadius: "4px",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--accent)",
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={i}>{token.slice(2, -2)}</strong>;
    }
    return token;
  });
}

function QADiagnosticsDetails({ diagnostics }: { diagnostics: QADiagnostics }) {
  return (
    <details style={{ marginTop: "12px", fontSize: "11px", color: "var(--text-muted)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Retrieval diagnostics</summary>
      <div style={{ display: "grid", gap: "4px", marginTop: "8px" }}>
        <div>Repository: {diagnostics.repository_id}</div>
        <div>Normalized query: {diagnostics.normalized_query || "(no searchable terms)"}</div>
        <div>
          Decisions: {diagnostics.candidate_decisions_retrieved} retrieved,{" "}
          {diagnostics.decisions_remaining_after_filtering} after relevance filtering
        </div>
        <div>
          Evidence: {diagnostics.evidence_records_passing_validation} validated of{" "}
          {diagnostics.evidence_records_retrieved} retrieved
        </div>
        <div>
          Strategy: {diagnostics.retrieval_strategy}; minimum relevance:{" "}
          {diagnostics.minimum_relevance_threshold}
        </div>
        <div>LLM invoked: {diagnostics.llm_invoked ? "yes" : "no"}</div>
        {diagnostics.llm_error_stage && (
          <div>LLM error stage: {diagnostics.llm_error_stage}</div>
        )}
        {diagnostics.fallback_reason && (
          <div>Fallback reason: {diagnostics.fallback_reason}</div>
        )}
        {diagnostics.relevance_scores && diagnostics.relevance_scores.length > 0 && (
          <div>
            Relevance: {diagnostics.relevance_scores
              .map(({ decision_id, score }) => `${decision_id.slice(0, 8)} ${score.toFixed(3)}`)
              .join(", ")}
          </div>
        )}
      </div>
    </details>
  );
}
