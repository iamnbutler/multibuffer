/**
 * Static server for e2e tests.
 *
 * Builds the playground and serves the _site directory.
 * Designed for CI/e2e testing - no WebSocket debug relay.
 *
 * Usage: bun run playground/serve-static.ts
 */

import { join, resolve } from "node:path";

const rootDir = join(import.meta.dir, "..");
const siteDir = join(rootDir, "_site");

// Run the build first
await import("./build.ts");

const PORT = Number(process.env.PORT) || 3001;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const filePath = resolve(join(siteDir, path));

    // Prevent path traversal outside the site directory
    if (!filePath.startsWith(siteDir)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(file);
  },
});

console.log(`Playground static server running at http://localhost:${PORT}`);
