import type { FeedMetadata, FeedProduct } from "@acp-demo/types";
import { getAllProducts } from "./products";
import { getStock } from "./stock";

declare global { var __feeds: Map<string, FeedMetadata> | undefined }
const mem = (global.__feeds ??= new Map<string, FeedMetadata>());

const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const SK = (id: string) => `acp:feed:${id}`;
const FSET = "acp:feeds";

async function redis() {
  const { Redis } = await import("@upstash/redis");
  return Redis.fromEnv();
}

function uid() { return "feed_" + Math.random().toString(36).slice(2, 9); }

async function getFeedById(id: string): Promise<FeedMetadata | null> {
  if (!USE_REDIS) return mem.get(id) ?? null;
  return (await redis()).get<FeedMetadata>(SK(id));
}

async function persistFeed(feed: FeedMetadata): Promise<FeedMetadata> {
  if (!USE_REDIS) { mem.set(feed.id, feed); return feed; }
  const r = await redis();
  await Promise.all([r.set(SK(feed.id), feed), r.sadd(FSET, feed.id)]);
  return feed;
}

export async function createFeed(data: { target_country?: string }): Promise<FeedMetadata> {
  const feed: FeedMetadata = {
    id: uid(),
    target_country: data.target_country,
    updated_at: new Date().toISOString(),
  };
  return persistFeed(feed);
}

export async function getFeed(id: string): Promise<FeedMetadata | null> {
  return getFeedById(id);
}

// Converts our internal product catalog to the ACP Feed product shape
export async function getFeedProducts(feedId: string): Promise<FeedProduct[]> {
  const feed = await getFeedById(feedId);
  if (!feed) return [];
  const products = await getAllProducts();
  return Promise.all(
    products.map(async (p) => {
      const stock = await getStock(p.id);
      return {
        id: p.id,
        title: p.name,
        description: { plain: p.description },
        variants: [
          {
            id: `${p.id}_v1`,
            title: p.name,
            price: { amount: p.price, currency: "USD" },
            availability: {
              available: stock > 0,
              status: stock > 10 ? "in_stock" : stock > 0 ? "limited_stock" : "out_of_stock",
            },
            description: { plain: p.description },
          },
        ],
      } satisfies FeedProduct;
    }),
  );
}

export async function upsertFeedProducts(
  feedId: string,
  _products: FeedProduct[],
): Promise<{ id: string; accepted: boolean }> {
  const feed = await getFeedById(feedId);
  if (!feed) throw new Error("Feed not found");
  // In a full implementation this would merge the upserted products into the feed's product set.
  // For the demo, we accept the payload and update the feed timestamp.
  feed.updated_at = new Date().toISOString();
  await persistFeed(feed);
  return { id: feedId, accepted: true };
}
