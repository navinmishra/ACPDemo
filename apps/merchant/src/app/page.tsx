import { CATALOG } from "@/lib/catalog";
import { store } from "@/lib/store";
import SessionsPanel from "@/components/SessionsPanel";
import "./globals.css";

export const dynamic = "force-dynamic";

const fmt = (cents: number) => "$" + (cents / 100).toFixed(2);

const PRODUCT_ICONS: Record<string, string> = {
  item_001: "👟",
  item_002: "🎧",
  item_003: "🧥",
  item_004: "☕",
  item_005: "👜",
};

function stockClass(n: number) {
  if (n > 15) return "stock stock-ok";
  if (n > 5)  return "stock stock-low";
  return "stock stock-crit";
}

export default function DashboardPage() {
  const sessions  = store.getAll();
  const active    = sessions.filter((s) => !["completed", "canceled"].includes(s.status));
  const completed = sessions.filter((s) => s.status === "completed");
  const revenue   = completed.reduce((sum, s) => {
    const t = s.totals.find((t) => t.type === "total");
    return sum + (t?.amount ?? 0);
  }, 0);
  const totalStock = CATALOG.reduce((sum, p) => sum + p.stock, 0);

  return (
    <div className="shell">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">🛍</div>
          <div>
            <div className="header-name">ShopACP</div>
            <div className="header-sub">Merchant Dashboard</div>
          </div>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          API Online
        </div>
      </header>

      <main className="main">
        {/* ── Stats ─────────────────────────────────────────── */}
        <div className="stats">
          <div className="stat-card">
            <span className="stat-label">Products</span>
            <span className="stat-value stat-violet">{CATALOG.length}</span>
            <span className="stat-sub">{totalStock} units in stock</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Sessions</span>
            <span className="stat-value stat-blue">{active.length}</span>
            <span className="stat-sub">in progress</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Completed Orders</span>
            <span className="stat-value stat-green">{completed.length}</span>
            <span className="stat-sub">fulfilled</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Revenue</span>
            <span className="stat-value stat-white">{fmt(revenue)}</span>
            <span className="stat-sub">from completed orders</span>
          </div>
        </div>

        {/* ── Two-column grid ───────────────────────────────── */}
        <div className="grid2">
          {/* Products */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Products Catalog</span>
              <span className="panel-count">{CATALOG.length}</span>
            </div>
            <div className="panel-body">
              {CATALOG.map((p) => (
                <div key={p.id} className="product-card">
                  <div className="product-icon">{PRODUCT_ICONS[p.id] ?? "📦"}</div>
                  <div className="product-info">
                    <div className="product-name">{p.name}</div>
                    <div className="product-desc">{p.description}</div>
                    <div className="product-id">{p.id}</div>
                  </div>
                  <div className="product-right">
                    <span className="product-price">{fmt(p.price)}</span>
                    <span className={stockClass(p.stock)}>stock: {p.stock}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions — client component with live polling */}
          <SessionsPanel initial={sessions} />
        </div>
      </main>
    </div>
  );
}
