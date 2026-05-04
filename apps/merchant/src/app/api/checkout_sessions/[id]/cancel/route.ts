import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { cancelSession } from "@/lib/acp";
import { withLogging } from "@/lib/logger";

async function handler(req: Request, { params }: { params: Record<string, string> }) {
  if (!verifyBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const s = await cancelSession(params.id);
    return NextResponse.json(s);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg.includes("cancel") ? 405 : 404 });
  }
}

export const POST = withLogging(handler, "POST", "/api/checkout_sessions/[id]/cancel");
