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

  // These APIs must not be added without a separate privacy/security review.
  const forbiddenRuntimePatterns = [
    [/navigator\s*\.\s*geolocation/, "geolocation"],
    [/navigator\s*\.\s*contacts/, "contacts API"],
    [/navigator\s*\.\s*mediaDevices\s*\.\s*getUserMedia/, "camera/microphone capture"],
    [/navigator\s*\.\s*sendBeacon/, "beacon transmission"],
    [/document\s*\.\s*cookie/, "cookie access"],
  ];

  for (const [sourceName, source] of [["index.html", index], ["timeline.html", timeline], ["sw.js", worker]]) {
    for (const [pattern, label] of forbiddenRuntimePatterns) {
      assert.doesNotMatch(source, pattern, sourceName + " must not use " + label + " without review");
    }
  }

  // Avoid silently loading third-party scripts, styles, frames, images or preconnect targets.
  const externalResourceTag = /<(?:script|iframe|img|audio|video|source|link)\b[^>]*(?:src|href)=["']https?:\/\//i;
  for (const [sourceName, source] of [["index.html", index], ["timeline.html", timeline]]) {
    assert.doesNotMatch(source, externalResourceTag, sourceName + " must not add remote embedded resources");
  }

  // Current online features are not implemented. Do not silently introduce direct socket sync.
  for (const [sourceName, source] of [["index.html", index], ["timeline.html", timeline], ["sw.js", worker]]) {
    assert.doesNotMatch(source, /new\s+WebSocket\s*\(/, sourceName + " must not enable direct online sync without review");
  }
});

test("save storage stays browser-local and version polling stays same-origin", async () => {
  const index = await read("index.html");
  assert.match(index, /localStorage\.setItem\(/, "expected local browser save");
  assert.match(index, /fetch\(\s*['"]\.\/version\.json/, "version check must use a relative same-origin path");
  assert.doesNotMatch(index, /fetch\(\s*['"]https?:\/\//i, "do not send game data to a hard-coded external endpoint");
});
