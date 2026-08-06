import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_KEY_ALIASES,
  OFFICIAL_KEY_ALIASES,
  parseOfficialLocalizationText,
} from "./lib/localization.mjs";
import { sha256 } from "./lib/http.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = "/Users/bindox/Documents/data/localization/chinese_(simplified)/global.ini";
const targetPath = path.join(projectRoot, "data/localization/official-global-derived.json");
const generatedItemsPath = path.join(projectRoot, "src/data/generated/items.json");
const generatedTradesPath = path.join(projectRoot, "src/data/generated/trades.json");

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  const buffer = await readFile(sourcePath);
  const sourceSha256 = sha256(buffer);
  const sourceUpdatedAt = (await stat(sourcePath)).mtime.toISOString();
  const allEntries = parseOfficialLocalizationText(buffer.toString("utf8"));
  const items = JSON.parse(await readFile(generatedItemsPath, "utf8")).items;
  const trades = JSON.parse(await readFile(generatedTradesPath, "utf8")).trades;
  const entityIds = new Set(items.map((item) => normalize(item.id)));
  const englishNames = new Set([
    ...items.map((item) => normalize(item.name.en)),
    ...trades.map((trade) => normalize(trade.name.en)),
  ].filter(Boolean));
  const requiredKeys = new Set([
    ...Object.values(OFFICIAL_KEY_ALIASES),
    ...Object.values(CONTRACT_KEY_ALIASES),
  ].map(normalize));

  const selected = {};
  for (const [lookupKey, entry] of allEntries) {
    const key = normalize(lookupKey);
    const values = String(entry.value ?? "").split("\\n").map(normalize).filter(Boolean);
    const idMatch = [...entityIds].some((id) => key.includes(id));
    const englishMatch = values.some((value) => englishNames.has(value) || [...englishNames].some((name) => value.endsWith(name)));
    if (requiredKeys.has(key) || idMatch || englishMatch) selected[lookupKey] = entry;
  }

  const previous = await readFile(targetPath, "utf8").then(JSON.parse).catch(() => null);
  if (previous?.sourceSha256 === sourceSha256 && JSON.stringify(previous.entries) === JSON.stringify(selected)) {
    console.log(JSON.stringify({ changed: false, sourceSha256, entries: Object.keys(selected).length }, null, 2));
    return;
  }
  const document = {
    schemaVersion: "1.0.0",
    sourcePath,
    sourceSha256,
    sourceUpdatedAt,
    generatedAt: new Date().toISOString(),
    note: "Project-scoped derivative of the read-only official Simplified Chinese global.ini. Used by remote refresh when the local source path is unavailable.",
    entries: selected,
  };
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ changed: true, sourceSha256, entries: Object.keys(selected).length }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
