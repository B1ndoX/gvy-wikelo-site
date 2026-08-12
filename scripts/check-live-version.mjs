import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./lib/http.mjs";
import { isVersionOlder, versionFromHtml } from "./lib/version.mjs";

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

  const result = {
    source: sourceUrl,
    checkedAt: new Date().toISOString(),
    currentVersion,
    remoteVersion,
    changed: remoteVersion !== currentVersion,
  };
  await writeGithubOutput(result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
