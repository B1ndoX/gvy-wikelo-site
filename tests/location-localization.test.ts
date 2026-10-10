import { describe, expect, it } from "vitest";
import { localizeLocationText, remainingUnlocalizedLocationTokens, reviewedLocationExceptions } from "../scripts/lib/location-localization.mjs";
import { assertLocalizationSeries, deriveOfficialLocations } from "../scripts/lib/official-location-source.mjs";
import source from "../data/localization/official-global-derived.json";
import items from "../src/data/generated/items.json";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { verifySyncedLocalization } from "../scripts/lib/localization.mjs";
import { sameOfficialEntries } from "../scripts/generate-localization-source.mjs";
const currentLocations = deriveOfficialLocations(new Map(Object.entries(source.entries)));

describe("official location localization", () => {
  it("uses official keys for the reported frontier shops", () => {
    expect(localizeLocationText("可购买地点：Shop Terminal - Bullock's Reach、Shop Terminal - Kinder Plots、Shop Terminal - The Yard、Shop Terminal - Shepherd's Rest"))
      .toBe("可购买地点：商店终端 - 犍牛原、商店终端 - 容善镇、商店终端 - “庭院”、商店终端 - 牧人驿站");
  });
  it("handles station parents and shop formatting variants", () => {
    expect(localizeLocationText("Armor - Terra Gateway (Stanton)" )).toBe(`${currentLocations.Armor.zh} - 泰拉星门 (斯坦顿)`);
    expect(localizeLocationText("CenterMass New Babbage")).toBe(`${currentLocations.CenterMass.zh} 新巴贝奇`);
    expect(localizeLocationText("CenterMass - New Babbage")).toBe(`${currentLocations.CenterMass.zh} - 新巴贝奇`);
  });
  it("resolves only verified complete terminal abbreviations", () => {
    expect(localizeLocationText("FPS Armor Everus")).toBe(`${currentLocations["FPS Armor"].zh} 埃弗勒斯空间站`);
    expect(localizeLocationText("Guns Megumi")).toBe(`${currentLocations.Guns.zh} 恩惠加油站`);
    expect(localizeLocationText("Guns Ruin")).toBe(`${currentLocations.Guns.zh} 废墟空间站`);
    expect(localizeLocationText("Skutters Grim")).toBe(`${currentLocations.Skutters.zh} ${currentLocations.GrimHEX.zh}`);
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
  it("handles official bilingual place names and the revised IO building greeting", () => {
    const entries = new Map(Object.entries(source.entries));
    entries.set("pyro6_outpost_col_s_frm_indy_001", { key: "Pyro6_Outpost_col_s_frm_indy_001", value: "Bullock's Reach [犍牛原]" });
    entries.set("stanton1_transfer", { key: "Stanton1_Transfer", value: "Everus Harbor\\n埃弗勒斯空间站" });
    entries.set("pu_iongreet01_ad_greeting_v_bg_003", { key: "PU_IONGREET01_AD_Greeting_V_BG_003,P", value: "欢迎来到 IO北区大厦，18区的主要中央商务区。" });
    const locations = deriveOfficialLocations(entries);
    expect(locations["Bullock's Reach"].zh).toBe("犍牛原");
    expect(locations["Everus Harbor"].zh).toBe("埃弗勒斯空间站");
    expect(locations["IO North Tower"].zh).toBe("IO北区大厦");
    expect(remainingUnlocalizedLocationTokens("可购买地点：IO北区大厦")).toEqual([]);
    entries.set("pu_iongreet01_ad_greeting_v_bg_003", { key: "PU_IONGREET01_AD_Greeting_V_BG_003,P", value: "未知大厦" });
    expect(() => deriveOfficialLocations(entries)).toThrow("review phrase mapping");
  });
  it("checks series honestly without claiming exact build verification", () => {
    const entries = new Map([["frontend_pu_version", { value: "4.10: 奥里森之围" }]]);
    expect(assertLocalizationSeries(entries, "4.10.1 LIVE.12660092").verification).toContain("series-only");
    const pending = assertLocalizationSeries(entries, "4.11.0 LIVE.12660092");
    expect(pending.localizationPending).toBe(true);
    expect(pending.matchedLiveVersion).toBeNull();
    expect(pending.targetLiveVersion).toBe("4.11.0 LIVE.12660092");
    expect(() => assertLocalizationSeries(entries, "4.9.0 LIVE.12660092")).toThrow("mismatch");
    expect(() => assertLocalizationSeries(new Map([["frontend_pu_version", { value: "4.10 PTU" }]]), "4.10.1 LIVE.12660092")).toThrow("mismatch");
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
  it("accepts the official Alpha-prefixed version label while retaining byte and LIVE checks", () => {
    const label = "Alpha 4.10：奥里森之围";
    const bytes = Buffer.from(`Frontend_PU_Version=${label}\n`);
    const manifest = { schemaVersion: 1, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length, versionLabel: label, versionPrecision: "major-minor-only", sourcePath: "/nas/global.ini", sourceUpdatedAt: "2026-10-10T13:03:46Z" };
    const verified = verifySyncedLocalization(manifest, gzipSync(bytes), "b".repeat(40));
    expect(verified.metadata.sourceSha256).toBe(manifest.sha256);
    expect(assertLocalizationSeries(verified.entries, "4.10.2 LIVE.12881860").series).toBe("4.10");
    expect(() => assertLocalizationSeries(new Map([["frontend_pu_version", { value: "Alpha 4.10 PTU" }]]), "4.10.2 LIVE.12881860")).toThrow("mismatch");
  });
  it("ignores source entry order/key capitalization but not translated values", () => {
    const left = { a: { key: "A", value: "犍牛原" }, b: { key: "B", value: "容善镇" } };
    expect(sameOfficialEntries(left, { b: left.b, a: { ...left.a, key: "a" } })).toBe(true);
    expect(sameOfficialEntries(left, { ...left, a: { key: "A", value: "不同译名" } })).toBe(false);
  });
});
