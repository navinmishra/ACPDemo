/**
 * E2E: Full ACP checkout flow
 *
 * Mirrors the live session observed with the shopping agent:
 *   listProducts → createCheckoutSession → updateCheckoutSession (address)
 *   → completeCheckout → verify order in store
 *
 * The merchant server is started on port 3099 by global-setup.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { MERCHANT_URL, API_KEY } from "./global-setup";

// ── helpers ──────────────────────────────────────────────────────────────────

function authHeaders(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
    "Idempotency-Key": crypto.randomUUID(),
    "Request-Id": crypto.randomUUID(),
    "API-Version": "2026-04-17",
    ...extra,
  };
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text}`);
  }
}

// ── test suite ────────────────────────────────────────────────────────────────

describe("ACP checkout flow — Wireless Headphones Pro", () => {
  let sessionId: string;

  // ── step 1: product discovery ─────────────────────────────────────────────

  it("GET /api/products — lists all catalog products (no auth required)", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/products`);

    expect(res.status).toBe(200);
    const { products } = await json<{ products: any[] }>(res);
    expect(products.length).toBeGreaterThan(0);

    const headphones = products.find((p) => p.id === "item_002");
    expect(headphones).toBeDefined();
    expect(headphones.name).toBe("Wireless Headphones Pro");
    expect(headphones.price).toBe(24900);   // $249.00 in cents
    expect(headphones.stock).toBeGreaterThan(0);
  });

  // ── step 2: session creation ──────────────────────────────────────────────

  it("POST /api/checkout_sessions — rejects missing auth", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: "item_002", quantity: 1 }] }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/checkout_sessions — creates session for Wireless Headphones Pro", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        items: [{ id: "item_002", quantity: 1 }],
      }),
    });

    expect(res.status).toBe(201);
    const session = await json<any>(res);

    expect(session.id).toMatch(/^cs_/);
    expect(session.status).toBe("not_ready_for_payment");
    expect(session.currency).toBe("usd");
    expect(session.line_items).toHaveLength(1);
    expect(session.line_items[0].item.name).toBe("Wireless Headphones Pro");

    // $249.00 + 8.75% tax = $270.79 (no shipping yet)
    const itemsTotal = session.totals.find((t: any) => t.type === "items_base_amount");
    const tax        = session.totals.find((t: any) => t.type === "tax");
    const total      = session.totals.find((t: any) => t.type === "total");
    expect(itemsTotal.amount).toBe(24900);
    expect(tax.amount).toBe(2179);  // Math.round(24900 * 0.0875)
    expect(total.amount).toBe(27079);

    // fulfillment options pre-populated
    expect(session.fulfillment_options).toHaveLength(2);
    expect(session.fulfillment_options.map((o: any) => o.id)).toEqual(["fo_std", "fo_exp"]);

    sessionId = session.id;
  });

  // ── step 3: address update ────────────────────────────────────────────────

  it("POST /api/checkout_sessions/:id — rejects unknown session", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions/cs_nonexistent`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ fulfillment_address: { name: "X", line_one: "Y", city: "Z", state: "CA", country: "US", postal_code: "00000" } }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /api/checkout_sessions/:id — adds shipping address → ready_for_payment", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions/${sessionId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fulfillment_address: {
          name: "Navin Kumar",
          line_one: "123 Main St",
          city: "San Francisco",
          state: "CA",
          country: "US",
          postal_code: "94102",
        },
      }),
    });

    expect(res.status).toBe(201);
    const session = await json<any>(res);

    expect(session.status).toBe("ready_for_payment");
    expect(session.fulfillment_address.name).toBe("Navin Kumar");
    // Standard shipping auto-selected ($5.99)
    expect(session.fulfillment_option_id).toBe("fo_std");

    const shipping = session.totals.find((t: any) => t.type === "fulfillment");
    const total    = session.totals.find((t: any) => t.type === "total");
    expect(shipping.amount).toBe(599);    // $5.99
    expect(total.amount).toBe(27678);     // $270.79 + $5.99
  });

  it("POST /api/checkout_sessions/:id — switches to express shipping", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions/${sessionId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ fulfillment_option_id: "fo_exp" }),
    });

    expect(res.status).toBe(201);
    const session = await json<any>(res);

    const shipping = session.totals.find((t: any) => t.type === "fulfillment");
    const total    = session.totals.find((t: any) => t.type === "total");
    expect(shipping.amount).toBe(1499);  // $14.99 express
    expect(total.amount).toBe(28578);    // $270.79 + $14.99

    // Switch back to standard before completing
    await fetch(`${MERCHANT_URL}/api/checkout_sessions/${sessionId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ fulfillment_option_id: "fo_std" }),
    });
  });

  // ── step 4: completion ────────────────────────────────────────────────────

  it("POST /api/checkout_sessions/:id/complete — creates order", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions/${sessionId}/complete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        buyer: { name: "Navin Kumar", email: "navin@example.com" },
        payment_data: { token: "spt_delegated", provider: "stripe" },
      }),
    });

    expect(res.status).toBe(201);
    const session = await json<any>(res);

    expect(session.status).toBe("completed");
    expect(session.order).toBeDefined();
    expect(session.order.id).toMatch(/^ord_/);
    expect(session.order.checkout_session_id).toBe(sessionId);
    expect(session.order.permalink_url).toContain(sessionId);
  });

  // ── step 5: post-completion state checks ──────────────────────────────────

  it("GET /api/internal/sessions — completed session visible in dashboard store", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/internal/sessions`);
    expect(res.status).toBe(200);

    const sessions = await json<any[]>(res);
    const ours = sessions.find((s) => s.id === sessionId);

    expect(ours).toBeDefined();
    expect(ours.status).toBe("completed");
    expect(ours.order.id).toMatch(/^ord_/);

    const total = ours.totals.find((t: any) => t.type === "total");
    expect(total.amount).toBe(27678); // $276.78 final total
  });

  it("POST /api/checkout_sessions/:id/cancel — cannot cancel a completed session", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(405);
  });

  it("POST /api/checkout_sessions/:id/complete — cannot complete twice", async () => {
    const res = await fetch(`${MERCHANT_URL}/api/checkout_sessions/${sessionId}/complete`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        buyer: { name: "Navin Kumar", email: "navin@example.com" },
        payment_data: { token: "spt_delegated", provider: "stripe" },
      }),
    });
    expect(res.status).toBe(422);
  });
});
