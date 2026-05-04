"use client";
import Link from "next/link";

const MODES = [
  {
    href: "/rest",
    label: "REST Agent",
    badge: "HTTP · REST",
    accent: "#10b981",
    accentDim: "#064e3b",
    icon: "🌐",
    headline: "Direct REST checkout",
    description:
      "Calls the merchant's REST endpoints directly. Uses internal field names and the classic ACP HTTP flow.",
    details: [
      { label: "Route", value: "POST /api/checkout_sessions" },
      { label: "Chat API", value: "/api/chat" },
      { label: "Fields", value: "items[].id, fulfillment_address" },
      { label: "Auth", value: "Bearer · Authorization header" },
    ],
  },
  {
    href: "/mcp",
    label: "MCP Agent",
    badge: "JSON-RPC · MCP",
    accent: "#818cf8",
    accentDim: "#1e1b4b",
    icon: "⚡",
    headline: "MCP-native checkout",
    description:
      "Connects to the merchant's MCP server (openrpc.agentic_checkout.json 2026-04-17). Tools auto-discovered via tools/list.",
    details: [
      { label: "Route", value: "POST /api/mcp" },
      { label: "Chat API", value: "/api/chat/mcp" },
      { label: "Fields", value: "line_items[].product_id, fulfillment_details.address" },
      { label: "Transport", value: "Streamable HTTP · JSON-RPC 2.0" },
    ],
  },
];

export default function LandingPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#030712",
        color: "#f9fafb",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* ── header ── */}
      <header
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid #1f2937",
          background: "#0b1120",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 17,
          }}
        >
          🛍
        </div>
        <div>
          <div style={{ fontWeight: 700, color: "#818cf8", fontSize: 14, letterSpacing: "0.01em" }}>
            ACP Shopping Agent
          </div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>
            Agentic Commerce Protocol · spec 2026-04-17
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <a
            href="https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/spec/2026-04-17/openrpc/openrpc.agentic_checkout.json"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: "#4b5563", textDecoration: "none" }}
          >
            OpenRPC spec ↗
          </a>
        </div>
      </header>

      {/* ── hero ── */}
      <div style={{ textAlign: "center", padding: "52px 24px 36px" }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            background: "linear-gradient(90deg,#818cf8,#c084fc)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 10,
          }}
        >
          Choose your agent transport
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, maxWidth: 480, margin: "0 auto" }}>
          Both agents shop from the same merchant catalog and drive the same ACP checkout flow.
          The difference is how they talk to the merchant.
        </p>
      </div>

      {/* ── mode cards ── */}
      <div
        style={{
          display: "flex",
          gap: 20,
          justifyContent: "center",
          padding: "0 24px 60px",
          flexWrap: "wrap",
        }}
      >
        {MODES.map((m) => (
          <div
            key={m.href}
            style={{
              width: 340,
              background: "#0f172a",
              border: `1px solid #1f2937`,
              borderRadius: 16,
              padding: "28px 26px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* card header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: m.accentDim,
                  border: `1px solid ${m.accent}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {m.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{m.label}</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: m.accent,
                    background: m.accentDim,
                    border: `1px solid ${m.accent}44`,
                    borderRadius: 4,
                    padding: "1px 6px",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {m.badge}
                </span>
              </div>
            </div>

            {/* headline + description */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>
                {m.headline}
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>{m.description}</p>
            </div>

            {/* detail rows */}
            <div
              style={{
                background: "#0b1120",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {m.details.map((d) => (
                <div key={d.label} style={{ display: "flex", gap: 8, fontSize: 11 }}>
                  <span style={{ color: "#4b5563", width: 64, flexShrink: 0 }}>{d.label}</span>
                  <span style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: 10.5 }}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <Link
              href={m.href}
              style={{
                display: "block",
                textAlign: "center",
                background: m.accent,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                borderRadius: 10,
                padding: "10px 0",
                textDecoration: "none",
                marginTop: 2,
                letterSpacing: "0.01em",
              }}
            >
              Launch {m.label} →
            </Link>
          </div>
        ))}
      </div>

      {/* ── footer ── */}
      <div style={{ marginTop: "auto", textAlign: "center", padding: "0 0 24px", color: "#374151", fontSize: 11 }}>
        Merchant API on :3001 · Agent on :3000 · MCP endpoint at /api/mcp
      </div>
    </div>
  );
}
