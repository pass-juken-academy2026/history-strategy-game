import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve("dist");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };
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
await new Promise((resolveListen) => server.listen(4174, "127.0.0.1", resolveListen));

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  await page.addInitScript(() => {
    let randomState = 1;
    window.__seedCpuSimulation = (seed) => {
      randomState = seed >>> 0;
      Math.random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 4294967296;
      };
    };
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, _delay, ...args) => nativeSetTimeout(callback, 0, ...args);
  });
  await page.goto("http://127.0.0.1:4174/index.html", { waitUntil: "networkidle" });

  const difficulties = ["easy", "normal", "hard", "master"];
  const sides = ["disrupt", "restore"];
  const outcomes = Object.fromEntries(difficulties.map((difficulty) => [difficulty, { cpuWins: 0, playerWins: 0, games: 0 }]));
  let firstMatch = true;
  let seed = 20261102;

  for (const difficulty of difficulties) {
    for (const side of sides) {
      for (let repetition = 0; repetition < 3; repetition++) {
        if (!firstMatch) {
          await page.locator("#newGame").click();
          await page.locator("#startScreen").waitFor({ state: "visible" });
        }
        firstMatch = false;
        await page.evaluate(({ side, difficulty, seed }) => {
          document.querySelector("#mode").value = "cpu";
          document.querySelector("#side").value = side;
          document.querySelector("#difficulty").value = difficulty;
          window.__seedCpuSimulation(seed);
        }, { side, difficulty, seed: seed++ });
        await page.locator("#beginCampaign").click();

        let cycles = 0;
        while (cycles < 30) {
          const playerName = side === "disrupt" ? "妨害派" : "史実派";
          const state = await page.evaluate(() => ({
            gameOver: document.querySelector("#status").textContent.includes("勝利！"),
            active: document.querySelector("#activeSide").textContent.trim(),
            turn: document.querySelector("#turnStat").textContent,
            stability: document.querySelector("#stabilityStat").textContent
          }));
          if (state.gameOver) break;

          if (!state.active.includes(playerName)) {
            await page.waitForFunction((expected) =>
              document.querySelector("#status").textContent.includes("勝利！")
              || document.querySelector("#activeSide").textContent.includes(expected),
              playerName,
              { timeout: 3000 }
            );
            cycles++;
            continue;
          }

          await page.evaluate(() => {
            const activeText = document.querySelector("#activeSide").textContent;
            const side = activeText.includes("妨害派") ? "disrupt" : "restore";
            const gold = Number(document.querySelector("#gold").textContent);
            const food = Number(document.querySelector("#food").textContent);
            const troops = Number(document.querySelector("#troops").textContent);
            const enemies = [...document.querySelectorAll("#map button.region.enemy")];
            const actions = [side === "disrupt" ? "mission" : "protect"];
            if (gold >= 3) actions.push("develop");
            if (gold >= 2 && food >= 2) actions.push("recruit");
            if (gold >= 2) actions.push("diplomacy");
            if (troops >= 4 && enemies.length) actions.push("attack");
            const action = actions[Math.floor(Math.random() * actions.length)];
            if (action === "attack" && enemies.length) {
              enemies[Math.floor(Math.random() * enemies.length)].click();
            } else if (action === "develop") {
              const available = [...document.querySelectorAll("#map button.region:not(.enemy)")];
              if (available.length) available[Math.floor(Math.random() * available.length)].click();
            } else {
              const regions = [...document.querySelectorAll("#map button.region")];
              if (regions.length) regions[Math.floor(Math.random() * regions.length)].click();
            }
            document.querySelector("#" + action).click();
            document.querySelector("#endTurn").click();
          });
          await page.waitForFunction((expected) =>
            document.querySelector("#status").textContent.includes("勝利！")
            || document.querySelector("#activeSide").textContent.includes(expected),
            playerName,
            { timeout: 3000 }
          );
          cycles++;
        }

        const result = await page.evaluate(() => ({
          status: document.querySelector("#status").textContent,
          stability: Number.parseInt(document.querySelector("#stabilityStat").textContent, 10),
          turn: document.querySelector("#turnStat").textContent,
          disruptScore: Number(document.querySelector("#disruptScore").textContent),
          restoreScore: Number(document.querySelector("#restoreScore").textContent)
        }));
        const gameOver = result.status.includes("勝利！");
        assert.ok(gameOver, `CPU ${difficulty}, player side ${side}, match ${repetition + 1} should finish within 30 turn cycles; status=${result.status}`);
        assert.ok(Number.isFinite(result.stability) && result.stability >= 0 && result.stability <= 100, "stability should remain within bounds");
        assert.ok(Number.isFinite(result.disruptScore) && Number.isFinite(result.restoreScore), "scores should remain finite");
        const winner = result.status.includes("妨害派の勝利") ? "disrupt" : result.status.includes("史実派の勝利") ? "restore" : null;
        assert.ok(winner, "finished game should announce a winner");
        outcomes[difficulty].games++;
        if (winner === side) outcomes[difficulty].playerWins++;
        else outcomes[difficulty].cpuWins++;
      }
    }
  }

  assert.deepEqual(pageErrors, [], "CPU simulation should not emit uncaught browser errors");
  console.log("CPU simulation smoke results (3 seeded games per difficulty and player side; exploratory, not a statistically robust balance rating):");
  console.log(JSON.stringify(outcomes));
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
