import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
const base = decodeURIComponent(new URL("../", import.meta.url).pathname);
const mime = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const file = resolve(
      base,
      "." + (path.endsWith("/") ? path + "index.html" : path),
    );
    if (!["dist", "tests"].some((p) => file.startsWith(join(base, p) + sep)))
      throw Error();
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = "http://127.0.0.1:" + server.address().port;
const profile = await mkdtemp(join(tmpdir(), "spendwell-browser-"));
const chrome = spawn(
  process.env.CHROME_BIN || "google-chrome",
  [
    "--headless",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--remote-debugging-pipe",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
);
let pending = new Map(),
  seq = 0,
  buffer = "",
  sessionId,
  errors = [];
const timer = setTimeout(() => {
  console.error("Browser suite timed out");
  chrome.kill();
  process.exitCode = 1;
}, 60000);
function cmd(method, params = {}, session = sessionId) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    chrome.stdio[3].write(
      JSON.stringify({ id, method, params, sessionId: session }) + "\0",
    );
  });
}
chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    const cb = pending.get(msg.id);
    if (cb) {
      pending.delete(msg.id);
      msg.error ? cb.reject(Error(msg.error.message)) : cb.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown")
      errors.push(
        msg.params.exceptionDetails.exception?.description ||
          msg.params.exceptionDetails.text,
      );
  }
});
chrome.once("exit", () => {
  for (const cb of pending.values()) cb.reject(Error("Chrome exited."));
  pending.clear();
});
async function js(expression) {
  const r = await cmd("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result.value;
}
async function until(test) {
  for (let i = 0; i < 180; i++) {
    if (await js(test)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(
    "Timed out: " +
      test +
      " " +
      JSON.stringify(errors) +
      " · " +
      (await js("document.body.innerText.slice(0,320)")),
  );
}
const click = (selector) =>
  js(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill = (selector, value) =>
  js(
    `document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`,
  );
async function screen(width, height, label) {
  await cmd("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await js(
    "document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))).then(()=>true)",
  );
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(
    await js("document.documentElement.scrollWidth<=innerWidth"),
    true,
    label + " fits screen",
  );
  if (process.env.SNAPSHOT_DIR) {
    const { data } = await cmd("Page.captureScreenshot", { format: "png" });
    await writeFile(
      join(process.env.SNAPSHOT_DIR, "spendwell-" + label + ".png"),
      Buffer.from(data, "base64"),
    );
  }
}
try {
  const { targetInfos } = await cmd("Target.getTargets");
  sessionId = (
    await cmd("Target.attachToTarget", {
      targetId: targetInfos.find((t) => t.type === "page").targetId,
      flatten: true,
    })
  ).sessionId;
  await cmd("Runtime.enable");
  await cmd("Page.enable");
  await cmd("Page.navigate", { url: url + "/dist/" });
  await until('!!document.querySelector(".statvalue")');
  await screen(1440, 1000, "desktop");
  await screen(390, 844, "mobile");
  await click('.mobile-nav [data-act="new"]');
  await fill('[name="amount"]', "125.50");
  await fill('[name="title"]', "Browser test coffee");
  await fill('[name="category"]', "dining");
  await click("dialog [type=submit]");
  await until(
    '!document.querySelector("dialog").open && document.body.innerText.includes("Browser test coffee")',
  );
  await click(".tx-row .merchant");
  await fill('[name="amount"]', "145.50");
  await click("dialog [type=submit]");
  await until(
    '!document.querySelector("dialog").open && document.body.innerText.includes("145.5")',
  );
  await until("!!navigator.serviceWorker.controller");
  await cmd("Network.enable");
  await cmd("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await cmd("Page.reload");
  await until('document.body.innerText.includes("Browser test coffee")');
  await cmd("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await until('document.body.innerText.includes("Browser test coffee")');
  await js(
    "const group=document.querySelector('#breakdown-mode');group.value='member';group.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await click(".legend-row[data-person]");
  assert.equal(
    await js('document.querySelector("[data-filter=type]").value'),
    "expense",
  );
  assert.ok(await js('document.querySelector("[data-filter=member]").value'));
  await click(".mobile-nav [data-page=overview]");
  await js(
    "const groupBy=document.querySelector('#breakdown-mode');groupBy.value='category';groupBy.dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await click('[data-cat="dining"].legend-row');
  await until('document.querySelector("h1").textContent==="Transactions"');
  assert.equal(
    await js('document.querySelector("[data-filter=cat]").value'),
    "dining",
  );
  await click(".mobile-nav [data-page=budgets]");
  await click("[data-budget=dining]");
  await fill("[name=amount]", "8200");
  await click("dialog [type=submit]");
  await until(
    '!document.querySelector("dialog").open && document.body.innerText.includes("8,200")',
  );
  await click(".mobile-nav [data-page=transactions]");
  await click(".tx-row .merchant");
  await click("[data-act=delete]");
  await click("dialog [type=submit]");
  await until(
    '!document.querySelector("dialog").open&&!document.body.innerText.includes("Browser test coffee")',
  );
  await click(".mobile-nav [data-page=overview]");
  await click("[data-act=period]");
  await click(".picker-list button:nth-child(2)");
  await until('!document.querySelector("dialog").open');
  await click("[data-act=households]");
  await click("[data-act=create]");
  await until(
    'document.querySelector("dialog").innerText.includes("Choose a Google account")',
  );
  await cmd("Page.navigate", { url: url + "/tests/cloud.browser.html" });
  await until(
    'document.querySelector("#status")?.textContent.match(/pass|fail/i)',
  );
  const result = await js('document.querySelector("#status").textContent');
  assert.match(result, /pass/i);
  assert.doesNotMatch(result, /^fail/i);
  assert.deepEqual(errors, []);
  console.log(
    "Desktop and mobile layouts, transaction CRUD, persistence, category drill-down, budgets, periods, owner gate and cloud synchronization passed.",
  );
} finally {
  clearTimeout(timer);
  const stopped =
    chrome.exitCode !== null || chrome.signalCode !== null
      ? Promise.resolve()
      : once(chrome, "exit");
  chrome.kill();
  await stopped;
  server.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 150,
  });
}
