"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/catalog";

const PRODUCT_ICONS: Record<string, string> = {
  item_001: "👟", item_002: "🎧", item_003: "🧥", item_004: "☕", item_005: "👜",
};

const fmt = (cents: number) => "$" + (cents / 100).toFixed(2);

function stockClass(n: number) {
  if (n > 15) return "stock stock-ok";
  if (n > 5)  return "stock stock-low";
  return "stock stock-crit";
}

type FormState = { name: string; price: string; description: string; stock: string };
const EMPTY_FORM: FormState = { name: "", price: "", description: "", stock: "0" };

export default function ProductsPanel({ initial }: { initial: Product[] }) {
  const [products, setProducts]   = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/internal/products");
      if (res.ok) setProducts(await res.json());
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, []);

  const adjustStock = async (id: string, delta: number) => {
    setAdjusting(id + delta);
    try {
      await fetch(`/api/internal/products/${id}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      await refresh();
    } finally {
      setAdjusting(null);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    try {
      const res = await fetch("/api/internal/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          price: parseFloat(form.price),
          description: form.description.trim(),
          initialStock: parseInt(form.stock, 10) || 0,
        }),
      });
      if (res.ok) {
        setForm(EMPTY_FORM);
        setShowAdd(false);
        await refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Products Catalog</span>
        <div className="panel-actions">
          {refreshing && <span className="refreshing">↻</span>}
          <span className="refresh-label">live · 10s</span>
          <button className="btn-add" onClick={() => { setShowAdd((v) => !v); setForm(EMPTY_FORM); }}>
            {showAdd ? "✕ Cancel" : "+ Add Product"}
          </button>
          <span className="panel-count">{products.length}</span>
        </div>
      </div>

      <div className="panel-body">
        {/* ── Add product form ────────────────────────────────── */}
        {showAdd && (
          <form className="add-product-form" onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-field" style={{ flex: 2 }}>
                <label className="form-label">Product name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Leather Belt"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Price ($)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="29.99"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Stock</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                placeholder="Short product description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Adding…" : "Add Product"}
              </button>
            </div>
          </form>
        )}

        {/* ── Product list ─────────────────────────────────────── */}
        {products.map((p) => (
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
              <div className="stock-actions">
                {([5, 10, 25] as const).map((n) => (
                  <button
                    key={n}
                    className="btn-stock"
                    disabled={adjusting === p.id + n}
                    onClick={() => adjustStock(p.id, n)}
                    title={`Add ${n} units`}
                  >
                    +{n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
