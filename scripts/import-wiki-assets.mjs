import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = process.argv[2];
if (!artifactDir) throw new Error("Usage: node scripts/import-wiki-assets.mjs <browser pageAssets directory>");

const manifest = JSON.parse(await readFile(path.join(artifactDir, "manifest.json"), "utf8"));
const outputDir = path.join(projectRoot, "public/images/wiki");
await mkdir(outputDir, { recursive: true });

const assetList = manifest.assets || [];
const safeSlug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sourceName = (url) => decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1));

const importSnapshot = async (snapshotName, label) => {
  const snapshotPath = path.join(projectRoot, "data/source-snapshots", snapshotName);
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  let imported = 0;

  for (const item of snapshot.items) {
    const originalName = sourceName(item.imageUrl);
    const asset = assetList.find((candidate) => decodeURIComponent(candidate.url).includes(originalName));
    if (!asset) continue;
    const extension = path.extname(asset.path) || ".webp";
    const fileName = `${safeSlug(item.fileName || item.title)}${extension}`;
    await copyFile(asset.path, path.join(outputDir, fileName));
    item.localPath = `/images/wiki/${fileName}`;
    item.bundledFromUrl = asset.url;
    imported += 1;
  }

  if (imported) {
    snapshot.bundledAt = new Date().toISOString();
    snapshot.assetPolicy = "Exported from assets already loaded by normal public source pages; no access control was bypassed.";
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
  console.log(`Imported ${imported} ${label} images.`);
};

await importSnapshot("wiki-contract-images.json", "contract");
await importSnapshot("wiki-item-images.json", "item");

const portrait = assetList.find((asset) => /Wikelo_Hologram/i.test(asset.url));
if (portrait) await copyFile(portrait.path, path.join(projectRoot, "public/images/wikelo.webp"));
