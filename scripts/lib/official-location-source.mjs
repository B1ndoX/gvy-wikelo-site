// Explicit official keys, never fuzzy English-name matching. Generic shop labels
// are UI categories; they do not invent a physical shop or change its location.
export const LOCATION_KEYS = {
  "Shop Terminal": "kiosk_ShopTerminal",
  "Bullock's Reach": "Pyro6_Outpost_col_s_frm_indy_001",
  "Kinder Plots": "Pyro6_Outpost_col_s_frm_otlw_001",
  "The Yard": "Pyro3_Outpost_col_s_frm_otlw_002",
  "Shepherd's Rest": "Pyro3_Outpost_col_m_frm_indy_001",
  "Ashland": "Pyro5a_Outpost_col_m_trdpst_otlw_001",
  "Chawla's Beach": "Pyro4_Outpost_col_m_scrp_indy_001",
  "Everus Harbor": "Stanton1_Transfer",
  "Port Tressler": "Stanton4_Transfer",
  "Terra Gateway": "Stanton_Terra_JPStation",
  "Pyro Gateway": "Stanton_Pyro_JPStation",
  "Stanton Gateway": "Pyro_Stanton_JPStation",
  "Nyx Gateway": "Stanton_Nyx_JPStation",
  "Stanton": "Stanton",
  "Pyro": "Pyro",
  "Gaslight": "RR_P5_L2",
  "Megumi Refueling": "RR_P6_L5",
  "Endgame": "RR_P6_L3",
  "Rat's Nest": "RR_P5_L5",
  "Astor's Clearing": "Stanton4_DerelictSettlement_AstorsClearing",
  "Dunboro": "Stanton4_DerelictSettlement_Dunboro",
  "Frostbite": "Stanton4_DerelictSettlement_Frostbite",
  "Zephyr": "Stanton1_DerelictSettlement_Zephyr",
  "Arid Reach": "Pyro2_Outpost_col_s_trdpst_otlw_001",
  "Narena's Rest": "Pyro3_outpost_col_m_hmstd_indy_001",
  "Goner's Deal": "Pyro4_Outpost_col_s_trdpst_otlw_001",
  "Prophet's Peak": "Pyro5c_Outpost_col_m_hmstd_indy_001",
  "Rough Landing": "Pyro6_Outpost_col_s_trdpst_otlw_001",
  "Jackson's Swap": "Pyro2_Outpost_col_m_trdp_indy_001",
  "Frigid Knot": "Pyro3_Outpost_col_s_trdpst_indy_002",
  "Sacren's Plot": "Pyro4_Outpost_col_m_trdpst_indy_001",
  "Kabir's Post": "Pyro5a_Outpost_col_s_trdpst_indy_001",
  "Canard View": "Pyro6_Outpost_col_m_trdpst_indy_001",
  "Blackrock Exchange": "Pyro6_Outpost_col_s_trdpst_indy_001",
  "Dudley & Daughters": "RR_P6_L4",
  "Rod's Fuel 'N Supplies": "RR_P5_L4",
  "Starlight Service Station": "RR_P3_L1",
  "Starlight Service": "RR_P3_L1",
  "NBIS": "Stanton4_NewBab_NBIS_ATC",
  "IO North Tower": "PU_IONGREET01_AD_Greeting_V_BG_003",
  "Fallow Field": "Pyro4_Outpost_col_m_trdpst_otlw_001",
  "Last Landings": "Pyro6_Outpost_col_m_scrp_otlw_001",
  "Rustville": "Pyro1_Outpost_col_m_scrp_otlw_001",
  "Seer's Canyon": "Pyro5b_Outpost_col_m_scrp_otlw_001",
  "Sunset Mesa": "Pyro2_Outpost_col_m_scrp_indy_001",
  "People's Service Station Alpha": "Nyx_SocialStation_001",
  "People's Service Station Delta": "Nyx_SocialStation_002",
  "People's Service Station Theta": "Nyx_SocialStation_003",
  "People's Service Station Lambda": "Nyx_SocialStation_004",
  // Exact aliases verified by terminal IDs 833/834/838/842 (WAPSS*).
  "PSSA": "Nyx_SocialStation_001",
  "PSSD": "Nyx_SocialStation_002",
  "PSST": "Nyx_SocialStation_003",
  "PSSL": "Nyx_SocialStation_004",
  "GrimHEX": "shop_name_grimhex",
  "Grim HEX": "shop_name_grimhex",
  "Metro Center": "Lorville_Destination_Metro_Center",
  "CenterMass": "shop_name_centermass",
  "Cubby Blast": "shop_name_cubbyblast",
  "Ellroy's": "area_name_fdcrt_ellroys",
  "Skutters": "shop_name_skutters",
  "Kel-To": "shop_name_kelto",
  "Live Fire Weapons": "shop_name_livefireweapons",
  "Live Fire": "shop_name_livefireweapons",
  "Contested Zone": "ContestedZone",
  "FPS Armor": "area_name_shop_armor_gen_sml_a",
  "Armor": "area_name_shop_armor_gen_sml_a",
  "Guns": "area_name_WeaponShop",
  "Cargo Services": "shop_name_cargodepot",
  "Cargo Center Supplies": "area_name_cargo_shop",
  ...Object.fromEntries(["ARC-L1", "ARC-L2", "ARC-L4", "CRU-L1", "CRU-L4", "CRU-L5", "HUR-L1", "HUR-L2", "HUR-L3", "HUR-L4", "HUR-L5", "MIC-L1", "MIC-L2", "MIC-L3", "MIC-L4", "MIC-L5"].map(code => [code, `RR_${code.replaceAll("-", "_")}`])),
};

