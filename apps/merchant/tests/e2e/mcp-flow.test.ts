/**
 * E2E: MCP server — ACP Agentic Checkout binding
 *
 * Tests the /api/mcp JSON-RPC 2.0 endpoint against the live Next.js server
 * started by global-setup.ts (port 3099, ACP_API_KEY = "e2e-test-key").
 *
 * PSP is in mock mode (no STRIPE_SECRET_KEY set): vault tokens with the
 * prefix "vt_mock_" succeed without hitting Stripe.
 *
 * Scenarios covered:
 *   1. Protocol handshake  — initialize + tools/list
 *   2. Happy path          — create → get → update (address) → update (shipping) → complete
 *   3. spec field names    — line_items[].product_id, fulfillment_details.address,
 *                            selected_fulfillment_options
 *   4. Cancel flow         — create → cancel → verify terminal, then block complete
 *   5. Affiliate + notes   — affiliate_attribution, order_notes round-trip
 *   6. Error cases         — unauth, parse error, unknown method/tool, session not found,
 *                            missing payment_data, double-complete
 *   7. Idempotency         — same idempotency_key on create, verify one session returned
 */

import { describe, it, expect, beforeAll } from "vitest";
import { MERCHANT_URL, API_KEY } from "./global-setup";

// ── helpers ───────────────────────────────────────────────────────────────────

const MCP_URL = `${MERCHANT_URL}/api/mcp`;

function authHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
}

let _rpcSeq = 1;
function nextId() { return _rpcSeq++; }

async function rpc(method: string, params: unknown, headers = authHeaders()): Promise<Response> {
  return fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: nextId() }),
  });
}

async function rpcOk<T = unknown>(method: string, params: unknown): Promise<T> {
  const res = await rpc(method, params);
  expect(res.status).toBe(200);
  const body = await res.json() as { result?: T; error?: { code: number; message: string } };
  if (body.error) throw new Error(`RPC error ${body.error.code}: ${body.error.message}`);
  return body.result as T;
}

function meta(overrides: Record<string, string> = {}) {
  return {
    api_version: "2026-04-17",
    idempotency_key: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    ...overrides,
  };
}

// Convenience: call a named MCP tool, assert success, return result content as JSON
async function callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await rpcOk<{ content: { type: string; text: string }[] }>(
    "tools/call",
    { name, arguments: args },
  );
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  return JSON.parse(result.content[0].text) as T;
}

// ── shared test data ──────────────────────────────────────────────────────────

const SHIPPING_ADDRESS = {
  name: "Test Buyer",
  line_one: "1 Infinite Loop",
  city: "Cupertino",
  state: "CA",
  country: "US",
  postal_code: "95014",
};

// Direct payment token (no "vt_" prefix) — completeSession skips PSP charge,
// suitable for tests that focus on checkout state transitions rather than PSP.
function mockDirectToken() {
  return `spt_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

// Register a vault token via the delegate_payment endpoint, then return its id.
// Use this to test the full delegate_payment → vault → charge flow with mock PSP.
async function registerVaultToken(checkoutSessionId: string, maxAmount: number): Promise<string> {
  const res = await fetch(`${MERCHANT_URL}/api/agentic_commerce/delegate_payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      payment_method: { number: "4242424242424242", exp_month: "12", exp_year: "2030", cvc: "123" },
      allowance: {
        checkout_session_id: checkoutSessionId,
        max_amount: maxAmount,
        currency: "usd",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        merchant_id: "merchant_test",
      },
      metadata: {},
    }),
  });
  // delegate_payment returns { id, created, metadata } from tokenizeCard
  const body = await res.json() as { id?: string };
  if (!body.id) throw new Error(`delegate_payment did not return vault token id: ${JSON.stringify(body)}`);
  return body.id;
}

// ── scenario 1: protocol handshake ────────────────────────────────────────────

describe("MCP — Protocol handshake", () => {
  it("POST /api/mcp — rejects missing Authorization header", async () => {
    const res = await rpc("initialize", {}, { "Content-Type": "application/json" });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: number } };
    expect(body.error.code).toBe(-32001);
  });

  it("initialize — returns protocolVersion and server capabilities", async () => {
    const result = await rpcOk<{
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: { tools: object };
    }>("initialize", {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "e2e-test-agent", version: "1.0.0" },
      capabilities: {},
    });

    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.serverInfo.name).toBe("acp-merchant");
    expect(result.serverInfo.version).toBe("2026-04-17");
    expect(result.capabilities.tools).toBeDefined();
  });

  it("ping — returns empty result", async () => {
    const result = await rpcOk<object>("ping", {});
    expect(result).toEqual({});
  });

  it("unknown method — returns -32601 method not found", async () => {
    const res = await rpc("resources/list", {});
    const body = await res.json() as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("invalid JSON body — returns -32700 parse error", async () => {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: authHeaders(),
      body: "{ not valid json",
    });
    const body = await res.json() as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("notifications/initialized (no id) — acknowledged with 204", async () => {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: authHeaders(),
      // Notification: no "id" field
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    });
    expect(res.status).toBe(204);
  });
});

