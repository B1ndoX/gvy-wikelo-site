import { readFile, stat } from "node:fs/promises";
import { sha256 } from "./http.mjs";

const CJK_RE = /[\u3400-\u9fff]/;
export const OFFICIAL_KEY_ALIASES = {
  anvl_hornet_f7_mk2_collector_mod: "TheCollector_ShipMod_F7_Hornet_VehicleName",
  argo_atls_geo_collector_grad01: "TheCollector_Mod_ATLS_Geo_Grad1_Name",
  argo_atls_geo_collector_grad02: "TheCollector_Mod_ATLS_Geo_Grad2_Name",
  argo_atls_geo_collector_grad03: "TheCollector_Mod_ATLS_Geo_Grad3_Name",
  harvestable_armillaria: "harvestable_Armillaria",
  bp_reward_collectormaterial_001: "Blueprints",
  bp_reward_collectormaterial_002: "Blueprints",
  bp_reward_cds_combat_superheavy_backpack_01_03_01: "Blueprints",
  bp_reward_cds_combat_superheavy_suit_01_03_01: "Blueprints",
  bp_reward_cds_combat_superheavy_helmet_01_03_01: "Blueprints",
  carryable_1h_cy_banu_favour_wikelo: "TheCollector_Coin_Name",
  carryable_1h_cy_banu_favour_wikelo_special: "TheCollector_PolarisBit_Name",
  carryable_1h_cy_hadesian_fragment_1_large_pristine_a: "item_NameAlienAA_fragment_1_large_pristine_a",
  carryable_1h_cy_physical_currency_scrip_council_1: "item_name_Physical_Currency_Scrip_Council_1",
  carryable_1h_cy_physical_currency_scrip_merc_1: "item_name_Physical_Currency_Scrip_Merc_1",
  fps_consumable_harddrive_delving_hardened_asd_red: "ItemGathering_ASD_HardDrive_Name",
  carryable_1h_sq_pyro_serverblade_5: "item_name_ExecHangar_CompBoard_05",
  carryable_1h_cy_advocacy_badge: "item_NameCommon_AdvocacyBadge",
  carryable_1h_cy_medal_1_damaged_a: "item_NameMedal_1_damaged_a",
  carryable_1h_cy_medal_1_damaged_b: "item_NameMedal_1_damaged_b",
  carryable_1h_cy_medal_1_damaged_c: "item_NameMedal_1_damaged_c",
  carryable_1h_cy_medal_1_damaged_d: "item_NameMedal_1_damaged_d",
  carryable_1h_cy_medal_1_pristine_a: "item_NameMedal_1_pristine_a",
  carryable_1h_cy_medal_1_pristine_b: "item_NameMedal_1_pristine_b",
  carryable_1h_cy_medal_1_pristine_c: "item_NameMedal_1_pristine_c",
  carryable_1h_cy_medal_1_pristine_d: "item_NameMedal_1_pristine_d",
  carryable_1h_cy_medal_1_worn_a: "item_NameMedal_1_worn_a",
  carryable_1h_cy_medal_1_worn_b: "item_NameMedal_1_worn_b",
  carryable_1h_cy_medal_1_worn_c: "item_NameMedal_1_worn_c",
  carryable_1h_cy_medal_1_worn_d: "item_NameMedal_1_worn_d",
  carryable_tbo_asdreward_xtl1: "Hockrow_FacilityDelve_P3M1_Sample01_Name",
  carryable_tbo_asdreward_xtl2: "Hockrow_FacilityDelve_P3M1_Sample02_Name",
  carryable_tbo_asdreward_xtl3: "Hockrow_FacilityDelve_P3M1_Sample03_Name",
  carryable_tbo_asdreward_pwl1: "Hockrow_FacilityDelve_P3M1_Sample04_Name",
  carryable_tbo_asdreward_pwl2: "Hockrow_FacilityDelve_P3M1_Sample05_Name",
  carryable_tbo_asdreward_pwl3: "Hockrow_FacilityDelve_P3M1_Sample06_Name",
  carryable_tbo_asdreward_rgl1: "Hockrow_FacilityDelve_P3M1_Sample07_Name",
  carryable_tbo_asdreward_rgl2: "Hockrow_FacilityDelve_P3M1_Sample08_Name",
  carryable_tbo_asdreward_rgl3: "Hockrow_FacilityDelve_P3M1_Sample09_Name",
};

