import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { cancelSession } from "@/lib/acp";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!verifyBearer(req)) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  try { return NextResponse.json(cancelSession(params.id)); }
  catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: (e instanceof Error && e.message.includes("Cannot")) ? 405 : 404 }); }
}