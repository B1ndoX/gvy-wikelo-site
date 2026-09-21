import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_KEY_ALIASES,
  OFFICIAL_KEY_ALIASES,
  officialLocalizationKeyCandidates,
  loadNasOfficialLocalization,
} from "./lib/localization.mjs";
import { assertLocalizationSeries, deriveOfficialLocations, LOCATION_KEYS } from "./lib/official-location-source.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(projectRoot, "data/localization/official-global-derived.json");
const generatedItemsPath = path.join(projectRoot, "src/data/generated/items.json");
const generatedTradesPath = path.join(projectRoot, "src/data/generated/trades.json");

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function sameOfficialEntries(left, right) {
  const canonical = entries => JSON.stringify(Object.entries(entries || {}).map(([key, entry]) => [key.toLowerCase(), entry.value]).sort(([a], [b]) => a.localeCompare(b)));
  return canonical(left) === canonical(right);
}

export async function syncOfficialSnapshot(official, gameVersion) {
  const allEntries = official.entries;
  const { sourcePath, sourceSha256, sourceUpdatedAt } = official.metadata;
  const sourceVersion = assertLocalizationSeries(allEntries, gameVersion);
  deriveOfficialLocations(allEntries); // Fail before replacing any verified snapshot.
  const items = JSON.parse(await readFile(generatedItemsPath, "utf8")).items;
  const trades = JSON.parse(await readFile(generatedTradesPath, "utf8")).trades;
  const tradeEntries = trades.flatMap((trade) => [...trade.requirements, ...trade.rewards]);
  const craftingEntries = items.flatMap((item) => item.crafting?.ingredients ?? []);
  const localizedEntities = [...items, ...tradeEntries, ...craftingEntries];
  const entityIds = new Set(localizedEntities.map((item) => normalize(item.id)).filter(Boolean));
  const englishNames = new Set([
    ...localizedEntities.map((item) => normalize(item.name?.en)),
    ...trades.map((trade) => normalize(trade.name.en)),
  ].filter(Boolean));
  const requiredKeys = new Set([
    "Frontend_PU_Version",
    ...Object.values(OFFICIAL_KEY_ALIASES),
    ...Object.values(CONTRACT_KEY_ALIASES),
    ...Object.values(LOCATION_KEYS),
    ...localizedEntities.flatMap((item) => officialLocalizationKeyCandidates(item.id)),
  ].map(normalize));

  const selected = {};
  for (const [lookupKey, entry] of allEntries) {
    const key = normalize(lookupKey);
    const values = String(entry.value ?? "").split("\\n").map(normalize).filter(Boolean);
    const idMatch = [...entityIds].some((id) => key.includes(id));
    const englishMatch = values.some((value) => englishNames.has(value) || [...englishNames].some((name) => value.endsWith(name)));
    const futureEntityName = /^(?:item_name|vehicle_name|items_commodities_)/i.test(key);
    const futureWikeloContract = /^(?:thecollector_|blueprints$)/i.test(key);
    if (requiredKeys.has(key) || idMatch || englishMatch || futureEntityName || futureWikeloContract) {
      selected[lookupKey] = entry;
    }
  }

  const previous = await readFile(targetPath, "utf8").then(JSON.parse).catch(() => null);
  if (sameOfficialEntries(previous?.entries, selected)) {
    console.log(JSON.stringify({ changed: false, sourceSha256, entries: Object.keys(selected).length }, null, 2));
    return;
  }
  const document = {
    schemaVersion: "1.0.0",
    sourcePath,
    sourceSha256,
    sourceUpdatedAt,
    sourceVersion,
    generatedAt: new Date().toISOString(),
    note: "Project-scoped derivative of the read-only official Simplified Chinese global.ini. It keeps all official item/vehicle names and Wikelo contract keys so remote LIVE refreshes can localize newly introduced records without the local source file.",
    entries: selected,
  };
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ changed: true, sourceSha256, entries: Object.keys(selected).length }, null, 2));
}

async function main() {
  const official = await loadNasOfficialLocalization();
  const { gameVersion } = JSON.parse(await readFile(path.join(projectRoot, "src/data/generated/metadata.json"), "utf8"));
  await syncOfficialSnapshot(official, gameVersion);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
