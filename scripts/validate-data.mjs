import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(await readFile(path.join(root, "data/schema/trades.schema.json"), "utf8"));
const data = JSON.parse(await readFile(path.join(root, "src/data/generated/trades.json"), "utf8"));
const versionedData = JSON.parse(await readFile(path.join(root, "src/data/generated/versioned-data.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("date-time", { type: "string", validate: (value) => !Number.isNaN(Date.parse(value)) });
ajv.addFormat("uri", { type: "string", validate: (value) => { try { new URL(value); return true; } catch { return false; } } });
const validate = ajv.compile(schema);
const documents = [data, ...versionedData.datasets.map((dataset) => ({
  schemaVersion: "1.0.0",
  gameVersion: dataset.gameVersion,
  generatedAt: dataset.generatedAt,
  sourceStatus: dataset.sourceStatus,
  trades: dataset.trades,
}))];
for (const document of documents) {
  if (!validate(document)) {
    console.error(document.gameVersion, validate.errors);
    process.exitCode = 1;
  }
}
if (!process.exitCode) {
  console.log(`Validated ${versionedData.datasets.length} version dataset(s): ${versionedData.datasets.map((dataset) => `${dataset.gameVersion} (${dataset.trades.length} trades)`).join(", ")}.`);
}
