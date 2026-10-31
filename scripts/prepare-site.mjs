import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["index.html", "timeline.html", "manifest.json", "icon.svg", "version.json", "sw.js"]) {
  await cp(new URL(file, root), new URL(file, output));
}
const vendor = new URL("vendor/", output);
const controls = new URL("addons/controls/", vendor);
await mkdir(controls, { recursive: true });
await cp(new URL("node_modules/three/build/three.module.js", root), new URL("three.module.js", vendor));
await cp(new URL("node_modules/three/examples/jsm/controls/OrbitControls.js", root), new URL("OrbitControls.js", controls));
await cp(new URL("node_modules/three/LICENSE", root), new URL("THREE-LICENSE.txt", vendor));
console.log("Minimal website bundle prepared in dist/.");
