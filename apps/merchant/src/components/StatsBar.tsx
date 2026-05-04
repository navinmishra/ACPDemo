"use client";

import { useEffect, useState } from "react";
import type { CheckoutSession } from "@acp-demo/types";
import type { Product } from "@/lib/catalog";

type Stats = {
  products: number;
  totalStock: number;
  active: number;
  completed: number;
  revenue: number;
};

const fmt = (cents: number) => "$" + (cents / 100).toFixed(2);

export default function StatsBar({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    const tick = async () => {
      try {
        const [sr, pr] = await Promise.all([
          fetch("/api/internal/sessions"),
          fetch("/api/internal/products"),
        ]);
        if (!sr.ok || !pr.ok) return;
        const sessions: CheckoutSession[] = await sr.json();
        const products: Product[]         = await pr.json();
        const completed = sessions.filter((s) => s.status === "completed");
        setStats({
          products: products.length,
          totalStock: products.reduce((s, p) => s + p.stock, 0),
          active: sessions.filter((s) => !["completed", "canceled"].includes(s.status)).length,
          completed: completed.length,
          revenue: completed.reduce((s, sess) => {
            const t = sess.totals.find((t) => t.type === "total");
            return s + (t?.amount ?? 0);
          }, 0),
        });
      } catch {
        // silently ignore transient fetch errors
      }
    };

    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="stats">
      <div className="stat-card">
        <span className="stat-label">Products</span>
        <span className="stat-value stat-violet">{stats.products}</span>
        <span className="stat-sub">{stats.totalStock} units in stock</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Active Sessions</span>
        <span className="stat-value stat-blue">{stats.active}</span>
        <span className="stat-sub">in progress</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Completed Orders</span>
        <span className="stat-value stat-green">{stats.completed}</span>
        <span className="stat-sub">fulfilled</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Revenue</span>
        <span className="stat-value stat-white">{fmt(stats.revenue)}</span>
        <span className="stat-sub">from completed orders</span>
      </div>
    </div>
  );
}
