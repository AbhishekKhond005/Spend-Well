// Scope the shell cache to this Pages repository. Google requests never enter it.
const scope = new URL(self.registration.scope);
const family = "spendwell-shell:" + scope.pathname + ":";
const build = "LOCAL_BUILD";
const version = family + build;
const paths = [
  "index.html",
  "style.css",
  "theme.js",
  "app.js",
  "views.js",
  "ui.js",
  "cloud.js",
  "charts.js",
  "config.js",
  "money.js",
  "finance.js",
  "manifest.webmanifest",
  "assets/mark.svg",
  "assets/money.svg",
  "assets/inter-latin.woff2",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "google-setup.html",
  "privacy.html",
];
const known = new Set(paths.map((path) => new URL(path, scope).href));
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(version)
      .then((cache) =>
        cache.addAll(
          paths.map((p) => new Request(new URL(p, scope), { cache: "reload" })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(family) && k !== version)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.origin) return;
  const navigation =
    request.mode === "navigate" &&
    [scope.pathname, scope.pathname + "index.html"].includes(url.pathname);
  if (!navigation && !known.has(url.href)) return;
  const key = navigation ? new URL("index.html", scope).href : url.href;
  if (build !== "LOCAL_BUILD") {
    event.respondWith(
      caches
        .open(version)
        .then(async (cache) => (await cache.match(key)) || fetch(request)),
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(version);
          await cache.put(key, response.clone());
        }
        return response;
      })
      .catch(() => caches.open(version).then((cache) => cache.match(key))),
  );
});
