import { describe, expect, it } from "vitest";
import { localizeLocationText, remainingUnlocalizedLocationTokens, reviewedLocationExceptions } from "../scripts/lib/location-localization.mjs";
import { assertLocalizationSeries, deriveOfficialLocations } from "../scripts/lib/official-location-source.mjs";
import source from "../data/localization/official-global-derived.json";
import items from "../src/data/generated/items.json";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { verifySyncedLocalization } from "../scripts/lib/localization.mjs";
import { sameOfficialEntries } from "../scripts/generate-localization-source.mjs";

describe("official location localization", () => {
  it("uses official keys for the reported frontier shops", () => {
    expect(localizeLocationText("可购买地点：Shop Terminal - Bullock's Reach、Shop Terminal - Kinder Plots、Shop Terminal - The Yard、Shop Terminal - Shepherd's Rest"))
      .toBe("可购买地点：商店终端 - 犍牛原、商店终端 - 容善镇、商店终端 - “庭院”、商店终端 - 牧人驿站");
  });
  it("handles station parents and shop formatting variants", () => {
    expect(localizeLocationText("Armor - Terra Gateway (Stanton)" )).toBe("护甲店 - 泰拉星门 (斯坦顿)");
    expect(localizeLocationText("CenterMass New Babbage")).toBe("中心质量 新巴贝奇");
    expect(localizeLocationText("CenterMass - New Babbage")).toBe("中心质量 - 新巴贝奇");
  });
  it("resolves only verified complete terminal abbreviations", () => {
    expect(localizeLocationText("FPS Armor Everus")).toBe("护甲店 埃弗勒斯空间站");
    expect(localizeLocationText("Guns Megumi")).toBe("武器店 恩惠加油站");
    expect(localizeLocationText("Guns Ruin")).toBe("武器店 废墟空间站");
    expect(localizeLocationText("Skutters Grim")).toBe("射手 六角湾");
    expect(localizeLocationText("Unknown Ruin")).toBe("Unknown Ruin");
  });
  it("does not mistake equipment homonyms for places", () => {
    const locations = deriveOfficialLocations(new Map(Object.entries(source.entries)));
    expect(locations.Frostbite).toMatchObject({ zh: "寒霜镇", key: "Stanton4_DerelictSettlement_Frostbite" });
    expect(locations.Zephyr.zh).toBe("西风镇");
  });
  it("detects future unknown English without an old-name denylist", () => {
    expect(remainingUnlocalizedLocationTokens("可购买地点：Shop Terminal - Brand New Outpost").length).toBeGreaterThan(0);
    expect(remainingUnlocalizedLocationTokens("可购买地点：商店终端 - 犍牛原")).toEqual([]);
  });
  it("reports ambiguous abbreviations explicitly, retaining their identity", () => {
    expect(reviewedLocationExceptions("可购买地点：Green Circle、Sharp Shooters")).toEqual(["Green Circle", "Sharp Shooters"]);
    expect(localizeLocationText("Green Circle SCU RCMBNT-PWL-1")).toBe("Green Circle SCU RCMBNT-PWL-1");
    expect(localizeLocationText("武器与护甲店 PSSA")).toBe("武器与护甲店 人民服务空间站 阿尔法");
  });
  it("is idempotent for every current acquisition location", () => {
    for (const item of items.items) for (const method of item.acquisition) {
      const once = localizeLocationText(method.location);
      expect(localizeLocationText(once), item.id).toBe(once);
      expect(remainingUnlocalizedLocationTokens(once), item.id).toEqual([]);
    }
  });
  it("fails closed on missing official location keys", () => {
    expect(() => deriveOfficialLocations(new Map())).toThrow("Missing official location key");
  });
  it("checks series honestly without claiming exact build verification", () => {
    const entries = new Map([["frontend_pu_version", { value: "4.10: 奥里森之围" }]]);
    expect(assertLocalizationSeries(entries, "4.10.1 LIVE.12660092").verification).toContain("series-only");
    expect(() => assertLocalizationSeries(entries, "4.11.0 LIVE.12660092")).toThrow("mismatch");
    expect(() => assertLocalizationSeries(entries, "4.10.1 PTU.12660092")).toThrow("exact LIVE");
    expect(() => assertLocalizationSeries(new Map(), "4.10.1 LIVE.12660092")).toThrow("mismatch");
  });
  it("verifies a single immutable NAS input and rejects tampering", () => {
    const bytes = Buffer.from("Frontend_PU_Version=4.10: 奥里森之围\n");
    const manifest = { schemaVersion: 1, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, versionLabel: "4.10: 奥里森之围", versionPrecision: "major-minor-only", sourcePath: "/nas/global.ini", sourceUpdatedAt: "2026-09-17T10:54:40Z" };
    const compressed = gzipSync(bytes);
    expect(verifySyncedLocalization(manifest, compressed, "a".repeat(40)).metadata.sourceCommit).toBe("a".repeat(40));
    expect(() => verifySyncedLocalization({ ...manifest, sha256: "0".repeat(64) }, compressed, "a".repeat(40))).toThrow("mismatch");
    expect(() => verifySyncedLocalization({ ...manifest, byteLength: 1 }, compressed, "a".repeat(40))).toThrow("mismatch");
    expect(() => verifySyncedLocalization({ ...manifest, versionLabel: "4.11" }, compressed, "a".repeat(40))).toThrow("versionLabel mismatch");
    expect(() => verifySyncedLocalization(manifest, Buffer.from("bad gzip"), "a".repeat(40))).toThrow();
  });
  it("ignores source entry order/key capitalization but not translated values", () => {
    const left = { a: { key: "A", value: "犍牛原" }, b: { key: "B", value: "容善镇" } };
    expect(sameOfficialEntries(left, { b: left.b, a: { ...left.a, key: "a" } })).toBe(true);
    expect(sameOfficialEntries(left, { ...left, a: { key: "A", value: "不同译名" } })).toBe(false);
  });
});
