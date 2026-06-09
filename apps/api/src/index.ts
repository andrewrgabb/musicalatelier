/**
 * Musical Atelier API — entry point.
 *
 * Phase 1 scope: a minimal Express server that proves the wiring works:
 *   - GET /healthz : liveness + a Redis connectivity check (Fly uses this)
 *   - GET /        : a friendly hello so you can eyeball it in a browser
 *
 * Later phases add: the auth adapter, presigned R2 URLs, the /scores routes,
 * the BullMQ producer, and the Bull Board dashboard.
 */
import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { redisHealthy } from "./lib/redis.js";
import { dbHealthy } from "./lib/prisma.js";
import { requireAuth } from "./lib/auth/middleware.js";

const app = express();

// Allow the SPA's origin to call the API, and send cookies/credentials.
app.use(cors({ origin: env.appOrigin, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "musical-atelier-api", status: "ok" });
});

// Liveness + dependency check. Fly's health check hits this.
app.get("/healthz", async (_req, res) => {
  const [redis, db] = await Promise.all([redisHealthy(), dbHealthy()]);
  const ok = redis && db;
  res.status(ok ? 200 : 503).json({
    ok,
    checks: { redis, db },
    time: new Date().toISOString(),
  });
});

// A protected route demonstrating the auth adapter. requireAuth verifies the
// request, upserts the local user, and attaches req.user. In stub mode (local
// dev) any request "succeeds" as the fixed dev user; in clerk mode it needs a
// valid Bearer token.
app.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user, auth: req.auth });
});

app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
  console.log(`[api] CORS origin allowed: ${env.appOrigin}`);
  console.log(`[api] auth mode: ${env.auth.mode}`);
});
