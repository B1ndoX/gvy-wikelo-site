import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { downloadBinary, fetchJson, sha256 } from "./http.mjs";
import { resolveEntityLocalization } from "./localization.mjs";
import { localizeLocationText } from "./location-localization.mjs";

const API_ROOT = "https://api.star-citizen.wiki/api";

function slug(value) {
  return String(value ?? "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || sha256(String(value)).slice(0, 12);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanPublicDescription(value) {
  const text = String(value ?? "")
    .replace(/<\/?[A-Z][A-Z0-9_]*>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
  return text && /[\u3400-\u9fff]/.test(text) ? text : null;
}

export function apiLookupCandidates(entry) {
  const english = String(entry?.name?.en || "").trim();
  return unique([entry?.id, slug(english)]);
}

export function baseVehicleLookupCandidates(entry, record) {
  const english = String(record?.name || entry?.name?.en || "").trim();
  const baseName = english
    .replace(/\s+Wikelo\b.*$/i, "")
    .replace(/\s+(?:War|Work|Sneak|Speedy|Savior)\s+Special$/i, "")
    .trim();
  const baseId = String(entry?.id || "").replace(/_collector(?:_[a-z0-9]+)*$/i, "");
  const words = baseName.split(/\s+/);
  return unique([
    baseId && baseId !== entry?.id ? baseId : null,
    baseId && baseId !== entry?.id ? slug(baseId) : null,
    baseName && baseName !== english ? slug(baseName) : null,
    baseName && baseName !== english && words.length > 2 ? slug(words.slice(1).join(" ")) : null,
  ]);
}

export function baseItemLookupCandidates(entry, record) {
  const english = String(record?.name || entry?.name?.en || "").trim();
  const baseName = english
    .replace(/\s+[“\"][^”\"]+[”\"]\s+/g, " ")
    .replace(/\bAscension\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const baseId = String(entry?.id || "")
    .replace(/_iae\d{4}(?:_\d+)*$/i, "")
    .replace(/_collector\d+(?:_\d+)*$/i, "");
  return unique([
    baseId && baseId !== entry?.id ? baseId : null,
    baseId && baseId !== entry?.id ? slug(baseId) : null,
    baseName && baseName !== english ? slug(baseName) : null,
  ]);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function apiRecord(entry, cacheDir) {
  for (const candidate of apiLookupCandidates(entry)) {
    const encoded = encodeURIComponent(candidate);
    for (const resource of ["items", "vehicles"]) {
      try {
        const result = await fetchJson(`${API_ROOT}/${resource}/${encoded}?locale=zh_CN`, {
          cacheDir,
          timeoutMs: 20_000,
          preferCache: true,
          cacheMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
        });
        if (result.data?.data?.uuid) {
          return { ...result.data.data, apiResource: resource, fromCache: result.fromCache, lookupKey: candidate };
        }
      } catch {
        // Try the next public identifier or resource type.
      }
    }
  }
  return null;
}

async function commodityRecord(entry, cacheDir) {
  for (const candidate of apiLookupCandidates(entry)) {
    try {
      const result = await fetchJson(`${API_ROOT}/commodities/${encodeURIComponent(candidate)}?locale=zh_CN`, {
        cacheDir,
        timeoutMs: 20_000,
        preferCache: true,
        cacheMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      });
      if (result.data?.data?.uuid) return result.data.data;
    } catch {
      // Not every trade item is a commodity.
    }
  }
  return null;
}

async function baseVehicleImage(entry, record, cacheDir) {
  if (record?.apiResource !== "vehicles" || sourceImage(record)) return null;
  for (const candidate of baseVehicleLookupCandidates(entry, record)) {
    try {
      const result = await fetchJson(`${API_ROOT}/vehicles/${encodeURIComponent(candidate)}?locale=zh_CN`, {
        cacheDir,
        timeoutMs: 20_000,
        preferCache: true,
        cacheMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      });
      const baseRecord = result.data?.data;
      const image = sourceImage(baseRecord);
      if (baseRecord?.uuid && image) return { ...image, record: baseRecord };
    } catch {
      // A base-model reference is optional and must never block stable data.
    }
  }
  return null;
}

async function baseItemImage(entry, record, cacheDir) {
  if (record?.apiResource !== "items" || sourceImage(record)) return null;
  for (const candidate of baseItemLookupCandidates(entry, record)) {
    try {
      const result = await fetchJson(`${API_ROOT}/items/${encodeURIComponent(candidate)}?locale=zh_CN`, {
        cacheDir,
        timeoutMs: 20_000,
        preferCache: true,
        cacheMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      });
      const baseRecord = result.data?.data;
      const image = sourceImage(baseRecord);
      if (baseRecord?.uuid && image) return { ...image, record: baseRecord };
    } catch {
      // Base-model imagery is optional and remains clearly labelled in the UI.
    }
  }
  return null;
}

function sourceImage(record) {
  const images = Array.isArray(record?.images) ? record.images : [];
  const image = images.find((candidate) => candidate.thumbnail_url || candidate.original_url);
  return image ? { downloadUrl: image.thumbnail_url || image.original_url, sourceUrl: image.original_url || image.thumbnail_url } : null;
}

async function craftingFrom(record, cacheDir, localization) {
  const blueprintLink = Array.isArray(record?.blueprint) ? record.blueprint[0]?.link : null;
  if (!blueprintLink) return null;
  try {
    const result = await fetchJson(`${blueprintLink}?locale=zh_CN`, {
      cacheDir,
      timeoutMs: 20_000,
      preferCache: true,
      cacheMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });
    const blueprint = result.data?.data;
    if (!blueprint?.uuid || !Array.isArray(blueprint.ingredients)) return null;
    return {
      sourceUrl: blueprint.web_url || record.web_url || null,
      gameVersion: blueprint.game_version || record.version || null,
      craftTimeSeconds: Number.isFinite(blueprint.craft_time_seconds) ? blueprint.craft_time_seconds : null,
      ingredients: blueprint.ingredients.map((ingredient) => {
        const id = ingredient.item_uuid || ingredient.resource_type_uuid || ingredient.name;
        const byId = resolveEntityLocalization(localization, id, ingredient.name);
        const localizedName = byId.localizationSource === "english_fallback"
          ? resolveEntityLocalization(localization, ingredient.name, ingredient.name)
          : byId;
        return {
          id,
          name: localizedName,
          quantity: Number(ingredient.quantity_scu ?? ingredient.quantity ?? 0),
          unit: ingredient.quantity_scu !== null && ingredient.quantity_scu !== undefined ? "SCU" : "x",
          sourceUrl: ingredient.web_url || null,
        };
      }),
      unlocks: (blueprint.unlocking_missions || []).map((mission) => ({
        title: mission.title,
        sourceUrl: mission.web_url || null,
      })),
    };
  } catch {
    return null;
  }
}

function acquisitionFrom(record, commodity, rewardTrades, crafting, overrides = []) {
  const methods = [...overrides];
  const purchases = record?.uex_prices?.purchase || [];
  if (purchases.length) {
    const locations = unique(purchases.slice(0, 8).map((shop) => shop.terminal_name || shop.starmap_location?.name));
    const prices = purchases.map((shop) => shop.price_buy).filter(Number.isFinite);
    const first = purchases[0];
    methods.push({
      type: "purchase",
      label: "商店购买",
      location: locations.length ? `可购买地点：${locations.join("、")}` : "游戏内商店终端",
      price: prices.length && new Set(prices).size === 1 ? prices[0] : null,
      currency: "aUEC",
      sourceUrl: first?.uex_link || record?.web_url || null,
      sourceUpdatedAt: first?.date_updated || null,
    });
  }
  if (record?.is_craftable && !methods.some((method) => method.type === "craft")) {
    methods.push({ type: "craft", label: "使用蓝图制作", location: crafting ? "完整配方见下方“制作配方”" : "完整配方暂无", price: null, currency: null, sourceUrl: crafting?.sourceUrl || record.web_url || null, sourceUpdatedAt: record.updated_at || null });
  }
  if (commodity && !methods.some((method) => method.type === "mine" || method.type === "harvest")) {
    const locations = unique((commodity.locations || []).slice(0, 8).map((location) => {
      const parent = location.parent_name ? `${location.parent_name} · ` : "";
      return `${parent}${location.display_name || location.name}`;
    }));
    const harvesting = commodity.kind === "harvestable";
    methods.push({
      type: harvesting ? "harvest" : "mine",
      label: harvesting ? "现场采集" : "采矿获取",
      location: locations.length
        ? `已确认地点：${locations.join("、")}${(commodity.locations || []).length > locations.length ? ` 等 ${(commodity.locations || []).length} 处` : ""}`
        : "可通过采集获得，但当前版本没有已确认的固定矿点",
      price: null,
      currency: null,
      sourceUrl: commodity.web_url || null,
      sourceUpdatedAt: null,
    });
  }
  if (rewardTrades.length && !methods.some((method) => method.type === "wikelo" || method.type === "barter")) {
    methods.push({ type: "wikelo", label: "完成维科洛合同", location: `可从 ${rewardTrades.length} 笔交易获得，具体交易见下方`, price: null, currency: null, sourceUrl: "https://starcitizen.tools/Wikelo", sourceUpdatedAt: null });
  }
  if (record?.is_lootable && !methods.length) {
    methods.push({ type: "loot", label: "随机战利品", location: "可从战利品箱或敌人身上获得，但没有已确认的固定掉落点", price: null, currency: null, sourceUrl: record.web_url || null, sourceUpdatedAt: record.updated_at || null });
  }
  if (!methods.length) methods.push({ type: "unknown", label: "获取方式暂无", location: "具体获取路径暂无", price: null, currency: null, sourceUrl: record?.web_url || null, sourceUpdatedAt: record?.updated_at || null });
  return methods.map((method) => ({
    ...method,
    label: localizeLocationText(method.label),
    location: localizeLocationText(method.location),
  }));
}

export async function buildItemIndex({ trades, localization, cacheDir, projectRoot, wikiImages, wikiItemImages = { items: [] }, acquisitionOverrides = {} }) {
  const byId = new Map();
  for (const trade of trades) {
    for (const [role, items] of [["requirement", trade.requirements], ["reward", trade.rewards]]) {
      for (const item of items) {
        const current = byId.get(item.id) || { id: item.id, name: item.name, category: item.category, requiredBy: [], rewardedBy: [] };
        const relation = { tradeId: trade.id, tradeName: trade.name, quantity: item.quantity, unit: item.unit };
        if (role === "requirement") current.requiredBy.push(relation);
        else current.rewardedBy.push(relation);
        byId.set(item.id, current);
      }
    }
  }

  const wikiImageByTitle = new Map((wikiImages.items || []).map((entry) => [entry.title.toLowerCase(), entry]));
  const wikiItemImageById = new Map((wikiItemImages.items || []).map((entry) => [entry.id, entry]));
  const entries = [...byId.values()];
  const results = [];
  for (let offset = 0; offset < entries.length; offset += 8) {
    const chunk = entries.slice(offset, offset + 8);
    const enriched = await Promise.all(chunk.map(async (entry) => {
      const record = entry.id.startsWith("bp_reward_") ? null : await apiRecord(entry, cacheDir);
      const hasBuiltInRoute = Boolean(record?.uex_prices?.purchase?.length || record?.is_lootable || record?.is_craftable || entry.rewardedBy.length || acquisitionOverrides[entry.id]?.acquisition?.length);
      const commodity = entry.requiredBy.length && !hasBuiltInRoute ? await commodityRecord(entry, cacheDir) : null;
      const apiImage = sourceImage(record);
      const baseImage = apiImage ? null : (await baseVehicleImage(entry, record, cacheDir)) || (await baseItemImage(entry, record, cacheDir));
      const crafting = await craftingFrom(record, cacheDir, localization);
      const rewardTradeImage = entry.rewardedBy.map((relation) => wikiImageByTitle.get(relation.tradeName.en.toLowerCase())).find(Boolean);
      const pinnedItemImage = wikiItemImageById.get(entry.id);
      const selectedImage = pinnedItemImage?.localPath
        ? { localPath: pinnedItemImage.localPath, sourceUrl: pinnedItemImage.pageUrl || pinnedItemImage.imageUrl, kind: pinnedItemImage.imageKind || "exact" }
        : rewardTradeImage?.localPath
        ? { localPath: rewardTradeImage.localPath, sourceUrl: rewardTradeImage.imageUrl }
        : apiImage || (rewardTradeImage ? { downloadUrl: rewardTradeImage.imageUrl, sourceUrl: rewardTradeImage.imageUrl } : null) || baseImage;
      const selectedImageKind = selectedImage?.kind || (baseImage && selectedImage === baseImage ? "base_model" : "exact");
      const itemOverride = acquisitionOverrides[entry.id] || {};
      let imagePath = null;
      let imageSourceUrl = null;
      if (selectedImage?.localPath) {
        imagePath = selectedImage.localPath;
        imageSourceUrl = selectedImage.sourceUrl;
      } else if (selectedImage?.downloadUrl && !/Placeholderv2/i.test(selectedImage.downloadUrl)) {
        const extension = /\.jpe?g(?:$|\?)/i.test(selectedImage.downloadUrl) ? "jpg" : /\.png(?:$|\?)/i.test(selectedImage.downloadUrl) ? "png" : "webp";
        const relative = `/images/items/${slug(entry.id)}.${extension}`;
        const absolute = path.join(projectRoot, "public", relative);
        try {
          if (!(await exists(absolute))) await downloadBinary(selectedImage.downloadUrl, absolute);
          imagePath = relative;
          imageSourceUrl = selectedImage.sourceUrl;
        } catch {
          // Media servers may reject non-browser clients. Keep the item factual and image-free.
        }
      }
      const imageKind = imagePath ? selectedImageKind : "none";
      return {
        id: entry.id,
        name: entry.name,
        category: record?.type_label || record?.type || entry.category,
        descriptionZh: cleanPublicDescription(itemOverride.descriptionZh || record?.description),
        imagePath,
        imageSourceUrl,
        imageKind,
        sourceUrl: record?.web_url || null,
        sourceUpdatedAt: record?.updated_at || null,
        sourceGameVersion: record?.version || null,
        isLootable: Boolean(record?.is_lootable),
        isCraftable: Boolean(record?.is_craftable),
        acquisition: acquisitionFrom(record, commodity, entry.rewardedBy, crafting, itemOverride.acquisition || []),
        crafting,
        requiredBy: entry.requiredBy,
        rewardedBy: entry.rewardedBy,
      };
    }));
    results.push(...enriched);
    if ((offset + chunk.length) % 32 === 0 || offset + chunk.length === entries.length) {
      console.log(`Enriched ${offset + chunk.length}/${entries.length} item records…`);
    }
  }
  return results.sort((a, b) => a.name.en.localeCompare(b.name.en));
}

export async function loadWikiImages(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
