import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve("dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + sep)) throw new Error("Invalid path");
    const info = await stat(file);
    const target = info.isDirectory() ? resolve(file, "index.html") : file;
    res.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((resolveListen) => server.listen(4173, "127.0.0.1", resolveListen));

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  const networkOrigins = new Set();
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (url.protocol === "http:" || url.protocol === "https:") networkOrigins.add(url.origin);
    } catch {}
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") await dialog.accept("1");
    else await dialog.accept();
  });

  await page.goto("http://127.0.0.1:4173/timeline.html", { waitUntil: "networkidle" });
  await page.locator("#world3d canvas").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("#webglError").isVisible(), false, "3D renderer should start in Chromium");
  assert.ok(await page.locator("#world3d canvas").count() === 1, "3D canvas should render");

  await page.locator("#settingsButton").click();
  await page.locator("#qualitySelect").selectOption("low");
  await page.locator("#applySettings").click();
  await page.locator('[data-mode="versus"]').click();
  assert.equal(await page.locator("#tools [data-kind='restore']").count(), 0, "human player must only see disruption blocks in versus mode");
  await page.locator("#tools [data-kind='disrupt']").first().click();

  await page.evaluate(() => {
    window.__canvasPointerEvents = [];
    const target = document.querySelector("#world3d canvas");
    for (const name of ["pointerdown", "pointerup"]) {
      target.addEventListener(name, () => window.__canvasPointerEvents.push(name), true);
    }
  });

  const canvas = page.locator("#world3d canvas");
  const bounds = await canvas.boundingBox();
  assert.ok(bounds, "3D canvas should have a browser viewport box");
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.48);
  await page.waitForTimeout(80);
  const canvasInput = await page.evaluate(() => window.__canvasPointerEvents.includes("pointerdown") && window.__canvasPointerEvents.includes("pointerup"));
  assert.ok(canvasInput, "browser mouse input should reach the 3D canvas");

  await page.locator("#placeSelectedButton").click();
  await page.waitForTimeout(100);
  const placementState = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.endsWith("-autosave"));
    return key ? { key, data: JSON.parse(localStorage.getItem(key)) } : null;
  });
  assert.ok(placementState?.data?.placed?.length > 0, "place button should create and persist a disruption block");
  assert.ok(placementState.data.placed.every(p => p.id !== "archive" && p.id !== "education" && p.id !== "diplomacy" && p.id !== "resilience" && p.id !== "science" && p.id !== "law"), "human player should not place CPU protection blocks");

  const beforeResize = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.endsWith("-autosave"));
    const data = JSON.parse(localStorage.getItem(key));
    return { key, transform: { ...data.blockTransforms[data.blockTransforms.length - 1] } };
  });
  await page.locator("#growBlock").click();
  const afterResize = await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key));
    return data.blockTransforms[data.blockTransforms.length - 1];
  }, beforeResize.key);
  assert.ok(afterResize.sx > beforeResize.transform.sx && afterResize.sy > beforeResize.transform.sy && afterResize.sz > beforeResize.transform.sz, "resize button should enlarge and persist block dimensions");

  const beforeDrag = await page.evaluate(() => window.__gameTestHooks.lastBlockScreenPosition());
  assert.ok(beforeDrag, "test hook should return the placed block screen position");
  await page.mouse.move(beforeDrag.x, beforeDrag.y);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x + 45, beforeDrag.y + 8, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const afterDrag = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.endsWith("-autosave"));
    const data = JSON.parse(localStorage.getItem(key));
    return data.blockTransforms[data.blockTransforms.length - 1];
  });
  assert.ok(Math.abs(afterDrag.x - beforeDrag.worldX) > 0.05 || Math.abs(afterDrag.z - beforeDrag.worldZ) > 0.05,
    "dragging a placed block should change and persist its world position");

  await page.locator("#saveButton").click();
  const saveKey = await page.evaluate(() => Object.keys(localStorage).find(k => k.includes("slot-1")));
  assert.ok(saveKey, "manual save should create local slot 1");
  const beforeLoad = await page.locator("#historyTitle").innerText();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
  assert.equal(saved.mode, "versus");
  assert.ok(saved.placed.length >= 1, "save should contain placed blocks");

  await page.locator("#advanceButton").click();
  await page.locator("#loadButton").click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#historyTitle").innerText(), beforeLoad, "loading a slot should restore the saved era");
  const afterLoad = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
  assert.equal(afterLoad.eraIndex, saved.eraIndex, "restored era should remain in saved state");
  assert.equal(afterLoad.quality, "low", "saved graphics quality should survive load");

  for (let i = 0; i < 20 && !(await page.locator("#advanceButton").isDisabled()); i++) {
    await page.locator("#advanceButton").click();
    await page.waitForTimeout(80);
  }
  const feed = await page.locator("#feed").innerText();
  assert.match(feed, /対戦結果：/, "reaching the last era should calculate and display a versus result");

  const victoryCases = [
    { rule: "stability", score: 49, expected: "妨害派" },
    { rule: "stability", score: 50, expected: "史実派" },
    { rule: "preserve", score: 69, expected: "妨害派" },
    { rule: "preserve", score: 70, expected: "史実派" }
  ];
  for (const scenario of victoryCases) {
    const result = await page.evaluate((testCase) => {
      document.querySelector("#feed").replaceChildren();
      window.__gameTestHooks.setVictoryState(testCase);
      window.__gameTestHooks.finishTimeline();
      return document.querySelector("#feed").innerText;
    }, scenario);
    assert.match(result, new RegExp("対戦結果：" + scenario.expected), `victory boundary ${scenario.rule} at ${scenario.score} should resolve to ${scenario.expected}`);
  }
  const blockTie = await page.evaluate(() => {
    document.querySelector("#feed").replaceChildren();
    window.__gameTestHooks.setVictoryState({ rule: "blocks", score: 50, placedCount: 1, protectionCount: 1 });
    window.__gameTestHooks.finishTimeline();
    return document.querySelector("#feed").innerText;
  });
  assert.match(blockTie, /対戦結果：引き分け/, "equal block counts should resolve to a draw");
  const blockWin = await page.evaluate(() => {
    document.querySelector("#feed").replaceChildren();
    window.__gameTestHooks.setVictoryState({ rule: "blocks", score: 50, placedCount: 2, protectionCount: 1 });
    window.__gameTestHooks.finishTimeline();
    return document.querySelector("#feed").innerText;
  });
  assert.match(blockWin, /対戦結果：妨害派/, "more disruption blocks should win the block-count rule");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const mobileLayout = await page.evaluate(() => {
    const mode = document.querySelector(".mode-switch").getBoundingClientRect();
    const label = document.querySelector(".center-label").getBoundingClientRect();
    return { modeBottom: mode.bottom, labelTop: label.top, labelBottom: label.bottom, viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth };
  });
  assert.ok(mobileLayout.labelTop >= mobileLayout.modeBottom, "event label must not overlap the mode switch on a mobile viewport");
  assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1, "mobile layout should not create horizontal page overflow");
  assert.deepEqual(pageErrors, [], "browser page should not emit uncaught JavaScript errors");
  assert.deepEqual([...networkOrigins], ["http://127.0.0.1:4173"], "game page must not make HTTP(S) requests to third-party origins");
  console.log("Browser smoke passed: 3D renderer, faction controls, block placement, save/load, graphics restoration, block resizing and drag movement, victory-condition boundaries, mobile overlap/overflow, and end-of-timeline scoring.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
