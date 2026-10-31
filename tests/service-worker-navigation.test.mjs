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
    serviceWorker.includes('(await caches.match(request)) || (await caches.match("./index.html"))'),
    "offline navigation should try its own cached page before falling back to the homepage"
  );
});

test("service worker shell includes both the home page and 3D timeline", () => {
  const shell = serviceWorker.match(/const APP_SHELL = \[([^\]]+)\]/);
  assert.ok(shell, "app shell list should exist");
  assert.ok(shell[1].includes('"./index.html"'), "home page should be precached");
  assert.ok(shell[1].includes('"./timeline.html"'), "3D timeline should be precached");
});