export const CONTRACT_KEY_ALIASES = {
  thecollector_combatclothing: "TheCollector_Recipes_Title_SuperHeavyCombat",
  thecollector_intro: "TheCollector_Intro_Title",
  thecollector_foodorder: "TheCollector_Lunch_Title",
  thecollector_favours_caranite: "TheCollector_Conversion_Favors_Title",
  thecollector_favours_councilscrip: "TheCollector_Conversion_Favors_Title",
  thecollector_favours_irradiatedpearls: "TheCollector_Conversion_Favors_Title",
  thecollector_favours_mercscrip: "TheCollector_Conversion_Favors_Title",
  thecollector_favours_polarisparts: "TheCollector_Conversion_SpecialFavors_Title",
  thecollector_vehicle_ground_nox: "TheCollector_Ships_Nox_Title",
  thecollector_vehicle_ground_pulse: "TheCollector_Ships_Pulse_Title",
  thecollector_vehicle_ground_ursa_medical: "TheCollector_Ships_Ursa_Title",
  thecollector_vehicle_large_anvil_asgard: "TheCollector_Ships_Anvil_Asgard_Title",
  thecollector_vehicle_large_connie_tau: "TheCollector_Ships_Constellation_Taurus_Title",
  thecollector_vehicle_large_crusader_a2: "TheCollector_Ships_Crusader_A2_Title",
  thecollector_vehicle_large_f8c_milt: "TheCollector_Ships_F8C_Milt_Title",
  thecollector_vehicle_large_f8c_stealth: "TheCollector_Ships_F8C_Stealth_Title",
  thecollector_vehicle_large_prowler_utility: "TheCollector_Ships_Prowler_Util_Title",
  thecollector_vehicle_large_starlancer_tac: "TheCollector_Ships_Starlancer_ATC_Title",
  thecollector_vehicle_large_starlancer_max: "TheCollector_Ships_Starlift_Max_Title",
  thecollector_vehicle_medium_f7_mk2: "TheCollector_Ships_F7_MK2_Title",
  thecollector_vehicle_medium_firebird: "TheCollector_Ships_Firebird_Title",
  thecollector_vehicle_medium_guardian: "TheCollector_Ships_Guardian_Title",
  thecollector_vehicle_medium_guardianmx: "TheCollector_Ships_GuardianMX_Title",
  thecollector_vehicle_medium_guardianqi: "TheCollector_Ships_GuardianQI_Title",
  thecollector_vehicle_medium_peregrine: "TheCollector_Ships_Peregrine_Title",
  thecollector_vehicle_medium_scorpius: "TheCollector_Ships_Scorpius_Title",
  thecollector_vehicle_medium_spirit_c1: "TheCollector_Ships_Spirit_C1_Title",
  thecollector_vehicle_medium_starfighter_inferno: "TheCollector_Ships_Starfighter_Inferno_Title",
  thecollector_vehicle_medium_starfighter_ion: "TheCollector_Ships_Starfighter_Ion_Title",
  thecollector_vehicle_medium_terrapin_medic: "TheCollector_Ships_Terrapin_Medic_Title",
  thecollector_vehicle_medium_zeuscl: "TheCollector_Ships_ZeusCL_Title",
  thecollector_vehicle_medium_zeuses: "TheCollector_Ships_ZeusES_Title",
  thecollector_vehicle_small_argo_raft: "TheCollector_Ships_ARGO_Raft_Title",
  thecollector_vehicle_small_drake_golem: "TheCollector_Ships_Drake_Golem_Title",
  thecollector_vehicle_small_fortune: "TheCollector_Ships_Fortune_Indus_Title",
  thecollector_vehicle_small_intrepid: "TheCollector_Ships_Intrepid_Title",
  thecollector_vehicle_small_kruger_wolf: "TheCollector_Ships_Kruger_Wolf_Title",
  thecollector_vehicle_small_kruger_wolf_unique: "TheCollector_Ships_Wolf_Unique_Title",
  thecollector_vehicle_small_misc_prospector: "TheCollector_Ships_MISC_Prospector_Title",
  thecollector_vehicle_small_rsi_meteor: "TheCollector_Ships_Meteor_Title",
  thecollector_vehicle_super_idris: "TheCollector_Ships_Idris_Title",
  thecolllector_vehicle_ground_atls_rednblue: "TheCollector_Mod_ATLS_Geo_Grad3_Name",
  thecolllector_vehicle_ground_atls_orangengrey: "TheCollector_Mod_ATLS_Geo_Grad2_Name",
  thecolllector_vehicle_ground_atls_whitengreen: "TheCollector_Mod_ATLS_Geo_Grad1_Name",
  thecollector_vehicle_drakeclipper: "TheCollector_Recipes_Title_DrakeClipper",
  thecollector_vehicle_l22_wolf: "TheCollector_Recipes_Title_L22Wolf",
  thecollector_vehicle_ground_atls_ikti: "TheCollector_Recipes_Title_AtlsPew",
  thecollector_vehicle_ground_atls_ikti_geo: "TheCollector_Recipes_Title_AtlsJump",
  thecollector_vehicle_polaris: "TheCollector_Menu_Title_PolarisShip",
  thecollector_vehicle_apollo_triage: "TheCollector_Recipes_Title_ApolloSkin",
  thecollector_gg_venturesuit: "TheCollector_Trade_GG_VentureSuilt_Name",
  thecollector_orbarm: "TheCollector_Recipes_Title_SandArmour",
  thecollector_spikeyarmor: "TheCollector_Recipes_Title_SpikeyArmor",
  thecollector_gg_s71: "TheCollector_Trade_GG_S71_Name",
  thecollector_bigbooma: "TheCollector_Recipes_Title_BigBooma",
  thecollector_nov_molten: "TheCollector_Recipes_Title_Molten",
  thecollector_f55: "TheCollector_Recipes_Title_F55",
  thecollector_gg_coda: "TheCollector_Trade_GG_Coda_Name",
  thecollector_orbvolt_kopskull: "TheCollector_Recipes_Title_KopSkull",
  thecollector_orbvolt_koptooth: "TheCollector_Recipes_Title_KopTooth",
  thecollector_orbvolt_miltskull: "TheCollector_Recipes_Title_MiltSkull",
  thecollector_orbvolt_milttooth: "TheCollector_Recipes_Title_MiltTooth",
  thecollector_superheavycombat: "TheCollector_Recipes_Title_SuperHeavyCombat",
  thecollector_nov_lotsofzipzap: "TheCollector_Recipes_Title_LotsOfZipZap",
  thecollector_ad_hush: "TheCollector_Recipes_Title_Hush",
  thecollector_nonepistol: "TheCollector_Recipes_Title_NonePistol",
  thecollector_sb_desertarm: "TheCollector_Menu_Title_DesertArm",
  thecollector_ao_irrarm: "TheCollector_Recipes_Title_IrrArm",
  thecollector_sb_volt_desert: "TheCollector_Menu_Title_DesertVolt",
  thecollector_sb_navyarm: "TheCollector_Menu_Title_NavyArm",
  thecollector_ao_voltthwack: "TheCollector_Recipes_Title_VoltThwack",
  thecollector_gg_karna: "TheCollector_Trade_GG_Karna_Name",
  thecollector_redhunterarmour: "TheCollector_Recipes_Title_RedHunterArmor",
  thecollector_geminishotgun: "TheCollector_Recipes_Title_GMNI_Shotgun",
  thecollector_nov_heavyutil: "TheCollector_Recipes_Title_HeavyUtil",
  thecollector_ad_zapzip: "TheCollector_Recipes_Title_ZipZap",
  thecollector_vglflightsuit: "TheCollector_Recipes_Title_VGLflightsuit",
  thecollector_battle: "TheCollector_Recipes_Title_Battle",
  thecollector_apar_hmg: "TheCollector_Recipes_Title_aparGatlingGun",
  thecollector_sb_volt_navy: "TheCollector_Menu_Title_NavyVolt",
  thecollector_gg_explorationsuit: "TheCollector_Trade_GG_ExpolrationSuit_Name",
  thecollector_sb_junglearm: "TheCollector_Menu_Title_JungleArm",
  thecollector_icansee: "TheCollector_Recipes_Title_Bino",
  thecollector_gg_xanthulesuit: "TheCollector_Trade_GG_XanthuleSuit_Name",
  thecollector_slimylmg: "TheCollector_Recipes_Title_SlimyLMG",
  thecollector_noneassultrifle: "TheCollector_Recipes_Title_NoneAR",
  thecollector_sb_volt_jungle: "TheCollector_Menu_Title_JungleVolt",
};

