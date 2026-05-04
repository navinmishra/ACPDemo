/**
 * MCP server — ACP Agentic Checkout binding (openrpc.agentic_checkout.json 2026-04-17)
 *
 * Transport: stateless HTTP JSON-RPC 2.0 (Streamable HTTP, no SSE)
 * Auth:      Bearer token at server level (ACP_API_KEY env var)
 *
 * Methods handled:
 *   initialize          → server capabilities handshake
 *   notifications/*     → acknowledged, no body
 *   tools/list          → 5 tool definitions matching the OpenRPC spec
 *   tools/call          → dispatches to checkout_sessions handlers
 *   ping                → health check
 */

import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { createSession, updateSession, completeSession, cancelSession } from "@/lib/acp";
import { store } from "@/lib/store";
import { log } from "@/lib/logger";

// ── JSON-RPC 2.0 primitives ───────────────────────────────────────────────────

type JrpcId = string | number | null;

interface JrpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id?: JrpcId;
}

function ok(id: JrpcId, data: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", result: data, id });
}

function rpcErr(id: JrpcId, code: number, message: string): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", error: { code, message }, id: id ?? null });
}

// ── Tool schemas (faithful to openrpc.agentic_checkout.json) ─────────────────

const META_SCHEMA = {
  type: "object",
  description: "Protocol metadata mapped from ACP HTTP headers.",
  required: ["api_version"],
  additionalProperties: true,
  properties: {
    api_version: { type: "string", description: "ACP API version date, e.g. '2026-04-17'." },
    idempotency_key: { type: "string", description: "Unique key for retry safety." },
    request_id: { type: "string", description: "Correlation ID for request tracing." },
    user_agent: { type: "string", description: "Agent identification string." },
    accept_language: { type: "string", description: "Locale preference, e.g. 'en-US'." },
    signature: { type: "string", description: "Request signature for integrity verification." },
    timestamp: { type: "string", format: "date-time", description: "Request signing timestamp (RFC 3339)." },
  },
};

const ITEM_SCHEMA = {
  type: "object",
  required: ["product_id", "quantity"],
  properties: {
    product_id: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    variant_id: { type: "string" },
  },
};

const ADDRESS_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    line_one: { type: "string" },
    line_two: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    country: { type: "string" },
    postal_code: { type: "string" },
    phone_number: { type: "string" },
  },
};

const FULFILLMENT_DETAILS_SCHEMA = {
  type: "object",
  description: "Fulfillment contact and address details.",
  properties: {
    address: ADDRESS_SCHEMA,
    contact: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
        phone_number: { type: "string" },
      },
    },
  },
};

const PAYMENT_DATA_SCHEMA = {
  type: "object",
  required: ["token"],
  properties: {
    token: { type: "string", description: "Vault token (vt_...) from delegate_payment, or direct payment token." },
    provider: { type: "string", enum: ["stripe", "adyen", "braintree"] },
    billing_address: ADDRESS_SCHEMA,
  },
};

