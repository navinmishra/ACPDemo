import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth";
import { completeSession } from "@/lib/acp";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!verifyBearer(req)) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  try { const body = await req.json(); if (!body.payment_data) return NextResponse.json({ type:"invalid_request", message:"payment_data required" }, { status:400 }); return NextResponse.json(await completeSession(params.id, body), { status:201 }); }
  catch(e) { return NextResponse.json({ type:"invalid_request", message: e instanceof Error ? e.message : "Error" }, { status:422 }); }
}