const englishIndexCache = new WeakMap();

export async function loadOfficialLocalization(sourcePath, derivedPath = null) {
  try {
    const buffer = await readFile(sourcePath);
    const sourceHash = sha256(buffer);
    const entries = parseOfficialLocalizationText(buffer.toString("utf8"));
    const sourceStat = await stat(sourcePath);
    return {
      entries,
      metadata: {
        sourcePath,
        sourceSha256: sourceHash,
        sourceUpdatedAt: sourceStat.mtime.toISOString(),
        usingDerivedSnapshot: false,
      },
    };
  } catch (error) {
    if (!derivedPath) throw error;
    const snapshot = JSON.parse(await readFile(derivedPath, "utf8"));
    const entries = new Map(
      Object.entries(snapshot.entries || {}).map(([lookupKey, entry]) => [lookupKey, entry]),
    );
    if (!entries.size || !snapshot.sourceSha256) {
      throw new Error(`Derived official localization snapshot is invalid: ${derivedPath}`);
    }
    return {
      entries,
      metadata: {
        sourcePath: snapshot.sourcePath,
        sourceSha256: snapshot.sourceSha256,
        sourceUpdatedAt: snapshot.sourceUpdatedAt,
        usingDerivedSnapshot: true,
        derivedSnapshotPath: derivedPath,
        derivedGeneratedAt: snapshot.generatedAt,
      },
    };
  }
}

