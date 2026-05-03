"use client";

import { useEffect, useState } from "react";
import type { CheckoutSession } from "@acp-demo/types";

const fmt = (cents: number) =>
  "$" + (cents / 100).toFixed(2);

function statusBadge(status: CheckoutSession["status"]) {
  const map: Record<string, [string, string]> = {
    ready_for_payment:     ["badge badge-ready",     "Ready"],
    not_ready_for_payment: ["badge badge-not-ready", "Not Ready"],
    completed:             ["badge badge-completed",  "Completed"],
    canceled:              ["badge badge-canceled",   "Canceled"],
  };
  const [cls, label] = map[status] ?? ["badge badge-not-ready", status];
  return <span className={cls}>{label}</span>;
}

function SessionCard({ s }: { s: CheckoutSession }) {
  const total = s.totals.find((t) => t.type === "total");
  const buyer = s.buyer?.name ?? null;

  return (
    <div className="session-card">
      <div className="session-top">
        <span className="session-id">{s.id}</span>
        {statusBadge(s.status)}
      </div>
      <div className="session-meta">
        <span className="session-items">{s.line_items.length} item{s.line_items.length !== 1 ? "s" : ""}</span>
        {total && <span className="session-amount">{fmt(total.amount)}</span>}
        {buyer && <span className="session-buyer">· {buyer}</span>}
      </div>
      {s.line_items.length > 0 && (
        <div style={{ fontSize: 11, color: "#444", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {s.line_items.map((li) => (
            <span key={li.id} style={{ background: "#1a1a1a", padding: "1px 6px", borderRadius: 4 }}>
              {li.item.name} ×{li.item.quantity}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionsPanel({ initial }: { initial: CheckoutSession[] }) {
  const [sessions, setSessions] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const tick = async () => {
      setRefreshing(true);
      try {
        const res = await fetch("/api/internal/sessions");
        if (res.ok) setSessions(await res.json());
      } finally {
        setRefreshing(false);
      }
    };

    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const active    = sessions.filter((s) => !["completed", "canceled"].includes(s.status));
  const completed = sessions.filter((s) => s.status === "completed");
  const canceled  = sessions.filter((s) => s.status === "canceled");
  const ordered   = [...active, ...completed, ...canceled];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Checkout Sessions</span>
        <div className="panel-actions">
          {refreshing && <span className="refreshing">↻</span>}
          <span className="refresh-label">live · 5s</span>
          <span className="panel-count">{sessions.length}</span>
        </div>
      </div>
      <div className="panel-body">
        {ordered.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">🛒</span>
            <span className="empty-text">No sessions yet — waiting for agent activity</span>
          </div>
        ) : (
          ordered.map((s) => <SessionCard key={s.id} s={s} />)
        )}
      </div>
    </div>
  );
}
