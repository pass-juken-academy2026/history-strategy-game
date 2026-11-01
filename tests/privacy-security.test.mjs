import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("privacy baseline: no high-risk personal-data browser APIs or external resource tags", async () => {
  const [index, timeline, worker] = await Promise.all([
    read("index.html"),
    read("timeline.html"),
    read("sw.js"),
  ]);

  const forbiddenRuntimePatterns = [
    [/navigator\s*\.\s*geolocation/, "geolocation"],
    [/navigator\s*\.\s*contacts/, "contacts API"],
    [/navigator\s*\.\s*mediaDevices\s*\.\s*getUserMedia/, "camera/microphone capture"],
    [/navigator\s*\.\s*sendBeacon/, "beacon transmission"],
    [/document\s*\.\s*cookie/, "cookie access"],
    [/new\s+WebSocket\s*\(/, "direct online sync"],
    [/\bXMLHttpRequest\b/, "XHR network requests"],
    [/\bEventSource\s*\(/, "server-sent events"],
    [/\bimportScripts\s*\(/, "worker script loading"],
  ];

  for (const [sourceName, source] of [["index.html", index], ["timeline.html", timeline], ["sw.js", worker]]) {
    for (const [pattern, label] of forbiddenRuntimePatterns) {
      assert.doesNotMatch(source, pattern, sourceName + " must not use " + label + " without review");
    }
  }

  const externalResourceTag = /<(?:script|iframe|img|audio|video|source|link)\b[^>]*(?:src|href)=["']https:/i;
  for (const [sourceName, source] of [["index.html", index], ["timeline.html", timeline]]) {
    assert.doesNotMatch(source, externalResourceTag, sourceName + " must not add remote embedded resources");
  }
});

test("save storage stays browser-local and version polling stays same-origin", async () => {
  const index = await read("index.html");
  assert.match(index, /localStorage\.setItem\(/, "expected local browser save");
  assert.ok(index.includes("fetch('./version.json"), "version check must use a relative same-origin path");
  assert.ok(!index.includes("fetch('https:") && !index.includes('fetch("https:'), "do not send game data to a hard-coded external endpoint");
});

test("public privacy page is linked and included in the deployed bundle", async () => {
  const [index, timeline, privacy, builder, androidBuilder, worker] = await Promise.all([
    read("index.html"),
    read("timeline.html"),
    read("privacy.html"),
    read("scripts/prepare-site.mjs"),
    read("scripts/prepare-android.mjs"),
    read("sw.js"),
  ]);
  assert.match(index, /href=["']\.\/privacy\.html["']/);
  assert.match(timeline, /href=["']\.\/privacy\.html["']/);
  assert.match(privacy, /GitHub Pages/);
  assert.match(privacy, /IP\s*アドレス/);
  assert.match(privacy, /docs\.github\.com\/en\/site-policy\/privacy-policies\/github-general-privacy-statement/);
  assert.match(privacy, /ホスティング事業者/);
  assert.match(privacy, /端末内ストレージ/);
  assert.match(builder, /"privacy\.html"/);
  assert.match(androidBuilder, /privacy\\.html/, "Android package must include the linked privacy page");
  assert.match(worker, /"\.\/privacy\.html"/);
});
