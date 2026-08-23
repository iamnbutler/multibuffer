/**
 * Test fixture: a diff worker that loads successfully but throws while handling
 * a message.
 *
 * This is deliberately distinct from pointing the client at an unresolvable URL:
 * that exercises a module that never loads, whereas this one is reachable and
 * fails later. Both surface through `Worker.onerror`.
 */

declare const self: Worker;

self.onmessage = () => {
  throw new Error("throwing-diff-worker fixture: intentional failure");
};
