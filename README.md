# ACP Demo

Full-stack implementation of the [Agentic Commerce Protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) (spec 2026-04-17).

Ships a merchant API with both REST and MCP transports, and a Claude-powered shopping agent that can drive the checkout flow over either protocol.

---

## Apps

| App | Port | Description |
|---|---|---|
| `apps/merchant` | 3001 | ACP Checkout API — REST endpoints + MCP server (`/api/mcp`) |
| `apps/agent` | 3000 | AI Shopping Agent — Claude drives checkout via REST or MCP |

## Packages

| Package | Description |
|---|---|
| `packages/types` | Shared TypeScript types for ACP checkout, orders, and PSP |

---

## Quick start

```bash
pnpm install

# Copy and fill in env vars
cp apps/merchant/.env.example apps/merchant/.env.local
cp apps/agent/.env.example    apps/agent/.env.local

# Start both apps
pnpm dev
```

Open **http://localhost:3000** → choose REST or MCP agent mode.

---

## Agent modes

### REST Agent (`/rest`)
Calls merchant REST endpoints directly. Hand-coded tool schemas, internal field names.

### MCP Agent (`/mcp`)
Connects to the merchant's MCP server (`POST /api/mcp`, JSON-RPC 2.0).  
Tools auto-discovered from `tools/list`. Spec field names (`line_items[].product_id`, `fulfillment_details.address`).  
Protocol `meta` (api_version, idempotency_key, request_id) injected automatically.

---

## MCP server

The merchant exposes an MCP endpoint at `POST /api/mcp` implementing
[`openrpc.agentic_checkout.json`](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/spec/2026-04-17/openrpc/openrpc.agentic_checkout.json):

| Tool | Maps to |
|---|---|
| `create_checkout_session` | `POST /checkout_sessions` |
| `get_checkout_session` | `GET /checkout_sessions/{id}` |
| `update_checkout_session` | `POST /checkout_sessions/{id}` |
| `complete_checkout_session` | `POST /checkout_sessions/{id}/complete` |
| `cancel_checkout_session` | `POST /checkout_sessions/{id}/cancel` |

```bash
# Quick MCP healthcheck
curl -s -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-local-key" \
  -d '{"jsonrpc":"2.0","method":"ping","params":{},"id":1}'
```

---

## Tests

```bash
pnpm --filter acp-merchant test
```

Covers REST checkout flow and full MCP protocol (41 tests).

---

## Detailed docs

- [Running agents locally — REST vs MCP](docs/running-agents.md)
