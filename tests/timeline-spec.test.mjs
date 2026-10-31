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