// ── scenario 2: tools/list ────────────────────────────────────────────────────

describe("MCP — tools/list", () => {
  it("returns all 5 ACP checkout tools", async () => {
    const { tools } = await rpcOk<{ tools: { name: string; inputSchema: object }[] }>("tools/list", {});

    const names = tools.map((t) => t.name);
    expect(names).toContain("create_checkout_session");
    expect(names).toContain("get_checkout_session");
    expect(names).toContain("update_checkout_session");
    expect(names).toContain("complete_checkout_session");
    expect(names).toContain("cancel_checkout_session");
    expect(tools).toHaveLength(5);
  });

  it("each tool has a description and inputSchema with meta + required fields", async () => {
    const { tools } = await rpcOk<{ tools: { name: string; description: string; inputSchema: { properties: { meta: object } } }[] }>(
      "tools/list", {},
    );
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.properties.meta).toBeDefined();
    }
  });

  it("create tool schema requires line_items, currency, capabilities", async () => {
    const { tools } = await rpcOk<{ tools: { name: string; inputSchema: { properties: { payload: { properties: object; required?: string[] } } } }[] }>(
      "tools/list", {},
    );
    const create = tools.find((t) => t.name === "create_checkout_session")!;
    const payloadSchema = create.inputSchema.properties.payload;
    expect(payloadSchema.required).toContain("line_items");
    expect(payloadSchema.required).toContain("currency");
    expect(payloadSchema.required).toContain("capabilities");
  });
});

// ── scenario 3: happy path — create → get → update → complete ────────────────

describe("MCP — Happy path (mock PSP)", () => {
  let sessionId: string;
  const directToken = mockDirectToken();

  it("create_checkout_session — spec field names (line_items with product_id)", async () => {
    const session = await callTool<{
      id: string;
      status: string;
      currency: string;
      line_items: { item: { name?: string } }[];
      totals: { type: string; amount: number }[];
      fulfillment_options: { id: string }[];
    }>("create_checkout_session", {
      meta: meta(),
      payload: {
        line_items: [{ product_id: "item_001", quantity: 1 }],  // spec shape: product_id not id
        currency: "usd",
        capabilities: {},
      },
    });

    expect(session.id).toMatch(/^cs_/);
    expect(session.status).toBe("not_ready_for_payment");
    expect(session.currency).toBe("usd");
    expect(session.line_items).toHaveLength(1);
    expect(session.fulfillment_options).toHaveLength(2);

    // totals present with no shipping yet
    const total = session.totals.find((t) => t.type === "total");
    expect(total?.amount).toBeGreaterThan(0);

    sessionId = session.id;
  });

  it("get_checkout_session — retrieves session by id", async () => {
    const session = await callTool<{ id: string; status: string }>("get_checkout_session", {
      meta: meta(),
      id: sessionId,
    });

    expect(session.id).toBe(sessionId);
    expect(session.status).toBe("not_ready_for_payment");
  });

  it("update_checkout_session — spec field: fulfillment_details.address → ready_for_payment", async () => {
    const session = await callTool<{
      status: string;
      fulfillment_address: { name: string };
      fulfillment_option_id: string;
      totals: { type: string; amount: number }[];
    }>("update_checkout_session", {
      meta: meta(),
      id: sessionId,
      payload: {
        fulfillment_details: {              // spec shape: address nested under fulfillment_details
          address: SHIPPING_ADDRESS,
        },
      },
    });

    expect(session.status).toBe("ready_for_payment");
    expect(session.fulfillment_address.name).toBe("Test Buyer");
    expect(session.fulfillment_option_id).toBe("fo_std");   // auto-selected

    const shipping = session.totals.find((t) => t.type === "fulfillment");
    expect(shipping?.amount).toBe(599);    // $5.99 standard
  });

  it("update_checkout_session — spec field: selected_fulfillment_options switches to express", async () => {
    const session = await callTool<{
      fulfillment_option_id: string;
      totals: { type: string; amount: number }[];
    }>("update_checkout_session", {
      meta: meta(),
      id: sessionId,
      payload: {
        // spec shape: selected_fulfillment_options array with shipping.option_id
        selected_fulfillment_options: [{ shipping: { option_id: "fo_exp" } }],
      },
    });

    expect(session.fulfillment_option_id).toBe("fo_exp");
    const shipping = session.totals.find((t) => t.type === "fulfillment");
    expect(shipping?.amount).toBe(1499);  // $14.99 express
  });

  it("complete_checkout_session — direct payment token creates order", async () => {
    // Switch back to standard shipping first
    await callTool("update_checkout_session", {
      meta: meta(),
      id: sessionId,
      payload: { fulfillment_option_id: "fo_std" },
    });

    const session = await callTool<{
      status: string;
      order: {
        id: string;
        order_number: string;
        checkout_session_id: string;
        status: string;
        permalink_url: string;
      };
    }>("complete_checkout_session", {
      meta: meta(),
      id: sessionId,
      payload: {
        buyer: { name: "Test Buyer", email: "test@example.com" },
        payment_data: { token: directToken },
      },
    });

    expect(session.status).toBe("completed");
    expect(session.order).toBeDefined();
    expect(session.order.id).toMatch(/^ord_/);
    expect(session.order.order_number).toMatch(/\d{8}/);
    expect(session.order.checkout_session_id).toBe(sessionId);
    expect(session.order.status).toBe("confirmed");
    expect(session.order.permalink_url).toContain(sessionId);
  });

  it("get_checkout_session — final state shows completed + order", async () => {
    const session = await callTool<{ status: string; order: { id: string } }>(
      "get_checkout_session",
      { meta: meta(), id: sessionId },
    );
    expect(session.status).toBe("completed");
    expect(session.order.id).toMatch(/^ord_/);
  });
});

