# ACP Spec Sync

Scan the official ACP OpenAPI spec from GitHub, compare it against the current implementation, and either report gaps or implement missing features.

## Usage

- `/acp-sync` — analyze gaps only (default)
- `/acp-sync analyze` — same as above
- `/acp-sync implement <topic>` — implement missing routes for a topic (e.g. `cart`, `feed`, `delegate_payment`, `webhook`)
- `/acp-sync diff` — show endpoint-by-endpoint comparison table
- `/acp-sync check-version` — check if a newer spec version has been published

## Live context (auto-injected at invocation)

**Current API routes:**
```
!`find apps/merchant/src/app/api -name "route.ts" | sed 's|apps/merchant/src/app/api||;s|/route.ts||' | sort`
```

**Current lib files:**
```
!`ls apps/merchant/src/lib/`
```

**Spec versions available on GitHub:**
```
!`gh api repos/agentic-commerce-protocol/agentic-commerce-protocol/contents/spec --jq '.[].name' 2>/dev/null || echo "gh CLI not available"`
```

**Latest spec files (current pinned version: 2026-04-17):**
```
!`gh api repos/agentic-commerce-protocol/agentic-commerce-protocol/contents/spec/2026-04-17/openapi --jq '.[].name' 2>/dev/null || echo "gh CLI not available"`
```

---

## Instructions

The argument passed by the user is: **$ARGUMENTS**

### Step 1 — Fetch the spec

For every file listed in the spec directory, fetch its full content:

```bash
gh api repos/agentic-commerce-protocol/agentic-commerce-protocol/contents/spec/2026-04-17/openapi/<filename> --jq '.content' | base64 -d
```

Fetch all spec files in parallel. Extract every `paths:` entry (method + path) and every named schema from `components/schemas`.

If the user passed `check-version`, also list `spec/` subdirectories to detect new versions:
```bash
gh api repos/agentic-commerce-protocol/agentic-commerce-protocol/contents/spec --jq '.[].name'
```

### Step 2 — Map spec endpoints to implementation files

Use this mapping to find the corresponding implementation file for each spec endpoint:

| Spec path pattern | Expected route file |
|---|---|
| `/checkout_sessions` | `api/checkout_sessions/route.ts` |
| `/checkout_sessions/{id}` | `api/checkout_sessions/[id]/route.ts` |
| `/checkout_sessions/{id}/complete` | `api/checkout_sessions/[id]/complete/route.ts` |
| `/checkout_sessions/{id}/cancel` | `api/checkout_sessions/[id]/cancel/route.ts` |
| `/carts` | `api/carts/route.ts` |
| `/carts/{id}` | `api/carts/[id]/route.ts` |
| `/carts/{id}/cancel` | `api/carts/[id]/cancel/route.ts` |
| `/agentic_commerce/delegate_payment` | `api/agentic_commerce/delegate_payment/route.ts` |
| `/delegate_authentication` | `api/delegate_authentication/route.ts` |
| `/feeds` | `api/feeds/route.ts` |
| `/feeds/{id}` | `api/feeds/[id]/route.ts` |
| `/feeds/{id}/products` | `api/feeds/[id]/products/route.ts` |
| Webhook sender | `lib/acp.ts` → `emitWebhook()` |

For each spec endpoint, check:
1. Does the route file exist? (`find apps/merchant/src/app/api -name "route.ts"`)
2. Is the HTTP method exported from that file? (`grep -l "export const GET\|POST\|PUT\|PATCH\|DELETE"`)
3. Read the route file and check it handles the required request/response fields from the spec.

### Step 3 — Execute the requested mode

#### Mode: `analyze` (default)

Produce a gap analysis table:

```
| Spec | Endpoint | Method | Status | Notes |
|------|----------|--------|--------|-------|
| openapi.agentic_checkout.yaml | /checkout_sessions | POST | ✅ Implemented | ... |
| openapi.cart.yaml | /carts | POST | ✅ Implemented | ... |
| openapi.delegate_payment.yaml | /agentic_commerce/delegate_payment | POST | ⚠️ Partial | Missing risk_signals validation |
| openapi.delegate_authentication.yaml | /delegate_authentication | POST | ❌ Missing | Entire 3DS flow not implemented |
```

Then list:
- **Schema gaps**: Types in `packages/types/src/index.ts` that don't match spec schemas
- **Header gaps**: Required headers not being echoed (Idempotency-Key, Request-Id)
- **P1 gaps** (break agent flows): missing required endpoints
- **P2 gaps** (incomplete): endpoints exist but missing required fields
- **P3 gaps** (nice to have): optional features not implemented

#### Mode: `implement <topic>`

Implement the missing feature. Topic can be:
- `delegate_authentication` — full 3DS flow (3 endpoints in `openapi.delegate_authentication.yaml`)
- `idempotency` — proper idempotency key replay detection across all POST endpoints
- `webhook-receiver` — inbound webhook endpoint for the merchant to receive events
- `capabilities` — capabilities negotiation in checkout session create/update
- `discounts` — discount/coupon codes in checkout session
- Or any other topic the user names

Steps:
1. Read the relevant spec file(s) in full
2. Read the existing related implementation files
3. Design the implementation (lib + route files)
4. Write the code — lib first, then routes
5. Run `npx tsc --project apps/merchant/tsconfig.json --noEmit` to verify types
6. Run `cd apps/merchant && npx next build 2>&1 | tail -20` to verify the build
7. Report what was created/modified

#### Mode: `diff`

For each implemented endpoint, show:
- Spec-required request fields vs what the route actually parses
- Spec-required response fields vs what the route actually returns
- Missing required headers

#### Mode: `check-version`

1. List all version directories under `spec/` in the GitHub repo
2. Compare against the currently pinned version (`2026-04-17`)
3. If a newer version exists, fetch its spec file list and compare endpoint count/names with the current version
4. Report: what's new, what changed, what was removed
5. Do NOT auto-implement — report only, and ask the user whether to proceed

---

## Implementation conventions (follow these when writing code)

- All lib files go in `apps/merchant/src/lib/`
- Use the dual-mode Redis/in-memory pattern from `store.ts` and `stock.ts` (check `USE_REDIS` flag)
- All routes wrap handlers with `withLogging(handler, METHOD, "/api/path")` from `@/lib/logger`
- Bearer auth via `verifyBearer(req)` from `@/lib/auth` on all external-facing routes
- Internal routes (`/api/internal/*`) skip auth
- Feed/cart/vault polling routes go in the QUIET set in `logger.ts` if they're called on a tight loop
- Types go in `packages/types/src/index.ts`
- Error responses use `{ type, code, message }` shape per the ACP spec
- No comments unless the WHY is non-obvious; no docstrings
