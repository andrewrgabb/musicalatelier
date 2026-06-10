import type { NextFunction, Request, Response } from "express";

/**
 * Logs one line per request, after the response is sent:
 *   [api] POST /scores 201 14ms
 *   [api] GET /scores 200 6ms
 *
 * We hook `res.on("finish")` so we know the final status code and can time the
 * whole request. The Fly health check (/healthz, hit every 15s) and Bull Board's
 * static assets (/admin/*) are skipped to keep the logs readable.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/healthz" || req.path.startsWith("/admin")) {
    return next();
  }

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`
    );
  });

  next();
}
