import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/products";

export async function GET() {
  return NextResponse.json({ products: await getAllProducts() });
}
