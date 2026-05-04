/**
 * PSP integration — Delegate Payment (ACP spec: openapi.delegate_payment.yaml)
 *
 * Flow:
 *  1. OpenAI calls POST /agentic_commerce/delegate_payment with raw card + allowance
 *  2. If STRIPE_SECRET_KEY is set → tokenize via Stripe PaymentMethods API → store pm_xxx as vault token
 *  3. Otherwise → generate mock vault token (safe for dev / demo)
 *  4. On checkout complete, payment_data.token = "vt_..." → look up vault token → charge
 */
import type { VaultToken } from "@acp-demo/types";

declare global { var __vaults: Map<string, VaultToken> | undefined }
const mem = (global.__vaults ??= new Map<string, VaultToken>());

const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

async function storeVault(vt: VaultToken): Promise<void> {
  if (!USE_REDIS) { mem.set(vt.id, vt); return; }
  const ttlSec = Math.max(60, Math.floor((new Date(vt.expires_at).getTime() - Date.now()) / 1000));
  await (await redis()).set(`acp:vault:${vt.id}`, vt, { ex: ttlSec });
}

export async function getVaultToken(id: string): Promise<VaultToken | null> {
  if (!USE_REDIS) return mem.get(id) ?? null;
  return (await redis()).get<VaultToken>(`acp:vault:${id}`);
}

export interface CardDetails {
  number: string;
  exp_month: string;
  exp_year: string;
  cvc?: string;
  name?: string;
}

export interface Allowance {
  checkout_session_id: string;
  max_amount: number;
  currency: string;
  expires_at: string;
  merchant_id: string;
}

export async function tokenizeCard(
  card: CardDetails,
  allowance: Allowance,
  metadata: Record<string, string>,
): Promise<{ id: string; created: string; metadata: Record<string, string> }> {
  const created = new Date().toISOString();
  let stripe_pm_id: string | undefined;

  if (process.env.STRIPE_SECRET_KEY) {
    const body = new URLSearchParams({ type: "card" });
    body.set("card[number]", card.number);
    body.set("card[exp_month]", card.exp_month);
    body.set("card[exp_year]", card.exp_year);
    if (card.cvc) body.set("card[cvc]", card.cvc);
    if (card.name) body.set("billing_details[name]", card.name);

    const res = await fetch("https://api.stripe.com/v1/payment_methods", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "Stripe tokenization failed");
    stripe_pm_id = data.id as string;
  }

  const vtId = stripe_pm_id
    ? `vt_${stripe_pm_id}`
    : `vt_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const vt: VaultToken = {
    id: vtId,
    checkout_session_id: allowance.checkout_session_id,
    max_amount: allowance.max_amount,
    currency: allowance.currency,
    expires_at: allowance.expires_at,
    ...(stripe_pm_id ? { stripe_pm_id } : {}),
  };
  await storeVault(vt);

  return {
    id: vtId,
    created,
    metadata: { ...metadata, source: "acp_delegate_payment", merchant_id: allowance.merchant_id },
  };
}

export async function chargeVaultToken(
  vtId: string,
  amountCents: number,
  currency: string,
): Promise<{ success: boolean; charge_id: string }> {
  const vt = await getVaultToken(vtId);
  if (!vt) throw new Error("Vault token not found or expired");
  if (amountCents > vt.max_amount) throw new Error(`Charge amount ${amountCents} exceeds allowance ${vt.max_amount}`);

  if (process.env.STRIPE_SECRET_KEY && vt.stripe_pm_id) {
    const body = new URLSearchParams({
      amount: String(amountCents),
      currency,
      payment_method: vt.stripe_pm_id,
      confirm: "true",
      "automatic_payment_methods[enabled]": "true",
      "automatic_payment_methods[allow_redirects]": "never",
    });
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const pi = await res.json();
    if (!res.ok || pi.status === "requires_action") throw new Error(pi?.error?.message ?? "Payment failed");
    return { success: true, charge_id: pi.id as string };
  }

  // Mock charge — no real Stripe key, succeeds in dev/demo
  return { success: true, charge_id: `ch_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` };
}
