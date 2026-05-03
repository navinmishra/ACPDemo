import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

const PORT = 3099; // isolated port so it doesn't clash with the dev server
const BASE = `http://localhost:${PORT}`;
export const MERCHANT_URL = BASE;
export const API_KEY = "e2e-test-key";

let server: ChildProcess | null = null;

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

export async function setup(): Promise<void> {
  // If something is already on our port, skip starting (e.g. pre-started in CI)
  if (await isReachable(`${BASE}/api/products`)) return;

  const root = resolve(__dirname, "../../../..");
  server = spawn("pnpm", ["--filter", "acp-merchant", "exec", "next", "dev", "-p", String(PORT)], {
    cwd: root,
    env: {
      ...process.env,
      ACP_API_KEY: API_KEY,
      ACP_WEBHOOK_SECRET: "e2e-webhook-secret",
    },
    stdio: "pipe",
    shell: false,
  });

  server.stderr?.on("data", (d: Buffer) => {
    if (process.env.DEBUG_E2E) process.stderr.write(d);
  });

  await waitFor(`${BASE}/api/products`, 45_000);
}

export async function teardown(): Promise<void> {
  if (!server) return;
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
  if (!server.killed) server.kill("SIGKILL");
}
