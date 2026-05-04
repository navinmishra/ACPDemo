import { CATALOG } from "./catalog";

// ── In-memory fallback (local dev / E2E) ─────────────────────────────────────
declare global { var __stocks: Map<string, number> | undefined }
const mem = (global.__stocks ??= new Map(CATALOG.map((p) => [p.id, p.stock])));

// ── Redis config ─────────────────────────────────────────────────────────────
const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const SK = (id: string) => `acp:stock:${id}`;

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

async function kvGet(id: string): Promise<number> {
  const r = await redis();
  const v = await r.get<number>(SK(id));
  if (v !== null) return v;
  const initial = CATALOG.find((p) => p.id === id)?.stock ?? 0;
  await r.set(SK(id), initial, { nx: true });
  return (await r.get<number>(SK(id))) ?? initial;
}

export async function getStock(id: string): Promise<number> {
  if (!USE_REDIS) return mem.get(id) ?? 0;
  return kvGet(id);
}

export async function deductStock(id: string, quantity: number): Promise<void> {
  if (!USE_REDIS) {
    const curr = mem.get(id) ?? 0;
    if (curr < quantity) throw new Error(`Insufficient stock for ${id} (${curr} available)`);
    mem.set(id, curr - quantity);
    return;
  }
  const curr = await kvGet(id);
  if (curr < quantity) throw new Error(`Insufficient stock for ${id} (${curr} available)`);
  const r = await redis();
  await r.decrby(SK(id), quantity);
}

export async function getAllStocks(): Promise<Record<string, number>> {
  const entries = await Promise.all(CATALOG.map(async (p) => [p.id, await getStock(p.id)] as const));
  return Object.fromEntries(entries);
}
