import { NextResponse } from "next/server";
import { getFeed, getFeedProducts, upsertFeedProducts } from "@/lib/feed";
import { withLogging } from "@/lib/logger";
import type { FeedProduct } from "@acp-demo/types";

async function getHandler(_req: Request, { params }: { params: Record<string, string> }) {
  const feed = await getFeed(params.id);
  if (!feed) return NextResponse.json({ type: "invalid_request", code: "feed_not_found", message: "Feed not found", param: "id" }, { status: 404 });
  const products = await getFeedProducts(params.id);
  return NextResponse.json({ products });
}

async function patchHandler(req: Request, { params }: { params: Record<string, string> }) {
  try {
    const body = await req.json();
    if (!body.products?.length) {
      return NextResponse.json({ type: "invalid_request", code: "invalid_product_payload", message: "products must contain at least one valid Product", param: "products" }, { status: 400 });
    }
    const result = await upsertFeedProducts(params.id, body.products as FeedProduct[]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ type: "invalid_request", code: status === 404 ? "feed_not_found" : "invalid_product_payload", message: msg, param: "id" }, { status });
  }
}

export const GET   = withLogging(getHandler,   "GET",   "/api/feeds/[id]/products");
export const PATCH = withLogging(patchHandler, "PATCH", "/api/feeds/[id]/products");
