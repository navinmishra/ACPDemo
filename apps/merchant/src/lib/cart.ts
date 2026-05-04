import type { Cart, CartLineItem } from "@acp-demo/types";
import { getProduct } from "./products";
import { getStock } from "./stock";

declare global { var __carts: Map<string, Cart> | undefined }
const mem = (global.__carts ??= new Map<string, Cart>());

const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const SK = (id: string) => `acp:cart:${id}`;
const CART_TTL = 7200; // 2 hours

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

function uid() { return "cart_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12); }

async function getCartById(id: string): Promise<Cart | null> {
  if (!USE_REDIS) return mem.get(id) ?? null;
  return (await redis()).get<Cart>(SK(id));
}

async function persistCart(cart: Cart): Promise<Cart> {
  if (!USE_REDIS) { mem.set(cart.id, cart); return cart; }
  await (await redis()).set(SK(cart.id), cart, { ex: CART_TTL });
  return cart;
}

async function deleteCart(id: string): Promise<void> {
  if (!USE_REDIS) { mem.delete(id); return; }
  await (await redis()).del(SK(id));
}

async function buildLineItems(
  items: { id: string; quantity: number }[],
): Promise<CartLineItem[]> {
  return Promise.all(
    items.map(async (itm, i) => {
      const p = await getProduct(itm.id);
      if (!p) throw new Error(`Product not found: ${itm.id}`);
      const stock = await getStock(itm.id);
      const subtotal = p.price * itm.quantity;
      return {
        id: `li_${i}`,
        item: { id: itm.id, name: p.name, unit_amount: p.price },
        quantity: itm.quantity,
        totals: [{ type: "subtotal", display_text: "Subtotal", amount: subtotal }],
        ...(stock < itm.quantity ? { availability: { available: false, status: "limited_stock" } } : {}),
      };
    }),
  );
}

export async function createCart(data: {
  line_items: { id: string; quantity: number }[];
  buyer?: { email: string };
}): Promise<Cart> {
  const line_items = await buildLineItems(data.line_items);
  const subtotal = line_items.reduce((s, li) => s + li.totals[0].amount, 0);
  const id = uid();
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://shop.example.com";
  const cart: Cart = {
    id,
    line_items,
    currency: "usd",
    buyer: data.buyer,
    totals: [
      { type: "subtotal", display_text: "Subtotal", amount: subtotal },
      { type: "total", display_text: "Total", amount: subtotal },
    ],
    continue_url: `${base}/cart/${id}`,
    expires_at: new Date(Date.now() + CART_TTL * 1000).toISOString(),
  };
  return persistCart(cart);
}

export async function fetchCart(id: string): Promise<Cart | null> {
  return getCartById(id);
}

export async function replaceCart(
  id: string,
  items: { id: string; quantity: number }[],
): Promise<Cart> {
  const existing = await getCartById(id);
  if (!existing) throw new Error("Cart not found");
  const line_items = await buildLineItems(items);
  const subtotal = line_items.reduce((s, li) => s + li.totals[0].amount, 0);
  const updated: Cart = {
    ...existing,
    line_items,
    totals: [
      { type: "subtotal", display_text: "Subtotal", amount: subtotal },
      { type: "total", display_text: "Total", amount: subtotal },
    ],
  };
  return persistCart(updated);
}

export async function cancelCart(id: string): Promise<Cart> {
  const cart = await getCartById(id);
  if (!cart) throw new Error("Cart not found");
  await deleteCart(id);
  return cart;
}
