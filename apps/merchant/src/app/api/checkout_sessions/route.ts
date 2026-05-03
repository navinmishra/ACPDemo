import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { createSession } from "@/lib/acp";
export async function POST(req: Request) {
  if (!verifyBearer(req)) return NextResponse.json({ type:"invalid_request", message:"Unauthorized" }, { status:401 });
  try {
    const body = await req.json();
    if (!body.items?.length) return NextResponse.json({ type:"invalid_request", message:"items required" }, { status:400 });
    return NextResponse.json(createSession(body), { status:201, headers:{ "Idempotency-Key": req.headers.get("idempotency-key")??"", "Request-Id": req.headers.get("request-id")??"" } });
  } catch(e) { return NextResponse.json({ type:"invalid_request", message: e instanceof Error ? e.message : "Error" }, { status:422 }); }
}