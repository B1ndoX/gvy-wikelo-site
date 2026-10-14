import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContractLocalizationResolver, loadOfficialLocalization, parseOfficialLocalizationText, resolveEntityLocalization } from "../scripts/lib/localization.mjs";
import source from "../data/localization/official-global-derived.json";
import { firstChineseLine } from "../scripts/lib/localization.mjs";

describe("official localization parser", () => {
  it("uses the committed derivative on remote runners and covers top-level and crafting names", async () => {
    const localization = await loadOfficialLocalization(
      "/definitely-unavailable/gvy-wikelo-global.ini",
      resolve(process.cwd(), "data/localization/official-global-derived.json"),
    );
    expect(localization.metadata.usingDerivedSnapshot).toBe(true);
    expect(resolveEntityLocalization(localization, "harvestable_ore_1h_jacliumore", "Jaclium (Ore)").zh).toBe("杰金矿石");
    expect(resolveEntityLocalization(localization, "fixture-titanium", "Titanium").zh).toBe("钛");
    expect(resolveEntityLocalization(localization, "fixture-riccite", "Riccite").zh).toBe("愈金");
    expect(resolveEntityLocalization(localization, "fixture-ouratite", "Ouratite").zh).toBe("欧拉特烃");
    expect(resolveEntityLocalization(localization, "cds_combat_superheavy_suit_01_03_01", "BUL-H4 Armor Snow Camo").zh)
      .toBe("BUL-H4 护甲 雪地迷彩");
    expect(resolveEntityLocalization(localization, "cds_combat_superheavy_helmet_01_03_01", "BUL-H4 Helmet Snow Camo").zh)
      .toBe("BUL-H4 头盔 雪地迷彩");
    expect(resolveEntityLocalization(localization, "cds_combat_superheavy_backpack_01_03_01", "H4-PBF Ammo Carrier Snow Camo").zh)
      .toBe(firstChineseLine(source.entries.item_name_cds_combat_superheavy_backpack_01_03_01.value));
    expect(resolveEntityLocalization(localization, "carryable_2h_sq_collectormaterial_002", "Metamaterial Test #152").zh)
      .toBe("超材料测试 #152");
  });

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

  it("uses the name line in enhanced / fully Chinese inputs, not later translations or specifications", () => {
    const localization = { entries: parseOfficialLocalizationText([
      "item_Nameold=原中文\\nOriginal English",
      "item_Namebilingual,P=English-first Original\\n官方中文",
      "item_Namebracket=Original English [官方中文（基础）]",
      "item_Nameuntranslated=Monolith Armor Core\\nMonolith Armor Core",
      "item_Namebrand=F55 重机枪（基础）",
    ].join("\n")) };
    expect(resolveEntityLocalization(localization, "old", "Original English").zh).toBe("原中文");
    expect(resolveEntityLocalization(localization, "bilingual", "English-first Original").localizationSource).toBe("english_fallback");
    expect(resolveEntityLocalization(localization, "bracket", "Original English").zh).toBe("官方中文（基础）");
    expect(resolveEntityLocalization(localization, "brand", "F55 LMG").zh).toBe("F55 重机枪（基础）");
    expect(resolveEntityLocalization(localization, "untranslated", "Monolith Armor Core").localizationSource).toBe("english_fallback");
  });

  it("does not mistake actual enhanced-package component specifications for Chinese names", () => {
    const localization = { entries: parseOfficialLocalizationText([
      "item_NamePOWR_AMRS_S01_JS300_SCItem=JS-300\\n[发电 S1 军用 A]",
      "Item_NameRADR_IASI_S01=DelphiDelphi RS-10\\n[雷达 S1 军用 B]",
      "item_Nametranslated=官方中文名称\\n[组件 S2 军用 A]",
    ].join("\n")) };
    for (const [id, en] of [["POWR_AMRS_S01_JS300_SCItem", "JS-300"], ["RADR_IASI_S01", "Delphi RS-10"]]) {
      expect(resolveEntityLocalization(localization, id, en)).toEqual({ zh: null, en, localizationSource: "english_fallback" });
    }
    expect(resolveEntityLocalization(localization, "translated", "Original English").zh).toBe("官方中文名称");
    expect(firstChineseLine("\r\nJS-300\r\n[发电 S1 军用 A]")).toBeNull();
  });

  it("uses the reviewed new LIVE recipe keys, retaining untranslated Monolith titles", () => {
    const localization = { entries: parseOfficialLocalizationText([
      "TheCollector_Recipes_Title_GMNI_LMG=大风格轻机枪",
      "TheCollector_Recipes_Title_GreyHeavyCombat=Monolith Armor Very Smooth",
    ].join("\n")) };
    const resolver = buildContractLocalizationResolver(localization);
    expect(resolver({ debugName: "TheCollector_GMNI_LMG", title: "Big Style LMG" }).zh).toBe("大风格轻机枪");
    expect(resolver({ debugName: "TheCollector_GreyHeavyCombatArmour", title: "Monolith Armor Very Smooth" }).localizationSource).toBe("english_fallback");
  });
  it("retains reviewed special-vehicle identities when official entries lose their English suffix", () => {
    const cases = [
      ["misc_fortune_collector_industrial", "TheCollector_ShipMod_MISC_Fortune_VehicleName", "MISC Fortune Wikelo Special", "武藏 财运 维克洛特别版"],
      ["mrai_guardian_qi_collector_indust", "TheCollector_ShipMod_MRAI_GuardianQI_VehicleName", "Mirai Guardian QI Wikelo Special", "未来 守护者 QI 维克洛特别版"],
      ["mrai_pulse_collector_civ", "TheCollector_ShipMod_MRAI_Pulse_VehicleName", "Mirai Pulse Wikelo Special", "未来 脉冲 维克洛特别版"],
      ["rsi_ursa_medivac_stealth", "TheCollector_ShipMod_URSA_Medivac_VehicleName", "RSI Ursa Medivac Wikelo Special", "RSI 大熊座 医疗 维克洛特别版"],
      ["xian_nox_collector_mod", "TheCollector_ShipMod_XIAN_Nox_VehicleName", "Aopoa Nox Wikelo Special", "奥波亚 Nox 维克洛特别版"],
    ];
    for (const [id, key, en, zh] of cases) for (const value of [zh, `${zh}\\n${en}`]) {
      const localization = { entries: parseOfficialLocalizationText(`${key},P=${value}`) };
      expect(resolveEntityLocalization(localization, id, en)).toEqual({ zh, en, localizationSource: "official_global_ini" });
    }
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
  it("automatically uses newly supplied exact official English title evidence, not similar titles", () => {
    const trade = { debugName: "TheCollector_UnmappedFixture", title: "New LIVE Task" };
    expect(buildContractLocalizationResolver({ entries: new Map() })(trade).localizationSource).toBe("english_fallback");
    const updated = { entries: parseOfficialLocalizationText("TheCollector_Fixture_Title=官方新任务\\nNew LIVE Task") };
    const resolveContract = buildContractLocalizationResolver(updated);
    expect(resolveContract(trade).zh).toBe("官方新任务");
    expect(resolveContract({ ...trade, title: "New LIVE Task Plus" }).zh).toBeNull();
    const ambiguous = { entries: parseOfficialLocalizationText([
      "TheCollector_A_Title=官方甲\\nNew LIVE Task", "TheCollector_B_Title=官方乙\\nNew LIVE Task",
    ].join("\n")) };
    expect(buildContractLocalizationResolver(ambiguous)(trade).zh).toBeNull();
  });
});