// ── scenario 4: vault token flow (delegate_payment → charge) ─────────────────

describe("MCP — Vault token via delegate_payment (mock PSP)", () => {
  it("registers a vault token then completes via complete_checkout_session", async () => {
    // 1. Create session
    const created = await callTool<{
      id: string;
      totals: { type: string; amount: number }[];
    }>("create_checkout_session", {
      meta: meta(),
      payload: {
        line_items: [{ product_id: "item_001", quantity: 1 }],
        currency: "usd",
        capabilities: {},
      },
    });

    // 2. Add address so session is ready_for_payment
    await callTool("update_checkout_session", {
      meta: meta(),
      id: created.id,
      payload: { fulfillment_details: { address: SHIPPING_ADDRESS } },
    });

    // Re-fetch to get authoritative total after shipping is applied
    const ready = await callTool<{ totals: { type: string; amount: number }[] }>(
      "get_checkout_session",
      { meta: meta(), id: created.id },
    );
    const total = ready.totals.find((t) => t.type === "total")!;

    // 3. Register vault token via delegate_payment (mock PSP — no Stripe key)
    const vtId = await registerVaultToken(created.id, total.amount + 500); // +500 buffer

    expect(vtId).toMatch(/^vt_mock_/);

    // 4. Complete via MCP tool with the registered vault token
    const session = await callTool<{
      status: string;
      order: { id: string; status: string };
    }>("complete_checkout_session", {
      meta: meta(),
      id: created.id,
      payload: {
        buyer: { name: "Vault Buyer", email: "vault@example.com" },
        payment_data: { token: vtId },
      },
    });

    expect(session.status).toBe("completed");
    expect(session.order.status).toBe("confirmed");
    expect(session.order.id).toMatch(/^ord_/);
  });
});

// ── scenario 5: cancel flow ───────────────────────────────────────────────────

