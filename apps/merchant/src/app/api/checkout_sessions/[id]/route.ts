import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { updateSession } from "@/lib/acp";
import { store } from "@/lib/store";
import { withLogging } from "@/lib/logger";

type P = { params: Record<string, string> };

async function getHandler(req: Request, { params }: P) {
  if (!verifyBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await store.get(params.id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(s);
}

async function postHandler(req: Request, { params }: P) {
  if (!verifyBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const session = await updateSession(params.id, body);
    return NextResponse.json(session, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ type: "invalid_request", code: "request_not_idempotent", message: e instanceof Error ? e.message : "Error" }, { status: 422 });
  }
}

export const GET  = withLogging(getHandler,  "GET",  "/api/checkout_sessions/[id]");
export const POST = withLogging(postHandler, "POST", "/api/checkout_sessions/[id]");
