import { NextResponse } from "next/server";
import { increaseStock, deductStock, getStock } from "@/lib/stock";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { delta } = await req.json();
    const amount = Math.round(Number(delta));
    if (isNaN(amount) || amount === 0) return NextResponse.json({ error: "delta must be a non-zero integer" }, { status: 400 });

    let newStock: number;
    if (amount > 0) {
      newStock = await increaseStock(params.id, amount);
    } else {
      await deductStock(params.id, Math.abs(amount));
      newStock = await getStock(params.id);
    }
    return NextResponse.json({ id: params.id, stock: newStock });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 422 });
  }
}
