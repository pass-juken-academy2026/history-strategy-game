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

test("website and Android build scripts package the 3D timeline page", async () => {
  const { readFile } = await import("node:fs/promises");
  const siteBuilder = await readFile(new URL("../scripts/prepare-site.mjs", import.meta.url), "utf8");
  const androidBuilder = await readFile(new URL("../scripts/prepare-android.mjs", import.meta.url), "utf8");
  assert.ok(siteBuilder.includes('"timeline.html"'), "website bundle should include timeline.html");
  assert.ok(androidBuilder.includes('"timeline.html"'), "Android bundle should include timeline.html");
});


test("3D timeline uses local Three.js imports and build scripts bundle dependencies", async () => {
  const { readFile } = await import("node:fs/promises");
  const timeline = await readFile(new URL("../timeline.html", import.meta.url), "utf8");
  const siteBuilder = await readFile(new URL("../scripts/prepare-site.mjs", import.meta.url), "utf8");
  const androidBuilder = await readFile(new URL("../scripts/prepare-android.mjs", import.meta.url), "utf8");
  assert.ok(timeline.includes('"three":"./vendor/three.module.js"'), "Three.js import should be local");
  assert.ok(timeline.includes('"three/addons/":"./vendor/addons/"'), "addons should be local");
  assert.ok(!timeline.includes("cdn.jsdelivr.net/npm/three@"), "3D page should not depend on the Three.js CDN");
  for (const [name, builder] of [["website", siteBuilder], ["Android", androidBuilder]]) {
    assert.ok(builder.includes("node_modules/three/build/three.module.js"), name + " bundle should include Three.js");
    assert.ok(builder.includes("OrbitControls.js"), name + " bundle should include OrbitControls");
    assert.ok(builder.includes("THREE-LICENSE.txt"), name + " bundle should include the library license");
  }
});

test("service worker precaches local Three.js dependencies", () => {
  assert.ok(serviceWorker.includes('"./vendor/three.module.js"'), "Three.js should be in app shell cache");
  assert.ok(serviceWorker.includes('"./vendor/addons/controls/OrbitControls.js"'), "OrbitControls should be in app shell cache");
  assert.ok(serviceWorker.includes("history-strategy-shell-v9"), "vendor cache update should invalidate old shell");
});
