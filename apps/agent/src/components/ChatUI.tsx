"use client";
import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import Link from "next/link";

interface Props {
  /** Vercel AI SDK chat endpoint */
  apiPath: string;
  /** Displayed in the header badge */
  mode: "REST" | "MCP";
  /** Accent colour for the mode badge and send button */
  accent: string;
  /** Dim background for the mode badge */
  accentDim: string;
}

export function ChatUI({ apiPath, mode, accent, accentDim }: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useChat({
    api: apiPath,
  });
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isRest = mode === "REST";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#030712",
        color: "#f9fafb",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* ── header ── */}
      <header
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid #1f2937",
          background: "#0b1120",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Link
          href="/"
          style={{
            color: "#4b5563",
            fontSize: 18,
            textDecoration: "none",
            lineHeight: 1,
            marginRight: 2,
          }}
          title="Back to mode selector"
        >
          ←
        </Link>

        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
          }}
        >
          {isRest ? "🌐" : "⚡"}
        </div>

        <div>
          <div
            style={{
              fontWeight: 700,
              color: "#818cf8",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ACP Shopping Agent
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: accent,
                background: accentDim,
                border: `1px solid ${accent}44`,
                borderRadius: 4,
                padding: "1px 5px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {mode}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#4b5563" }}>
            {isRest
              ? "Direct REST · /api/chat"
              : "MCP JSON-RPC · /api/chat/mcp"}
          </div>
        </div>
      </header>

      {/* ── messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 56, color: "#4b5563" }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🛍</div>
            <p style={{ fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
              What would you like to buy?
            </p>
            <p style={{ fontSize: 12 }}>
              I can browse the catalog, handle checkout, and place your order.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 10,
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "9px 14px",
                borderRadius:
                  m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                background: m.role === "user" ? "#4f46e5" : "#1f2937",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "#1f2937",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              🤖
            </div>
            <span style={{ color: "#6b7280", fontSize: 13 }}>thinking…</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* ── input ── */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: "10px 12px",
          borderTop: "1px solid #1f2937",
          background: "#0b1120",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder="Ask the agent to help you shop…"
          style={{
            flex: 1,
            background: "#1f2937",
            border: "1px solid #374151",
            borderRadius: 22,
            padding: "9px 16px",
            color: "#f9fafb",
            fontSize: 13,
            outline: "none",
          }}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            style={{
              background: "#dc2626",
              border: "none",
              borderRadius: 22,
              padding: "9px 18px",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              background: accent,
              border: "none",
              borderRadius: 22,
              padding: "9px 18px",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              opacity: input.trim() ? 1 : 0.4,
            }}
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