// Verified terminal aliases from Wiki API uex_prices.purchase.starmap_location.
// Match whole terminal labels, not arbitrary substrings elsewhere in prose.
export const TERMINAL_ALIASES = {
  "FPS Armor Everus": { canonical: "FPS Armor Everus Harbor", terminalId: 180, locationId: "ab29f65e-c792-4b1f-b23d-5810cb0ef416" },
  "FPS Armor Tressler": { canonical: "FPS Armor Port Tressler", terminalId: 183, locationId: "233238ee-adeb-4405-8045-49fa07370f37" },
  "Guns Megumi": { canonical: "Guns Megumi Refueling", terminalId: 481, locationId: "82a8afd8-cd0a-4f5b-b448-35fa1214684e" },
  "Guns Ruin": { canonical: "Guns Ruin Station", terminalId: 537, locationId: "1c585a2e-73c4-4bc5-8922-e0b434b8c8ea" },
  "Skutters Grim": { canonical: "Skutters Grim HEX", terminalId: 143, locationId: "8cda0b9b-22a8-43fe-ac33-df7a1ba9434d" },
  "Cubby Area 18": { canonical: "Cubby Blast Area 18", terminalId: 113, locationId: "c6535844-c615-494e-9dc1-c2d0c6e7190a" },
  "Cubby 18区": { canonical: "Cubby Blast 18区", terminalId: 113, locationId: "c6535844-c615-494e-9dc1-c2d0c6e7190a" },
  "Shop Astor's": { canonical: "Shop Astor's Clearing", terminalId: 265, locationId: "36b54755-ecdf-45bc-9970-d976064dc5a8" },
  "Shooters Ruin": { canonical: "Sharp Shooters - Ruin Station", terminalId: 468, locationId: "1c585a2e-73c4-4bc5-8922-e0b434b8c8ea" },
  "Shooters Orbituary": { canonical: "Sharp Shooters - Orbituary", terminalId: 446, locationId: "28e220ba-ba74-42eb-bae5-382475eba65d" },
  "Shooters Checkmate": { canonical: "Sharp Shooters - Checkmate", terminalId: 438, locationId: "07463f54-4ecd-4323-8a28-fb65b8a4ebca" },
  "Guns Dudley": { canonical: "Guns - Dudley & Daughters", terminalId: 548, locationId: "a88ae72e-15e9-43da-8a20-c14cc851d2da" },
  "Guns Rod's Fuel": { canonical: "Guns - Rod's Fuel 'N Supplies", terminalId: 488, locationId: "1711f3cc-59ef-4b08-a762-19d8691ae268" },
  "Guns Starlight": { canonical: "Guns - Starlight Service Station", terminalId: 452, locationId: "a8b1ec44-6287-4687-9a56-476663db591a" },
};

export function deriveOfficialLocations(entries) {
  return Object.fromEntries(Object.entries(LOCATION_KEYS).map(([english, key]) => {
    const entry = entries.get(key.toLowerCase());
    if (!entry) throw new Error(`Missing official location key: ${key}`);
    let zh = entry.value.split("\\n")[0].replace(/\s*\([^()]*[A-Za-z][^()]*\)\s*$/, "").trim();
    if (english === "IO North Tower") {
      if (!zh.includes("IO北塔")) throw new Error("Official IO North Tower dialogue changed; review phrase mapping");
      zh = "IO北塔";
    }
    if (!/[\u3400-\u9fff]/.test(zh)) throw new Error(`Untranslated official location key: ${key}`);
    return [english, { zh, key: entry.key }];
  }));
}

export function assertLocalizationSeries(entries, liveVersion) {
  if (!/^\d+\.\d+\.\d+ LIVE\.\d+$/.test(liveVersion)) throw new Error("Calibration requires an exact LIVE build");
  const label = entries.get("frontend_pu_version")?.value ?? "";
  const series = label.match(/\b(\d+\.\d+)(?:\.\d+)?\b/)?.[1];
  if (!series || series !== liveVersion.split(".").slice(0, 2).join(".") || /\b(?:EPTU|PTU)\b/i.test(label)) {
    throw new Error(`NAS localization series mismatch: ${label || "unknown"}; LIVE=${liveVersion}`);
  }
  return { label, series, matchedLiveVersion: liveVersion, verification: "series-only; source does not identify an exact LIVE build" };
}
