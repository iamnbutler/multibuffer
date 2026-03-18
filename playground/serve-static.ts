/**
 * Static server for e2e tests.
 *
 * Builds the playground and serves the _site directory.
 * Designed for CI/e2e testing - no WebSocket debug relay.
 *
 * Usage: bun run playground/serve-static.ts
 */

import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const siteDir = join(rootDir, "_site");

// Run the build first
await import("./build.ts");

const PORT = Number(process.env.PORT) || 3001;

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const filePath = join(siteDir, path);
    try {
      const file = Bun.file(filePath);
      return new Response(file);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`Playground static server running at http://localhost:${PORT}`);
