import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");
const cesiumRoot = resolve(webRoot, "node_modules/cesium");
const sourceRoot = resolve(cesiumRoot, "Build/Cesium");
const targetRoot = resolve(webRoot, "public/cesium");
const version = JSON.parse(readFileSync(resolve(cesiumRoot, "package.json"), "utf8")).version;
const files = ["Cesium.js"];
const directories = ["Workers", "ThirdParty", "Assets", "Widgets"];
const marker = resolve(targetRoot, ".version");

if (
  existsSync(marker)
  && readFileSync(marker, "utf8") === version
  && files.every((name) => existsSync(resolve(targetRoot, name)))
  && directories.every((name) => existsSync(resolve(targetRoot, name)))
) {
  process.exit(0);
}

mkdirSync(targetRoot, { recursive: true });
for (const name of files) cpSync(resolve(sourceRoot, name), resolve(targetRoot, name));
for (const name of directories) cpSync(resolve(sourceRoot, name), resolve(targetRoot, name), { recursive: true, force: true });
writeFileSync(marker, version);
