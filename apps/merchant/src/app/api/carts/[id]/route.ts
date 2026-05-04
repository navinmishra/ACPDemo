import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { fetchCart, replaceCart } from "@/lib/cart";
import { withLogging } from "@/lib/logger";

type P = { params: Record<string, string> };

async function getHandler(req: Request, { params }: P) {
  if (!verifyBearer(req)) return NextResponse.json({ type: "invalid_request", code: "unauthorized", message: "Unauthorized" }, { status: 401 });
  const cart = await fetchCart(params.id);
  if (!cart) return NextResponse.json({ type: "invalid_request", code: "not_found", message: "Cart not found or has expired." }, { status: 404 });
  return NextResponse.json(cart);
}

async function putHandler(req: Request, { params }: P) {
  if (!verifyBearer(req)) return NextResponse.json({ type: "invalid_request", code: "unauthorized", message: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.line_items?.length) return NextResponse.json({ type: "invalid_request", code: "missing_line_items", message: "line_items must contain at least one item" }, { status: 400 });
    const cart = await replaceCart(params.id, body.line_items);
    return NextResponse.json(cart);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg.includes("not found") ? 404 : 422;
    return NextResponse.json({ type: "invalid_request", code: status === 404 ? "not_found" : "invalid_request", message: msg }, { status });
  }
}

export const GET = withLogging(getHandler, "GET", "/api/carts/[id]");
export const PUT = withLogging(putHandler, "PUT", "/api/carts/[id]");
