import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(await readFile(path.join(root, "data/schema/trades.schema.json"), "utf8"));
const data = JSON.parse(await readFile(path.join(root, "src/data/generated/trades.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("date-time", { type: "string", validate: (value) => !Number.isNaN(Date.parse(value)) });
ajv.addFormat("uri", { type: "string", validate: (value) => { try { new URL(value); return true; } catch { return false; } } });
const validate = ajv.compile(schema);
if (!validate(data)) {
  console.error(validate.errors);
  process.exitCode = 1;
} else {
  console.log(`Validated ${data.trades.length} Wikelo trades for ${data.gameVersion}.`);
}
