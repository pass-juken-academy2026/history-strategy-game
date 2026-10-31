import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

const html = await read("index.html");
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if (scriptMatches.length !== 1) throw new Error(`Expected one inline game script, found ${scriptMatches.length}`);
new vm.Script(scriptMatches[0][1], { filename: "index.html:inline-script" });

for (const id of ["newGame", "resumeGame", "mode", "side", "difficulty", "goal", "map", "recruit", "develop", "diplomacy", "mission", "protect", "attack", "endTurn", "updateNotice", "applyUpdate"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required UI element in index.html: ${id}`);
}

const timeline = await read("timeline.html");
for (const id of ["world3d", "eraTrack", "saveButton", "loadButton", "settingsButton", "advanceButton", "qualitySelect", "campaignSelect", "cpuDifficultySelect", "victorySelect", "applySettings", "networkNotice"]) {
  if (!timeline.includes(`id="${id}"`)) throw new Error(`Missing required UI element in timeline.html: ${id}`);
}
const timelineScripts = [...timeline.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/type=["']importmap["']/.test(match[1]));
if (timelineScripts.length < 1) throw new Error("Expected executable scripts in timeline.html");
for (const [index, match] of timelineScripts.entries()) {
  const source = /type=["']module["']/.test(match[1])
    ? match[2].replace(/^\s*import\s+.*?;\s*$/gm, "")
    : match[2];
  new vm.Script(source, { filename: `timeline.html:inline-${index + 1}` });
}

for (const path of ["manifest.json", "version.json", "capacitor.config.json"]) {
  const data = JSON.parse(await read(path));
  if (!data || typeof data !== "object") throw new Error(`Invalid JSON file: ${path}`);
}
console.log("Project checks passed (main game, 3D timeline, required controls, script syntax, JSON).");
