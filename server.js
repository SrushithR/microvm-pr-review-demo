import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const APP_PORT = Number(process.env.APP_PORT || 8080);
const HOOK_PORT = Number(process.env.HOOK_PORT || 9000);
const HOOK_PREFIX = "/aws/lambda-microvms/runtime/v1";
const markedModule = readFileSync(new URL("./node_modules/marked/lib/marked.esm.js", import.meta.url));

export const state = { sessionId: null, lifecycle: "IMAGE_READY" };

function json(response, status, body) {
  response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 16_384) request.destroy(new Error("request too large"));
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("invalid JSON")); }
    });
    request.on("error", reject);
  });
}

export const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Markdown event description editor</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172033; background: #f5f7fb; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; padding: 3rem 1.5rem; }
      main { width: min(70rem, 100%); margin: auto; }
      header { margin-bottom: 1.75rem; }
      h1 { margin: 0 0 .4rem; font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -.035em; }
      header p { margin: 0; color: #667085; }
      .workspace { display: grid; grid-template-columns: 1fr 1fr; min-height: 28rem; overflow: hidden; border: 1px solid #dfe3eb; border-radius: 1rem; background: white; box-shadow: 0 18px 50px rgba(23, 32, 51, .08); }
      section { padding: 1.6rem; }
      section + section { border-left: 1px solid #e7eaf0; background: #fbfcfe; }
      .label { display: flex; align-items: center; justify-content: space-between; margin-bottom: .85rem; font-weight: 700; }
      .badge { padding: .3rem .6rem; border-radius: 999px; color: #175cd3; background: #eff8ff; font-size: .75rem; font-weight: 700; }
      textarea { width: 100%; min-height: 21rem; resize: vertical; padding: 1rem; border: 1px solid #cfd5df; border-radius: .7rem; color: #172033; background: white; font: 0.95rem/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; outline: none; }
      textarea:focus { border-color: #7f56d9; box-shadow: 0 0 0 3px rgba(127, 86, 217, .14); }
      #preview { min-height: 21rem; padding: 1rem; border: 1px solid #e7eaf0; border-radius: .7rem; background: white; line-height: 1.65; overflow-wrap: anywhere; }
      #preview > :first-child { margin-top: 0; }
      #preview a { color: #6941c6; }
      footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 1rem; color: #667085; font-size: .85rem; }
      footer span:last-child { overflow-wrap: anywhere; text-align: right; }
      @media (max-width: 760px) {
        body { padding: 1.5rem 1rem; }
        .workspace { grid-template-columns: 1fr; }
        section + section { border-top: 1px solid #e7eaf0; border-left: 0; }
        footer { display: block; }
        footer span { display: block; margin-top: .35rem; text-align: left !important; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Event description</h1>
        <p>Write in Markdown and preview the formatted event details.</p>
      </header>
      <div class="workspace">
        <section>
          <div class="label"><label for="description">Markdown</label><span id="count">0 characters</span></div>
          <textarea id="description" spellcheck="true"># AWS Community Day Mumbai

Learn about **Lambda MicroVMs** and isolated preview environments.

- Fast startup
- Dedicated isolation
- Suspend and resume</textarea>
        </section>
        <section>
          <div class="label"><span>Live preview</span><span class="badge" id="security-status">Markdown enabled</span></div>
          <div id="preview" aria-live="polite"></div>
        </section>
      </div>
      <footer>
        <span>Contributor preview · AWS Lambda MicroVM in Singapore</span>
        <span id="session">Loading session…</span>
      </footer>
    </main>
    <script type="module">
      import { marked } from '/marked.js';
      const description = document.querySelector('#description');
      const preview = document.querySelector('#preview');
      const count = document.querySelector('#count');
      function render() {
        preview.innerHTML = marked.parse(description.value);
        count.textContent = description.value.length + ' characters';
      }
      description.addEventListener('input', render);
      render();
      fetch('/api/state', { cache: 'no-store' })
        .then(response => response.json())
        .then(value => { document.querySelector('#session').textContent = value.sessionId + ' · ' + value.lifecycle; })
        .catch(() => { document.querySelector('#session').textContent = 'Session unavailable'; });
    </script>
  </body>
</html>`;

export function createAppServer() {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" });
      response.end(page);
      return;
    }
    if (request.method === "GET" && request.url === "/marked.js") {
      response.writeHead(200, { "cache-control": "public, max-age=3600", "content-type": "text/javascript; charset=utf-8" });
      response.end(markedModule);
      return;
    }
    if (request.method === "GET" && request.url === "/api/state") return json(response, 200, state);
    json(response, 404, { error: "not found" });
  });
}

export function createHookServer() {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.startsWith(`${HOOK_PREFIX}/`)) return json(response, 404, { error: "not found" });
    const hook = request.url.slice(HOOK_PREFIX.length + 1);
    try {
      if (hook === "ready" || hook === "validate") return json(response, 200, { hook });
      if (hook === "run") {
        const payload = await readJson(request);
        state.sessionId = payload.microvmId || `local-${randomUUID()}`;
        state.lifecycle = "RUNNING";
      } else if (hook === "suspend") state.lifecycle = "SUSPENDING";
      else if (hook === "resume") state.lifecycle = "RUNNING";
      else if (hook === "terminate") state.lifecycle = "TERMINATING";
      else return json(response, 404, { error: "unknown hook" });
      json(response, 200, { hook, ...state });
    } catch (error) {
      json(response, 400, { error: error.message });
    }
  });
}

export function startServers() {
  const appServer = createAppServer().listen(APP_PORT, "0.0.0.0");
  const hookServer = createHookServer().listen(HOOK_PORT, "0.0.0.0");
  return { appServer, hookServer };
}

if (process.argv[1] === new URL(import.meta.url).pathname) startServers();
