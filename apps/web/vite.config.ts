import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// envDir points at the repo root so the SPA reads the SAME single .env as the
// rest of the monorepo (only VITE_-prefixed vars are exposed to the browser).
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
