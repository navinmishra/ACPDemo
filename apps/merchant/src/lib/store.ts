import type { CheckoutSession } from "@acp-demo/types";

// ── In-memory fallback (local dev / E2E — no Redis env vars) ─────────────────
declare global { var __sessions: Map<string, CheckoutSession> | undefined }
const mem = (global.__sessions ??= new Map<string, CheckoutSession>());

// ── Redis config ─────────────────────────────────────────────────────────────
const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const SK = (id: string) => `acp:sess:${id}`;
const SSET = "acp:sessions";

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

export const store = {
  async get(id: string): Promise<CheckoutSession | null> {
    if (!USE_REDIS) return mem.get(id) ?? null;
    return (await redis()).get<CheckoutSession>(SK(id));
  },

  async set(id: string, s: CheckoutSession): Promise<CheckoutSession> {
    if (!USE_REDIS) { mem.set(id, s); return s; }
    const r = await redis();
    await Promise.all([r.set(SK(id), s), r.sadd(SSET, id)]);
    return s;
  },

  async del(id: string): Promise<void> {
    if (!USE_REDIS) { mem.delete(id); return; }
    const r = await redis();
    await Promise.all([r.del(SK(id)), r.srem(SSET, id)]);
  },

  async getAll(): Promise<CheckoutSession[]> {
    if (!USE_REDIS) return Array.from(mem.values());
    const r = await redis();
    const ids = (await r.smembers(SSET)) as string[];
    if (!ids.length) return [];
    const vals = await Promise.all(ids.map((id) => r.get<CheckoutSession>(SK(id))));
    return vals.filter(Boolean) as CheckoutSession[];
  },
};
