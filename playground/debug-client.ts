/**
 * CLI client for the editor debug API.
 *
 * Usage:
 *   bun run demo/debug-client.ts getState
 *   bun run demo/debug-client.ts getText
 *   bun run demo/debug-client.ts press "Meta+ArrowRight"
 *   bun run demo/debug-client.ts press "ArrowLeft"
 *   bun run demo/debug-client.ts type "hello world"
 *   bun run demo/debug-client.ts click 5 10
 *   bun run demo/debug-client.ts dispatch '{"type":"insertText","text":"hi"}'
 */

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd) {
  console.log("Usage: bun run demo/debug-client.ts <command> [args]");
  console.log("");
  console.log("Commands:");
  console.log("  getState                  Get cursor, selection, line count");
  console.log("  getText                   Get full buffer text");
  console.log('  press "Meta+ArrowRight"   Simulate a key press');
  console.log('  type "hello"              Simulate typing text');
  console.log("  click <row> <col>         Set cursor to position");
  console.log('  dispatch \'{"type":...}\'    Dispatch an editor command');
  process.exit(0);
}

const id = crypto.randomUUID().slice(0, 8);
let message: string;

switch (cmd) {
  case "getState":
    message = JSON.stringify({ id, cmd: "getState" });
    break;
  case "getText":
    message = JSON.stringify({ id, cmd: "getText" });
    break;
  case "press":
    message = JSON.stringify({ id, cmd: "press", key: args[1] ?? "" });
    break;
  case "type":
    message = JSON.stringify({ id, cmd: "type", text: args[1] ?? "" });
    break;
  case "click":
    message = JSON.stringify({
      id,
      cmd: "click",
      row: Number(args[1] ?? 0),
      column: Number(args[2] ?? 0),
    });
    break;
  case "dispatch":
    message = JSON.stringify({
      id,
      cmd: "dispatch",
      command: JSON.parse(args[1] ?? "{}"),
    });
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}

const WS_URL = "ws://localhost:3000/ws?role=cli";
const ws = new WebSocket(WS_URL);
const timeout = setTimeout(() => {
  console.error("Timeout: no response after 5s");
  ws.close();
  process.exit(1);
}, 5000);

ws.onopen = () => {
  ws.send(message);
};

ws.onmessage = (event) => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(String(event.data));
    if (data.error) {
      console.error("Error:", data.error);
    } else {
      console.log(JSON.stringify(data.result, null, 2));
    }
  } catch {
    console.log(String(event.data));
  }
  ws.close();
};

ws.onerror = (event) => {
  clearTimeout(timeout);
  console.error("WebSocket error — is the dev server running? (bun run dev)");
  process.exit(1);
};
