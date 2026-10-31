"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { ChatConversation, ChatMessage } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

interface IntelligenceViewProps {
  repositoryId: string;
}

const SUGGESTED_QUESTIONS = [
  "Why was this architecture selected?",
  "Which alternatives were rejected and why?",
  "What decisions were superseded over time?",
  "What technical trade-offs were discussed around concurrency?",
  "What decisions are still marked unresolved?",
];

export function IntelligenceView({ repositoryId }: IntelligenceViewProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversation | null>(null);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopy(id: string, text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

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
    } catch (err) {
      setErrorMsg("Failed to load conversation");
    }
  }

  async function handleNewConversation(initialQuery?: string) {
    if (!repositoryId) return;
    try {
      const res = await fetch(`${API}/repositories/${repositoryId}/chat/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: initialQuery ? initialQuery.slice(0, 40) : "New Inquiry" }),
      });
      const conv = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveConv({ ...conv, messages: [] });

      if (initialQuery) {
        await sendMessage(conv.id, initialQuery);
      }
    } catch (err) {
      setErrorMsg("Could not create conversation");
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

      // Reload full conversation to get validated citations
      await loadConversation(convId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error answering question");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputQuestion.trim()) return;
    if (!activeConv) {
      handleNewConversation(inputQuestion);
    } else {
      sendMessage(activeConv.id, inputQuestion);
    }
  }

  return (
    <div className="chat-container">
      {/* ── Conversation Sidebar ────────────────────────────── */}
      <div className="chat-conversations">
        <div className="chat-conv-header">
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
            Inquiries
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleNewConversation()}
            disabled={!repositoryId}
            title="Start new inquiry"
          >
            <Plus size={14} /> New
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-dim)", fontSize: "12px" }}>
              No inquiries yet.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                className={`chat-conv-item ${activeConv?.id === c.id ? "active" : ""}`}
                onClick={() => loadConversation(c.id)}
              >
                <span
                  style={{
                    color: activeConv?.id === c.id ? "var(--accent)" : "var(--text)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.title}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                  {new Date(c.updated_at).toLocaleDateString()}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat Messages Main Area ─────────────────────────── */}
      <div className="chat-main">
        {!activeConv || !activeConv.messages || activeConv.messages.length === 0 ? (
          <div className="state-empty" style={{ margin: "auto", maxWidth: "600px" }}>
            <Sparkles size={36} color="var(--accent)" />
            <div className="state-empty-title">
              Explore the engineering history of your codebase.
            </div>
            <div className="state-empty-desc">
              Ask questions about past architectural debates, rejected alternatives,
              or specific design choices. Responses are grounded directly in ingested GitHub discussions.
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginTop: "12px" }}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (!activeConv) {
                      handleNewConversation(q);
                    } else {
                      sendMessage(activeConv.id, q);
                    }
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {activeConv.messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.role}`}>
                <div className="chat-meta">
                  <span style={{ fontWeight: 600 }}>
                    {msg.role === "user" ? "Developer Inquiry" : "METIS Assistant"}
                  </span>
                  {msg.provider && (
                    <span>
                      · {msg.provider} / {msg.model_name}
                    </span>
                  )}
                  {msg.generation_latency_ms && (
                    <span>· {(msg.generation_latency_ms / 1000).toFixed(2)}s</span>
                  )}
                  {msg.role === "assistant" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: "auto", padding: "2px 6px", fontSize: "11px", height: "auto" }}
                      onClick={() => handleCopy(msg.id, msg.content)}
                      title="Copy response to clipboard"
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
                  )}
                </div>

                <FormattedMessageContent content={msg.content} />

                {/* Evidence citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="chat-citations">
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                      Cited Evidence Sources ({msg.sources.length})
                    </div>
                    {msg.sources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-citation-card"
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <ShieldCheck size={13} color="var(--success)" />
                          <strong style={{ textTransform: "capitalize" }}>{src.evidence_role}:</strong>
                          <span style={{ color: "var(--text)", fontStyle: "italic" }}>
                            &ldquo;{src.excerpt ? src.excerpt.slice(0, 110) + "…" : "View source discussion"}&rdquo;
                          </span>
                        </span>
                        <ExternalLink size={13} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="chat-bubble assistant">
                <div className="chat-meta">METIS Assistant · Analyzing Evidence</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
                  <span className="spinner" />
                  Retrieving decisions and verifying citations against discussion threads…
                </div>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              padding: "8px 20px",
              background: "var(--error-bg)",
              color: "var(--error)",
              fontSize: "12px",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* ── Message Composer ──────────────────────────────── */}
        <div className="chat-composer-wrap">
          <form className="chat-composer" onSubmit={handleSubmit}>
            <input
              className="input"
              placeholder="Ask about a decision, rejected alternative, or technical trade-off..."
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              disabled={isLoading || !repositoryId}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isLoading || !inputQuestion.trim() || !repositoryId}
            >
              {isLoading ? <span className="spinner" /> : <Send size={15} />}
              Ask
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

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
