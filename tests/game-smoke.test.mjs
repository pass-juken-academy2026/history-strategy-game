import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");

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
  assert.ok(html.includes("history-strategy-save-backup-v1"), "save backup key missing");
  assert.ok(html.includes("checkForUpdates"), "version check missing");
  assert.ok(html.includes("serviceWorker.register"), "service worker registration missing");
  assert.ok(html.includes('rel="manifest"'), "web manifest missing");
});

test("manifest and version metadata are valid", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const version = JSON.parse(await readFile(new URL("../version.json", import.meta.url), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.lang, "ja");
  assert.match(version.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.version, version.version, "package and deployed app versions should match");
  assert.ok(html.includes("const APP_VERSION=\'" + version.version + "\'"), "runtime app version should match version.json");
});


test("campaign selection changes the playable map and starting resources", () => {
  const start = html.indexOf("const campaignRegions=[");
  const end = html.indexOf("let chosenCampaignRegion=", start);
  assert.ok(start >= 0 && end > start, "campaign setup declarations should exist");
  const declarations = html.slice(start, end);
  const sandbox = {
    regionsSeed: Array.from({length: 6}, (_, id) => ({
      id, name: "base-" + id, emoji: "x", owner: id < 2 ? "restore" : id < 4 ? "disrupt" : "neutral",
      troops: 2, dev: 0, desc: "base"
    }))
  };
  vm.runInNewContext(declarations + ";globalThis.__campaignSetupFor=campaignSetupFor;globalThis.__makeCampaignMap=makeCampaignMap;", sandbox);
  const asia = sandbox.__campaignSetupFor("東アジア");
  const america = sandbox.__campaignSetupFor("北アメリカ");
  assert.equal(asia.group, "アジア");
  assert.equal(america.group, "アメリカ大陸");
  assert.equal(asia.mapNames.length, 6);
  assert.notEqual(asia.mapNames[0], america.mapNames[0]);
  assert.notDeepEqual({...asia.bonus}, {...america.bonus});
  const map = sandbox.__makeCampaignMap("北アメリカ", "disrupt");
  assert.equal(map.length, 27);
  assert.equal(map[0].name, "北アメリカ");
  assert.equal(map[0].owner, "disrupt");
  assert.equal(map.filter(r => r.owner === "disrupt").length, 9);
  assert.equal(map.filter(r => r.owner === "restore").length, 9);
});


test("all campaign choices have a 27-region profile and balanced starting ownership", () => {
  const start = html.indexOf("const campaignRegions=[");
  const end = html.indexOf("let chosenCampaignRegion=", start);
  const sandbox = {
    regionsSeed: Array.from({length: 6}, (_, id) => ({
      id, name: "base-" + id, emoji: "x", owner: id < 2 ? "restore" : id < 4 ? "disrupt" : "neutral",
      troops: 2, dev: 0, desc: "base"
    }))
  };
  vm.runInNewContext(html.slice(start, end) + ";globalThis.__campaignRegions=campaignRegions;globalThis.__campaignSetupFor=campaignSetupFor;globalThis.__makeCampaignMap=makeCampaignMap;", sandbox);
  assert.equal(sandbox.__campaignRegions.length, 27);
  for (const item of sandbox.__campaignRegions) {
    const setup = sandbox.__campaignSetupFor(item.name);
    const map = sandbox.__makeCampaignMap(item.name, "restore");
    assert.equal(setup.mapNames.length, 6, item.name + " map should have six labels");
    assert.equal(map.length, 27, item.name + " map should include all 27 campaign regions");
    assert.equal(map.find(r => r.name === item.name)?.owner, "restore");
    assert.equal(map.filter(r => r.owner === "restore").length, 9);
    assert.equal(map.filter(r => r.owner === "disrupt").length, 9);
    assert.equal(map.filter(r => r.owner === "neutral").length, 9);
  }
});

test("development is capped and attack is a declared action control", () => {
  assert.ok(html.includes('id="attack"'), "attack button should exist in markup");
  assert.ok(html.includes("if(r.dev>=5)"), "development level cap should be enforced");
  assert.ok(html.includes("dev:Math.min(r.dev,5)"), "old saves should migrate to the new cap");
  assert.ok(html.includes("for(const id of ['recruit','develop','diplomacy','mission','protect','attack','endTurn'])"), "CPU turns should disable every player action");
});

test("CPU difficulty only changes CPU attack strength and menus support Escape", () => {
  assert.ok(html.includes("const cpuActing=g.mode==='cpu'&&g.active!==g.playerSide"));
  assert.ok(html.includes("g.difficulty==='easy'?-1:g.difficulty==='hard'?2:0"));
  assert.ok(html.includes("if(e.key==='Escape')closeSocialMenus()"));
  assert.ok(html.includes("if(!e.target.closest('.start-topbar'))closeSocialMenus()"));
});

