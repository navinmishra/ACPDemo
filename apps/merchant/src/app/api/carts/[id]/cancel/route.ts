import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { cancelCart } from "@/lib/cart";
import { withLogging } from "@/lib/logger";

async function handler(req: Request, { params }: { params: Record<string, string> }) {
  if (!verifyBearer(req)) return NextResponse.json({ type: "invalid_request", code: "unauthorized", message: "Unauthorized" }, { status: 401 });
  try {
    const cart = await cancelCart(params.id);
    return NextResponse.json(cart);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ type: "invalid_request", code: "not_found", message: msg }, { status: 404 });
  }
}

export const POST = withLogging(handler, "POST", "/api/carts/[id]/cancel");
