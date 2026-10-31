import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");

test("offline navigation caches each page under its own request URL", () => {
  assert.ok(
    serviceWorker.includes("await cache.put(request, fresh.clone());"),
    "successful navigation should be cached under the requested page URL"
  );
  assert.ok(
    !serviceWorker.includes('await cache.put("./index.html", fresh.clone());'),
    "a different page must not overwrite the offline homepage cache entry"
  );
  assert.ok(
    serviceWorker.includes("const cachedExact = await caches.match(request);") && serviceWorker.includes('return (await caches.match("./index.html")) || new Response('),
    "offline navigation should try its own cached page before falling back to the homepage"
  );
});

test("service worker shell includes both the home page and 3D timeline", () => {
  const shell = serviceWorker.match(/const APP_SHELL = \[([^\]]+)\]/);
  assert.ok(shell, "app shell list should exist");
  assert.ok(shell[1].includes('"./index.html"'), "home page should be precached");
  assert.ok(shell[1].includes('"./timeline.html"'), "3D timeline should be precached");
});

test("offline navigation retries the cached URL without query parameters", () => {
  assert.ok(
    serviceWorker.includes("const offlineUrl = new URL(request.url);"),
    "offline fallback should normalize the requested URL"
  );
  assert.ok(
    serviceWorker.includes("offlineUrl.search = \"\";"),
    "offline fallback should ignore cache-busting query strings"
  );
  assert.ok(
    serviceWorker.includes("const cachedWithoutQuery = await caches.match(offlineUrl.href);"),
    "offline fallback should try the normalized URL"
  );
  assert.ok(
    serviceWorker.includes("このページはまだオフライン用に保存されていません。"),
    "missing cached pages should return a clear explanation instead of an unrelated page"
  );
});
