import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./lib/http.mjs";
import { isVersionOlder, versionFromHtml } from "./lib/version.mjs";
import { readSyncedLocalizationManifest, loadNasOfficialLocalization } from "./lib/localization.mjs";
import { assertLocalizationSeries } from "./lib/official-location-source.mjs";
import { primaryBundleUrl, primaryPublication, primaryReviewKey, primaryTradeFingerprint, reviewPrimaryTrades } from "./lib/primary-review.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataPath = path.join(projectRoot, "src/data/generated/metadata.json");
const sourceUrl = "https://dumpers-repo.com/wikelo/";
const reviewDir = path.join(projectRoot, ".cache/primary-source");
const manifestPath = path.join(reviewDir, "manifest.json");
const reviewedPath = path.join(reviewDir, "reviewed.json");

async function writeJson(file, value) {
  await mkdir(reviewDir, { recursive: true });
  await writeFile(`${file}.next`, `${JSON.stringify(value)}\n`, "utf8");
  await rename(`${file}.next`, file);
}

async function writeGithubOutput(result) {
  if (!process.argv.includes("--github-output")) return;
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required with --github-output");
  await appendFile(outputPath, [
    `changed=${result.changed}`,
    `current_version=${result.currentVersion}`,
    `remote_version=${result.remoteVersion}`,
    `localization_commit=${result.localizationCommit || ""}`,
    `localization_sha256=${result.localizationSha256}`,
    `primary_review_key=${result.primaryReviewKey}`,
    `primary_cacheable=${result.primaryPublication.cacheable}`,
    `primary_changed=${Boolean(result.primaryTradesChanged)}`,
  ].join("\n") + "\n", "utf8");
}

async function inspectManifest(currentVersion, stableTrades) {
  const page = await fetchText(sourceUrl, {
    timeoutMs: 25_000,
    retries: 3,
    allowStaleCache: false,
  });
  const remoteVersion = versionFromHtml(page.text);
  if (isVersionOlder(remoteVersion, currentVersion)) {
    throw new Error(`Dumper's Repo LIVE version regressed from ${currentVersion} to ${remoteVersion}`);
  }
  const currentLocalization = JSON.parse(await readFile(path.join(projectRoot, "src/data/generated/localization.json"), "utf8"));
  let localizationSha256, localizationCommit = null;
  if (process.env.GITHUB_ACTIONS === "true") {
    const { commit, manifest } = await readSyncedLocalizationManifest();
    assertLocalizationSeries(new Map([["frontend_pu_version", { value: manifest.versionLabel }]]), remoteVersion);
    localizationSha256 = manifest.sha256;
    localizationCommit = commit;
  } else {
    const official = await loadNasOfficialLocalization();
    assertLocalizationSeries(official.entries, remoteVersion);
    localizationSha256 = official.metadata.sourceSha256;
  }
  const localizationChanged = localizationSha256 !== currentLocalization.sourceSha256;

  const bundleUrl = primaryBundleUrl(page.text);
  const result = {
    source: sourceUrl,
    checkedAt: new Date().toISOString(),
    currentVersion,
    remoteVersion,
    versionChanged: remoteVersion !== currentVersion,
    localizationChanged,
    localizationSha256,
    localizationCommit,
    primaryBundleUrl: bundleUrl,
    primaryPublication: await primaryPublication(bundleUrl),
    primaryAppliedFingerprint: primaryTradeFingerprint(stableTrades),
    changed: remoteVersion !== currentVersion || localizationChanged,
  };
  result.primaryReviewKey = primaryReviewKey(result);
  return result;
}

async function main() {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const currentVersion = String(metadata.gameVersion ?? "");
  if (!/\bLIVE\.\d+$/i.test(currentVersion)) throw new Error(`Stable Wikelo data is not an exact LIVE build: ${currentVersion}`);
  const stable = JSON.parse(await readFile(path.join(projectRoot, "src/data/generated/trades.json"), "utf8"));
  if (stable.gameVersion !== currentVersion) throw new Error("Stable primary trade version is not synchronized with metadata");
  const reviewOnly = process.argv.includes("--review-primary");
  const manifestOnly = process.argv.includes("--manifest-only");
  if (reviewOnly && manifestOnly) throw new Error("Select only one primary check phase");
  let result;
  if (reviewOnly) {
    result = JSON.parse(await readFile(manifestPath, "utf8"));
    const age = Date.now() - Date.parse(result.checkedAt);
    if (result.currentVersion !== currentVersion || result.remoteVersion !== currentVersion || !Number.isFinite(age) || age < 0 || age > 35 * 60_000) throw new Error("Primary manifest is stale or belongs to a different LIVE; run a new manifest check");
  } else {
    result = await inspectManifest(currentVersion, stable.trades);
    await writeJson(manifestPath, result);
  }
  if (!manifestOnly && !result.versionChanged) {
    let cachedReview = null;
    try { cachedReview = JSON.parse(await readFile(reviewedPath, "utf8")); } catch { /* Missing/corrupt cache requires a fresh review, never a skip. */ }
    const { review, ...primary } = await reviewPrimaryTrades(result, stable.trades, cachedReview);
    result = { ...result, ...primary, changed: result.changed || primary.primaryTradesChanged };
    if (review) await writeJson(reviewedPath, review);
  }
  await writeGithubOutput(result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
