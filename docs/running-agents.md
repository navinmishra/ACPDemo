# Running the ACP Agents

This repo ships two agent modes that drive the same ACP checkout flow over different transports.

---

## Prerequisites

```bash
pnpm install
```

Copy `.env.example` files and fill in keys:

```bash
cp apps/merchant/.env.example apps/merchant/.env.local
cp apps/agent/.env.example    apps/agent/.env.local
```

Minimum required variables:

| App | Variable | Purpose |
|---|---|---|
| merchant | `ACP_API_KEY` | Bearer token for REST + MCP endpoints |
| merchant | `ACP_WEBHOOK_SECRET` | HMAC secret for order webhooks |
| agent | `MERCHANT_API_URL` | `http://localhost:3001` in local dev |
| agent | `MERCHANT_API_KEY` | Must match `ACP_API_KEY` above |
| agent | `ANTHROPIC_API_KEY` | Claude API key |

Optional (enables real Stripe charges and Upstash persistence):

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Real card tokenization (omit → mock vault tokens) |
| `UPSTASH_REDIS_REST_URL` | Persist sessions across restarts |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token |

---

## Starting the servers

Open two terminals:

```bash
# Terminal 1 — merchant API (port 3001)
pnpm --filter acp-merchant dev

# Terminal 2 — shopping agent (port 3000)
pnpm --filter acp-agent dev
```

Or use turbo to start both together:

```bash
pnpm dev
```

---

## Choosing a mode

Open **http://localhost:3000** in a browser. You'll see a landing page with two cards:

| Mode | Route | How it works |
|---|---|---|
| **REST Agent** | `/rest` | Claude calls tools that POST directly to merchant REST endpoints. Uses internal field names (`items[].id`, `fulfillment_address`). |
| **MCP Agent** | `/mcp` | Claude calls tools discovered via `tools/list` from the merchant's MCP server at `/api/mcp`. Uses spec field names (`line_items[].product_id`, `fulfillment_details.address`). |

---

## REST Agent — how it works

**Chat endpoint:** `POST /api/chat`
**Merchant calls:** direct HTTP via `acp-client.ts`

```
User message
  → Claude (claude-sonnet-4-6)
    → listProducts       → GET  /api/products
    → createCheckoutSession → POST /api/checkout_sessions
    → updateCheckoutSession → POST /api/checkout_sessions/{id}
    → completeCheckout   → POST /api/checkout_sessions/{id}/complete
    → cancelCheckout     → POST /api/checkout_sessions/{id}/cancel
```

Tool schemas are hand-coded Zod objects in `apps/agent/src/lib/tools.ts`.
Field names follow the internal REST shape, not the OpenRPC spec.

---

## MCP Agent — how it works

**Chat endpoint:** `POST /api/chat/mcp`
**Merchant calls:** JSON-RPC 2.0 via `mcp-client.ts` → `POST /api/mcp`

```
User message
  → Claude (claude-sonnet-4-6)
    → listProducts              → GET  /api/products  (local REST, not MCP)
    → create_checkout_session   → POST /api/mcp  (tools/call)
    → get_checkout_session      → POST /api/mcp  (tools/call)
    → update_checkout_session   → POST /api/mcp  (tools/call)
    → complete_checkout_session → POST /api/mcp  (tools/call)
    → cancel_checkout_session   → POST /api/mcp  (tools/call)
```

The MCP client uses a custom `HttpMcpTransport` (stateless POST, no SSE) because
AI SDK 4.x only ships SSE built-in. See `apps/agent/src/lib/mcp-client.ts`.

**Key differences from REST mode:**

- Tool schemas are auto-discovered from the merchant's `tools/list` response (OpenRPC 2026-04-17).
- Field names match the ACP spec: `line_items[].product_id`, `fulfillment_details.address`, `selected_fulfillment_options`.
- Protocol `meta` (api_version, idempotency_key, request_id) is injected automatically — Claude never sees it.
- New merchant tools become available to the agent without any agent-side code changes.

---

## MCP server directly (curl)

The merchant MCP endpoint speaks JSON-RPC 2.0 over plain POST:

```bash
# Handshake
curl -s -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"curl","version":"1.0"},"capabilities":{}},"id":1}'

# Discover tools
curl -s -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'

# Create a checkout session (spec field names)
curl -s -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "create_checkout_session",
      "arguments": {
        "meta": { "api_version": "2026-04-17" },
        "payload": {
          "line_items": [{ "product_id": "item_001", "quantity": 1 }],
          "currency": "usd",
          "capabilities": {}
        }
      }
    },
    "id": 3
  }'
```

---

## Delegate payment → vault token flow (mock PSP)

When `STRIPE_SECRET_KEY` is not set, vault tokens are mocked locally (no real charges).

```bash
# 1. Create a checkout session (save the returned id)
SESSION_ID=$(curl -s -X POST http://localhost:3001/api/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d '{"items":[{"id":"item_001","quantity":1}],"currency":"usd"}' | jq -r '.id')

# 2. Register a card → get vault token
VAULT_TOKEN=$(curl -s -X POST http://localhost:3001/api/agentic_commerce/delegate_payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d "{
    \"payment_method\":{\"number\":\"4242424242424242\",\"exp_month\":\"12\",\"exp_year\":\"2030\",\"cvc\":\"123\"},
    \"allowance\":{\"checkout_session_id\":\"$SESSION_ID\",\"max_amount\":99999,\"currency\":\"usd\",
      \"expires_at\":\"$(date -u -v+1H '+%Y-%m-%dT%H:%M:%SZ')\",\"merchant_id\":\"demo\"},
    \"metadata\":{}
  }" | jq -r '.id')

echo "Vault token: $VAULT_TOKEN"
```

Then complete via MCP:

```bash
curl -s -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d "{
    \"jsonrpc\":\"2.0\",\"method\":\"tools/call\",
    \"params\":{
      \"name\":\"complete_checkout_session\",
      \"arguments\":{
        \"meta\":{\"api_version\":\"2026-04-17\"},
        \"id\":\"$SESSION_ID\",
        \"payload\":{\"payment_data\":{\"token\":\"$VAULT_TOKEN\"},
          \"buyer\":{\"name\":\"Test Buyer\",\"email\":\"test@example.com\"}}
      }
    },\"id\":4
  }"
```

---

## Running the E2E test suite

The test suite starts its own merchant server on port 3099 (no conflict with dev):

```bash
pnpm --filter acp-merchant test
```

Tests cover:
- `checkout-flow.test.ts` — full REST checkout (create → update → complete → cancel guard)
- `mcp-flow.test.ts` — MCP protocol (handshake, tools/list, all 5 tools, vault token, error cases)
