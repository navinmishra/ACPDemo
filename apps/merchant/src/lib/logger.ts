// Routes polled by the dashboard / agent on a tight interval — suppress to avoid log noise
const QUIET: Set<string> = new Set([
  "GET /api/internal/sessions",
  "GET /api/internal/products",
  "GET /api/products",
]);

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, fields: Fields): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  level === "error" ? console.error(line) : console.log(line);
}

/** Direct structured log — use in business-logic layer (acp.ts etc.) */
export function log(level: Level, event: string, fields: Fields = {}): void {
  emit(level, { event, ...fields });
}

type Context = { params: Record<string, string> };
type Handler = (req: Request, ctx: Context) => Promise<Response>;

/**
 * Wraps a Next.js App Router handler with structured request/response logging.
 * Routes in the QUIET set are silenced entirely (still run normally).
 * 4xx responses → warn, 5xx / thrown errors → error.
 */
export function withLogging(handler: Handler, method: string, route: string): Handler {
  return async (req: Request, ctx: Context): Promise<Response> => {
    const quiet = QUIET.has(`${method} ${route}`);
    const start = Date.now();

    if (!quiet) {
      emit("info", {
        event: "request",
        method,
        route,
        params: ctx.params,
        requestId: req.headers.get("request-id") ?? undefined,
        idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
        apiVersion: req.headers.get("api-version") ?? undefined,
      });
    }

    try {
      const res = await handler(req, ctx);
      const ms = Date.now() - start;

      if (!quiet) {
        const level: Level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
        emit(level, {
          event: "response",
          method,
          route,
          params: ctx.params,
          status: res.status,
          ms,
        });
      }

      return res;
    } catch (err) {
      emit("error", {
        event: "unhandled_error",
        method,
        route,
        params: ctx.params,
        ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
      });
      throw err;
    }
  };
}
