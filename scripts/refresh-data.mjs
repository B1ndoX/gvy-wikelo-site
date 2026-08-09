import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { blockingRefreshReasons, detectDataAnomalies } from "./lib/anomalies.mjs";
import { buildItemIndex, loadWikiImages } from "./lib/enrich.mjs";
import { downloadBinary, fetchJson, fetchText, sha256 } from "./lib/http.mjs";
import { loadOfficialLocalization } from "./lib/localization.mjs";
import { normalizeTrades, summarizeValidation } from "./lib/normalize.mjs";
import { parseAssignedLiteral, parseAssignedLiteralBySourceLabel } from "./lib/parse-static.mjs";
import { anomalyBaselineForVersion, mergeVersionDatasets } from "./lib/version-datasets.mjs";
import { semanticPatch, versionFromHtml } from "./lib/version.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(projectRoot, "src/data/generated");
const cacheDir = path.join(projectRoot, ".cache/http");
const backupRoot = path.join(projectRoot, "data/backups");
const localizationSource = process.env.GVY_WIKELO_LOCALIZATION_SOURCE
  || "/Users/bindox/Documents/data/localization/chinese_(simplified)/global.ini";
const derivedLocalizationSource = path.join(projectRoot, "data/localization/official-global-derived.json");
const publishCheck = process.argv.includes("--publish-check");
const fetchedAt = new Date().toISOString();

