import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../timeline.html", import.meta.url), "utf8");

test("3D timeline page has its required controls", () => {
  for (const id of [
    "world3d", "eraTrack", "saveButton", "loadButton", "settingsButton",
    "advanceButton", "qualitySelect", "campaignSelect", "cpuDifficultySelect",
    "victorySelect", "applySettings", "networkNotice", "placeSelectedButton"
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), `missing #${id}`);
  }
});

test("executable inline scripts parse as JavaScript", () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type=["']importmap["']/.test(match[1]));
  assert.ok(scripts.length >= 1, "expected executable inline JavaScript");
  for (const [index, match] of scripts.entries()) {
    const source = /type=["']module["']/.test(match[1])
      ? match[2].replace(/^\s*import\s+.*?;\s*$/gm, "")
      : match[2];
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: `timeline.html:inline-${index + 1}` }),
      `inline script ${index + 1} must parse after module imports are isolated`
    );
  }
});

test("branch and versus modes remain distinct", () => {
  assert.match(html, /function setMode\(m\)/);
  assert.match(html, /分岐モード：妨害のみ/);
  assert.match(html, /対戦モード：妨害 vs 史実CPU/);
  assert.match(html, /if\(mode==='branch'\)/);
  assert.match(html, /mode==='versus'/);
  assert.match(html, /const disruptBlocks\s*=/);
  assert.match(html, /const restoreBlocks\s*=/);
  assert.match(html, /function activeBlocks\(\)\{return disruptBlocks\}/, "the human player must stay on the disruptor side; history-preservation blocks belong to the CPU");
  assert.match(html, /if\(!disruptBlocks\.some\(b=>b\.id===selected\)\)selected='delay'/, "switching modes or loading old saves must not leave a non-player block selected");
});

test("save data includes game state and block transforms", () => {
  assert.match(html, /function persistSave\(targetKey=AUTOSAVE_KEY\)/);
  assert.match(html, /localStorage\.setItem\(targetKey,JSON\.stringify\(data\)\)/);
  assert.ok(html.includes("blockTransforms:blockMeshes.map"), "block transforms must be saved");
  assert.match(html, /function restoreSave\(key=AUTOSAVE_KEY\)/);
});

test("quality settings and end-of-timeline result handling exist", () => {
  assert.match(html, /function applyQuality\(\)/);
  assert.match(html, /quality==='low'/);
  assert.match(html, /quality==='ultra'/);
  assert.match(html, /function finishTimeline\(\)/);
  assert.match(html, /ミッション達成エンド/);
  assert.match(html, /対戦結果：/);
});

test("save restoration validates stored values and slot boundaries", () => {
  assert.match(html, /slot<1\|\|slot>5/);
  assert.match(html, /d\.version!==1/);
  assert.match(html, /!\['branch','versus'\]\.includes\(d\.mode\)/);
  assert.match(html, /!Array\.isArray\(d\.placed\)/);
  assert.match(html, /\['low','medium','high','ultra'\]\.includes\(d\.quality\)/);
});

test("the page clearly identifies online multiplayer as not implemented", () => {
  assert.match(html, /オンライン対戦・フレンド招待・サーバー同期は未実装です/);
  assert.match(html, /ローカルの試作対戦で、オンライン対戦ではありません/);
});

test("the opening timeline is organized by individual Chinese dynasties", () => {
  for (const dynasty of ["name:'秦'", "name:'漢'", "name:'唐'", "name:'明'", "name:'清'"]) {
    assert.ok(html.includes(dynasty), `missing dynasty stage ${dynasty}`);
  }
  assert.doesNotMatch(html, /name:'古代'|name:'中世'|name:'近世'|name:'近代'|name:'現代'/);
});

test("event label is positioned below the mode switch on short screens", () => {
  assert.match(html, /\.mode-switch\{top:128px\}[\s\S]*?\.center-label\{top:clamp\(160px,22vh,240px\)\}/);
  assert.match(html, /\.center-label\{position:absolute;top:clamp\(160px,22vh,240px\)/);
});

test("3D scene initialization calls the implemented landmark builder", () => {
  assert.match(html, /function landmarks\(\)/);
  assert.match(html, /makeEarth\(\);makeTimeline\(\);landmarks\(\);animate\(\)/);
  assert.doesNotMatch(html, /makeLandmarks\(\)/);
});

test("3D click placement is handled by click events while pointerup only finalizes dragging", () => {
  assert.match(html, /addEventListener\('click',e=>\{if\(!lastPointerWasDrag\)pickObject\(e\);lastPointerWasDrag=false\}\)/);
  assert.match(html, /addEventListener\('pointerup',e=>\{lastPointerWasDrag=pointerMoved/);
});

test("a dedicated accessible control places the selected block into the 3D scene", () => {
  assert.match(html, /id="placeSelectedButton"/);
  assert.match(html, /\$\('placeSelectedButton'\)\.addEventListener\('click',place\)/);
});

test("3D clicks prioritize the nearest object so background era markers cannot steal block placement", () => {
  assert.match(html, /const hit=raycaster\.intersectObjects\(worldGroup\.children,true\)\[0\];if\(hit\?\.object\.userData\.type==='era'\)/);
});

test("loading a save reapplies the saved graphics quality to the renderer", () => {
  assert.match(html, /function loadSlot\(\)\{[\s\S]*?restoreSave\(slotKey\(slot\)\);applyQuality\(\);rebuildPlacedBlocks\(\)/);
});

test("manual save slots remain independent from continuous autosave", () => {
  assert.match(html, /const AUTOSAVE_KEY=SAVE_KEY\+"-autosave"/);
  assert.match(html, /function persistSave\(targetKey=AUTOSAVE_KEY\)/);
  assert.match(html, /activeSlot=slot;persistSave\(slotKey\(slot\)\)/);
  assert.match(html, /function restoreSave\(key=AUTOSAVE_KEY\)/);
  assert.match(html, /if\(!raw&&key===AUTOSAVE_KEY\)raw=localStorage\.getItem\(slotKey\(activeSlot\)\)/);
});

test("loading an empty save slot does not reset the current game", () => {
  assert.match(html, /if\(!localStorage\.getItem\(slotKey\(slot\)\)\)\{toast\('このスロットに保存データがありません'\);return\}/);
});
