import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import * as defaults from "../dist/config.js";
const config = Object.keys(defaults).map(
  (name) =>
    "export const " +
    name +
    " = " +
    JSON.stringify(process.env[name] || defaults[name]) +
    ";",
);
await writeFile(
  new URL("../dist/config.js", import.meta.url),
  config.join("\n") + "\n",
);

// A new content version installs one coherent offline bundle after each deployment.
const directory = new URL("../dist/", import.meta.url);
const digest = createHash("sha256");
for (const name of (await readdir(directory, { recursive: true })).sort()) {
  if (!name.includes(".") || name === "sw.js") continue;
  digest.update(name).update(await readFile(new URL(name, directory)));
}
const worker = new URL("sw.js", directory);
const source = await readFile(worker, "utf8");
const version = digest
  .update(
    source.replace(/const build = "[^"]+";/, 'const build = "LOCAL_BUILD";'),
  )
  .digest("hex")
  .slice(0, 16);
await writeFile(
  worker,
  source.replace(/const build = "[^"]+";/, 'const build = "' + version + '";'),
);
