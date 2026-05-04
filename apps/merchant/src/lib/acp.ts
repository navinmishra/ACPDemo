import type { CheckoutSession, CreateSessionRequest, UpdateSessionRequest, CompleteSessionRequest, CancelSessionRequest, FulfillmentOption, Total, LineItem, Order } from "@acp-demo/types";
import { store } from "./store";
import { getProduct } from "./products";
import { signWebhook } from "./auth";
import { getStock, deductStock } from "./stock";
import { chargeVaultToken } from "./psp";
import { log } from "./logger";

const TAX = 0.0875;

const FO: FulfillmentOption[] = [
  {
    type: "shipping", id: "fo_std", title: "Standard Shipping", subtitle: "5-7 business days",
    carrier: "USPS",
    earliest_delivery_time: new Date(Date.now() + 5 * 86400000).toISOString(),
    latest_delivery_time: new Date(Date.now() + 7 * 86400000).toISOString(),
    subtotal: 599, tax: 0, total: 599,
  },
  {
    type: "shipping", id: "fo_exp", title: "Express Shipping", subtitle: "2-3 business days",
    carrier: "FedEx",
    earliest_delivery_time: new Date(Date.now() + 2 * 86400000).toISOString(),
    latest_delivery_time: new Date(Date.now() + 3 * 86400000).toISOString(),
    subtotal: 1499, tax: 0, total: 1499,
  },
];

function totals(li: LineItem[], ship: number): Total[] {
  const it = li.reduce((s, l) => s + l.base_amount, 0);
  const tx = li.reduce((s, l) => s + l.tax, 0);
  return [
    { type: "items_base_amount", display_text: "Items", amount: it },
    { type: "tax", display_text: "Tax (8.75%)", amount: tx },
    { type: "fulfillment", display_text: "Shipping", amount: ship },
    { type: "total", display_text: "Total", amount: it + tx + ship },
  ];
}

function uid(p: string) { return p + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12); }
function orderNumber() { return String(Date.now()).slice(-8); }

export async function createSession(req: CreateSessionRequest): Promise<CheckoutSession> {
  for (const itm of req.items) {
    const available = await getStock(itm.id);
    if (available < itm.quantity) {
      throw new Error(`Insufficient stock for ${itm.id} (${available} available, ${itm.quantity} requested)`);
    }
  }

  const li: LineItem[] = await Promise.all(req.items.map(async (itm, i) => {
    const p = await getProduct(itm.id);
    if (!p) throw new Error("Product not found: " + itm.id);
    const base = p.price * itm.quantity, tax = Math.round(base * TAX);
    return { id: "li_" + i, item: { ...itm, name: p.name }, base_amount: base, discount: 0, subtotal: base, tax, total: base + tax };
  }));

  const sel = req.fulfillment_address ? FO[0] : undefined;
  const s: CheckoutSession = {
    id: uid("cs"), currency: req.currency ?? "usd",
    status: req.fulfillment_address ? "ready_for_payment" : "not_ready_for_payment",
    buyer: req.buyer, line_items: li,
    fulfillment_address: req.fulfillment_address, fulfillment_options: FO,
    fulfillment_option_id: sel?.id,
    totals: totals(li, sel?.total ?? 0),
    messages: [], links: [{ type: "terms_of_use", url: "https://shop.example.com/terms" }],
    payment_provider: { provider: "stripe", supported_payment_methods: ["card"] },
    ...(req.affiliate_attribution ? { affiliate_attribution: req.affiliate_attribution } : {}),
  };
  await store.set(s.id, s);
  const total = s.totals.find((t) => t.type === "total");
  log("info", "session_created", {
    sessionId: s.id,
    status: s.status,
    itemCount: s.line_items.length,
    items: s.line_items.map((l) => ({ id: l.item.id, qty: l.item.quantity })),
    totalCents: total?.amount,
    affiliate: req.affiliate_attribution?.provider,
  });
  return s;
}

