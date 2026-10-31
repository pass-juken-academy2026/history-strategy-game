import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../timeline.html", import.meta.url), "utf8");

test("3D timeline page has its required controls", () => {
  for (const id of [
    "world3d", "eraTrack", "saveButton", "loadButton", "settingsButton",
    "advanceButton", "qualitySelect", "campaignSelect", "cpuDifficultySelect",
    "victorySelect", "applySettings", "networkNotice"
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), `missing #${id}`);
  }
});

test("all inline scripts parse as JavaScript", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 1, "expected inline JavaScript");
  for (const [index, match] of scripts.entries()) {
    assert.doesNotThrow(
      () => new vm.Script(match[1], { filename: `timeline.html:inline-${index + 1}` }),
      `inline script ${index + 1} must parse`
    );
  }
});

test("branch and versus modes remain distinct", () => {
  assert.match(html, /function setMode\(m\)/);
  assert.match(html, /分岐モード：妨害のみ/);
  assert.match(html, /対戦モード：妨害 vs 史実CPU/);
  assert.match(html, /if\(mode==='branch'\)/);
  assert.match(html, /if\(mode==='versus'\)/);
  assert.match(html, /const disruptBlocks\s*=/);
  assert.match(html, /const restoreBlocks\s*=/);
});

test("save data includes game state and block transforms", () => {
  assert.match(html, /function persistSave\(\)/);
  assert.match(html, /localStorage\.setItem\(slotKey\(activeSlot\),JSON\.stringify\(data\)\)/);
  assert.match(html, /blockTransforms:blockMeshes\.map/);
  assert.match(html, /function restoreSave\(\)/);
});

test("quality settings and end-of-timeline result handling exist", () => {
  assert.match(html, /function applyQuality\(\)/);
  assert.match(html, /quality==='low'/);
  assert.match(html, /quality==='ultra'/);
  assert.match(html, /function finishTimeline\(\)/);
  assert.match(html, /ミッション達成エンド/);
  assert.match(html, /対戦結果：/);
});
