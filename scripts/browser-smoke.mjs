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

  const canvas = page.locator("#world3d canvas");
  const bounds = await canvas.boundingBox();
  assert.ok(bounds, "3D canvas should have a browser viewport box");
  await page.evaluate(() => {
    window.__placedEventCount = 0;
    window.__canvasPointerEvents = [];
    const canvas = document.querySelector("#world3d canvas");
    for (const name of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
      canvas.addEventListener(name, (event) => {
        if (window.__canvasPointerEvents.length < 20) window.__canvasPointerEvents.push({ name, x: event.clientX, y: event.clientY });
      }, true);
    }
    window.addEventListener("history:block-placed", () => { window.__placedEventCount += 1; });
  });
  let placed = false;
  const placementAttempts = [];
  const grid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  outer: for (const y of [0.24, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.64]) {
    for (const x of grid) {
      const px = bounds.x + bounds.width * x;
      const py = bounds.y + bounds.height * y;
      const hitTarget = await page.evaluate(({ px, py }) => {
        const target = document.elementFromPoint(px, py);
        return { tag: target?.tagName, id: target?.id, isCanvas: target?.tagName === "CANVAS" };
      }, { px, py });
      if (!hitTarget.isCanvas) continue;
      await page.mouse.click(px, py);
      await page.waitForTimeout(45);
      placed = await page.evaluate(() => Object.keys(localStorage).some(k => k.includes("slot-1") && (() => {
        try { return JSON.parse(localStorage.getItem(k)).placed?.length > 0; } catch { return false; }
      })()));
      if (placed) break outer;
      if (placementAttempts.length < 12) placementAttempts.push({ x, y, ...hitTarget });
    }
  }
  const interactionDebug = await page.evaluate(() => ({
    blockPlacedEvents: window.__placedEventCount,
    canvasPointerEvents: window.__canvasPointerEvents,
    toast: document.querySelector("#toast")?.textContent,
    savedKeys: Object.keys(localStorage).filter(k => k.includes("slot-1"))
  }));
  assert.ok(placed, "clicking the 3D world should place and persist a disruption block; attempts=" + JSON.stringify({ tried: placementAttempts, ...interactionDebug }));

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
  assert.deepEqual(pageErrors, [], "browser page should not emit uncaught JavaScript errors");
  console.log("Browser smoke passed: 3D renderer, faction controls, block placement, save/load, graphics restoration, and end-of-timeline scoring.");
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
