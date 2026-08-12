import { describe, expect, it } from "vitest";
import { semanticChangeSummary, semanticFingerprint } from "../scripts/lib/semantic-fingerprint.mjs";

const input = {
  gameVersion: "4.9.0 LIVE.12344265",
  trades: [{ id: "trade-a", fetchedAt: "2026-08-01T00:00:00.000Z", requirements: [{ id: "item-a", quantity: 1 }] }],
  items: [{ id: "item-a", sourceUpdatedAt: "2026-08-01T00:00:00.000Z", imagePath: "/image.webp" }],
  localizationDictionary: { "item-a": { zh: "物品", en: "Item" } },
};

describe("semantic data change detection", () => {
  it("ignores timestamps, array order, and secondary source version noise", () => {
    const reordered = {
      ...input,
      trades: [{ ...input.trades[0], fetchedAt: "2026-08-12T00:00:00.000Z" }],
      items: [{ ...input.items[0], sourceUpdatedAt: "2026-08-12T00:00:00.000Z", sourceGameVersion: "4.9.0-LIVE.999" }],
    };
    expect(semanticFingerprint(reordered)).toBe(semanticFingerprint(input));
  });

  it("detects real additions, modifications, removals, and LIVE changes", () => {
    const next = {
      gameVersion: "4.10.0 LIVE.12400000",
      trades: [{ id: "trade-a", requirements: [{ id: "item-a", quantity: 2 }] }, { id: "trade-b" }],
      items: [{ id: "item-b" }],
    };
    expect(semanticChangeSummary(
      { gameVersion: input.gameVersion, trades: input.trades, items: input.items },
      next,
    )).toEqual({
      versionChanged: true,
      trades: { added: 1, modified: 1, removed: 0 },
      items: { added: 1, modified: 0, removed: 1 },
    });
  });
});
