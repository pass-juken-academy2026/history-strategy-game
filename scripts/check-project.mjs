import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if (scriptMatches.length !== 1) throw new Error(`Expected one inline game script, found ${scriptMatches.length}`);
new vm.Script(scriptMatches[0][1], { filename: "index.html:inline-script" });

for (const id of ["newGame", "resumeGame", "mode", "side", "difficulty", "goal", "map", "recruit", "develop", "diplomacy", "mission", "protect", "endTurn", "updateNotice", "applyUpdate"]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required UI element: ${id}`);
}

for (const path of ["manifest.json", "version.json", "capacitor.config.json"]) {
  const data = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
  if (!data || typeof data !== "object") throw new Error(`Invalid JSON file: ${path}`);
}
console.log("Project checks passed.");
