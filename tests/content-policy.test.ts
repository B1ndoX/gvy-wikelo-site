import { describe, expect, it } from "vitest";
import { detectSupplementRegressions, localizationGaps, supplementalAuditIssues } from "../scripts/lib/content-policy.mjs";
import { detectDataAnomalies } from "../scripts/lib/anomalies.mjs";
import { buildContractLocalizationResolver, parseOfficialLocalizationText, resolveEntityLocalization } from "../scripts/lib/localization.mjs";
import { semanticFingerprint } from "../scripts/lib/semantic-fingerprint.mjs";

const english = { zh: null, en: "New LIVE item", localizationSource: "english_fallback" };
const official = { zh: "官方中文", en: "New LIVE item", localizationSource: "official_global_ini" };
const item = (id = "fixture", name: { zh: string | null; en: string; localizationSource: string } = official) => ({
  id, name, imagePath: "/images/fixture.webp", descriptionZh: "原有说明",
  acquisition: [{ type: "shop", sourceUrl: "https://api.star-citizen.wiki/fixture" }],
});

describe("LIVE first, official Chinese when available", () => {
  it("allows honest unknown routes but still rejects unsourced claims, fabricated unknown copy and blank English", () => {
    const unknown = { ...item("new", english), acquisition: [{ type: "unknown", label: "获取方式暂无", location: "具体获取路径暂无", price: null, currency: null, sourceUrl: null }] };
    expect(supplementalAuditIssues([], [unknown], [unknown]).errors).toEqual([]);
    expect(supplementalAuditIssues([], [unknown], [unknown]).warnings.map((gap: { code: string }) => gap.code))
      .toEqual(["item-localization-fallback", "unknown-requirement-acquisition"]);
    const claimed = { ...unknown, acquisition: [{ ...unknown.acquisition[0], type: "shop", location: "Some shop" }] };
    expect(supplementalAuditIssues([], [claimed], [claimed]).errors[0].code).toBe("unsourced-requirement-acquisition");
    const fabricated = { ...unknown, acquisition: [{ ...unknown.acquisition[0], location: "Guaranteed drop" }] };
    expect(supplementalAuditIssues([], [fabricated], [fabricated]).errors[0].code).toBe("misleading-unknown-acquisition");
    expect(supplementalAuditIssues([], [{ ...unknown, name: { ...english, en: " " } }], []).errors[0].code).toBe("missing-english-fallback-name");
  });
  it("reports English tasks/items/ingredients without blocking new LIVE facts", () => {
    const trades = [{ id: "new-trade", name: english, requirements: [], rewards: [] }];
    const items = [{ ...item("new-item", english), imagePath: null, descriptionZh: null,
      acquisition: [{ type: "unknown", sourceUrl: null }], crafting: { ingredients: [{ id: "new-material", name: english }] } }];
    expect(localizationGaps(trades, items).map((gap: { code: string }) => gap.code)).toEqual([
      "trade-localization-fallback", "item-localization-fallback", "crafting-ingredient-localization-fallback",
    ]);
    expect(detectSupplementRegressions({ trades, items })).toEqual([]);
    expect(detectSupplementRegressions({ previousItems: items, trades, items })).toEqual([]);
  });

  it("does not mistake new English records for a localization coverage regression", () => {
    expect(detectDataAnomalies({ previousTrades: { gameVersion: "4.10.1 LIVE.1", trades: [{}] },
      previousMetadata: { localizationCoverage: 1 }, localizationCoverage: 0.1,
      gameVersion: "4.10.2 LIVE.2", trades: Array.from({ length: 50 }, () => ({ rewards: [{}], reputationGain: 1 })) })).toEqual([]);
  });

  it("blocks loss of existing localization, images, acquisition and Chinese descriptions", () => {
    const stable = item();
    const degraded = { ...stable, name: english, imagePath: null, descriptionZh: null, acquisition: [{ type: "unknown", sourceUrl: null }] };
    expect(detectSupplementRegressions({ previousItems: [stable], trades: [], items: [degraded] })).toEqual([
      "Verified localization lost: item:fixture", "Verified image lost: fixture",
      "Sourced acquisition lost: fixture", "Chinese description lost: fixture",
    ]);
  });

  it("blocks localized task, line-item, ingredient and official-code regressions", () => {
    const trade = { id: "t", name: official, requirements: [{ id: "r", name: official }], rewards: [] };
    const stable = { ...item(), crafting: { ingredients: [{ id: "i", name: official }] } };
    const code = item("code", { zh: null, en: "RCMBNT-XTL-1", localizationSource: "official_global_ini" });
    const results = detectSupplementRegressions({ previousTrades: [trade], previousItems: [stable, code],
      trades: [{ ...trade, name: english, requirements: [{ id: "r", name: english }] }],
      items: [{ ...stable, crafting: { ingredients: [{ id: "i", name: english }] } }, { ...code, name: english }] });
    expect(results).toHaveLength(4);
    expect(results.every((reason: string) => reason.startsWith("Verified localization lost:"))).toBe(true);
  });

  it("allows legitimate LIVE removals, price changes and official Chinese corrections", () => {
    expect(detectSupplementRegressions({ previousItems: [item(), item("removed")], trades: [],
      items: [{ ...item(), name: { ...official, zh: "官方校正" }, acquisition: [{ type: "shop", price: 100, sourceUrl: "https://api.star-citizen.wiki/new-shop" }] }] })).toEqual([]);
  });

  it("re-localizes the same LIVE after official input changes and remains semantically idempotent", () => {
    const missing = { entries: new Map() };
    const updated = { entries: parseOfficialLocalizationText([
      "item_Namefixture=官方中文\\nNew LIVE item",
      "TheCollector_Recipes_Title_F55=官方任务名称\\n[兑换 - F55]",
    ].join("\n")) };
    const rawTrade = { debugName: "TheCollector_F55", title: "New LIVE task" };
    const dataset = (localization: typeof updated) => ({ gameVersion: "4.10.2 LIVE.2",
      items: [{ ...item(), name: resolveEntityLocalization(localization, "fixture", english.en) }],
      trades: [{ id: "t", name: buildContractLocalizationResolver(localization)(rawTrade) }], localizationDictionary: {} });
    const before = dataset(missing), after = dataset(updated);
    expect(before.items[0].name.localizationSource).toBe("english_fallback");
    expect(before.trades[0].name.localizationSource).toBe("english_fallback");
    expect(after.items[0].name.zh).toBe("官方中文");
    expect(after.trades[0].name.zh).toBe("官方任务名称");
    expect(semanticFingerprint(before)).not.toBe(semanticFingerprint(after));
    expect(semanticFingerprint(after)).toBe(semanticFingerprint(dataset(updated)));
    expect(detectSupplementRegressions({ previousItems: before.items, previousTrades: before.trades,
      items: after.items, trades: after.trades })).toEqual([]);
  });
  it("allows enhanced -> fully Chinese -> enhanced changes, not missing Chinese", () => {
    const variants = ["增强版中文\\nNew LIVE item", "官方完全中文", "增强版中文\\nNew LIVE item"];
    const datasets = variants.map(value => ({ gameVersion: "4.10.2 LIVE.2", trades: [], localizationDictionary: {},
      items: [{ ...item(), name: resolveEntityLocalization({ entries: parseOfficialLocalizationText(`item_Namefixture,P=${value}`) }, "fixture", english.en) }] }));
    for (let i = 1; i < datasets.length; i++) {
      expect(detectSupplementRegressions({ previousItems: datasets[i - 1].items, trades: [], items: datasets[i].items })).toEqual([]);
      expect(semanticFingerprint(datasets[i - 1])).not.toBe(semanticFingerprint(datasets[i]));
    }
    expect(semanticFingerprint(datasets[0])).toBe(semanticFingerprint(datasets[2]));
    expect(detectSupplementRegressions({ previousItems: datasets[2].items, trades: [], items: [item("fixture", english)] }))
      .toEqual(["Verified localization lost: item:fixture"]);
  });
  it("cannot restore verified Chinese from a historical English-first bilingual input", () => {
    const historical = { entries: parseOfficialLocalizationText("item_Namefixture=New LIVE item\\n旧双语中文") };
    const restored = { ...item(), name: resolveEntityLocalization(historical, "fixture", english.en) };
    expect(restored.name).toEqual(english);
    expect(detectSupplementRegressions({ previousItems: [item()], trades: [], items: [restored] }))
      .toEqual(["Verified localization lost: item:fixture"]);
  });
});
