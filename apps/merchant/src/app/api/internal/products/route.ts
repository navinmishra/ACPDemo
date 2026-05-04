import { NextResponse } from "next/server";
import { getAllProducts, addProduct } from "@/lib/products";

export async function GET() {
  return NextResponse.json(await getAllProducts());
}

export async function POST(req: Request) {
  try {
    const { name, price, description, initialStock } = await req.json();
    if (!name || !price) return NextResponse.json({ error: "name and price required" }, { status: 400 });
    const product = await addProduct({
      name: String(name),
      price: Math.round(Number(price) * 100), // dollars → cents
      description: String(description ?? ""),
      initialStock: Math.max(0, Math.round(Number(initialStock ?? 0))),
    });
    return NextResponse.json(product, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 422 });
  }
}
