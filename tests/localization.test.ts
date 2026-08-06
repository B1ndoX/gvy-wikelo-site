import { describe, expect, it } from "vitest";
import { buildContractLocalizationResolver, parseOfficialLocalizationText, resolveEntityLocalization } from "../scripts/lib/localization.mjs";

describe("official localization parser", () => {
  it("handles BOM, comments, blank lines, and splits values only at the first equals sign", () => {
    const entries = parseOfficialLocalizationText("\uFEFF; comment\r\n\r\nitem_Namefixture=正式中文\\nOfficial Name=Variant\r\n# ignored=1");
    expect(entries.size).toBe(1);
    expect(entries.get("item_namefixture")?.value).toBe("正式中文\\nOfficial Name=Variant");
  });

  it("prefers an official Chinese name and preserves the English original", () => {
    const localization = { entries: parseOfficialLocalizationText("item_Namefixture=正式中文\\nOfficial Name") };
    expect(resolveEntityLocalization(localization, "fixture", "Official Name")).toEqual({
      zh: "正式中文",
      en: "Official Name",
      localizationSource: "official_global_ini",
    });
    expect(resolveEntityLocalization(localization, "missing", "English Fallback")).toEqual({
      zh: null,
      en: "English Fallback",
      localizationSource: "english_fallback",
    });
  });

  it("uses audited official aliases and strips a concatenated English suffix", () => {
    const localization = { entries: parseOfficialLocalizationText("TheCollector_Coin_Name=维科洛人情Wikelo Favor") };
    expect(resolveEntityLocalization(localization, "carryable_1h_cy_banu_favour_wikelo", "Wikelo Favor")).toEqual({
      zh: "维科洛人情",
      en: "Wikelo Favor",
      localizationSource: "official_global_ini",
    });
  });

  it("maps the Tevarin service marker to its differently named official key", () => {
    const localization = { entries: parseOfficialLocalizationText("item_NameMedal_1_pristine_c=塔维因战争服役徽记（完好）") };
    expect(resolveEntityLocalization(localization, "carryable_1h_cy_medal_1_pristine_c", "Tevarin War Service Marker (Pristine)")).toEqual({
      zh: "塔维因战争服役徽记（完好）",
      en: "Tevarin War Service Marker (Pristine)",
      localizationSource: "official_global_ini",
    });
  });

  it("maps the complete official medal family by condition and variant", () => {
    const localization = {
      entries: parseOfficialLocalizationText([
        "item_NameMedal_1_pristine_b=地球联合帝国（UEE）六排勋章（完好）",
        "item_NameMedal_1_pristine_d=政府制图局勋章（完好）",
        "item_NameMedal_1_worn_a=地球联合国（UNE）统一战争勋章（磨损）",
      ].join("\n")),
    };
    expect(resolveEntityLocalization(localization, "carryable_1h_cy_medal_1_pristine_b", "UEE 6th Platoon Medal (Pristine)").zh)
      .toBe("地球联合帝国（UEE）六排勋章（完好）");
    expect(resolveEntityLocalization(localization, "carryable_1h_cy_medal_1_pristine_d", "Government Cartography Agency Medal (Pristine)").zh)
      .toBe("政府制图局勋章（完好）");
    expect(resolveEntityLocalization(localization, "carryable_1h_cy_medal_1_worn_a", "UNE Unification War Medal (Worn)").zh)
      .toBe("地球联合国（UNE）统一战争勋章（磨损）");
  });

  it("matches official commodity keys and exact English-name fallbacks", () => {
    const localization = {
      entries: parseOfficialLocalizationText([
        "items_commodities_carinite_pure=纯净科力晶Carinite (Pure)",
        "items_commodities_saldynium_ore=烁迪银矿石",
        "item_Name_cds_heavy_armor_01_core=ADP-mk4 胸甲 林地版\\nADP-mk4 Core Woodland",
      ].join("\n")),
    };
    expect(resolveEntityLocalization(localization, "harvestable_mineral_1h_carinitepure", "Carinite (Pure)").zh).toBe("纯净科力晶");
    expect(resolveEntityLocalization(localization, "harvestable_ore_1h_saldyniumore", "Saldynium (Ore)").zh).toBe("烁迪银矿石");
    expect(resolveEntityLocalization(localization, "cds_armor_heavy_core_01_01_01", "ADP-mk4 Core Woodland").zh).toBe("ADP-mk4 胸甲 林地版");
  });

  it("preserves official pearl grades and uses official Hyperion sample codes", () => {
    const localization = {
      entries: parseOfficialLocalizationText([
        "items_commodities_valakkarpearl_apex_irradiated_tier1=受辐射的瓦拉卡珍珠（AAA 级）\\nIrradiated Valakkar Pearl (Grade AAA)",
        "Hockrow_FacilityDelve_P3M1_Sample01_Name=RCMBNT-XTL-1",
      ].join("\n")),
    };
    expect(resolveEntityLocalization(
      localization,
      "carryable_2h_fl_vlk_pearl_irradiated_super_01",
      "Irradiated Valakkar Pearl (Grade AAA)",
    ).zh).toBe("受辐射的瓦拉卡珍珠（AAA 级）");
    expect(resolveEntityLocalization(
      localization,
      "carryable_tbo_asdreward_xtl1",
      "ASD Extract Module (XTL-1)",
    )).toEqual({ zh: null, en: "RCMBNT-XTL-1", localizationSource: "official_global_ini" });
  });

  it("maps Wikelo artifacts, special favor, harvestables, and direct commodity ids", () => {
    const localization = {
      entries: parseOfficialLocalizationText([
        "item_NameAlienAA_fragment_1_large_pristine_a=大型遗物碎片（完好）",
        "TheCollector_PolarisBit_Name=北极星点数",
        "harvestable_Armillaria=蓝月菌Bluemoon Fungus",
        "items_commodities_savrilium=萨维里金属Savrilium",
        "items_commodities_quantainium=量子矿物Quantainium",
        "items_commodities_copper=铜Copper",
        "items_commodities_tungsten=钨Tungsten",
        "items_commodities_corundum=刚玉Corundom",
      ].join("\n")),
    };
    const cases = [
      ["carryable_1h_cy_hadesian_fragment_1_large_pristine_a", "Large Artifact Fragment (Pristine)", "大型遗物碎片（完好）"],
      ["carryable_1h_cy_banu_favour_wikelo_special", "Polaris Bit", "北极星点数"],
      ["harvestable_armillaria", "Bluemoon Fungus", "蓝月菌"],
      ["Savrilium", "Savrilium", "萨维里金属"],
      ["Quantainium", "Quantainium", "量子矿物"],
      ["Copper", "Copper", "铜"],
      ["Tungsten", "Tungsten", "钨"],
      ["Corundum", "Corundum", "刚玉"],
    ];
    for (const [id, en, zh] of cases) {
      expect(resolveEntityLocalization(localization, id, en).zh).toBe(zh);
    }
  });

  it("maps audited Wikelo recipe and ATLS titles without translating them", () => {
    const localization = {
      entries: parseOfficialLocalizationText([
        "TheCollector_Mod_ATLS_Geo_Grad2_Name,P=ATLS 警示线",
        "TheCollector_Recipes_Title_L22Wolf=格外特别的狼\\n[兑换 - L-22 头狼 维科洛战争版]",
        "TheCollector_Menu_Title_PolarisShip=现在可以造北极星了。限时交易。\\n[兑换 - 北极星 维科洛版]",
        "TheCollector_Recipes_Title_NoneAR=你的最好的枪\\n[兑换 - 绝杀 “统御迷彩” 步枪]",
      ].join("\n")),
    };
    const resolveContract = buildContractLocalizationResolver(localization);
    expect(resolveContract({ debugName: "TheColllector_Vehicle_Ground_ATLS_OrangeNGrey", title: "ATLS Orange Line" }).zh).toBe("ATLS 警示线");
    expect(resolveContract({ debugName: "TheCollector_Vehicle_L22_Wolf", title: "Extra Special Wolf" }).zh).toBe("格外特别的狼");
    expect(resolveContract({ debugName: "TheCollector_Vehicle_Polaris", title: "Now make Polaris. Short Time Deal." }).zh).toBe("现在可以造北极星了。限时交易。");
    expect(resolveContract({ debugName: "TheCollector_NoneAssultRifle", title: "Your Best Shot" }).zh).toBe("你的最好的枪");
  });

  it("uses explicit official contract keys and never guesses a nearby title", () => {
    const localization = {
      entries: parseOfficialLocalizationText([
        "TheCollector_Ships_Kruger_Wolf_Title=狼在哪？狼在这\\n[兑换 - 狼式 维科洛鬼祟版]",
        "TheCollector_Ships_Wolf_Unique_Title=最特别的狼\\n[兑换 - 狼式 维科洛战争版]",
      ].join("\n")),
    };
    const resolveContract = buildContractLocalizationResolver(localization);
    expect(resolveContract({ debugName: "TheCollector_Vehicle_Small_Kruger_Wolf_Unique", title: "Most Special Wolf" }).zh).toBe("最特别的狼");
    expect(resolveContract({ debugName: "TheCollector_CombatClothing", title: "CombatClothing" }).zh).toBeNull();
  });
});
