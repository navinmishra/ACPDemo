import { CATALOG, type Product } from "./catalog";
import { getStock, setStock } from "./stock";

type ProductMeta = Omit<Product, "stock">;

declare global { var __products: Map<string, ProductMeta> | undefined }

const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const SK = (id: string) => `acp:product:${id}`;
const PSET = "acp:products";

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

function mem(): Map<string, ProductMeta> {
  if (!global.__products) {
    global.__products = new Map(CATALOG.map(({ stock: _s, ...rest }) => [rest.id, rest]));
  }
  return global.__products!;
}

async function ensureSeeded() {
  const r = await redis();
  const count = (await r.scard(PSET)) as number;
  if (count === 0) {
    await Promise.all(
      CATALOG.map(({ stock: _s, ...meta }) =>
        Promise.all([r.set(SK(meta.id), meta), r.sadd(PSET, meta.id)])
      )
    );
  }
  return r;
}

export async function getAllProducts(): Promise<Product[]> {
  let metas: ProductMeta[];
  if (!USE_REDIS) {
    metas = Array.from(mem().values());
  } else {
    const r = await ensureSeeded();
    const ids = (await r.smembers(PSET)) as string[];
    const vals = await Promise.all(ids.map((id) => r.get<ProductMeta>(SK(id))));
    metas = vals.filter(Boolean) as ProductMeta[];
  }
  return Promise.all(metas.map(async (m) => ({ ...m, stock: await getStock(m.id) })));
}

export async function getProduct(id: string): Promise<ProductMeta | null> {
  if (!USE_REDIS) return mem().get(id) ?? null;
  const r = await redis();
  const v = await r.get<ProductMeta>(SK(id));
  if (v) return v;
  // Fallback to static catalog (before seeding has run)
  const fallback = CATALOG.find((p) => p.id === id);
  return fallback ? (({ stock: _s, ...rest }) => rest)(fallback) : null;
}

export async function addProduct(data: {
  name: string;
  price: number;
  description: string;
  initialStock: number;
}): Promise<Product> {
  const id = "item_" + Math.random().toString(36).slice(2, 9);
  const meta: ProductMeta = { id, name: data.name, price: data.price, description: data.description };

  if (!USE_REDIS) {
    mem().set(id, meta);
  } else {
    const r = await redis();
    await Promise.all([r.set(SK(id), meta), r.sadd(PSET, id)]);
  }
  await setStock(id, data.initialStock);
  return { ...meta, stock: data.initialStock };
}
