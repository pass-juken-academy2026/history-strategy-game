import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["index.html", "timeline.html", "manifest.json", "icon.svg", "version.json", "sw.js"]) {
  await cp(new URL(file, root), new URL(file, output));
}
console.log("Minimal website bundle prepared in dist/.");