const sources = {
  dumper: "https://dumpers-repo.com/wikelo/",
  wiki: "https://starcitizen.tools/Wikelo",
  emporium: "https://starcitizen.tools/Wikelo_Emporium",
  wikeloTrades: "https://wikelotrades.com/how-it-works",
  api: "https://api.star-citizen.wiki",
  scMarketApi: "https://api.sc-market.space/api/v2",
};

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomically(filePath, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if ((await readFile(filePath, "utf8")) === serialized) return false;
  } catch {
    // New file.
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.next`;
  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, filePath);
  return true;
}

function localizationCoverage(trades) {
  const names = trades.flatMap((trade) => [trade.name, ...trade.requirements.map((item) => item.name), ...trade.rewards.map((item) => item.name)]);
  const localized = names.filter((name) => name.zh && name.localizationSource !== "english_fallback").length;
  return names.length ? localized / names.length : 0;
}

async function backupStableData() {
  const currentFiles = ["trades.json", "items.json", "metadata.json", "localization.json", "versioned-data.json"];
  const existing = [];
  for (const name of currentFiles) {
    try {
      await stat(path.join(generatedDir, name));
      existing.push(name);
    } catch {
      // Initial refresh has nothing to back up.
    }
  }
  if (!existing.length) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(backupRoot, stamp);
  await mkdir(destination, { recursive: true });
  await Promise.all(existing.map((name) => copyFile(path.join(generatedDir, name), path.join(destination, name))));
  return destination;
}

async function pruneBackups() {
  await mkdir(backupRoot, { recursive: true });
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const entry of await readdir(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(backupRoot, entry.name);
    const info = await stat(directory);
    if (info.mtimeMs >= cutoff) continue;
    for (const name of await readdir(directory)) await unlink(path.join(directory, name));
    await import("node:fs/promises").then(({ rmdir }) => rmdir(directory));
  }
}

async function main() {
  await mkdir(generatedDir, { recursive: true });
  const previousTrades = await readJson(path.join(generatedDir, "trades.json"));
  const previousItems = await readJson(path.join(generatedDir, "items.json"));
  const previousMetadata = await readJson(path.join(generatedDir, "metadata.json"));
  const previousLocalization = await readJson(path.join(generatedDir, "localization.json"));
  const previousVersionedData = await readJson(path.join(generatedDir, "versioned-data.json"));

  const dumperPage = await fetchText(sources.dumper, { cacheDir, timeoutMs: 35_000 });
  const bundlePath = dumperPage.text.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!bundlePath) throw new Error("Dumper's Repo public bundle path was not found");
  const dumperBundle = await fetchText(new URL(bundlePath, sources.dumper).href, { cacheDir, timeoutMs: 120_000 });
  const dumperData = parseAssignedLiteralBySourceLabel(
    dumperBundle.text,
    "Star Citizen Game Files (TheCollector contract generator)",
    "trades",
  );
  if (!Array.isArray(dumperData.trades) || !dumperData.trades.length) throw new Error("Dumper trade dataset was empty");
  const gameVersion = versionFromHtml(dumperPage.text);

  const manifest = await fetchText("https://wikelotrades.com/scripts/trades/manifest.js", { cacheDir });
  const patches = parseAssignedLiteral(manifest.text, "window.tradePatches =").filter((entry) => entry.enabled !== false);
  patches.sort((a, b) => semanticPatch(b.patch).join("").localeCompare(semanticPatch(a.patch).join("")));
  const secondaryPatch = patches[0];
  if (!secondaryPatch) throw new Error("Wikelo Trades patch manifest was empty");
  const secondarySource = await fetchText(new URL(secondaryPatch.src, "https://wikelotrades.com/").href, { cacheDir });
  const secondaryTrades = parseAssignedLiteral(secondarySource.text, "window.trades =");

  const official = await loadOfficialLocalization(localizationSource, derivedLocalizationSource);
  const trades = normalizeTrades({ dumperData, secondaryTrades, localization: official, gameVersion, fetchedAt });
  const wikiImages = await loadWikiImages(path.join(projectRoot, "data/source-snapshots/wiki-contract-images.json"));
  const wikiItemImages = await loadWikiImages(path.join(projectRoot, "data/source-snapshots/wiki-item-images.json"));
  const apiItemImages = await loadWikiImages(path.join(projectRoot, "data/source-snapshots/api-item-images.json"));
  wikiItemImages.items = [...wikiItemImages.items, ...apiItemImages.items];
  const acquisitionOverrides = await readJson(path.join(projectRoot, "data/source-snapshots/item-acquisition-overrides.json"), { items: {} });
  const acquisitionAudit = await readJson(path.join(projectRoot, "data/source-snapshots/item-acquisition-audit.json"), { items: {} });
  acquisitionOverrides.items = { ...acquisitionOverrides.items, ...acquisitionAudit.items };

  let apiStatus = "ok";
  let apiVersion = null;
  try {
    const health = await fetchJson(`${sources.api}/api/game-versions/default`, { cacheDir });
    apiVersion = health.data?.data?.name || health.data?.data?.version || null;
  } catch {
    apiStatus = "partial";
  }

  let scMarketStatus = "ok";
  let scMarketVersion = null;
  let scMarketUpdatedAt = null;
  try {
    const active = await fetchJson(`${sources.scMarketApi}/game-data/versions/active`, { cacheDir });
    scMarketVersion = active.data?.LIVE?.version_number || null;
    scMarketUpdatedAt = active.data?.LIVE?.last_data_update || null;
    if (!scMarketVersion?.startsWith(gameVersion.match(/^\d+\.\d+\.\d+/)?.[0] || "")) scMarketStatus = "snapshot";
  } catch {
    scMarketStatus = "partial";
  }

  let wikiStatus = "snapshot";
  let wikiNote = "Human-readable Wiki page is pinned to the inspected 2026-07-14 snapshot; item facts use the public Wiki API.";
  try {
    const page = await fetchText(sources.wiki, { cacheDir, timeoutMs: 20_000, allowStaleCache: false, retries: 1 });
    if (/Wikelo is a Banu trader/i.test(page.text)) {
      wikiStatus = "ok";
      wikiNote = null;
    }
  } catch {
    // Cloudflare may require a normal browser. Never bypass it; retain the inspected snapshot.
  }

  const items = await buildItemIndex({ trades, localization: official, cacheDir, projectRoot, wikiImages, wikiItemImages, acquisitionOverrides: acquisitionOverrides.items });
  const portraitPath = path.join(projectRoot, "public/images/wikelo.webp");
  try {
    await stat(portraitPath);
  } catch {
    try {
      await downloadBinary("https://media.starcitizen.tools/8/83/Wikelo_Hologram_-_Alpha_4.1.0.jpg", portraitPath);
    } catch {
      // The documented manual page-assets import is the compliant fallback.
    }
  }

  const sourceStatus = [
    { url: sources.dumper, status: dumperPage.fromCache || dumperBundle.fromCache ? "partial" : "ok", updatedAt: dumperData._extracted || null, checkedAt: fetchedAt, note: dumperPage.fromCache ? "Used cached page data." : null },
    { url: sources.wikeloTrades, status: secondarySource.fromCache ? "partial" : "ok", updatedAt: secondarySource.text.match(/Generated on:\s*([^\r\n]+)/)?.[1] || null, checkedAt: fetchedAt, note: `Latest published secondary patch: ${secondaryPatch.patch}` },
    { url: sources.wiki, status: wikiStatus, updatedAt: "2026-07-14T14:39:00.000Z", checkedAt: fetchedAt, note: wikiNote },
    { url: sources.emporium, status: "snapshot", updatedAt: "2025-08-09T16:35:00.000Z", checkedAt: fetchedAt, note: "Station list cross-check snapshot." },
    { url: sources.api, status: apiStatus, updatedAt: null, checkedAt: fetchedAt, note: apiVersion ? `Default API version: ${apiVersion}` : "Item API version unavailable." },
    { url: sources.scMarketApi, status: scMarketStatus, updatedAt: scMarketUpdatedAt, checkedAt: fetchedAt, note: scMarketVersion ? `Public secondary game-data API: ${scMarketVersion}. Player listing prices are not imported into fixed Wikelo recipes.` : "Public secondary game-data API unavailable." },
  ];

  const tradeDocument = { schemaVersion: "1.0.0", gameVersion, generatedAt: fetchedAt, sourceStatus, trades };
  const schema = await readJson(path.join(projectRoot, "data/schema/trades.schema.json"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("date-time", { type: "string", validate: (value) => !Number.isNaN(Date.parse(value)) });
  ajv.addFormat("uri", { type: "string", validate: (value) => { try { new URL(value); return true; } catch { return false; } } });
  const validate = ajv.compile(schema);
  if (!validate(tradeDocument)) throw new Error(`Schema validation failed: ${JSON.stringify(validate.errors)}`);

  const coverage = localizationCoverage(trades);
  const anomalyBaseline = anomalyBaselineForVersion(previousVersionedData?.datasets ?? [], previousTrades, gameVersion);
  const anomalies = detectDataAnomalies({ previousTrades: anomalyBaseline, previousMetadata, trades, gameVersion, localizationCoverage: coverage });
  const refreshBlockers = blockingRefreshReasons(anomalies, sourceStatus);
  if (refreshBlockers.length) throw new Error(`Stable-data replacement blocked: ${refreshBlockers.join("; ")}`);
  const partialSources = sourceStatus.filter((source) => source.status === "partial" || source.status === "failed");
  const publishEligible = anomalies.length === 0 && partialSources.length === 0;
  if (publishCheck && !publishEligible) throw new Error(`Publish check blocked: ${[...anomalies, ...partialSources.map((source) => `${source.url}: ${source.status}`)].join("; ")}`);

  const fallbackDatasets = previousTrades?.trades?.length && previousItems?.items?.length ? [{
    gameVersion: previousTrades.gameVersion,
    generatedAt: previousTrades.generatedAt,
    sourceStatus: previousTrades.sourceStatus ?? [],
    trades: previousTrades.trades,
    items: previousItems.items,
  }] : [];
  const versionDatasets = mergeVersionDatasets(previousVersionedData?.datasets ?? fallbackDatasets, {
    gameVersion,
    generatedAt: fetchedAt,
    sourceStatus,
    trades,
    items,
  });
  for (const dataset of versionDatasets) {
    const snapshotDocument = {
      schemaVersion: "1.0.0",
      gameVersion: dataset.gameVersion,
      generatedAt: dataset.generatedAt,
      sourceStatus: dataset.sourceStatus,
      trades: dataset.trades,
    };
    if (!validate(snapshotDocument)) throw new Error(`Version snapshot validation failed for ${dataset.gameVersion}: ${JSON.stringify(validate.errors)}`);
  }
  const versionedData = {
    schemaVersion: "1.0.0",
    generatedAt: fetchedAt,
    datasets: versionDatasets,
  };

  const localizationDictionary = Object.fromEntries(items.map((item) => [item.id, item.name]));
  const candidateLocalization = { ...official.metadata, generatedAt: fetchedAt, entries: localizationDictionary };
  if (previousLocalization?.sourceSha256 === official.metadata.sourceSha256 && JSON.stringify(previousLocalization.entries) === JSON.stringify(candidateLocalization.entries)) {
    candidateLocalization.generatedAt = previousLocalization.generatedAt;
  }
  const sourceFingerprint = sha256(JSON.stringify({
    gameVersion,
    trades: trades.map(({ fetchedAt: _fetchedAt, ...trade }) => trade),
    items,
    versionDatasets: versionDatasets.map((dataset) => ({
      gameVersion: dataset.gameVersion,
      trades: dataset.trades.map(({ fetchedAt: _fetchedAt, ...trade }) => trade),
      items: dataset.items,
    })),
    localizationDictionary,
    officialLocalizationHash: official.metadata.sourceSha256,
    sourceVersions: sourceStatus.map(({ url, updatedAt }) => ({ url, updatedAt })),
  }));
  const metadata = {
    gameVersion,
    availableVersions: versionDatasets.map((dataset) => dataset.gameVersion),
    generatedAt: fetchedAt,
    totalTrades: trades.length,
    totalItems: items.length,
    imageCoverage: items.length ? items.filter((item) => item.imagePath).length / items.length : 0,
    localizationCoverage: coverage,
    validation: summarizeValidation(trades),
    sources: sourceStatus,
    anomalies,
    publishEligible,
    usageMode: "offline query; no account or upload",
    sourceFingerprint,
  };

  if (previousMetadata?.sourceFingerprint === sourceFingerprint) {
    await pruneBackups();
    console.log(JSON.stringify({ changed: [], unchanged: true, ...previousMetadata }, null, 2));
    return;
  }

  await backupStableData();
  const changed = [];
  if (await writeJsonAtomically(path.join(generatedDir, "trades.json"), tradeDocument)) changed.push("trades.json");
  if (await writeJsonAtomically(path.join(generatedDir, "items.json"), { schemaVersion: "1.0.0", generatedAt: fetchedAt, items })) changed.push("items.json");
  if (await writeJsonAtomically(path.join(generatedDir, "versioned-data.json"), versionedData)) changed.push("versioned-data.json");
  if (await writeJsonAtomically(path.join(generatedDir, "localization.json"), candidateLocalization)) changed.push("localization.json");
  if (await writeJsonAtomically(path.join(generatedDir, "metadata.json"), metadata)) changed.push("metadata.json");
  await pruneBackups();
  console.log(JSON.stringify({ changed, ...metadata }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
