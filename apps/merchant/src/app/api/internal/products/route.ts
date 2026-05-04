import { NextResponse } from "next/server";
import { getAllProducts, addProduct } from "@/lib/products";
import { withLogging } from "@/lib/logger";

async function getHandler() {
  return NextResponse.json(await getAllProducts());
}

async function postHandler(req: Request) {
  try {
    const { name, price, description, initialStock } = await req.json();
    if (!name || !price) return NextResponse.json({ error: "name and price required" }, { status: 400 });
    const product = await addProduct({
      name: String(name),
      price: Math.round(Number(price) * 100),
      description: String(description ?? ""),
      initialStock: Math.max(0, Math.round(Number(initialStock ?? 0))),
    });
    return NextResponse.json(product, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 422 });
  }
}

export const GET  = withLogging(getHandler,  "GET",  "/api/internal/products");
export const POST = withLogging(postHandler, "POST", "/api/internal/products");
