import { NextResponse } from "next/server";
import { createFeed } from "@/lib/feed";
import { withLogging } from "@/lib/logger";

async function handler(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const feed = await createFeed({ target_country: body.target_country });
    return NextResponse.json(feed, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ type: "invalid_request", code: "invalid_feed_payload", message: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}

export const POST = withLogging(handler, "POST", "/api/feeds");
