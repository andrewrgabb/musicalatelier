/**
 * The shared Redis connection.
 *
 * BullMQ requires a persistent TCP connection (ioredis), NOT the Upstash
 * HTTP/REST client — the queue relies on blocking commands and Lua scripts
 * that only work over a real TCP socket. The same `redis://` URL points at the
 * local `redis` container in dev and at Fly/Upstash in prod.
 */
import { Redis } from "ioredis";
import { env } from "./env.js";

// `maxRetriesPerRequest: null` is BullMQ's required setting for the connection
// it uses; we apply it here so this single connection is reusable by the queue
// (added in Phase 5) as well as by health checks.
export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

/**
 * Returns true if Redis answers PING. Used by /healthz.
 *
 * We fail fast: if the socket isn't connected we don't even send a command
 * (ioredis would otherwise queue it until a connection comes back, hanging the
 * health check), and we race the ping against a short timeout as a backstop.
 */
export async function redisHealthy(): Promise<boolean> {
  if (redis.status !== "ready") return false;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("redis ping timeout")), 1000)
    );
    const pong = await Promise.race([redis.ping(), timeout]);
    return pong === "PONG";
  } catch {
    return false;
  }
}
