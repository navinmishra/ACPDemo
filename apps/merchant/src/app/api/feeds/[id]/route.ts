import { NextResponse } from "next/server";
import { getFeed } from "@/lib/feed";
import { withLogging } from "@/lib/logger";

async function handler(_req: Request, { params }: { params: Record<string, string> }) {
  const feed = await getFeed(params.id);
  if (!feed) return NextResponse.json({ type: "invalid_request", code: "feed_not_found", message: "Feed not found", param: "id" }, { status: 404 });
  return NextResponse.json(feed);
}

export const GET = withLogging(handler, "GET", "/api/feeds/[id]");
