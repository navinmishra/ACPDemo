/** @type {import('next').NextConfig} */
const config = {
  experimental: { typedRoutes: true },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          // Allow any Vercel preview/production deployment + localhost during dev.
          // The merchant API uses Bearer-token auth, not cookies, so wildcard is safe.
          { key: "Access-Control-Allow-Origin",  value: process.env.CORS_ALLOW_ORIGIN ?? "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, Idempotency-Key, Request-Id, API-Version",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
};

export default config;
