import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { updateSession } from "@/lib/acp";
import { store } from "@/lib/store";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!verifyBearer(req)) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const s = store.get(params.id); if (!s) return NextResponse.json({ error:"Not found" }, { status:404 });
  return NextResponse.json(s);
}
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!verifyBearer(req)) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  try { return NextResponse.json(updateSession(params.id, await req.json()), { status:201 }); }
  catch(e) { return NextResponse.json({ type:"invalid_request", message: e instanceof Error ? e.message : "Error" }, { status:422 }); }
}