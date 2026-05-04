import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { tokenizeCard } from "@/lib/psp";
import { withLogging } from "@/lib/logger";
import { log } from "@/lib/logger";

/**
 * POST /agentic_commerce/delegate_payment
 *
 * ACP Delegate Payment endpoint (spec: openapi.delegate_payment.yaml).
 * OpenAI sends raw card credentials + allowance constraints; this endpoint
 * tokenizes the card via Stripe (or generates a mock vault token in dev)
 * and returns the vault token ID for use as payment_data.token in /complete.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY  — set to enable real Stripe tokenization
 *   (absent)           — generates a mock vt_mock_* token (demo/dev)
 */
async function handler(req: Request) {
  if (!verifyBearer(req)) {
    return NextResponse.json({ type: "invalid_request", code: "unauthorized", message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { payment_method, allowance, metadata = {} } = body;

    if (!payment_method?.number) {
      return NextResponse.json(
        { type: "invalid_request", code: "invalid_card", message: "payment_method.number is required", param: "payment_method.number" },
        { status: 400 },
      );
    }
    if (!allowance?.checkout_session_id || !allowance?.max_amount || !allowance?.currency || !allowance?.expires_at || !allowance?.merchant_id) {
      return NextResponse.json(
        { type: "invalid_request", code: "invalid_allowance", message: "allowance fields required: checkout_session_id, max_amount, currency, expires_at, merchant_id", param: "allowance" },
        { status: 400 },
      );
    }

    const result = await tokenizeCard(
      {
        number: payment_method.number,
        exp_month: payment_method.exp_month ?? "",
        exp_year: payment_method.exp_year ?? "",
        cvc: payment_method.cvc,
        name: payment_method.name,
      },
      {
        checkout_session_id: allowance.checkout_session_id,
        max_amount: allowance.max_amount,
        currency: allowance.currency,
        expires_at: allowance.expires_at,
        merchant_id: allowance.merchant_id,
      },
      metadata,
    );

    log("info", "delegate_payment_created", {
      vaultTokenId: result.id,
      checkoutSessionId: allowance.checkout_session_id,
      maxAmountCents: allowance.max_amount,
      currency: allowance.currency,
      psp: result.id.startsWith("vt_mock") ? "mock" : "stripe",
      displayLast4: payment_method.display_last4,
    });

    return NextResponse.json(result, {
      status: 201,
      headers: {
        "Request-Id": req.headers.get("request-id") ?? crypto.randomUUID(),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ type: "invalid_request", code: "invalid_card", message: msg }, { status: 422 });
  }
}

export const POST = withLogging(handler, "POST", "/api/agentic_commerce/delegate_payment");
