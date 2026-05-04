import { store } from "@/lib/store";
import { getAllProducts } from "@/lib/products";
import SessionsPanel from "@/components/SessionsPanel";
import ProductsPanel from "@/components/ProductsPanel";
import StatsBar from "@/components/StatsBar";
import "./globals.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [sessions, products] = await Promise.all([store.getAll(), getAllProducts()]);

  const completed = sessions.filter((s) => s.status === "completed");
  const initialStats = {
    products: products.length,
    totalStock: products.reduce((s, p) => s + p.stock, 0),
    active: sessions.filter((s) => !["completed", "canceled"].includes(s.status)).length,
    completed: completed.length,
    revenue: completed.reduce((sum, s) => {
      const t = s.totals.find((t) => t.type === "total");
      return sum + (t?.amount ?? 0);
    }, 0),
  };

  return (
    <div className="shell">
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
        <StatsBar initial={initialStats} />

        <div className="grid2">
          <ProductsPanel initial={products} />
          <SessionsPanel initial={sessions} />
        </div>
      </main>
    </div>
  );
}