test("online and friends UI clearly discloses missing server implementation", () => {
  assert.ok(html.includes("オンライン対戦（準備中）"));
  assert.ok(html.includes("フレンド追加・招待は、サーバー連携が未実装"));
});

test("online multiplayer is not falsely presented as implemented", () => {
  assert.ok(html.includes("オンライン対戦はこの版では未接続です"));
});

test("map rendering avoids interpreting saved region strings as HTML", () => {
  const renderMap = html.match(/function renderMap\(\)\{[\s\S]*?\nfunction renderStats/);
  assert.ok(renderMap, "renderMap function should exist");
  assert.ok(renderMap[0].includes("textContent"), "map labels should use textContent");
  assert.ok(!renderMap[0].includes(".innerHTML"), "map rendering must not interpolate saved data into innerHTML");
});

test("saved-game loader bounds input and validates saved state", () => {
  const loader = html.match(/function loadSavedGame\(\)\{[\s\S]*?\nfunction log/);
  const validator = html.match(/function loadSavedGameData\(raw\)\{[\s\S]*?\nfunction loadSavedGame\(/);
  assert.ok(loader, "saved-game loader should exist");
  assert.ok(validator, "saved-game validator should exist");
  assert.ok(validator[0].includes("raw.length>100000"), "saved data size should be bounded");
  assert.ok(loader[0].includes("loadSavedGameData(primary)"), "primary save should be attempted first");
  assert.ok(loader[0].includes("loadSavedGameData(backup)"), "backup save should be attempted if primary fails");
  assert.ok(html.indexOf("history-strategy-save-backup-v1',serialized") < html.indexOf("history-strategy-save-v1',serialized"), "backup should be written before primary");
  assert.ok(validator[0].includes("Number.isFinite"), "numeric values should be validated");
  assert.ok(validator[0].includes("checkedRegions"), "region state should be rebuilt from trusted templates");
});

test("service worker only caches known static assets and avoids private/no-store responses", () => {
  assert.ok(serviceWorker.includes("function isCacheableStaticAsset(url)"));
  assert.ok(serviceWorker.includes("if (!isCacheableStaticAsset(url))"));
  assert.ok(serviceWorker.includes("no-store|private"));
  assert.ok(serviceWorker.includes('response.headers.has("Set-Cookie")'));
  assert.ok(serviceWorker.includes("Unknown same-origin URLs are fetched but never stored"));
});


test("random technology events never exceed development level five", () => {
  assert.ok(html.includes("const candidates=g.regions.filter(r=>r.dev<5)"), "events should only choose regions below the cap");
  assert.ok(html.includes("r.dev=Math.min(5,r.dev+1)"), "event development should be capped at level five");
  assert.ok(html.includes("全地域が開発上限に達したため"), "event should have a fallback when every region is capped");
});

test("territory victory requires a majority of all regions, not a fixed small count", () => {
  assert.ok(html.includes("const territoryTarget=Math.floor(g.regions.length/2)+1"));
  assert.ok(html.includes("ownedCount('disrupt')>=territoryTarget"));
  assert.ok(html.includes("ownedCount('restore')>=territoryTarget"));
});

test("territory victory logic waits for a true majority of the 27-region map", () => {
  const start = html.indexOf("function checkEnd(){");
  const end = html.indexOf("\nfunction finish(", start);
  assert.ok(start >= 0 && end > start, "checkEnd function should exist");
  const source = html.slice(start, end);
  let winner = null;
  const sandbox = {
    g: {
      stability: 70, score: {disrupt: 0, restore: 0}, goal: "territory", turn: 1,
      regions: Array.from({length: 27}, (_, id) => ({id, owner: id < 9 ? "disrupt" : id < 18 ? "restore" : "neutral"}))
    },
    ownedCount(side) { return sandbox.g.regions.filter(r => r.owner === side).length; },
    finish(side) { winner = side; }
  };
  vm.runInNewContext(source, sandbox);
  sandbox.checkEnd();
  assert.equal(winner, null, "nine starting regions must not trigger a majority victory");
  sandbox.g.regions.slice(0, 5).forEach(r => { r.owner = "disrupt"; });
  sandbox.checkEnd();
  assert.equal(winner, "disrupt", "fourteen controlled regions should win");
  winner = null;
  sandbox.g.regions.forEach(r => { r.owner = "neutral"; });
  sandbox.g.regions.slice(0, 14).forEach(r => { r.owner = "restore"; });
  sandbox.checkEnd();
  assert.equal(winner, "restore", "the opposing faction should also be able to win by majority");
});
