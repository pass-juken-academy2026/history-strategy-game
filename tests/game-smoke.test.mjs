import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("inline game JavaScript parses", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, "expected exactly one inline script");
  assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
});

test("core game controls and factions exist", () => {
  for (const text of ["妨害派", "史実派", "CPU対戦", "2人対戦（同じ端末）", "地域へ攻勢"]) {
    assert.ok(html.includes(text), `missing game feature text: ${text}`);
  }
  for (const id of ["newGame", "resumeGame", "map", "recruit", "develop", "diplomacy", "mission", "protect", "endTurn"]) {
    assert.ok(html.includes(`id="${id}"`), `missing control: ${id}`);
  }
});

test("save, PWA, and update mechanisms are wired", () => {
  assert.ok(html.includes("history-strategy-save-v1"), "local save key missing");
  assert.ok(html.includes("checkForUpdates"), "version check missing");
  assert.ok(html.includes("serviceWorker.register"), "service worker registration missing");
  assert.ok(html.includes('rel="manifest"'), "web manifest missing");
});

test("manifest and version metadata are valid", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const version = JSON.parse(await readFile(new URL("../version.json", import.meta.url), "utf8"));
  assert.equal(manifest.lang, "ja");
  assert.match(version.version, /^\d+\.\d+\.\d+$/);
});

test("online multiplayer is not falsely presented as implemented", () => {
  assert.ok(html.includes("オンライン対戦はこの版では未接続です"));
});
