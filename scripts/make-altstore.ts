/**
 * Writes the AltStore source. Usage: npx tsx scripts/make-altstore.ts <out.json> [run.json <app.ipa>]
 * `run.json` is `gh run view --json number,createdAt`; without it the source lists no versions.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { altStoreSource, privacyFromAppJson, type IosBuild } from "../src/core/altstore";

const SITE = "https://n3rdl0rd.github.io/slackboard";
const [out, runFile, ipa] = process.argv.slice(2);
if (!out) throw new Error("usage: make-altstore.ts <out.json> [run.json app.ipa]");

const expo = JSON.parse(readFileSync("app.json", "utf8")).expo;
let build: IosBuild | null = null;
if (runFile && ipa) {
  const run = JSON.parse(readFileSync(runFile, "utf8")) as { number: number; createdAt: string };
  build = { number: run.number, date: run.createdAt, size: statSync(ipa).size };
}
const source = altStoreSource({ version: expo.version, bundleId: expo.ios.bundleIdentifier, site: SITE, privacy: privacyFromAppJson(expo), build });
writeFileSync(out, JSON.stringify(source, null, 2) + "\n");
console.log(`wrote ${out}${build ? ` for build ${build.number}` : " with no versions"}`);
