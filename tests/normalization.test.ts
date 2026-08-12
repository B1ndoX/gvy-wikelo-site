import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import dumperData from "./fixtures/dumper.json";
import secondaryTrades from "./fixtures/secondary.json";
import { parseOfficialLocalizationText } from "../scripts/lib/localization.mjs";
import { normalizeTrades } from "../scripts/lib/normalize.mjs";
import { parseAssignedLiteral, parseAssignedLiteralBySourceLabel } from "../scripts/lib/parse-static.mjs";
import { isVersionOlder, versionFromHtml } from "../scripts/lib/version.mjs";
import { blockingRefreshReasons, detectDataAnomalies } from "../scripts/lib/anomalies.mjs";

const localization = {
  entries: parseOfficialLocalizationText("item_Namefixture_gun=测试枪\\nFixture Gun"),
};

describe("source parsing and normalization fixtures", () => {
  it("parses an assigned JSON literal without executing the source bundle", () => {
    const source = readFileSync(resolve(process.cwd(), "tests/fixtures/static-bundle.js"), "utf8");
    const parsed = parseAssignedLiteral(source, "var Ps=");
    expect(parsed.trades[0].rewards).toHaveLength(2);
    expect(parsed.trades[0].costs[0].scu).toBe(12);
  });

  it("finds the Dumper trade dataset by its semantic label when minified variable names change", () => {
    const source = [
      "var unrelated={_source:`Other dataset`,trades:[{id:`wrong`}]} ;",
      "const Os={_source:`Star Citizen Game Files (TheCollector contract generator)`,_extracted:`2026-08-09T00:00:00.000Z`,trades:[{id:`fixture`}],standings:{}};",
    ].join("");
    const parsed = parseAssignedLiteralBySourceLabel(
      source,
      "Star Citizen Game Files (TheCollector contract generator)",
      "trades",
    );
    expect(parsed.trades[0].id).toBe("fixture");
  });

  it("preserves SCU/x units, all rewards, blueprints, reputation, and source conflicts", () => {
    const [trade] = normalizeTrades({
      dumperData,
      secondaryTrades,
      localization,
      gameVersion: "4.9.0 LIVE.12345678",
      fetchedAt: "2026-08-04T00:00:00.000Z",
    });
    expect(trade.requirements.map((item: { quantity: number; unit: string }) => [item.quantity, item.unit])).toEqual([[24, "SCU"], [2, "x"]]);
    expect(trade.requirements[1].name.zh).toBe("测试枪");
    expect(trade.rewards).toHaveLength(3);
    expect(trade.rewards.at(-1)?.isBlueprint).toBe(true);
    expect(trade.minReputation).toBe("New Customer");
    expect(trade.validationStatus).toBe("conflict");
    expect(trade.conflicts[0].values).toHaveLength(2);
  });

  it("localizes resourceName commodities and standalone blueprint pools", () => {
    const directLocalization = {
      entries: parseOfficialLocalizationText([
        "items_commodities_quantainium=量子矿物Quantainium",
        "Blueprints=蓝图",
      ].join("\n")),
    };
    const [trade] = normalizeTrades({
      dumperData: {
        standings: {},
        trades: [{
          id: "fixture-resource-name",
          debugName: "TheCollector_CombatClothing",
          title: "Fixture Resource Name",
          category: "gear",
          subCategory: "armor",
          costs: [{ resourceName: "Quantainium", name: "Quantainium", scu: 36 }],
          rewards: [],
          blueprintPools: ["bp_reward_collectormaterial_001"],
        }],
      },
      secondaryTrades: [],
      localization: directLocalization,
      gameVersion: "4.9.0 LIVE.12345678",
      fetchedAt: "2026-08-04T00:00:00.000Z",
    });
    expect(trade.requirements[0].name.zh).toBe("量子矿物");
    expect(trade.rewards[0].name.zh).toBe("蓝图");
    expect(trade.rewards[0].name.localizationSource).toBe("official_global_ini");
  });

  it("extracts only the newest exact LIVE build and ignores PTU markers", () => {
    expect(versionFromHtml("<b>4.9.0-live.12345678</b>")).toBe("4.9.0 LIVE.12345678");
    expect(versionFromHtml("<b>4.10.0-ptu.9876543</b><b>4.9.0-live.12345678</b>")).toBe("4.9.0 LIVE.12345678");
    expect(versionFromHtml("4.9.0-live.1 4.10.0-live.2")).toBe("4.10.0 LIVE.2");
    expect(() => versionFromHtml("<b>4.10.0-ptu.9876543</b>")).toThrow(/exact LIVE/);
    expect(isVersionOlder("4.8.1 LIVE.1", "4.9.0 LIVE.1")).toBe(true);
    expect(isVersionOlder("4.9.0 LIVE.2", "4.9.0 LIVE.1")).toBe(false);
    expect(isVersionOlder("4.9.0 LIVE.1", "4.9.0 LIVE.2")).toBe(true);
  });

  it("blocks stable replacement on anomaly or partial source and keeps snapshots as references", () => {
    const anomalies = detectDataAnomalies({
      previousTrades: { gameVersion: "4.9.0 LIVE.9", trades: Array.from({ length: 100 }) },
      previousMetadata: { localizationCoverage: 0.8 },
      trades: Array.from({ length: 20 }, () => ({ rewards: [{}], reputationGain: 1 })),
      gameVersion: "4.8.1 LIVE.1",
      localizationCoverage: 0.4,
    });
    expect(anomalies).toHaveLength(3);
    expect(blockingRefreshReasons(anomalies, [
      { url: "https://primary.example", status: "partial" },
      { url: "https://wiki.example", status: "snapshot" },
    ])).toEqual([...anomalies, "https://primary.example: partial"]);
  });
});
