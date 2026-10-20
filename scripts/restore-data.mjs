import { access, copyFile, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backups = path.join(root, "data/backups");
const destination = path.join(root, "src/data/generated");
const requested = process.argv[2];
const available = (await readdir(backups, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
if (!requested) {
  console.log(`Available stable-data backups:\n${available.join("\n") || "无"}\n\nRestore with: npm run restore:data -- <backup-directory>`);
  process.exit(0);
}

const selected = requested;
if (!available.includes(selected)) {
  console.error(`Backup not found. Available backups:\n${available.join("\n") || "无"}`);
  process.exitCode = 1;
} else {
  const names = ["trades.json", "items.json", "metadata.json", "localization.json"];
  try {
    await access(path.join(backups, selected, "versioned-data.json"));
    names.push("versioned-data.json");
  } catch {
    // Older backups predate separate LIVE/PTU snapshots and remain restorable.
  }
  const targets = names.map(name => [name, path.join(destination, name)]);
  try {
    await access(path.join(backups, selected, "automatic-item-images.json"));
    targets.push(["automatic-item-images.json", path.join(root, "data/source-snapshots/automatic-item-images.json")]);
  } catch {
    // Legacy data backups predate automatic image provenance.
  }
  for (const [name] of targets) JSON.parse(await readFile(path.join(backups, selected, name), "utf8"));
  for (const [name, target] of targets) {
    const temporary = `${target}.restore-next`;
    await copyFile(path.join(backups, selected, name), temporary);
    await rename(temporary, target);
  }
  console.log(`Restored stable data from ${selected}.`);
}
