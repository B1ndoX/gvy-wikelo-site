import { buildContractLocalizationResolver, cleanLocalizedName, resolveEntityLocalization } from "./localization.mjs";

const DUMPERS_URL = "https://dumpers-repo.com/wikelo/";
const WIKI_URL = "https://starcitizen.tools/Wikelo";
const WIKELO_TRADES_URL = "https://wikelotrades.com/how-it-works";

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[“”"'‘’()（）\[\],.:?!，。！？\s_-]+/g, "");
}

function categoryFor(trade) {
  if (trade.title === "Wikelo Arrive to System") return "introduction";
  if (trade.title === "Very Hungry") return "food";
  if (trade.category === "vehicle") return trade.subCategory === "ground" ? "ground_vehicle" : "ship";
  if (trade.category === "gear") {
    if (trade.subCategory === "weapon") return "weapon";
    if (trade.subCategory === "armor") return "armor";
    return "gear";
  }
  if (/favor|polaris bit/i.test(`${trade.title} ${trade.rewards?.map((entry) => entry.name).join(" ")}`)) return "favor";
  return "other";
}

function lineItem(raw, localization, overrides = {}) {
  const hasScu = Number.isFinite(raw.scu);
  const id = raw.entityClass || raw.resourceName || overrides.id || normalizeText(raw.name || overrides.name);
  const english = overrides.name || raw.name || "Blueprint";
  const localized = overrides.localizedName ?? resolveEntityLocalization(localization, id, english);
  return {
    id,
    name: cleanLocalizedName(localized),
    quantity: Number(hasScu ? raw.scu : raw.amount ?? overrides.quantity ?? 1),
    unit: hasScu ? "SCU" : overrides.unit ?? "x",
    category: overrides.category || raw.kind || (hasScu ? "commodity" : "item"),
    isBlueprint: Boolean(overrides.isBlueprint),
    isGameBound: Boolean(overrides.isGameBound || raw.kind === "vehicle"),
  };
}

function blueprintItems(trade, localization) {
  return (trade.blueprintPools || []).map((pool, index) => {
    const relatedReward = (trade.rewards || []).find((reward) => pool.toLowerCase().includes(String(reward.entityClass).toLowerCase()));
    const english = relatedReward ? `${relatedReward.name} Blueprint` : "Blueprint";
    const entityName = relatedReward
      ? resolveEntityLocalization(localization, relatedReward.entityClass, relatedReward.name)
      : resolveEntityLocalization(localization, pool, "Blueprint");
    const localizedName = {
      zh: entityName.zh ? (/蓝图$/.test(entityName.zh) ? entityName.zh : `${entityName.zh} 蓝图`) : "蓝图",
      en: english,
      localizationSource: entityName.zh ? entityName.localizationSource : "english_fallback",
    };
    return lineItem(
      { name: english, amount: 1 },
      localization,
      { id: pool || `${trade.id}-blueprint-${index}`, localizedName, category: "blueprint", isBlueprint: true, isGameBound: true },
    );
  });
}

function secondaryRequirements(trade) {
  return (trade.requiredItems || []).flatMap((required) => {
    const names = Array.isArray(required.items) ? required.items : [required.items];
    return names.map((name) => ({ name, quantity: Number(required.quantity) }));
  });
}

function compareWithSecondary(primary, secondary) {
  if (!secondary) return { status: "single_source", conflicts: [] };
  const conflicts = [];
  const primaryCosts = primary.requirements.map((item) => `${normalizeText(item.name.en)}:${item.quantity}`).sort();
  const secondaryCosts = secondaryRequirements(secondary).map((item) => `${normalizeText(item.name)}:${item.quantity}`).sort();
  if (JSON.stringify(primaryCosts) !== JSON.stringify(secondaryCosts)) {
    conflicts.push({
      field: "requirements",
      values: [primaryCosts, secondaryCosts],
      sources: [DUMPERS_URL, WIKELO_TRADES_URL],
      note: "4.9.0 primary requirements differ from the latest available 4.8.1 secondary snapshot.",
    });
  }

  const secondaryRewardNames = (Array.isArray(secondary.rewardName) ? secondary.rewardName : [secondary.rewardName])
    .map(normalizeText)
    .filter(Boolean);
  const primaryRewardNames = primary.rewards.filter((item) => !item.isBlueprint).map((item) => normalizeText(item.name.en));
  if (secondaryRewardNames.length && !secondaryRewardNames.every((name) => primaryRewardNames.some((primaryName) => primaryName.includes(name) || name.includes(primaryName)))) {
    conflicts.push({
      field: "rewards",
      values: [primaryRewardNames, secondaryRewardNames],
      sources: [DUMPERS_URL, WIKELO_TRADES_URL],
      note: "Reward names differ between the 4.9.0 primary and 4.8.1 secondary snapshots.",
    });
  }
  return { status: conflicts.length ? "conflict" : "verified", conflicts };
}

export function normalizeTrades({ dumperData, secondaryTrades, localization, gameVersion, fetchedAt }) {
  const standings = dumperData.standings || {};
  const resolveContractName = buildContractLocalizationResolver(localization);
  const secondaryByTitle = new Map((secondaryTrades || []).map((trade) => [normalizeText(trade.missionName), trade]));

  return dumperData.trades.map((trade) => {
    const requirements = (trade.costs || []).map((raw) => lineItem(raw, localization));
    const rewards = [
      ...(trade.rewards || []).map((raw) => lineItem(raw, localization, { isGameBound: raw.kind === "vehicle" })),
      ...blueprintItems(trade, localization),
    ];
    const name = resolveContractName(trade, rewards.map((reward) => reward.name));
    const standing = trade.minStanding ? standings[trade.minStanding] : null;
    const secondary = secondaryByTitle.get(normalizeText(trade.title));
    const record = {
      id: trade.id,
      debugName: trade.debugName,
      name: cleanLocalizedName(name),
      category: categoryFor(trade),
      gameVersion,
      status: trade.notForRelease ? "inactive" : "active",
      minReputation: standing?.name || (trade.requiresIntro ? "New Customer" : null),
      reputationGain: Number.isFinite(trade.repReward) ? trade.repReward : null,
      station: { zh: null, en: null, status: "missing" },
      requirements,
      rewards,
      hasBlueprint: rewards.some((reward) => reward.isBlueprint),
      sourceUrls: secondary ? [DUMPERS_URL, WIKELO_TRADES_URL, WIKI_URL] : [DUMPERS_URL, WIKI_URL],
      sourceUpdatedAt: dumperData._extracted || null,
      fetchedAt,
      validationStatus: "pending",
      conflicts: [],
    };
    const validation = compareWithSecondary(record, secondary);
    record.validationStatus = validation.status;
    record.conflicts = validation.conflicts;
    return record;
  });
}

export function summarizeValidation(trades) {
  return trades.reduce(
    (summary, trade) => ({ ...summary, [trade.validationStatus]: (summary[trade.validationStatus] || 0) + 1 }),
    { verified: 0, single_source: 0, conflict: 0, pending: 0 },
  );
}
