import assert from "node:assert/strict";
import { after, test } from "node:test";
import { marked } from "marked";
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

test("contributor renderer formats Markdown and sanitizes its HTML", () => {
  assert.match(marked.parse("# Title\n\n**bold**"), /<h1>Title<\/h1>[\s\S]*<strong>bold<\/strong>/);
  assert.match(page, /DOMPurify\.sanitize\(marked\.parse/);
  assert.match(page, /import DOMPurify from '\/purify\.js'/);
});

test("serves the contributor editor and lifecycle identity", async () => {
  const app = await listen(createAppServer());
  const hooks = await listen(createHookServer());
  const hookUrl = `http://127.0.0.1:${hooks.address().port}/aws/lambda-microvms/runtime/v1`;
  await fetch(`${hookUrl}/run`, { method: "POST", body: JSON.stringify({ microvmId: "mvm-phase-5" }) });
  await fetch(`${hookUrl}/suspend`, { method: "POST" });
  await fetch(`${hookUrl}/resume`, { method: "POST" });

  const html = await fetch(`http://127.0.0.1:${app.address().port}`).then(response => response.text());
  const module = await fetch(`http://127.0.0.1:${app.address().port}/marked.js`);
  const sanitizer = await fetch(`http://127.0.0.1:${app.address().port}/purify.js`);
  const state = await fetch(`http://127.0.0.1:${app.address().port}/api/state`).then(response => response.json());
  assert.match(html, /Markdown enabled/);
  assert.match(module.headers.get("content-type"), /text\/javascript/);
  assert.match(sanitizer.headers.get("content-type"), /text\/javascript/);
  assert.deepEqual(state, { sessionId: "mvm-phase-5", lifecycle: "RUNNING" });
});