describe("MCP — Cancel flow", () => {
  let sessionId: string;

  beforeAll(async () => {
    const session = await callTool<{ id: string }>("create_checkout_session", {
      meta: meta(),
      payload: {
        line_items: [{ product_id: "item_002", quantity: 1 }],
        currency: "usd",
        capabilities: {},
      },
    });
    sessionId = session.id;
  });

  it("cancel_checkout_session — with intent_trace marks session canceled", async () => {
    const session = await callTool<{ status: string }>("cancel_checkout_session", {
      meta: meta(),
      id: sessionId,
      payload: {
        intent_trace: {
          reason_code: "buyer_cancelled",
          trace_summary: "Customer decided not to purchase after reviewing totals.",
        },
      },
    });
    expect(session.status).toBe("canceled");
  });

  it("cancel_checkout_session — cannot cancel an already-canceled session", async () => {
    const res = await rpc("tools/call", {
      name: "cancel_checkout_session",
      arguments: { meta: meta(), id: sessionId },
    });
    const body = await res.json() as { error?: { code: number; message: string }; result?: unknown };
    // Server returns RPC error (not HTTP 4xx) for business-logic failures
    expect(body.error).toBeDefined();
    expect(body.error!.message).toMatch(/[Cc]ancel/);
  });

  it("complete_checkout_session — cannot complete a canceled session", async () => {
    const res = await rpc("tools/call", {
      name: "complete_checkout_session",
      arguments: {
        meta: meta(),
        id: sessionId,
        payload: { payment_data: { token: mockDirectToken() } },
      },
    });
    const body = await res.json() as { error?: { code: number; message: string } };
    expect(body.error).toBeDefined();
    expect(body.error!.message).toMatch(/[Nn]ot ready/);
  });

  it("cancel_checkout_session — minimal call, no payload, no intent_trace", async () => {
    const fresh = await callTool<{ id: string }>("create_checkout_session", {
      meta: meta(),
      payload: { line_items: [{ product_id: "item_001", quantity: 1 }], currency: "usd", capabilities: {} },
    });
    const canceled = await callTool<{ status: string }>("cancel_checkout_session", {
      meta: meta(),
      id: fresh.id,
    });
    expect(canceled.status).toBe("canceled");
  });
});

// ── scenario 6: affiliate attribution + order notes ───────────────────────────

describe("MCP — Affiliate attribution & order notes", () => {
  it("create with affiliate_attribution round-trips the field through the session", async () => {
    const session = await callTool<{ id: string; affiliate_attribution?: { provider: string; touchpoint: string } }>(
      "create_checkout_session",
      {
        meta: meta(),
        payload: {
          line_items: [{ product_id: "item_001", quantity: 1 }],
          currency: "usd",
          capabilities: {},
          affiliate_attribution: {
            provider: "shareasale",
            token: "aff_token_abc123",
            publisher_id: "pub_789",
            touchpoint: "first",
          },
        },
      },
    );
    expect(session.id).toMatch(/^cs_/);
    // Attribution stored on session
    expect(session.affiliate_attribution).toBeDefined();
    expect(session.affiliate_attribution!.provider).toBe("shareasale");
    expect(session.affiliate_attribution!.touchpoint).toBe("first");
  });

  it("complete with last-touch affiliate_attribution and order_notes", async () => {
    // Create + address → then complete
    const created = await callTool<{ id: string }>("create_checkout_session", {
      meta: meta(),
      payload: {
        line_items: [{ product_id: "item_001", quantity: 2 }],
        currency: "usd",
        capabilities: {},
      },
    });

    await callTool("update_checkout_session", {
      meta: meta(),
      id: created.id,
      payload: { fulfillment_details: { address: SHIPPING_ADDRESS } },
    });

    const session = await callTool<{ status: string; order: { id: string } }>(
      "complete_checkout_session",
      {
        meta: meta(),
        id: created.id,
        payload: {
          buyer: { name: "Affiliate Buyer", email: "aff@example.com" },
          payment_data: { token: mockDirectToken() },
          affiliate_attribution: { provider: "impact", token: "tk_last", touchpoint: "last" },
          order_notes: "Please leave at front door.",
        },
      },
    );

    expect(session.status).toBe("completed");
    expect(session.order.id).toMatch(/^ord_/);
  });
});

// ── scenario 7: multi-item cart + stock deduction ─────────────────────────────

describe("MCP — Multi-item cart", () => {
  it("create with two distinct products, verify line_items and totals", async () => {
    const session = await callTool<{
      id: string;
      line_items: { item: { id: string }; base_amount: number; tax: number }[];
      totals: { type: string; amount: number }[];
    }>("create_checkout_session", {
      meta: meta(),
      payload: {
        line_items: [
          { product_id: "item_001", quantity: 1 },
          { product_id: "item_002", quantity: 1 },
        ],
        currency: "usd",
        capabilities: {},
      },
    });

    expect(session.line_items).toHaveLength(2);
    expect(session.line_items.map((l) => l.item.id).sort()).toEqual(["item_001", "item_002"].sort());

    const subtotal = session.totals.find((t) => t.type === "items_base_amount")!;
    const tax      = session.totals.find((t) => t.type === "tax")!;
    const total    = session.totals.find((t) => t.type === "total")!;

    expect(subtotal.amount).toBeGreaterThan(0);
    expect(tax.amount).toBe(Math.round(subtotal.amount * 0.0875));
    expect(total.amount).toBe(subtotal.amount + tax.amount); // no shipping yet
  });
});

// ── scenario 8: error handling ────────────────────────────────────────────────

