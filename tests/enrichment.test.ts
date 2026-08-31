import { describe, expect, it } from "vitest";
import {
  apiLookupCandidates,
  baseItemLookupCandidates,
  baseVehicleLookupCandidates,
  stableLocationSummary,
  stableMediaUrl,
} from "../scripts/lib/enrich.mjs";

describe("item enrichment lookup fallbacks", () => {
  it("looks up public records by both internal id and English-name slug", () => {
    expect(apiLookupCandidates({
      id: "carryable_1h_sq_pyro_serverblade_5",
      name: { en: "DCHS-05 Orbital Positioning Comp-Board" },
    })).toEqual([
      "carryable_1h_sq_pyro_serverblade_5",
      "dchs-05-orbital-positioning-comp-board",
    ]);
  });

  it("can identify a clearly-labelled base vehicle image fallback", () => {
    expect(baseVehicleLookupCandidates(
      { name: { en: "Kruger L-22 Alpha Wolf Wikelo War Special" } },
      { name: "Kruger L-22 Alpha Wolf Wikelo War Special" },
    )).toContain("l-22-alpha-wolf");
    expect(baseVehicleLookupCandidates(
      { id: "drak_clipper_collector_military", name: { en: "Drake Clipper Wikelo War Special" } },
      { name: "Drake Clipper Wikelo War Special" },
    )).toContain("drak_clipper");
  });

  it("can identify standard item records for special paint variants", () => {
    expect(baseItemLookupCandidates(
      { id: "gmni_rifle_ballistic_01_iae2023", name: { en: "S71 Ascension Rifle" } },
      { name: "S71 \"Ascension\" Rifle" },
    )).toEqual(expect.arrayContaining(["gmni_rifle_ballistic_01", "s71-rifle"]));
  });

  it("keeps acquisition locations stable when the upstream array order changes", () => {
    const locations = ["Guns Patch City", "Guns Starlight", "Guns Gaslight", "Guns Patch City"];
    expect(stableLocationSummary(locations)).toEqual(stableLocationSummary([...locations].reverse()));
    expect(stableLocationSummary(locations)).toMatchObject({ total: 3 });
  });

  it("removes cache-busting media query strings without changing page URLs", () => {
    expect(stableMediaUrl("https://media.starcitizen.tools/9/97/item.png?abc12#preview"))
      .toBe("https://media.starcitizen.tools/9/97/item.png");
    expect(stableMediaUrl("https://uexcorp.space/items/info?name=item&tab=about"))
      .toBe("https://uexcorp.space/items/info?name=item&tab=about");
  });
});
