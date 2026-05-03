import { tool } from "ai";
import { z } from "zod";
import { acpClient } from "./acp-client";
const fmt = (c: number) => "$"+(c/100).toFixed(2);
const addr = z.object({ name:z.string(), line_one:z.string(), line_two:z.string().optional(), city:z.string(), state:z.string(), country:z.string(), postal_code:z.string() });
export const acpTools = {
  listProducts: tool({ description:"Browse merchant catalog", parameters: z.object({ query: z.string().optional() }),
    execute: async ({ query }) => { const { products } = await acpClient.listProducts(); const f = query ? products.filter(p => (p.name+p.description).toLowerCase().includes(query.toLowerCase())) : products; return f.map(p => ({ id:p.id, name:p.name, price:fmt(p.price), description:p.description, in_stock:p.stock>0 })); } }),
  createCheckoutSession: tool({ description:"ACP POST /checkout_sessions", parameters: z.object({ items: z.array(z.object({ id:z.string(), quantity:z.number().int().positive() })) }),
    execute: async ({ items }) => { const s: any = await acpClient.createSession({ items }); return { checkout_session_id:s.id, status:s.status, items:s.line_items.map((l:any) => ({ name:l.item.name, qty:l.item.quantity, total:fmt(l.total) })), totals:s.totals.map((t:any) => ({ label:t.display_text, amount:fmt(t.amount) })) }; } }),
  updateCheckoutSession: tool({ description:"ACP POST /checkout_sessions/{id} — update address or fulfillment", parameters: z.object({ checkout_session_id:z.string(), fulfillment_address:addr.optional(), fulfillment_option_id:z.enum(["fo_std","fo_exp"]).optional() }),
    execute: async ({ checkout_session_id, fulfillment_address, fulfillment_option_id }) => { const s: any = await acpClient.updateSession(checkout_session_id, { fulfillment_address, fulfillment_option_id }); return { status:s.status, fulfillment_options:s.fulfillment_options.map((o:any) => ({ id:o.id, title:o.title, eta:o.subtitle, price:fmt(o.total) })), totals:s.totals.map((t:any) => ({ label:t.display_text, amount:fmt(t.amount) })) }; } }),
  completeCheckout: tool({ description:"ACP POST /checkout_sessions/{id}/complete — finalize order, only after user confirms", parameters: z.object({ checkout_session_id:z.string(), buyer_name:z.string(), buyer_email:z.string().email() }),
    execute: async ({ checkout_session_id, buyer_name, buyer_email }) => { const s: any = await acpClient.completeSession(checkout_session_id, { buyer:{ name:buyer_name, email:buyer_email }, payment_data:{ token:"spt_delegated", provider:"stripe" } }); return { order_id:s.order?.id, status:s.status, total:fmt(s.totals.find((t:any) => t.type==="total")?.amount??0), order_url:s.order?.permalink_url }; } }),
  cancelCheckout: tool({ description:"ACP POST /checkout_sessions/{id}/cancel", parameters: z.object({ checkout_session_id:z.string() }),
    execute: async ({ checkout_session_id }) => { const s: any = await acpClient.cancelSession(checkout_session_id); return { status:s.status }; } }),
};