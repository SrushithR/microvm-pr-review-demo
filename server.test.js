import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createAppServer, createHookServer, page } from "./server.js";

const servers = [];
function listen(server) {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
after(async () => Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))));

test("baseline preview renders user input as plain text", () => {
  assert.match(page, /preview\.textContent = description\.value/);
  assert.doesNotMatch(page, /preview\.innerHTML/);
  assert.match(page, /Plain text · HTML escaped/);
});

test("serves the editor and preserves its MicroVM lifecycle identity", async () => {
  const app = await listen(createAppServer());
  const hooks = await listen(createHookServer());
  const hookUrl = `http://127.0.0.1:${hooks.address().port}/aws/lambda-microvms/runtime/v1`;
  await fetch(`${hookUrl}/run`, { method: "POST", body: JSON.stringify({ microvmId: "mvm-phase-4" }) });
  await fetch(`${hookUrl}/suspend`, { method: "POST" });
  await fetch(`${hookUrl}/resume`, { method: "POST" });

  const html = await fetch(`http://127.0.0.1:${app.address().port}`).then(response => response.text());
  const state = await fetch(`http://127.0.0.1:${app.address().port}/api/state`).then(response => response.json());
  assert.match(html, /Event description/);
  assert.deepEqual(state, { sessionId: "mvm-phase-4", lifecycle: "RUNNING" });
});
