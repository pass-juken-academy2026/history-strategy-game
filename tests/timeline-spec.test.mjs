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
  assert.ok(html.includes("3Dライブラリはサイトに同梱されています"));
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


test("block selection can be cleared safely after use or when starting a new game", () => {
  assert.ok(html.includes("function deselectBlock()"), "selection cleanup should be centralized");
  assert.ok(html.includes("if(e.key==='Escape'){deselectBlock();return}"), "Escape should clear selection");
  assert.ok(html.includes("function reset(){deselectBlock();"), "reset should not retain a stale selected mesh");
  assert.ok(html.includes("deselectBlock();goEra(hit.object.userData.era)"), "switching eras should clear the previous block selection");
});


test("block resizing clamps each axis independently instead of changing vector direction", () => {
  assert.ok(html.includes("const bounded=v=>Math.max(.5,Math.min(2.5,v))"));
  assert.ok(html.includes("selectedBlockMesh.scale.set(bounded(next.x),bounded(next.y),bounded(next.z))"));
  assert.ok(!html.includes("selectedBlockMesh.scale.clampLength(.5,2.5)"), "resize should not use vector-length clamping");
});


test("CPU protection moves are recorded for save, rebuild, and end-of-game scoring", () => {
  assert.ok(html.includes("placed.push({id:b.id,era:eraIndex,delta:b.delta,source:'cpu'})"), "CPU protection placements must enter the shared placement ledger");
  assert.ok(html.includes("const protections=placed.filter(p=>restoreBlocks.some(b=>b.id===p.id)).length"), "CPU protection moves must count toward the preservation result");
  assert.ok(html.includes("x.source!=='cpu'"), "CPU moves must not consume the player's three-placement limit");
});

test("reset stops auto-advance and returns the timeline to branch mode", () => {
  const start = html.indexOf("function reset(){");
  const end = html.indexOf("$('advanceButton')", start);
  assert.ok(start >= 0 && end > start, "reset function should exist");
  const reset = html.slice(start, end);
  assert.ok(reset.includes("clearInterval(autoTimer)"), "reset should stop the active auto-advance timer");
  assert.ok(reset.includes("autoFlow=false"), "reset should clear auto-advance state");
  assert.ok(reset.includes("mode='branch'"), "new game should start in branch mode");
  assert.ok(reset.includes("b.dataset.mode==='branch'"), "mode controls should reflect the reset mode");
});


test("versus mode offers persisted CPU difficulty levels with different protection strategies", () => {
  for (const level of ["easy", "normal", "hard"]) {
    assert.ok(html.includes('value="' + level + '"'), "missing CPU difficulty " + level);
  }
  assert.ok(html.includes('id="cpuDifficultySelect"'), "difficulty should be configurable in settings");
  assert.ok(html.includes("let cpuDifficulty=\"normal\""), "default difficulty should be balanced");
  assert.ok(html.includes("cpuDifficulty==='easy'?.45:cpuDifficulty==='hard'?.95:.72"), "difficulty should affect CPU action frequency");
  assert.ok(html.includes("function chooseCpuProtection()"), "CPU should select protection based on difficulty");
  assert.ok(html.includes("cpuDifficulty,campaignType,victoryRule") || html.includes("campaignType,victoryRule,cpuDifficulty"), "difficulty should persist in saves");
  assert.ok(html.includes("cpuDifficulty=['easy','normal','hard'].includes(d.cpuDifficulty)?d.cpuDifficulty:'normal'"), "invalid or old saves should fall back safely");
});


test("hard CPU adapts protection choices to victory rules and avoids same-era repetition", () => {
  assert.ok(html.includes("const used=new Set(placed.filter(p=>p.era===eraIndex&&p.source==='cpu').map(p=>p.id))"), "CPU should track its same-era choices");
  assert.ok(html.includes("const available=restoreBlocks.filter(b=>!used.has(b.id))"), "CPU should prefer unused protection blocks in the current era");
  assert.ok(html.includes("if(victoryRule==='stability')score="), "hard CPU should account for the stability victory rule");
  assert.ok(html.includes("else if(victoryRule==='preserve')score="), "hard CPU should account for the preservation threshold");
  assert.ok(html.includes("disruptionCount>0?1:0"), "hard CPU should respond to player disruption");
});


test("offline messaging matches the locally bundled Three.js implementation", () => {
  assert.ok(html.includes("3Dライブラリはサイトに同梱されています"), "settings should disclose bundled local 3D assets");
  assert.ok(html.includes("オンラインで一度開いてキャッシュされた状態で確認してください"), "offline claims should be qualified by cache availability");
  assert.ok(!html.includes("Three.jsの読み込みにはネット接続が必要です"), "obsolete CDN-dependent notice should be removed");
});
