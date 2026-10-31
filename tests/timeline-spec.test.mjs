import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../timeline.html", import.meta.url), "utf8");

test("3D timeline offers four graphics levels and applies local rendering settings", () => {
  for (const level of ["low", "medium", "high", "ultra"]) {
    assert.ok(html.includes('value="' + level + '"'), "missing quality level " + level);
  }
  assert.ok(html.includes("function applyQuality()"));
  assert.ok(html.includes("renderer.shadowMap.enabled=quality!=='low'"));
  assert.ok(html.includes("quality,campaignType,victoryRule"), "settings should be saved locally");
});

test("historical timeline distinguishes historical summaries from fictional alternate history", () => {
  assert.ok(html.includes('id="historyCompare"'));
  assert.ok(html.includes("【史実の要約】"));
  assert.ok(html.includes("【ゲーム内の架空分岐】"));
  assert.ok(html.includes("Julius Caesar") || html.includes("ユリウス・カエサル"));
  assert.ok(html.includes("ノーベル賞公式サイト"));
  assert.ok(html.includes("altered:'架空の分岐"));
});

test("branch endings and selectable local victory rules are implemented without claiming online multiplayer", () => {
  assert.ok(html.includes("value=\"sandbox\""));
  assert.ok(html.includes("value=\"mission\""));
  assert.ok(html.includes("value=\"stability\""));
  assert.ok(html.includes("value=\"blocks\""));
  assert.ok(html.includes("value=\"preserve\""));
  assert.ok(html.includes("史実保護 — 最終時代で安定度70以上を目指す"), "label must match the implemented threshold");
  assert.ok(html.includes("victoryRule===\'preserve\')winner=stability>=70"), "preservation rule must use threshold 70");
  assert.ok(html.includes("function finishTimeline()"));
  assert.ok(html.includes("歴史の連続性エンド"));
  assert.ok(html.includes("大分岐エンド"));
  assert.ok(html.includes("オンライン対戦・フレンド招待・サーバー同期は未実装です"));
});

test("settings do not ask for account or personal information and can clear local saves", () => {
  assert.ok(html.includes("アカウント登録・ログイン・個人情報入力は不要"));
  assert.ok(html.includes('id="clearSaves"'));
  assert.ok(html.includes("localStorage.removeItem(slotKey(i))"));
  assert.ok(!/innerHTML\s*=/.test(html), "dynamic UI must not interpolate untrusted values into innerHTML");
});

test("camera, drag placement, resize, and save slots have regression coverage", () => {
  assert.ok(html.includes("new OrbitControls(camera,renderer.domElement)"), "3D camera controls should be wired");
  assert.ok(html.includes("controls.enableDamping=true"), "camera movement should be smoothed");
  assert.ok(html.includes("renderer.domElement.setPointerCapture?.(e.pointerId)"), "dragging should retain pointer input");
  assert.ok(html.includes("renderer.domElement.addEventListener('pointermove'"), "block drag movement should be wired");
  assert.ok(html.includes("addEventListener('resize',resize)"), "renderer should respond to viewport resizing");
  assert.ok(html.includes("function slotKey(slot)"), "save slots should have isolated keys");
  assert.ok(html.includes("Number.isInteger(slot)||slot<1||slot>5"), "save/load must reject invalid slot numbers");
  assert.ok(html.includes("d.version!==1"), "unknown save formats should be rejected");
  assert.ok(html.includes("!Array.isArray(d.placed)"), "malformed saved block data should be rejected");
});

test("the 3D prototype discloses its online and network-dependent limitations", () => {
  assert.ok(html.includes("オンライン対戦・フレンド招待・サーバー同期は未実装です"));
  assert.ok(html.includes("Three.js") && html.includes("ネット接続が必要です"));
  assert.ok(html.includes("アカウント登録・ログイン・個人情報入力は不要"));
});

test("selected 3D blocks can be resized with touch-friendly on-screen controls", () => {
  assert.ok(html.includes('id="blockSizeControls"'));
  assert.ok(html.includes('id="shrinkBlock"'));
  assert.ok(html.includes('id="growBlock"'));
  assert.ok(html.includes("function resizeSelectedBlock(factor)"));
  assert.ok(html.includes("$('blockSizeControls').hidden=false"), "controls should appear after selecting a block");
  assert.ok(html.includes("@media(max-width:540px)"), "mobile layout should have dedicated sizing rules");
  assert.ok(html.includes("touch-action:manipulation"), "touch buttons should avoid unnecessary gesture delay");
});
