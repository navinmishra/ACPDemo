/**
 * MCP-native chat route — Agent → Merchant via ACP MCP binding
 *
 * Parallel to /api/chat (which uses direct REST).
 * Uses experimental_createMCPClient + HttpMcpTransport to talk to the
 * merchant's /api/mcp JSON-RPC endpoint per openrpc.agentic_checkout.json.
 *
 * Tools:
 *   listProducts             — REST (not in ACP MCP spec; local tool)
 *   create_checkout_session  — MCP  (spec field: line_items[].product_id)
 *   get_checkout_session     — MCP
 *   update_checkout_session  — MCP  (spec field: fulfillment_details.address)
 *   complete_checkout_session — MCP
 *   cancel_checkout_session  — MCP
 *
 * Protocol meta (api_version, idempotency_key, request_id) is injected
 * automatically by the client wrapper — Claude never sees it.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createAcpMcpTools } from "@/lib/mcp-client";

export const maxDuration = 60;

const SYSTEM = `\
You are an AI shopping agent using the Agentic Commerce Protocol (ACP) over MCP.

WORKFLOW — follow this order exactly:
1. listProducts          — discover what's available and note the product id (not name)
2. create_checkout_session — start a session with line_items using product_id, currency "usd", capabilities {}
3. Ask the user for: full name, email, shipping address (line_one, city, state, postal_code, country)
4. update_checkout_session — send fulfillment_details.address with the shipping address
5. Show the full order summary (items, shipping, tax, total) and ask for explicit confirmation
6. complete_checkout_session — ONLY after the user says yes; include buyer name + email + payment_data
7. Share the order ID and confirmation URL

RULES:
- Never call complete_checkout_session without explicit user confirmation ("yes", "confirm", "go ahead").
- If the user wants to abandon the cart, call cancel_checkout_session with a reason_code.
- Use get_checkout_session to refresh state if needed between steps.
- Prices are in cents in tool responses — convert to dollars when displaying ($249.00 not 24900).
- fulfillment_options in the session show available shipping choices (fo_std = standard, fo_exp = express).
  After the user picks a shipping method, call update_checkout_session with fulfillment_option_id.
- payment_data.token: use "spt_delegated" for demo orders (no real card needed in dev).`;

export async function POST(req: Request): Promise<Response> {
  const { messages } = (await req.json()) as { messages: unknown[] };

  const { tools, close } = await createAcpMcpTools();

  const result = await streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SYSTEM,
    messages: messages as Parameters<typeof streamText>[0]["messages"],
    tools,
    maxSteps: 12,
    onFinish: async () => {
      await close();
    },
  });

  return result.toDataStreamResponse();
}
