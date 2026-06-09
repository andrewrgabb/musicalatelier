import { defineConfig } from "tsup";

// Production build for the API. We bundle the app and INLINE the workspace
// package @musical-atelier/contracts (which is TypeScript source Node can't run
// directly). All real npm dependencies (express, prisma, ioredis, bullmq, the
// AWS SDK, jose, …) stay external and are loaded from node_modules at runtime.
//
// Local dev is unaffected — `pnpm dev` still runs the TypeScript source via tsx.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@musical-atelier/contracts"],
});
