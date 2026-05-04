/**
 * ACP MCP client — @ai-sdk/mcp binding
 *
 * Transport: native type:'http' (Streamable HTTP / stateless JSON-RPC POST)
 *   @ai-sdk/mcp ships built-in HTTP transport, so no custom class is needed.
 *
 * Meta injection: each tool's execute is wrapped to auto-populate the ACP
 *   protocol headers (api_version, idempotency_key, request_id) so Claude
 *   only sees the business-level parameters (payload, id).
 *
 * Usage:
 *   const { tools, close } = await createAcpMcpTools();
 *   // pass tools to streamText, call close() in onFinish
 */

import { createMCPClient } from "@ai-sdk/mcp";
import { tool, type Tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

// ── Protocol meta ─────────────────────────────────────────────────────────────

function buildMeta() {
  return {
    api_version: "2026-04-17" as const,
    idempotency_key: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
  };
}

// ── ACP tool schemas (Claude-facing — meta omitted, injected at call time) ───
// These mirror the OpenRPC spec shapes but strip the protocol meta so Claude
// only needs to reason about e-commerce semantics.

const addr = z.object({
  name: z.string(),
  line_one: z.string(),
  line_two: z.string().optional(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  postal_code: z.string(),
  phone_number: z.string().optional(),
});

const buyer = z.object({
  name: z.string(),
  email: z.string().email(),
  phone_number: z.string().optional(),
});

const lineItem = z.object({
  product_id: z.string().describe("Merchant product ID"),
  quantity: z.number().int().positive(),
});

const fulfillmentDetails = z.object({
  address: addr.optional(),
});

const paymentData = z.object({
  token: z.string().describe("Vault token (vt_…) from delegate_payment, or direct payment token"),
  provider: z.enum(["stripe", "adyen", "braintree"]).optional(),
  billing_address: addr.optional(),
});

const ACP_TOOL_SCHEMAS = {
  create_checkout_session: {
    inputSchema: z.object({
      payload: z.object({
        line_items: z.array(lineItem).min(1).describe("Items to purchase (use product_id, not id)"),
        currency: z.string().default("usd").describe("ISO 4217 currency code"),
        capabilities: z.record(z.unknown()).optional().default({}),
        buyer: buyer.optional(),
        fulfillment_details: fulfillmentDetails.optional().describe("Shipping address"),
        order_notes: z.string().optional(),
      }),
    }),
  },
  get_checkout_session: {
    inputSchema: z.object({
      id: z.string().describe("Checkout session ID to retrieve"),
    }),
  },
  update_checkout_session: {
    inputSchema: z.object({
      id: z.string().describe("Checkout session ID to update"),
      payload: z.object({
        buyer: buyer.optional(),
        line_items: z.array(lineItem).optional(),
        fulfillment_details: fulfillmentDetails.optional().describe("Shipping address"),
        selected_fulfillment_options: z
          .array(
            z.object({
              shipping: z.object({ option_id: z.string() }).optional(),
            }),
          )
          .optional()
          .describe("Select a fulfillment option, e.g. [{ shipping: { option_id: 'fo_std' } }]"),
        fulfillment_option_id: z
          .string()
          .optional()
          .describe("Shorthand shipping option id when only one group (fo_std or fo_exp)"),
        order_notes: z.string().optional(),
      }),
    }),
  },
  complete_checkout_session: {
    inputSchema: z.object({
      id: z.string().describe("Checkout session ID to complete"),
      payload: z.object({
        payment_data: paymentData.describe("Payment token for the order"),
        buyer: buyer.optional(),
        order_notes: z.string().optional(),
      }),
    }),
  },
  cancel_checkout_session: {
    inputSchema: z.object({
      id: z.string().describe("Checkout session ID to cancel"),
      payload: z
        .object({
          intent_trace: z
            .object({
              reason_code: z.string(),
              trace_summary: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    }),
  },
};

// ── Client factory ────────────────────────────────────────────────────────────

/**
 * Creates an MCP client connected to the merchant's /api/mcp endpoint and
 * returns AI SDK tools with meta auto-injected at call time.
 *
 * Call close() in streamText's onFinish to clean up the connection.
 */
export async function createAcpMcpTools(): Promise<{
  tools: Record<string, Tool>;
  close: () => Promise<void>;
}> {
  const url = `${process.env.MERCHANT_API_URL}/api/mcp`;
  const key = process.env.MERCHANT_API_KEY ?? "";

  const client = await createMCPClient({
    transport: {
      type: "http",
      url,
      headers: { Authorization: `Bearer ${key}` },
    },
  });

  // Get tools with our schema overrides — meta is NOT in these schemas so
  // Claude only sees the business params. We inject meta in the wrapper below.
  const mcpTools = await client.tools({ schemas: ACP_TOOL_SCHEMAS });

  // Wrap each tool's execute to inject protocol meta before the MCP call.
  type LooseTool = {
    description?: string;
    parameters: z.ZodTypeAny;
    execute: (a: unknown, o: ToolExecutionOptions) => Promise<unknown>;
  };
  const tools: Record<string, Tool> = Object.fromEntries(
    Object.entries(mcpTools).map(([name, t]) => {
      const mcpTool = t as unknown as LooseTool;
      return [
        name,
        {
          ...mcpTool,
          execute: async (args: Record<string, unknown>, opts: ToolExecutionOptions) => {
            return mcpTool.execute({ meta: buildMeta(), ...args }, opts);
          },
        },
      ];
    }),
  );

  // listProducts is a REST endpoint, not an ACP MCP tool — add it locally so
  // Claude can discover what to buy before creating a checkout session.
  tools.listProducts = tool({
    description: "List products from the merchant catalog. Use this first to find item IDs before creating a checkout session.",
    parameters: z.object({
      query: z.string().optional().describe("Optional keyword filter"),
    }),
    execute: async ({ query }) => {
      const base = process.env.MERCHANT_API_URL ?? "";
      const res = await fetch(`${base}/api/products`);
      const { products } = (await res.json()) as { products: Record<string, unknown>[] };
      const fmt = (p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        price: `$${((p.price as number) / 100).toFixed(2)}`,
        description: p.description,
        in_stock: (p.stock as number) > 0,
      });
      return query
        ? products
            .filter((p) =>
              `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
            )
            .map(fmt)
        : products.map(fmt);
    },
  });

  return { tools, close: () => client.close() };
}
