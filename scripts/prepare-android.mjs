import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../www/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["index.html", "manifest.json", "icon.svg", "version.json", "sw.js"]) {
  await cp(new URL(file, root), new URL(file, output));
}
console.log("Android web assets prepared in www/.");
