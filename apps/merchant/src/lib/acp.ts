import type { CheckoutSession, CreateSessionRequest, UpdateSessionRequest, CompleteSessionRequest, FulfillmentOption, Total, LineItem } from "@acp-demo/types";
import { store } from "./store";
import { findProduct } from "./catalog";
import { signWebhook } from "./auth";
const TAX = 0.0875;
const FO: FulfillmentOption[] = [
  { type:"shipping", id:"fo_std", title:"Standard Shipping", subtitle:"5-7 business days", carrier:"USPS", earliest_delivery_time: new Date(Date.now()+5*864e5).toISOString(), latest_delivery_time: new Date(Date.now()+7*864e5).toISOString(), subtotal:599, tax:0, total:599 },
  { type:"shipping", id:"fo_exp", title:"Express Shipping", subtitle:"2-3 business days", carrier:"FedEx", earliest_delivery_time: new Date(Date.now()+2*864e5).toISOString(), latest_delivery_time: new Date(Date.now()+3*864e5).toISOString(), subtotal:1499, tax:0, total:1499 },
];
function totals(li: LineItem[], ship: number): Total[] {
  const items = li.reduce((s,l) => s+l.base_amount, 0);
  const disc  = li.reduce((s,l) => s+l.discount, 0);
  const tax   = li.reduce((s,l) => s+l.tax, 0);
  return [
    { type:"items_base_amount", display_text:"Items", amount:items },
    { type:"items_discount", display_text:"Discounts", amount:disc },
    { type:"subtotal", display_text:"Subtotal", amount:items-disc },
    { type:"tax", display_text:"Tax (8.75%)", amount:tax },
    { type:"fulfillment", display_text:"Shipping", amount:ship },
    { type:"total", display_text:"Total", amount:items-disc+tax+ship },
  ];
}
function uid(p: string) { return p+"_"+crypto.randomUUID().replace(/-/g,"").slice(0,12); }
export function createSession(req: CreateSessionRequest): CheckoutSession {
  const li: LineItem[] = req.items.map((itm,i) => {
    const p = findProduct(itm.id); if (!p) throw new Error("Product not found: "+itm.id);
    const base = p.price*itm.quantity, tax = Math.round(base*TAX);
    return { id:"li_"+i, item:{...itm,name:p.name}, base_amount:base, discount:0, subtotal:base, tax, total:base+tax };
  });
  const fo = req.fulfillment_address ? FO[0] : undefined;
  const s: CheckoutSession = { id:uid("cs"), currency:"usd", status: fo?"ready_for_payment":"not_ready_for_payment", buyer:req.buyer, line_items:li, fulfillment_address:req.fulfillment_address, fulfillment_options:FO, fulfillment_option_id:fo?.id, totals:totals(li,fo?.total??0), messages:[], links:[{type:"terms_of_use",url:"https://shop.example.com/terms"}], payment_provider:{provider:"stripe",supported_payment_methods:["card"]} };
  return store.set(s.id, s);
}
export function updateSession(id: string, req: UpdateSessionRequest): CheckoutSession {
  const s = store.get(id); if (!s) throw new Error("Session not found");
  if (req.fulfillment_address) s.fulfillment_address = req.fulfillment_address;
  if (req.fulfillment_option_id) { const fo = FO.find(o=>o.id===req.fulfillment_option_id); if (!fo) throw new Error("Invalid fulfillment_option_id"); s.fulfillment_option_id = fo.id; }
  if (!s.fulfillment_option_id && s.fulfillment_address) s.fulfillment_option_id = FO[0].id;
  const selFO = FO.find(o=>o.id===s.fulfillment_option_id);
  s.totals = totals(s.line_items, selFO?.total??0);
  s.status = s.fulfillment_address?"ready_for_payment":"not_ready_for_payment";
  return store.set(id, s);
}
export async function completeSession(id: string, req: CompleteSessionRequest): Promise<CheckoutSession> {
  const s = store.get(id); if (!s) throw new Error("Session not found");
  if (s.status !== "ready_for_payment") throw new Error("Session not ready");
  s.status="completed"; s.buyer=req.buyer??s.buyer;
  s.order = { id:uid("ord"), checkout_session_id:id, permalink_url:"https://shop.example.com/orders/"+id };
  store.set(id, s); void emitWebhook(s); return s;
}
export function cancelSession(id: string): CheckoutSession {
  const s = store.get(id); if (!s) throw new Error("Session not found");
  if (s.status==="completed"||s.status==="canceled") throw new Error("Cannot cancel");
  s.status="canceled"; return store.set(id, s);
}
async function emitWebhook(s: CheckoutSession) {
  const url = process.env.OPENAI_WEBHOOK_URL; if (!url||!s.order) return;
  const payload = JSON.stringify({ type:"order_created", data:{ type:"order", checkout_session_id:s.id, permalink_url:s.order.permalink_url, status:"created", refunds:[] } });
  const sig = await signWebhook(payload);
  await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", "Merchant-Signature":sig, Timestamp:new Date().toISOString() }, body:payload }).catch(console.error);
}