import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { completeSession } from "@/lib/acp";
import { withLogging } from "@/lib/logger";

async function handler(req: Request, { params }: { params: Record<string, string> }) {
  if (!verifyBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.payment_data) return NextResponse.json({ type: "invalid_request", code: "request_not_idempotent", message: "payment_data required" }, { status: 400 });
    const session = await completeSession(params.id, body);
    return NextResponse.json(session, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ type: "invalid_request", code: "request_not_idempotent", message: e instanceof Error ? e.message : "Error" }, { status: 422 });
  }
}

export const POST = withLogging(handler, "POST", "/api/checkout_sessions/[id]/complete");
