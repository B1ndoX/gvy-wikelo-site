import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./lib/http.mjs";
import { isVersionOlder, versionFromHtml } from "./lib/version.mjs";
import { readSyncedLocalizationManifest, loadNasOfficialLocalization } from "./lib/localization.mjs";
import { assertLocalizationSeries } from "./lib/official-location-source.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataPath = path.join(projectRoot, "src/data/generated/metadata.json");
const sourceUrl = "https://dumpers-repo.com/wikelo/";

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
  ].join("\n") + "\n", "utf8");
}

async function main() {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const currentVersion = String(metadata.gameVersion ?? "");
  if (!/\bLIVE\.\d+$/i.test(currentVersion)) throw new Error(`Stable Wikelo data is not an exact LIVE build: ${currentVersion}`);

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

  const result = {
    source: sourceUrl,
    checkedAt: new Date().toISOString(),
    currentVersion,
    remoteVersion,
    versionChanged: remoteVersion !== currentVersion,
    localizationChanged,
    localizationSha256,
    localizationCommit,
    changed: remoteVersion !== currentVersion || localizationChanged,
  };
  await writeGithubOutput(result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
