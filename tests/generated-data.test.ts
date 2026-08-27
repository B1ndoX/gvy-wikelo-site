import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import tradesData from "../src/data/generated/trades.json";
import itemsData from "../src/data/generated/items.json";
import metadata from "../src/data/generated/metadata.json";
import versionedData from "../src/data/generated/versioned-data.json";
import schema from "../data/schema/trades.schema.json";

describe("generated stable data", () => {
  it("contains exactly one exact LIVE dataset", () => {
    expect(versionedData.datasets).toHaveLength(1);
    expect(versionedData.datasets[0].gameVersion).toMatch(/^\d+\.\d+\.\d+ LIVE\.\d+$/);
    expect(versionedData.datasets[0].gameVersion).not.toMatch(/PTU|EPTU/);
  });

  it("keeps the versioned snapshot synchronized with the stable item and trade documents", () => {
    const dataset = versionedData.datasets[0];
    expect(dataset.generatedAt).toBe(itemsData.generatedAt);
    expect(dataset.items).toEqual(itemsData.items);
    expect(dataset.trades).toEqual(tradesData.trades);
  });

  it("passes the strict trade JSON Schema", () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
    ajv.addFormat("uri", { type: "string", validate: (value: string) => { try { new URL(value); return true; } catch { return false; } } });
    const validate = ajv.compile(schema);
    expect(validate(tradesData), JSON.stringify(validate.errors)).toBe(true);
  });

  it("keeps a metadata-consistent trade set, real local images, multiple rewards, units, and conflicts", () => {
    expect(tradesData.trades).toHaveLength(metadata.totalTrades);
    expect(itemsData.items).toHaveLength(metadata.totalItems);
    expect(tradesData.trades.length).toBeGreaterThan(0);
    expect(tradesData.trades.some((trade) => trade.requirements.some((item) => item.unit === "SCU"))).toBe(true);
    expect(tradesData.trades.some((trade) => trade.rewards.length > 1)).toBe(true);
    expect(tradesData.trades.some((trade) => trade.validationStatus === "conflict" && trade.conflicts.length > 0)).toBe(true);
    const imaged = itemsData.items.filter((item) => item.imagePath);
    expect(imaged.length).toBeGreaterThan(100);
    imaged.slice(0, 20).forEach((item) => {
      expect(readFileSync(resolve(process.cwd(), `public${item.imagePath}`)).byteLength).toBeGreaterThan(100);
    });
  });

  it("keeps SC Market as a documented secondary version source without overriding LIVE", () => {
    const source = metadata.sources.find((candidate) => candidate.url === "https://api.sc-market.space/api/v2");
    expect(["ok", "snapshot"]).toContain(source?.status);
    expect(source?.note).toMatch(/\d+\.\d+\.\d+-LIVE\.\d+/);
    expect(source?.note).toContain("Player listing prices are not imported");
  });

  it("pins verified images for the previously ambiguous Wikelo materials", () => {
    const ids = [
      "carryable_1h_cy_banu_favour_wikelo",
      "carryable_1h_sq_pyro_serverblade_5",
      "carryable_1h_cy_medal_1_pristine_c",
    ];
    for (const id of ids) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.imageKind).toBe("exact");
      expect(item?.imagePath).toMatch(/^\/images\/wiki\//);
      expect(readFileSync(resolve(process.cwd(), `public${item?.imagePath}`)).byteLength).toBeGreaterThan(10_000);
    }

    const l22 = itemsData.items.find((candidate) => candidate.id === "krig_l22_alphawolf_collector_military");
    expect(l22?.imageKind).toBe("base_model");
    expect(l22?.imageSourceUrl).toBe("https://starcitizen.tools/L-22_Alpha_Wolf");
    expect(readFileSync(resolve(process.cwd(), `public${l22?.imagePath}`)).byteLength).toBeGreaterThan(10_000);
  });

  it("pins the exact source images requested for common Wikelo materials", () => {
    const ids = [
      "basl_combat_light_helmet_02_01_01",
      "harvestable_trophy_1h_quasigrazeregg_grassland",
      "cds_armor_heavy_core_01_01_01",
      "cds_armor_heavy_arms_01_01_01",
      "cds_armor_heavy_legs_01_01_01",
      "cds_armor_heavy_helmet_01_01_01",
    ];
    for (const id of ids) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.imageKind).toBe("exact");
      expect(item?.imagePath).toMatch(/^\/images\/wiki\//);
      expect(item?.imageSourceUrl).toContain("api.star-citizen.wiki/items/");
      expect(readFileSync(resolve(process.cwd(), `public${item?.imagePath}`)).byteLength).toBeGreaterThan(10_000);
    }
  });

  it("keeps the newly localized high-frequency Wikelo images auditable", () => {
    const exactIds = [
      "fps_consumable_harddrive_delving_hardened_asd_red",
      "carryable_1h_cy_physical_currency_scrip_merc_1",
      "harvestable_trophy_1h_yormandi_eye",
      "carryable_2h_cy_yormandi_tongue",
      "carryable_1h_cy_medal_1_pristine_b",
      "carryable_1h_cy_armor_vanduul_1_b",
      "carryable_1h_cy_armor_vanduul_1_a",
      "argo_atls",
      "carryable_1h_cy_medal_1_pristine_d",
      "volt_rifle_energy_01",
      "harvestable_trophy_1h_kopionhorn_tundra",
      "carryable_1h_cy_hadesian_fragment_1_large_pristine_a",
      "volt_smg_energy_01",
      "volt_smg_energy_01_mag",
      "carryable_1h_cy_advocacy_badge",
      "carryable_1h_cy_physical_currency_scrip_council_1",
      "carryable_tbo_missionitem_tsg_fueltank",
      "volt_lmg_energy_01",
      "mxox_neutroncannon_s1",
    ];

    for (const id of exactIds) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.imageKind).toBe("exact");
      expect(item?.imagePath).toMatch(/^\/images\/wiki\//);
      expect(item?.imageSourceUrl).toMatch(/^https:\/\/(api\.)?star-citizen\.wiki\//);
      expect(readFileSync(resolve(process.cwd(), `public${item?.imagePath}`)).byteLength).toBeGreaterThan(10_000);
    }

    const carinite = itemsData.items.find((candidate) => candidate.id === "harvestable_mineral_1h_carinite");
    expect(carinite?.imageKind).toBe("exact");
    expect(carinite?.imageSourceUrl).toBe("https://starcitizen.tools/Carinite");

    const pureCarinite = itemsData.items.find((candidate) => candidate.id === "harvestable_mineral_1h_carinitepure");
    expect(pureCarinite?.imageKind).toBe("base_model");
    expect(pureCarinite?.imageSourceUrl).toBe("https://starcitizen.tools/Carinite");
  });

  it("uses verified exact images for Venture armor, Jaclium ore, and the Vendetta HMG", () => {
    const expected = new Map([
      ["rsi_explorer_armor_light_core_01_01_01", "/images/wiki/venture-core.png"],
      ["rsi_explorer_armor_light_legs_01_01_01", "/images/wiki/venture-legs.png"],
      ["harvestable_ore_1h_jacliumore", "/images/wiki/jaclium-ore.png"],
      ["apar_hmg_ballistic_01", "/images/wiki/vendetta-hmg.jpg"],
    ]);
    for (const [id, imagePath] of expected) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.imageKind).toBe("exact");
      expect(item?.imagePath).toBe(imagePath);
      expect(readFileSync(resolve(process.cwd(), `public${imagePath}`)).byteLength).toBeGreaterThan(100_000);
    }

    for (const id of ["cds_combat_superheavy_suit_01_01_01", "cds_combat_superheavy_helmet_01_01_01"]) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.imageKind).toBe("community");
      expect(item?.imagePath).toBe("/images/wiki/bul-h4-community.png");
      expect(item?.imageSourceUrl).toContain("robertsspaceindustries.com/community-hub/post/bul-h4");
    }
  });

  it("keeps sourced Wikelo special images and labels player screenshots", () => {
    const exactIds = [
      "gmni_rifle_ballistic_01_iae2023",
      "gmni_lmg_ballistic_01_collector01",
      "ksar_pistol_ballistic_01_iae2023",
      "volt_rifle_energy_01_collector01",
      "volt_rifle_energy_01_collector04",
      "cds_combat_heavy_helmet_03_01_01",
      "volt_smg_energy_01_collector01",
      "volt_smg_energy_01_collector02",
      "volt_smg_energy_01_collector03",
      "ksar_rifle_energy_01_iae2023",
      "clda_env_heavy_unified_01_iae2023_01",
    ];
    for (const id of exactIds) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.imageKind).toBe("exact");
      expect(item?.imageSourceUrl).toContain("starcitizen.tools/");
      expect(readFileSync(resolve(process.cwd(), `public${item?.imagePath}`)).byteLength).toBeGreaterThan(10_000);
    }

    const xanthule = itemsData.items.find((candidate) => candidate.id === "syfb_flightsuit_01_iae2023_01");
    expect(xanthule?.imageKind).toBe("community");
    expect(xanthule?.imageSourceUrl).toContain("starcitizen.tools/File:");

    const nox = itemsData.items.find((candidate) => candidate.id === "xian_nox_collector_mod");
    expect(nox?.imageKind).toBe("community");
    expect(nox?.imageSourceUrl).toContain("robertsspaceindustries.com/community-hub/");
    expect(readFileSync(resolve(process.cwd(), `public${nox?.imagePath}`)).byteLength).toBeGreaterThan(100_000);

    const coolMetal = itemsData.items.find((candidate) => candidate.id === "argo_atls_geo_collector_grad03");
    expect(coolMetal?.imageKind).toBe("community");
    expect(coolMetal?.imagePath).toBe("/images/wiki/atls-cool-metal-community.jpg");
    expect(coolMetal?.imageSourceUrl).toBe(
      "https://robertsspaceindustries.com/community-hub/post/atls-geo-cool-metal-edition-from-wikelo-rXU9GCHNUTdAa",
    );
    expect(readFileSync(resolve(process.cwd(), `public${coolMetal?.imagePath}`)).byteLength).toBeGreaterThan(100_000);
  });

  it("keeps explicit acquisition directions and exact crafting quantities", () => {
    const dchs = itemsData.items.find((item) => item.id === "carryable_1h_sq_pyro_serverblade_5");
    expect(dchs?.acquisition[0].location).toContain("Ghost Arena");
    expect(dchs?.acquisition[0].location).toContain("地穴密钥卡");

    const favor = itemsData.items.find((item) => item.id === "carryable_1h_cy_banu_favour_wikelo");
    expect(favor?.acquisition[0].location).toContain("4 笔兑换合同");

    const pwl2 = itemsData.items.find((item) => item.id === "carryable_tbo_asdreward_pwl2");
    expect(pwl2?.descriptionZh).toContain("催化剂-PWL和反应物-02");
    expect(pwl2?.name).toEqual(expect.objectContaining({ zh: null, en: "RCMBNT-PWL-2", localizationSource: "official_global_ini" }));
    expect(pwl2?.acquisition[0].label).toBe("实验终端合成");
    expect(pwl2?.acquisition[0].location).toContain("RCMBNT-PWL-2");
    expect(pwl2?.acquisition[0].location).toContain("材料：反应物-02代码 + 催化剂-PWL代码");

    const rgl1 = itemsData.items.find((item) => item.id === "carryable_tbo_asdreward_rgl1");
    expect(rgl1?.descriptionZh).toContain("催化剂-RGL和反应物-01");
    expect(rgl1?.acquisition[0].location).toContain("RCMBNT-RGL-1");

    const metamaterial = itemsData.items.find((item) => item.id === "carryable_2h_cy_collectormaterial_001");
    expect(metamaterial?.crafting?.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.objectContaining({ zh: "钛", en: "Titanium" }), quantity: 2, unit: "SCU" }),
      expect.objectContaining({ name: expect.objectContaining({ zh: "愈金", en: "Riccite" }), quantity: 2, unit: "SCU" }),
      expect.objectContaining({ name: expect.objectContaining({ zh: "约曼迪之眼", en: "Yormandi Eye" }), quantity: 4, unit: "x" }),
    ]));
  });

  it("keeps every audited official Wikelo name connected to global.ini", () => {
    const expectedItems = new Map([
      ["carryable_1h_cy_hadesian_fragment_1_large_pristine_a", "大型遗物碎片（完好）"],
      ["carryable_1h_cy_banu_favour_wikelo_special", "北极星点数"],
      ["harvestable_armillaria", "蓝月菌"],
      ["Savrilium", "萨维里金属"],
      ["Quantainium", "量子矿物"],
      ["Copper", "铜"],
      ["Tungsten", "钨"],
      ["Corundum", "刚玉"],
    ]);
    for (const [id, zh] of expectedItems) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.name.zh).toBe(zh);
      expect(item?.name.localizationSource).toBe("official_global_ini");
    }

    const orangeAtls = tradesData.trades.find((trade) => trade.name.en === "ATLS Orange Line");
    expect(orangeAtls?.name.zh).toBe("ATLS 警示线");
    expect(orangeAtls?.rewards[0].name.zh).toBe("ATLS 警示线");

    expect(itemsData.items.filter((item) => item.name.localizationSource === "english_fallback")).toEqual([]);
    expect(tradesData.trades.filter((trade) => trade.name.localizationSource === "english_fallback")).toEqual([]);

    const heavyAndBright = tradesData.trades.find((trade) => trade.name.en === "Heavy and Bright");
    if (heavyAndBright) expect(heavyAndBright.name.zh).toBe("沉重又明亮");
  });

  it("preserves full official pearl grades and local community evidence", () => {
    const expected = new Map([
      ["carryable_2h_fl_vlk_pearl_irradiated_high_02", "受辐射的瓦拉卡珍珠（AA 级）"],
      ["carryable_2h_fl_vlk_pearl_irradiated_super_01", "受辐射的瓦拉卡珍珠（AAA 级）"],
    ]);
    for (const [id, zh] of expected) {
      const item = itemsData.items.find((candidate) => candidate.id === id);
      expect(item?.name.zh).toBe(zh);
      expect(item?.name.localizationSource).toBe("official_global_ini");
      expect(item?.imageKind).toBe("community");
      expect(item?.imagePath).toMatch(/^\/images\/wiki\//);
      expect(readFileSync(resolve(process.cwd(), `public${item?.imagePath}`)).byteLength).toBeGreaterThan(10_000);
    }
  });

  it("keeps every required material sourced and reports only honest image gaps", () => {
    const requiredIds = new Set(tradesData.trades.flatMap((trade) => trade.requirements.map((item) => item.id)));
    const requiredItems = itemsData.items.filter((item) => requiredIds.has(item.id));
    expect(requiredItems).toHaveLength(requiredIds.size);
    expect(requiredItems.filter((item) => item.acquisition.some((method) => method.type === "unknown"))).toEqual([]);
    expect(requiredItems.filter((item) => item.acquisition.some((method) => !method.sourceUrl))).toEqual([]);
    expect(itemsData.items.filter((item) => item.descriptionZh && !/[\u3400-\u9fff]/.test(item.descriptionZh))).toEqual([]);
    expect(itemsData.items.flatMap((item) => item.crafting?.ingredients ?? [])
      .filter((ingredient) => ingredient.name.localizationSource === "english_fallback")).toEqual([]);
  });

  it("keeps acquisition copy player-facing while retaining sources only in data", () => {
    const internalCopy = /公开(?:数据|资料|来源|商品接口)|结构化来源|来源合同|来自这些合同|内部任务占位|主数据|交叉校验|单一来源|待核验|物品资料版本/;
    const leaked = itemsData.items.filter((item) => item.acquisition
      .flatMap((method) => [method.label, method.location])
      .filter(Boolean)
      .some((value) => internalCopy.test(value)));
    expect(leaked).toEqual([]);
    expect(itemsData.items.some((item) => item.acquisition.some((method) => Boolean(method.sourceUrl)))).toBe(true);
  });

  it("bundles exact public images for the newly audited requirement items", () => {
    const ids = [
      "argo_atls_geo",
      "none_special_ballistic_01",
      "ksar_pistol_ballistic_01",
      "omc_utility_heavy_helmet_01_01_16",
      "gmni_lmg_ballistic_01",
      "ksar_rifle_energy_01",
      "clda_env_armor_heavy_suit_01_01_01",
      "qrt_utility_heavy_core_01_01_01",
      "volt_shotgun_energy_01",
      "gmni_shotgun_ballistic_01",
      "gmni_rifle_ballistic_01",
      "vgl_flightsuit_helmet_01_01_01",
      "qrt_combat_medium_core_01_01_16",
      "syfb_flightsuit_suit_01_01_01",
    ];
    const currentItems = ids
      .map((id) => itemsData.items.find((candidate) => candidate.id === id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    expect(currentItems.length).toBeGreaterThan(0);
    for (const item of currentItems) {
      expect(item?.imageKind).toBe("exact");
      expect(item?.imageSourceUrl).toContain("api.star-citizen.wiki/");
      expect(readFileSync(resolve(process.cwd(), `public${item?.imagePath}`)).byteLength).toBeGreaterThan(20_000);
    }
  });
});