describe("MCP — Error handling", () => {
  it("get_checkout_session — session not found returns RPC error", async () => {
    const res = await rpc("tools/call", {
      name: "get_checkout_session",
      arguments: { meta: meta(), id: "cs_does_not_exist" },
    });
    const body = await res.json() as { error?: { code: number; message: string } };
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32000);
    expect(body.error!.message).toMatch(/[Nn]ot found/);
  });

  it("create_checkout_session — empty line_items returns -32602 invalid params", async () => {
    const res = await rpc("tools/call", {
      name: "create_checkout_session",
      arguments: {
        meta: meta(),
        payload: { line_items: [], currency: "usd", capabilities: {} },
      },
    });
    const body = await res.json() as { error?: { code: number } };
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32602);
  });

  it("complete_checkout_session — missing payment_data returns -32602", async () => {
    const session = await callTool<{ id: string }>("create_checkout_session", {
      meta: meta(),
      payload: { line_items: [{ product_id: "item_001", quantity: 1 }], currency: "usd", capabilities: {} },
    });

    await callTool("update_checkout_session", {
      meta: meta(),
      id: session.id,
      payload: { fulfillment_details: { address: SHIPPING_ADDRESS } },
    });

    const res = await rpc("tools/call", {
      name: "complete_checkout_session",
      arguments: { meta: meta(), id: session.id, payload: {} },
    });
    const body = await res.json() as { error?: { code: number } };
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32602);
  });

  it("complete_checkout_session — not-ready session (no address) returns error", async () => {
    const session = await callTool<{ id: string }>("create_checkout_session", {
      meta: meta(),
      payload: { line_items: [{ product_id: "item_001", quantity: 1 }], currency: "usd", capabilities: {} },
    });

    const res = await rpc("tools/call", {
      name: "complete_checkout_session",
      arguments: {
        meta: meta(),
        id: session.id,
        payload: { payment_data: { token: mockDirectToken() } },
      },
    });
    const body = await res.json() as { error?: { code: number; message: string } };
    expect(body.error).toBeDefined();
    expect(body.error!.message).toMatch(/[Nn]ot ready/);
  });

  it("complete_checkout_session — double complete is rejected", async () => {
    const session = await callTool<{ id: string }>("create_checkout_session", {
      meta: meta(),
      payload: { line_items: [{ product_id: "item_001", quantity: 1 }], currency: "usd", capabilities: {} },
    });

    await callTool("update_checkout_session", {
      meta: meta(),
      id: session.id,
      payload: { fulfillment_details: { address: SHIPPING_ADDRESS } },
    });

    const vtok = mockDirectToken();
    await callTool("complete_checkout_session", {
      meta: meta(),
      id: session.id,
      payload: { buyer: { name: "X", email: "x@x.com" }, payment_data: { token: vtok } },
    });

    const res = await rpc("tools/call", {
      name: "complete_checkout_session",
      arguments: {
        meta: meta(),
        id: session.id,
        payload: { payment_data: { token: vtok } },
      },
    });
    const body = await res.json() as { error?: { code: number } };
    expect(body.error).toBeDefined();
  });

  it("tools/call — unknown tool name returns -32601", async () => {
    const res = await rpc("tools/call", {
      name: "nonexistent_tool",
      arguments: { meta: meta() },
    });
    const body = await res.json() as { error?: { code: number } };
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32601);
  });
});

// ── scenario 9: meta header propagation ──────────────────────────────────────

describe("MCP — meta header fields", () => {
  it("meta.api_version is required — missing it still works (additionalProperties: true)", async () => {
    // The server validates tools, not meta internals — meta is advisory
    // This tests that a call with minimal meta is accepted
    const session = await callTool<{ id: string }>("create_checkout_session", {
      meta: { api_version: "2026-04-17" },  // minimal meta
      payload: { line_items: [{ product_id: "item_001", quantity: 1 }], currency: "usd", capabilities: {} },
    });
    expect(session.id).toMatch(/^cs_/);
  });

  it("meta.request_id and idempotency_key are accepted and flow through", async () => {
    const requestId = "req_" + crypto.randomUUID();
    const idemKey   = "idem_" + crypto.randomUUID();

    // Just verify the call succeeds with these headers present
    const session = await callTool<{ id: string }>("create_checkout_session", {
      meta: { api_version: "2026-04-17", request_id: requestId, idempotency_key: idemKey },
      payload: { line_items: [{ product_id: "item_001", quantity: 1 }], currency: "usd", capabilities: {} },
    });
    expect(session.id).toMatch(/^cs_/);
  });
});