export async function updateSession(id: string, req: UpdateSessionRequest): Promise<CheckoutSession> {
  const s = await store.get(id);
  if (!s) throw new Error("Session not found");
  if (req.fulfillment_address) s.fulfillment_address = req.fulfillment_address;
  if (req.fulfillment_option_id) {
    const fo = FO.find((o) => o.id === req.fulfillment_option_id);
    if (!fo) throw new Error("Invalid fulfillment_option_id");
    s.fulfillment_option_id = fo.id;
  }
  // Support selected_fulfillment_options from the spec update shape
  const sfo = (req as unknown as { selected_fulfillment_options?: { shipping?: { option_id?: string } }[] }).selected_fulfillment_options;
  if (sfo?.length) {
    const optId = sfo[0]?.shipping?.option_id;
    if (optId) {
      const fo = FO.find((o) => o.id === optId);
      if (fo) s.fulfillment_option_id = fo.id;
    }
  }
  if (!s.fulfillment_option_id && s.fulfillment_address) s.fulfillment_option_id = FO[0].id;
  const sel = FO.find((o) => o.id === s.fulfillment_option_id);
  s.totals = totals(s.line_items, sel?.total ?? 0);
  s.status = s.fulfillment_address ? "ready_for_payment" : "not_ready_for_payment";
  await store.set(id, s);
  log("info", "session_updated", {
    sessionId: id,
    status: s.status,
    fulfillmentOptionId: s.fulfillment_option_id,
    hasAddress: !!s.fulfillment_address,
  });
  return s;
}

export async function completeSession(id: string, req: CompleteSessionRequest): Promise<CheckoutSession> {
  const s = await store.get(id);
  if (!s) throw new Error("Session not found");
  if (s.status !== "ready_for_payment") throw new Error("Not ready");

  // Charge via PSP if payment token is a vault token
  const token = req.payment_data?.token;
  const total = s.totals.find((t) => t.type === "total");
  if (token?.startsWith("vt_") && total) {
    try {
      const charge = await chargeVaultToken(token, total.amount, s.currency);
      log("info", "psp_charge", { sessionId: id, chargeId: charge.charge_id, amountCents: total.amount });
    } catch (e: unknown) {
      log("error", "psp_charge_failed", { sessionId: id, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  for (const li of s.line_items) {
    await deductStock(li.item.id, li.item.quantity);
  }

  s.status = "completed";
  s.buyer = req.buyer ?? s.buyer;
  if (req.affiliate_attribution) s.affiliate_attribution = req.affiliate_attribution;

  // Build a full Order matching the ACP spec
  const orderLineItems = s.line_items.map((li) => ({
    id: li.id,
    title: li.item.name ?? li.item.id,
    quantity: { ordered: li.item.quantity, current: li.item.quantity, fulfilled: 0 },
    unit_price: li.base_amount / li.item.quantity,
    subtotal: li.subtotal,
  }));
  const orderTotals = s.totals.map((t) => ({ type: t.type, display_text: t.display_text, amount: t.amount }));

  const order: Order = {
    id: uid("ord"),
    type: "order",
    order_number: orderNumber(),
    checkout_session_id: id,
    permalink_url: `https://shop.example.com/orders/${id}`,
    status: "confirmed",
    currency: s.currency,
    line_items: orderLineItems,
    totals: orderTotals,
    fulfillments: [],
    adjustments: [],
    created_at: new Date().toISOString(),
  };
  s.order = order;
  await store.set(id, s);

  log("info", "session_completed", {
    sessionId: id,
    orderId: order.id,
    orderNumber: order.order_number,
    totalCents: total?.amount,
    fulfillmentOptionId: s.fulfillment_option_id,
    itemCount: s.line_items.length,
    psp: token?.startsWith("vt_mock") ? "mock" : token?.startsWith("vt_") ? "stripe" : "direct",
  });
  void emitWebhook(s);
  return s;
}

export async function cancelSession(id: string, req?: CancelSessionRequest): Promise<CheckoutSession> {
  const s = await store.get(id);
  if (!s) throw new Error("Session not found");
  if (s.status === "completed" || s.status === "canceled") throw new Error("Cannot cancel");
  s.status = "canceled";
  await store.set(id, s);
  log("warn", "session_canceled", {
    sessionId: id,
    reasonCode: req?.intent_trace?.reason_code,
    summary: req?.intent_trace?.trace_summary,
  });
  return s;
}

async function emitWebhook(s: CheckoutSession) {
  const url = process.env.OPENAI_WEBHOOK_URL;
  if (!url || !s.order) return;
  const payload = JSON.stringify({
    type: "order_create",
    data: s.order,
  });
  const sig = await signWebhook(payload);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Merchant-Signature": sig,
      "Request-Id": crypto.randomUUID(),
    },
    body: payload,
  }).catch((e: unknown) => log("error", "webhook_failed", { error: e instanceof Error ? e.message : String(e) }));
}
