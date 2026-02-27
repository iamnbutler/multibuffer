/**
 * Dev server: runs the build, then serves the demo on localhost.
 */

import { join } from "node:path";

const demoDir = import.meta.dir;

// Run the build first
await import("./build.ts");

// Serve from the demo directory (has all built assets)
const PORT = 3000;

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const filePath = join(demoDir, path);
    try {
      const file = Bun.file(filePath);
      return new Response(file);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`Demo server running at http://localhost:${PORT}`);
