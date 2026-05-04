export function verifyBearer(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();
  return token === (process.env.ACP_API_KEY ?? "");
}

// Produces t=<unix_seconds>,v1=<64_hex> per the ACP webhook spec
export async function signWebhook(payload: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const signed = `${ts}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.ACP_WEBHOOK_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const hex = Buffer.from(sig).toString("hex");
  return `t=${ts},v1=${hex}`;
}