export function parseOfficialLocalizationText(text) {
  const entries = new Map();
  const withoutBom = String(text).replace(/^\uFEFF/, "");
  for (const rawLine of withoutBom.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#") || line.startsWith("//")) continue;
    const separator = rawLine.indexOf("=");
    if (separator < 1) continue;
    const key = rawLine.slice(0, separator).replace(/^\uFEFF/, "").trim();
    const value = rawLine.slice(separator + 1).trim();
    const lookupKey = key.replace(/,[a-z]+$/i, "");
    entries.set(lookupKey.toLowerCase(), { key, value });
  }
  return entries;
}

function firstChineseLine(value) {
  const lines = String(value ?? "")
    .split("\\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => CJK_RE.test(line)) ?? null;
}

function officialChinese(value, englishName, key = "") {
  const line = firstChineseLine(value);
  if (!line) return null;
  const normalizedEnglish = String(englishName ?? "").trim();
  if (normalizedEnglish && line.toLowerCase().endsWith(normalizedEnglish.toLowerCase())) {
    const stripped = line.slice(0, line.length - normalizedEnglish.length).trim();
    return stripped || line;
  }
  // Some older commodity values concatenate Chinese and English, but current
  // bilingual values use a literal `\n`. Never let the first A in a grade
  // such as “（AAA 级）” be mistaken for the start of an English suffix.
  if (String(key).toLowerCase().startsWith("items_commodities_") && !String(value).includes("\\n")) {
    const bundledLanguages = line.match(/^([\u3400-\u9fff][\u3400-\u9fff（）·\-]*)[A-Za-z]/);
    if (bundledLanguages?.[1]) return bundledLanguages[1];
  }
  return line;
}

function normalizedEnglish(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
}

function commodityKeyCandidates(entityClass) {
  const normalizedClass = String(entityClass ?? "").toLowerCase();
  const direct = `items_commodities_${normalizedClass}`;
  const match = normalizedClass.match(/^harvestable_(?:ore|mineral)_1h_(.+)$/);
  if (!match) return [direct];
  let resource = match[1];
  let suffix = "";
  if (resource.endsWith("ore")) {
    resource = resource.slice(0, -3);
    suffix = "_ore";
  } else if (resource.endsWith("pure")) {
    resource = resource.slice(0, -4);
    suffix = "_pure";
  }
  return [`items_commodities_${resource}${suffix}`, direct];
}

export function officialLocalizationKeyCandidates(entityClass) {
  if (!entityClass) return [];
  return [
    OFFICIAL_KEY_ALIASES[String(entityClass).toLowerCase()],
    `item_Name${entityClass}`,
    `vehicle_Name${entityClass}`,
    `item_name_${entityClass}`,
    `vehicle_name_${entityClass}`,
    ...commodityKeyCandidates(entityClass),
  ].filter(Boolean);
}

function officialEnglishIndex(entries) {
  const cached = englishIndexCache.get(entries);
  if (cached) return cached;
  const index = new Map();
  for (const entry of entries.values()) {
    if (!/(?:item|vehicle).*name|items_commodities_/i.test(entry.key)) continue;
    const lines = String(entry.value ?? "").split("\\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (CJK_RE.test(line)) continue;
      const normalized = normalizedEnglish(line);
      if (normalized && !index.has(normalized)) index.set(normalized, entry);
    }
  }
  englishIndexCache.set(entries, index);
  return index;
}

function officialEntryByEnglish(localization, englishName) {
  const normalized = normalizedEnglish(englishName);
  if (!normalized) return null;
  const exact = officialEnglishIndex(localization.entries).get(normalized);
  if (exact) return exact;
  for (const entry of localization.entries.values()) {
    if (!/(?:item|vehicle).*name|items_commodities_/i.test(entry.key)) continue;
    const line = firstChineseLine(entry.value);
    if (line && normalizedEnglish(line).endsWith(normalized)) return entry;
  }
  return null;
}

export function resolveEntityLocalization(localization, entityClass, englishName) {
  if (!entityClass) return { zh: null, en: englishName, localizationSource: "english_fallback" };
  const candidates = officialLocalizationKeyCandidates(entityClass);
  for (const key of candidates) {
    const entry = localization.entries.get(key.toLowerCase());
    const zh = officialChinese(entry?.value, englishName, entry?.key);
    if (zh) return { zh, en: englishName, localizationSource: "official_global_ini" };
    const officialCode = String(entry?.value ?? "")
      .split("\\n")
      .map((line) => line.trim())
      .find(Boolean);
    if (/^RCMBNT-(?:XTL|PWL|RGL)-[123]$/.test(officialCode ?? "")) {
      return { zh: null, en: officialCode, localizationSource: "official_global_ini" };
    }
  }
  const englishEntry = officialEntryByEnglish(localization, englishName);
  const englishMatchedZh = officialChinese(englishEntry?.value, englishName, englishEntry?.key);
  if (englishMatchedZh) return { zh: englishMatchedZh, en: englishName, localizationSource: "official_global_ini" };
  return { zh: null, en: englishName, localizationSource: "english_fallback" };
}

export function buildContractLocalizationResolver(localization) {
  return (trade) => {
    const debugName = String(trade.debugName ?? "").replace(/\(.+$/, "").toLowerCase();
    const key = CONTRACT_KEY_ALIASES[debugName];
    const entry = key ? localization.entries.get(key.toLowerCase()) : null;
    const zh = firstChineseLine(entry?.value);
    if (zh) return { zh, en: trade.title, localizationSource: "official_global_ini", key: entry.key };
    return { zh: null, en: trade.title, localizationSource: "english_fallback", key: null };
  };
}

export function cleanLocalizedName(name) {
  const { key: _key, ...publicName } = name || {};
  if (!publicName.zh) return publicName;
  const zh = name.zh.replace(/\s*\n.*$/s, "").trim();
  return { ...publicName, zh: zh || null };
}
