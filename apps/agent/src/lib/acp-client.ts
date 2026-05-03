const BASE = process.env.MERCHANT_API_URL!;
const KEY  = process.env.MERCHANT_API_KEY!;
async function acpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE+"/api"+path, { ...init, headers: { "Content-Type":"application/json", Authorization:"Bearer "+KEY, "Idempotency-Key": crypto.randomUUID(), "Request-Id": crypto.randomUUID(), "API-Version":"2026-04-17", ...(init.headers??{}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message:res.statusText })); throw new Error(e.message??"ACP error"); }
  return res.json();
}
export const acpClient = {
  listProducts: () => acpFetch<{ products: { id:string; name:string; price:number; description:string; stock:number }[] }>("/products"),
  createSession: (body: object) => acpFetch("/checkout_sessions", { method:"POST", body:JSON.stringify(body) }),
  updateSession: (id: string, body: object) => acpFetch("/checkout_sessions/"+id, { method:"POST", body:JSON.stringify(body) }),
  completeSession: (id: string, body: object) => acpFetch("/checkout_sessions/"+id+"/complete", { method:"POST", body:JSON.stringify(body) }),
  cancelSession: (id: string) => acpFetch("/checkout_sessions/"+id+"/cancel", { method:"POST" }),
  getSession: (id: string) => acpFetch("/checkout_sessions/"+id),
};