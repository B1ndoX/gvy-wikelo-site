import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiLookupCandidates,
  baseItemLookupCandidates,
  baseVehicleLookupCandidates,
  buildItemIndex,
  stableLocationSummary,
  stableMediaUrl,
} from "../scripts/lib/enrich.mjs";
import { detectSupplementRegressions } from "../scripts/lib/content-policy.mjs";

afterEach(() => vi.unstubAllGlobals());

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

describe("vehicle acquisition from its canonical resource", () => {
  const vehicle = {
    uuid: "09c9fa95-5b5a-4200-9ff8-3b288df9925b", class_name: "ARGO_ATLS",
    name: "ATLS", is_vehicle: true, web_url: "https://api.star-citizen.wiki/vehicles/argo-atls",
    uex_prices: { purchase: [] },
  };
  const trade = {
    id: "atls-trade", name: { en: "ATLS trade" },
    requirements: [{ id: "argo_atls", name: { en: "Argo ATLS" }, category: "vehicle", quantity: 1, unit: "x" }],
    rewards: [],
  };
  const previous = {
    id: "argo_atls", acquisition: [{ type: "purchase", sourceUrl: "https://uexcorp.space/atls" }],
  };

  async function enrich(purchases: unknown[] | null) {
    const fetcher = vi.fn(async (input: string) => {
      if (input.includes("/items/argo_atls?")) return new Response(JSON.stringify({ data: vehicle }));
      if (input.includes("/vehicles/argo_atls?") && purchases !== null) {
        return new Response(JSON.stringify({ data: { ...vehicle, uex_prices: { purchase: purchases } } }));
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);
    const items = await buildItemIndex({
      trades: [trade], localization: { entries: new Map() }, wikiImages: { items: [] },
    });
    return { items, fetcher };
  }

  it("uses the vehicle endpoint when the generic item endpoint omits purchase data", async () => {
    const { items, fetcher } = await enrich([{
      terminal_name: "Teach's Ship Shop - Levski", price_buy: 75600,
      uex_link: "https://uexcorp.space/atls", date_updated: "2026-11-13T12:26:57Z",
    }]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.star-citizen.wiki/api/items/argo_atls?locale=zh_CN",
      "https://api.star-citizen.wiki/api/vehicles/argo_atls?locale=zh_CN",
    ]);
    expect(items[0].acquisition).toEqual([expect.objectContaining({
      type: "purchase", price: 75600, sourceUrl: "https://uexcorp.space/atls",
    })]);
    expect(detectSupplementRegressions({ previousItems: [previous], trades: [trade], items })).toEqual([]);
  });

  it.each([[], null])("keeps the regression gate when the canonical source has no route (%s)", async purchases => {
    const { items } = await enrich(purchases);
    expect(items[0].acquisition[0].type).toBe("unknown");
    expect(detectSupplementRegressions({ previousItems: [previous], trades: [trade], items }))
      .toContain("Sourced acquisition lost: argo_atls");
  });

  it("keeps ordinary items on the item resource without querying vehicles", async () => {
    const fetcher = vi.fn(async (_input: string) => new Response(JSON.stringify({ data: {
      uuid: "fixture-rifle", class_name: "FIXTURE_RIFLE", name: "Fixture rifle", is_vehicle: false,
      uex_prices: { purchase: [{ terminal_name: "Fixture shop", price_buy: 250,
        uex_link: "https://uexcorp.space/fixture-rifle" }] },
    } })));
    vi.stubGlobal("fetch", fetcher);
    const items = await buildItemIndex({
      trades: [{ ...trade, requirements: [{ ...trade.requirements[0], id: "fixture_rifle",
        name: { en: "Fixture rifle" }, category: "weapon" }] }],
      localization: { entries: new Map() }, wikiImages: { items: [] },
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.star-citizen.wiki/api/items/fixture_rifle?locale=zh_CN",
    ]);
    expect(items[0].acquisition[0]).toMatchObject({ type: "purchase", price: 250 });
  });
});
