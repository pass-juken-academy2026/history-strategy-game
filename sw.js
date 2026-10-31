const CACHE_NAME = "history-strategy-shell-v10";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg", "./version.json", "./timeline.html", "./vendor/three.module.js", "./vendor/addons/controls/OrbitControls.js", "./vendor/THREE-LICENSE.txt"];

function isCacheableStaticAsset(url) {
  return /\.(?:js|mjs|css|svg|png|webp|ico|woff2?)$/i.test(url.pathname)
    || url.pathname.endsWith("/manifest.json");
}

function isSafeToCache(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const cacheControl = response.headers.get("Cache-Control") || "";
  if (/\b(?:no-store|private)\b/i.test(cacheControl)) return false;
  if (response.headers.has("Set-Cookie")) return false;
  return true;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Do not activate a worker that silently failed to cache required offline assets.
    // Keeping the previous worker active is safer than advertising a broken app shell.
    await Promise.all(APP_SHELL.map(async path => {
      const response = await fetch(new Request(path, { cache: "reload" }));
      if (!isSafeToCache(response)) {
        throw new Error(`Required offline asset could not be cached: ${path}`);
      }
      await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("history-strategy-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || url.pathname.endsWith("/version.json")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        if (fresh.ok && request.mode === "navigate" && isSafeToCache(fresh)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (_) {
        const cachedExact = await caches.match(request);
        if (cachedExact) return cachedExact;

        // A cache-busting query string should not make an already cached page unavailable offline.
        const offlineUrl = new URL(request.url);
        offlineUrl.search = "";
        offlineUrl.hash = "";
        const cachedWithoutQuery = await caches.match(offlineUrl.href);
        if (cachedWithoutQuery) return cachedWithoutQuery;

        return (await caches.match("./index.html")) || new Response(
          "このページはまだオフライン用に保存されていません。オンラインで一度開いてから再試行してください。",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // Only cache known static assets. Unknown same-origin URLs are fetched but never stored.
  if (!isCacheableStaticAsset(url)) {
    event.respondWith(fetch(request).catch(() => new Response("オフラインです。接続を確認して再試行してください。", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (isSafeToCache(fresh)) (await caches.open(CACHE_NAME)).put(request, fresh.clone());
      return fresh;
    } catch (_) {
      return new Response("オフラインです。接続を確認して再試行してください。", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
