import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { createCart } from "@/lib/cart";
import { withLogging } from "@/lib/logger";

async function handler(req: Request) {
  if (!verifyBearer(req)) return NextResponse.json({ type: "invalid_request", code: "unauthorized", message: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.line_items?.length) return NextResponse.json({ type: "invalid_request", code: "missing_line_items", message: "line_items is required and must contain at least one item" }, { status: 400 });
    const cart = await createCart({ line_items: body.line_items, buyer: body.buyer });
    return NextResponse.json(cart, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const code = msg.includes("not found") ? "out_of_stock" : "invalid_request";
    return NextResponse.json({ type: "invalid_request", code, message: msg }, { status: 422 });
  }
}

export const POST = withLogging(handler, "POST", "/api/carts");
