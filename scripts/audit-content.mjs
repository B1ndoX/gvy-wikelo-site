import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { remainingUnlocalizedLocationTokens } from "./lib/location-localization.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDir = path.join(projectRoot, "src/data/generated");
const reportPath = path.join(projectRoot, "data/audits/content-audit.json");
const CJK_RE = /[\u3400-\u9fff]/;
const INTERNAL_RE = /<\/?(?:EM\d*|TUT\w*)>|\b(?:TheCollector_|carryable_|harvestable_|bp_reward_|fps_consumable_)|(?:static-bundle|source-snapshots|\.cache\/)/i;
const PLAYER_FACING_INTERNAL_RE = /公开(?:数据|资料|来源|商品接口)|结构化来源|来源合同|来自这些合同|内部任务占位|主数据|交叉校验|单一来源|待核验|物品资料版本/;

async function readJson(name) {
  return JSON.parse(await readFile(path.join(generatedDir, name), "utf8"));
}

async function readOptionalJson(name) {
  try {
    return await readJson(name);
  } catch {
    return null;
  }
}

function hasUnbalancedBrackets(value) {
  const text = String(value ?? "");
  return (text.match(/[（(]/g)?.length ?? 0) !== (text.match(/[）)]/g)?.length ?? 0);
}

function publicStrings(trade) {
  return [
    trade.name.zh,
    trade.name.en,
    trade.station.zh,
    trade.station.en,
    ...trade.requirements.flatMap((item) => [item.name.zh, item.name.en]),
    ...trade.rewards.flatMap((item) => [item.name.zh, item.name.en]),
  ].filter(Boolean);
}

async function main() {
  const [currentTrades, currentItems, metadata, versionedData] = await Promise.all([
    readJson("trades.json"),
    readJson("items.json"),
    readJson("metadata.json"),
    readOptionalJson("versioned-data.json"),
  ]);
  const datasets = versionedData?.datasets?.length ? versionedData.datasets : [{
    gameVersion: currentTrades.gameVersion,
    trades: currentTrades.trades,
    items: currentItems.items,
  }];
  const trades = datasets.flatMap((dataset) => dataset.trades);
  const items = datasets.flatMap((dataset) => dataset.items);
  const requirementIds = new Set(trades.flatMap((trade) => trade.requirements.map((item) => item.id)));
  const requirements = items.filter((item) => requirementIds.has(item.id));
  const errors = [];
  const warnings = [];

  const fallbackTrades = trades.filter((trade) => trade.name.localizationSource === "english_fallback");
  const fallbackItems = items.filter((item) => item.name.localizationSource === "english_fallback");
  const fallbackIngredients = items.flatMap((item) => (item.crafting?.ingredients ?? [])
    .filter((ingredient) => ingredient.name.localizationSource === "english_fallback")
    .map((ingredient) => `${item.id}:${ingredient.id || ingredient.name.en}`));
  if (fallbackTrades.length) errors.push({ code: "trade-localization-fallback", ids: fallbackTrades.map((trade) => trade.id) });
  if (fallbackItems.length) errors.push({ code: "item-localization-fallback", ids: fallbackItems.map((item) => item.id) });
  if (fallbackIngredients.length) errors.push({ code: "crafting-ingredient-localization-fallback", ids: fallbackIngredients });

  const malformedNames = items.filter((item) => hasUnbalancedBrackets(item.name.zh) || hasUnbalancedBrackets(item.name.en));
  if (malformedNames.length) errors.push({ code: "malformed-item-name", ids: malformedNames.map((item) => item.id) });
  const malformedTrades = trades.filter((trade) => hasUnbalancedBrackets(trade.name.zh) || hasUnbalancedBrackets(trade.name.en));
  if (malformedTrades.length) errors.push({ code: "malformed-trade-name", ids: malformedTrades.map((trade) => trade.id) });

  const englishDescriptions = items.filter((item) => item.descriptionZh && !CJK_RE.test(item.descriptionZh));
  if (englishDescriptions.length) errors.push({ code: "english-only-description", ids: englishDescriptions.map((item) => item.id) });

  const internalTradeText = trades.filter((trade) => publicStrings(trade).some((value) => INTERNAL_RE.test(value)));
  if (internalTradeText.length) errors.push({ code: "internal-trade-text", ids: internalTradeText.map((trade) => trade.id) });
  const internalItemText = items.filter((item) => [item.name.zh, item.name.en, item.descriptionZh, ...item.acquisition.flatMap((method) => [method.label, method.location])].filter(Boolean).some((value) => INTERNAL_RE.test(value)));
  if (internalItemText.length) errors.push({ code: "internal-item-text", ids: internalItemText.map((item) => item.id) });
  const internalAcquisitionCopy = items.filter((item) => item.acquisition
    .flatMap((method) => [method.label, method.location])
    .filter(Boolean)
    .some((value) => PLAYER_FACING_INTERNAL_RE.test(value)));
  if (internalAcquisitionCopy.length) errors.push({ code: "internal-acquisition-copy", ids: internalAcquisitionCopy.map((item) => item.id) });

  const unknownRoutes = requirements.filter((item) => item.acquisition.length === 0 || item.acquisition.some((method) => method.type === "unknown"));
  if (unknownRoutes.length) errors.push({ code: "unknown-requirement-acquisition", ids: unknownRoutes.map((item) => item.id) });
  const unsourcedRoutes = requirements.filter((item) => item.acquisition.some((method) => !method.sourceUrl));
  if (unsourcedRoutes.length) errors.push({ code: "unsourced-requirement-acquisition", ids: unsourcedRoutes.map((item) => item.id) });

  const untranslatedLocations = items.flatMap((item) => item.acquisition.flatMap((method) => {
    const tokens = remainingUnlocalizedLocationTokens(`${method.label ?? ""} ${method.location ?? ""}`);
    return tokens.length ? [{ id: item.id, tokens }] : [];
  }));
  if (untranslatedLocations.length) errors.push({ code: "untranslated-public-location", entries: untranslatedLocations });

  const missingRequirementImages = requirements.filter((item) => !item.imagePath);
  warnings.push({
    code: "missing-requirement-images",
    count: missingRequirementImages.length,
    ids: missingRequirementImages.map((item) => item.id),
    note: "Image gaps are reported, not filled with an invented or mismatched image.",
  });
  const brokenImages = [];
  for (const item of items.filter((candidate) => candidate.imagePath)) {
    try {
      await access(path.join(projectRoot, "public", item.imagePath));
    } catch {
      brokenImages.push(item.id);
    }
  }
  if (brokenImages.length) errors.push({ code: "missing-local-image-file", ids: brokenImages });

  const report = {
    schemaVersion: "1.0.0",
    generatedAt: metadata.generatedAt,
    gameVersion: metadata.gameVersion,
    totals: {
      trades: trades.length,
      items: items.length,
      requirementItems: requirements.length,
      localizedItems: items.filter((item) => item.name.localizationSource !== "english_fallback").length,
      localizedTrades: trades.filter((trade) => trade.name.localizationSource !== "english_fallback").length,
      localizedCraftingIngredients: items.flatMap((item) => item.crafting?.ingredients ?? [])
        .filter((ingredient) => ingredient.name.localizationSource !== "english_fallback").length,
      requirementItemsWithImages: requirements.length - missingRequirementImages.length,
      requirementItemsWithAcquisition: requirements.length - unknownRoutes.length,
    },
    errors,
    warnings,
    passed: errors.length === 0,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  const temporary = `${reportPath}.next`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporary, reportPath);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
