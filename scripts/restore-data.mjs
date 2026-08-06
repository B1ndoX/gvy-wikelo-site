import { copyFile, readFile, readdir, rename } from "node:fs/promises";
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
  for (const name of names) {
    JSON.parse(await readFile(path.join(backups, selected, name), "utf8"));
  }
  for (const name of names) {
    const temporary = path.join(destination, `${name}.restore-next`);
    await copyFile(path.join(backups, selected, name), temporary);
    await rename(temporary, path.join(destination, name));
  }
  console.log(`Restored stable data from ${selected}.`);
}
