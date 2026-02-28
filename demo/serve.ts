/**
 * Dev server: runs the build, then serves the demo on localhost.
 * Includes a WebSocket relay for the debug API.
 */

import { join } from "node:path";
import type { ServerWebSocket } from "bun";

const demoDir = import.meta.dir;

// Run the build first
await import("./build.ts");

const PORT = 1421;

// Track connections by role
let browserSocket: ServerWebSocket<{ role: string }> | null = null;
const cliSockets = new Set<ServerWebSocket<{ role: string }>>();

Bun.serve<{ role: string }>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const role = url.searchParams.get("role") ?? "cli";
      const ok = server.upgrade(req, { data: { role } });
      if (ok) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Static file serving
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
  websocket: {
    open(ws) {
      if (ws.data.role === "browser") {
        browserSocket = ws;
        console.log("[debug] Browser connected");
      } else {
        cliSockets.add(ws);
        console.log(`[debug] CLI client connected (${cliSockets.size} total)`);
      }
    },
    message(ws, msg) {
      const text = typeof msg === "string" ? msg : new TextDecoder().decode(msg);

      if (ws.data.role === "browser") {
        // Response from browser → relay to all CLI clients
        for (const cli of cliSockets) {
          cli.send(text);
        }
      } else {
        // Command from CLI → relay to browser
        if (browserSocket) {
          browserSocket.send(text);
        } else {
          ws.send(JSON.stringify({
            id: "?",
            error: "No browser connected. Open the demo in a browser first.",
          }));
        }
      }
    },
    close(ws) {
      if (ws.data.role === "browser") {
        browserSocket = null;
        console.log("[debug] Browser disconnected");
      } else {
        cliSockets.delete(ws);
        console.log(`[debug] CLI client disconnected (${cliSockets.size} remaining)`);
      }
    },
  },
});

console.log(`Demo server running at http://localhost:${PORT}`);
console.log(`Debug WebSocket at ws://localhost:${PORT}/ws`);