const TOOLS = [
  {
    name: "create_checkout_session",
    description:
      "Create a new checkout session from line items, currency, and capabilities. Maps to POST /checkout_sessions.",
    inputSchema: {
      type: "object",
      required: ["meta", "payload"],
      properties: {
        meta: META_SCHEMA,
        payload: {
          type: "object",
          required: ["line_items", "currency", "capabilities"],
          properties: {
            buyer: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string", format: "email" },
                phone_number: { type: "string" },
              },
            },
            line_items: { type: "array", minItems: 1, items: ITEM_SCHEMA },
            currency: { type: "string", description: "ISO 4217 currency code." },
            fulfillment_details: FULFILLMENT_DETAILS_SCHEMA,
            capabilities: { type: "object", additionalProperties: true },
            discounts: {
              type: "object",
              properties: { codes: { type: "array", items: { type: "string" } } },
            },
            affiliate_attribution: {
              type: "object",
              properties: {
                provider: { type: "string" },
                token: { type: "string" },
                publisher_id: { type: "string" },
                touchpoint: { type: "string", enum: ["first", "last"] },
              },
            },
            locale: { type: "string" },
            timezone: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
            order_notes: { type: "string", maxLength: 5000 },
          },
        },
      },
    },
  },
  {
    name: "get_checkout_session",
    description:
      "Returns the latest authoritative state for a checkout session. Maps to GET /checkout_sessions/{id}.",
    inputSchema: {
      type: "object",
      required: ["meta", "id"],
      properties: {
        meta: META_SCHEMA,
        id: { type: "string", description: "The checkout session ID (maps to checkout_session_id path parameter)." },
      },
    },
  },
  {
    name: "update_checkout_session",
    description:
      "Apply changes (items, fulfillment address, fulfillment option) and return updated cart state. Maps to POST /checkout_sessions/{id}.",
    inputSchema: {
      type: "object",
      required: ["meta", "id", "payload"],
      properties: {
        meta: META_SCHEMA,
        id: { type: "string", description: "The checkout session ID." },
        payload: {
          type: "object",
          properties: {
            buyer: { type: "object" },
            line_items: { type: "array", items: ITEM_SCHEMA },
            fulfillment_details: FULFILLMENT_DETAILS_SCHEMA,
            selected_fulfillment_options: {
              type: "array",
              description: "Fulfillment options selected by the buyer.",
              items: {
                type: "object",
                properties: {
                  fulfillment_group_id: { type: "string" },
                  option_id: { type: "string" },
                  shipping: {
                    type: "object",
                    properties: { option_id: { type: "string" } },
                  },
                },
              },
            },
            fulfillment_option_id: {
              type: "string",
              description: "Shorthand: set directly when only one fulfillment group exists.",
            },
            discounts: { type: "object" },
            order_notes: { type: "string", maxLength: 5000 },
          },
        },
      },
    },
  },
  {
    name: "complete_checkout_session",
    description:
      "Finalize the checkout by applying a payment method. Creates an order and returns completed state on success. Maps to POST /checkout_sessions/{id}/complete.",
    inputSchema: {
      type: "object",
      required: ["meta", "id", "payload"],
      properties: {
        meta: META_SCHEMA,
        id: { type: "string", description: "The checkout session ID." },
        payload: {
          type: "object",
          required: ["payment_data"],
          properties: {
            buyer: { type: "object" },
            payment_data: PAYMENT_DATA_SCHEMA,
            authentication_result: {
              type: "object",
              description: "Authentication result for 3DS flows.",
              properties: {
                three_d_secure: { type: "object" },
              },
            },
            affiliate_attribution: { type: "object" },
            risk_signals: {
              type: "object",
              description: "Risk and fraud signals from the agent.",
              additionalProperties: true,
            },
            marketing_consents: {
              type: "array",
              description: "Buyer marketing consent decisions. Omit options not surfaced to the buyer.",
              items: {
                type: "object",
                properties: {
                  channel: { type: "string" },
                  consented: { type: "boolean" },
                },
              },
            },
            order_notes: { type: "string", maxLength: 5000 },
          },
        },
      },
    },
  },
  {
    name: "cancel_checkout_session",
    description:
      "Cancel a session if not already completed or canceled. Maps to POST /checkout_sessions/{id}/cancel.",
    inputSchema: {
      type: "object",
      required: ["meta", "id"],
      properties: {
        meta: META_SCHEMA,
        id: { type: "string", description: "The checkout session ID." },
        payload: {
          type: "object",
          description: "Optional cancellation data.",
          properties: {
            intent_trace: {
              type: "object",
              properties: {
                reason_code: { type: "string" },
                trace_summary: { type: "string" },
                metadata: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
];

// ── Spec → internal type translation ─────────────────────────────────────────
// The OpenRPC spec uses line_items[].product_id; internal types use items[].id.
// fulfillment_details.address maps to the flat fulfillment_address field.

type SpecItem = { product_id: string; quantity: number };

function toInternalItems(lineItems: SpecItem[]) {
  return lineItems.map((i) => ({ id: i.product_id, quantity: i.quantity }));
}

type SpecFulfillmentDetails = { address?: Record<string, unknown>; contact?: Record<string, unknown> } | null | undefined;

function toInternalAddress(fd: SpecFulfillmentDetails) {
  return fd?.address ?? undefined;
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

type ToolArgs = {
  meta: Record<string, string | undefined>;
  id?: string;
  payload?: Record<string, unknown>;
};

async function callTool(name: string, args: ToolArgs): Promise<unknown> {
  const { meta, id: sessionId, payload = {} } = args;
  const ctx = { requestId: meta.request_id, idempotencyKey: meta.idempotency_key };

  switch (name) {
    case "create_checkout_session": {
      const lineItems = (payload.line_items as SpecItem[] | undefined) ?? [];
      if (!lineItems.length) throw mcpError(-32602, "payload.line_items must have at least one item");

      const session = await createSession({
        items: toInternalItems(lineItems),
        buyer: payload.buyer as never,
        currency: (payload.currency as string | undefined) ?? "usd",
        fulfillment_address: toInternalAddress(payload.fulfillment_details as SpecFulfillmentDetails) as never,
        affiliate_attribution: payload.affiliate_attribution as never,
        capabilities: (payload.capabilities as Record<string, unknown> | undefined) ?? {},
      });

      log("info", "mcp_tool_call", { tool: name, sessionId: session.id, ...ctx });
      return toolContent(session);
    }

    case "get_checkout_session": {
      if (!sessionId) throw mcpError(-32602, "id is required");
      const s = await store.get(sessionId);
      if (!s) throw mcpError(-32000, `Session not found: ${sessionId}`);
      log("info", "mcp_tool_call", { tool: name, sessionId, ...ctx });
      return toolContent(s);
    }

    case "update_checkout_session": {
      if (!sessionId) throw mcpError(-32602, "id is required");
      const lineItems = payload.line_items as SpecItem[] | undefined;

      const session = await updateSession(sessionId, {
        buyer: payload.buyer as never,
        items: lineItems ? toInternalItems(lineItems) : undefined,
        fulfillment_address: toInternalAddress(payload.fulfillment_details as SpecFulfillmentDetails) as never,
        // Pass selected_fulfillment_options and fulfillment_option_id through — handled by updateSession
        selected_fulfillment_options: payload.selected_fulfillment_options as never,
        fulfillment_option_id: payload.fulfillment_option_id as string | undefined,
      });

      log("info", "mcp_tool_call", { tool: name, sessionId, ...ctx });
      return toolContent(session);
    }

    case "complete_checkout_session": {
      if (!sessionId) throw mcpError(-32602, "id is required");
      if (!payload.payment_data) throw mcpError(-32602, "payload.payment_data is required");

      const session = await completeSession(sessionId, {
        buyer: payload.buyer as never,
        payment_data: payload.payment_data as never,
        affiliate_attribution: payload.affiliate_attribution as never,
        authentication_result: payload.authentication_result,
      });

      log("info", "mcp_tool_call", { tool: name, sessionId, ...ctx });
      return toolContent(session);
    }

    case "cancel_checkout_session": {
      if (!sessionId) throw mcpError(-32602, "id is required");
      const p = (payload ?? {}) as Record<string, unknown>;
      const session = await cancelSession(sessionId, {
        intent_trace: p.intent_trace as never,
      });
      log("info", "mcp_tool_call", { tool: name, sessionId, ...ctx });
      return toolContent(session);
    }

    default:
      throw mcpError(-32601, `Unknown tool: ${name}`);
  }
}

function toolContent(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function mcpError(code: number, message: string): { code: number; message: string } {
  return { code, message };
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyBearer(req)) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
      { status: 401 },
    );
  }

  let body: JrpcRequest;
  try {
    body = (await req.json()) as JrpcRequest;
  } catch {
    return rpcErr(null, -32700, "Parse error: request body must be valid JSON");
  }

  const { method, params, id } = body;
  // Notifications have no id — acknowledge without a body
  if (id === undefined) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "acp-merchant", version: "2026-04-17" },
          capabilities: { tools: {} },
        });

      case "ping":
        return ok(id, {});

      case "tools/list":
        return ok(id, { tools: TOOLS });

      case "tools/call": {
        const { name, arguments: toolArgs } = params as { name: string; arguments: ToolArgs };
        if (!name) return rpcErr(id, -32602, "params.name is required");
        const result = await callTool(name, toolArgs ?? {});
        return ok(id, result);
      }

      default:
        return rpcErr(id, -32601, `Method not found: ${method}`);
    }
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      const err = e as { code: number; message: string };
      return rpcErr(id, err.code, err.message);
    }
    const msg = e instanceof Error ? e.message : String(e);
    log("error", "mcp_error", { method, error: msg });
    return rpcErr(id, -32000, msg);
  }
}

// OPTIONS — satisfies CORS preflight (headers are set by next.config.mjs)
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
