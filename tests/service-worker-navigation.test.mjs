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
  assert.ok(serviceWorker.includes("history-strategy-shell-v10"), "vendor cache update should invalidate old shell");
});


test("both build scripts verify bundled 3D assets in CI", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflow = await readFile(new URL("../.github/workflows/ci-pages.yml", import.meta.url), "utf8");
  for (const path of ["dist/timeline.html", "dist/vendor/three.module.js", "dist/vendor/addons/controls/OrbitControls.js", "dist/vendor/THREE-LICENSE.txt"]) {
    assert.ok(workflow.includes(path), "CI should verify web asset " + path);
  }
  for (const path of ["www/timeline.html", "www/vendor/three.module.js", "www/vendor/addons/controls/OrbitControls.js", "www/vendor/THREE-LICENSE.txt"]) {
    assert.ok(workflow.includes(path), "CI should verify Android asset " + path);
  }
});


test("service worker does not activate with an incomplete offline app shell", () => {
  assert.ok(serviceWorker.includes("if (!isSafeToCache(response))"), "required shell responses must be checked");
  assert.ok(serviceWorker.includes("Required offline asset could not be cached"), "failed required assets should fail installation clearly");
  assert.ok(serviceWorker.includes("await cache.put(path, response);"), "each required shell asset must be stored before activation");
  assert.ok(!/APP_SHELL\.map\(async path => \{\s*try\s*\{/.test(serviceWorker), "shell failures must not be silently swallowed");
});

test("service worker cache version changes when the required app shell changes", () => {
  assert.ok(serviceWorker.includes('const CACHE_NAME = "history-strategy-shell-v10"'));
  assert.ok(serviceWorker.includes('"./vendor/three.module.js"'));
  assert.ok(serviceWorker.includes('"./vendor/addons/controls/OrbitControls.js"'));
});


test("service worker install only activates after every required asset is cached", async () => {
  const vm = await import("node:vm");
  async function runInstall(failPath = null) {
    const listeners = new Map();
    const stored = [];
    let skipWaitingCalls = 0;
    const cache = { put: async (key, response) => { stored.push(String(key)); } };
    const context = {
      URL,
      Request,
      Response,
      Promise,
      Error,
      self: {
        location: { origin: "https://game.example" },
        addEventListener: (name, handler) => listeners.set(name, handler),
        skipWaiting: async () => { skipWaitingCalls += 1; }
      },
      caches: { open: async () => cache },
      fetch: async request => {
        if (failPath && String(request.url || request).endsWith(failPath)) {
          return { ok: false, type: "basic", headers: { get: () => "", has: () => false } };
        }
        return { ok: true, type: "basic", headers: { get: () => "", has: () => false } };
      }
    };
    vm.runInNewContext(serviceWorker, context, { filename: "sw.js" });
    let waitUntilPromise;
    listeners.get("install")({ waitUntil: promise => { waitUntilPromise = promise; } });
    let error = null;
    try { await waitUntilPromise; } catch (caught) { error = caught; }
    return { stored, skipWaitingCalls, error };
  }

  const success = await runInstall();
  assert.equal(success.error, null, "all successful assets should allow installation");
  assert.equal(success.skipWaitingCalls, 1, "worker should activate only after precache succeeds");
  assert.equal(success.stored.length, 9, "all nine required app-shell assets should be cached");

  const failure = await runInstall("timeline.html");
  assert.ok(failure.error instanceof Error || failure.error?.message?.includes("Required offline asset"), "a failed required asset should reject installation");
  assert.equal(failure.skipWaitingCalls, 0, "worker must not skip waiting when an app-shell asset fails");
});
