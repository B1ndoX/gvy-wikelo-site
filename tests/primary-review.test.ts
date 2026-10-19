import { describe, expect, it, vi } from "vitest";
import fixtureData from "./fixtures/dumper.json";
import { normalizeTrades } from "../scripts/lib/normalize.mjs";
import { fetchText } from "../scripts/lib/http.mjs";
import { primaryBundleUrl, primaryPublication, primaryReviewKey, primaryTradeFingerprint, reviewPrimaryTrades } from "../scripts/lib/primary-review.mjs";

const version = "4.10.2 LIVE.12913470";
const fixture = () => JSON.parse(JSON.stringify(fixtureData));
const normalized = (raw = fixture()) => normalizeTrades({ dumperData: raw, secondaryTrades: [], localization: { entries: new Map() }, gameVersion: version, fetchedAt: "fixture" });
const bundle = (raw = fixture()) => `const Renamed=${JSON.stringify({ ...raw, _source: "Star Citizen Game Files (TheCollector contract generator)" })};`;
const manifest = (trades = normalized(), suffix = "one") => {
  const value = { checkedAt: new Date().toISOString(), remoteVersion: version, primaryBundleUrl: `https://dumpers-repo.com/assets/index-${suffix}.js`, primaryAppliedFingerprint: primaryTradeFingerprint(trades), primaryPublication: { etag: `W/"${suffix}"`, lastModified: "2026-10-19T00:00:00.000Z", cacheable: true } };
  return { ...value, primaryReviewKey: primaryReviewKey(value) };
};
const reader = (m = manifest(), raw = fixture()) => vi.fn(async () => ({ text: bundle(raw), fromCache: false, etag: m.primaryPublication.etag }));

describe("same LIVE primary recipe review", () => {
  it("ignores ordering, whitespace, extraction times, Chinese names and derived source status", async () => {
    const stable = normalized();
    const reordered = JSON.parse(JSON.stringify(stable));
    reordered.reverse();
    reordered.forEach((trade: any) => {
      trade.requirements.reverse(); trade.rewards.reverse();
      trade.name.en = `  ${trade.name.en.replaceAll(" ", "   ")} `;
      if (trade.minReputation) trade.minReputation = `  ${trade.minReputation.replaceAll(" ", "   ")} `;
      trade.name.zh = "新官方译名"; trade.fetchedAt = "different"; trade.sourceUpdatedAt = "different";
      trade.validationStatus = "verified"; trade.conflicts = [{ field: "secondary-format" }];
      trade.requirements.forEach((entry: any) => entry.name.en = "Official RCMBNT code");
    });
    expect(primaryTradeFingerprint(reordered)).toBe(primaryTradeFingerprint(stable));
    const m = manifest(stable), raw = fixture();
    raw._extracted = "later"; raw.trades[0].costs.reverse(); raw.trades[0].rewards.reverse();
    const result = await reviewPrimaryTrades(m, stable, null, reader(m, raw));
    expect(result.primaryTradesChanged).toBe(false);
    expect(result.review).not.toBeNull();
  });

  it("performs no second bundle GET for identical reviewed inputs and does not rewrite its checkpoint", async () => {
    const stable = normalized(), m = manifest(stable), fetchBundle = reader(m);
    const first = await reviewPrimaryTrades(m, stable, null, fetchBundle);
    const checkpoint = JSON.stringify(first.review);
    const second = await reviewPrimaryTrades(m, stable, first.review, fetchBundle);
    expect(fetchBundle).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ primaryTradesChanged: false, primaryBundleRead: false, primaryReviewCacheHit: true, review: null });
    expect(JSON.stringify(first.review)).toBe(checkpoint);
  });

  it("only reviews semantics when a formatting-only publication/ETag changes", async () => {
    const stable = normalized(), old = manifest(stable), current = manifest(stable, "two");
    const before = await reviewPrimaryTrades(old, stable, null, reader(old));
    const get = vi.fn(async () => ({ text: `// UI-only deployment\n${bundle().replaceAll(",", ",\n")}`, fromCache: false, etag: current.primaryPublication.etag }));
    const after = await reviewPrimaryTrades(current, stable, before.review, get);
    expect(after.primaryBundleRead).toBe(true);
    expect(after.primaryTradesChanged).toBe(false);
    expect(after.review.key).not.toBe(before.review.key);
  });

  it.each(["quantity", "unit", "requirement", "reward", "blueprint", "reputation", "standing", "release", "title", "add", "remove"])("detects a real %s change with the same LIVE", async (change) => {
    const raw = fixture(), stable = normalized(), m = manifest(stable);
    if (change === "quantity") raw.trades[0].costs[1].amount++;
    if (change === "unit") { raw.trades[0].costs[0].amount = 24; delete raw.trades[0].costs[0].scu; }
    if (change === "requirement") raw.trades[0].costs[1].entityClass = "new-required-item";
    if (change === "reward") raw.trades[0].rewards[0].entityClass = "new-reward";
    if (change === "blueprint") raw.trades[0].blueprintPools = [];
    if (change === "reputation") raw.trades[0].repReward++;
    if (change === "standing") raw.standings["standing-new"].name = "Very Good Customer";
    if (change === "release") raw.trades[0].notForRelease = true;
    if (change === "title") raw.trades[0].title = "A renamed live contract";
    if (change === "add") raw.trades.push({ ...raw.trades[0], id: "new-trade" });
    // Removing a trade must leave a nonempty source; completely empty sources fail closed.
    if (change === "remove") stable.push({ ...stable[0], id: "old-trade" });
    const current = change === "remove" ? manifest(stable) : m;
    const result = await reviewPrimaryTrades(current, stable, null, reader(current, raw));
    expect(result.primaryTradesChanged).toBe(true);
    expect(result.review).toBeNull();
  });

  it("binds reviews to the applied trade facts, including rollback and A -> B -> A", async () => {
    const a = normalized(), b = normalized(); b[0].requirements[0].quantity++;
    const ma = manifest(a), mb = manifest(b);
    expect(ma.primaryReviewKey).not.toBe(mb.primaryReviewKey);
    const reviewedA = await reviewPrimaryTrades(ma, a, null, reader(ma));
    const actual = await reviewPrimaryTrades(mb, b, reviewedA.review, reader(mb));
    expect(actual.primaryTradesChanged).toBe(true);
    expect((await reviewPrimaryTrades(manifest(a), a, reviewedA.review, reader(ma))).primaryBundleRead).toBe(false);
    await expect(reviewPrimaryTrades(ma, b, reviewedA.review, reader(ma))).rejects.toThrow(/no longer matches/);
  });

  it("does not trust corrupt checkpoints or cache errors as evidence of no change", async () => {
    const stable = normalized(), m = manifest(stable), raw = fixture(); raw.trades[0].costs[1].amount++;
    const result = await reviewPrimaryTrades(m, stable, { schemaVersion: 1, key: m.primaryReviewKey, sourceFingerprint: "wrong" }, reader(m, raw));
    expect(result.primaryTradesChanged).toBe(true);
    await expect(reviewPrimaryTrades(m, stable, null, vi.fn(async () => { throw new Error("source offline"); }))).rejects.toThrow(/offline/);
  });

  it("rejects stale bodies, publication races, invalid quantities and unsafe source expressions", async () => {
    const stable = normalized(), m = manifest(stable);
    await expect(reviewPrimaryTrades(m, stable, null, async () => ({ text: bundle(), fromCache: true }))).rejects.toThrow(/stale/);
    await expect(reviewPrimaryTrades(m, stable, null, async () => ({ text: bundle(), fromCache: false, etag: '"other"' }))).rejects.toThrow(/changed between/);
    await expect(reviewPrimaryTrades(m, stable, null, async () => ({ text: 'const X={_source:"Star Citizen Game Files (TheCollector contract generator)",trades:runRemoteCode()};', fromCache: false, etag: m.primaryPublication.etag }))).rejects.toThrow();
    const raw = fixture(); raw.trades[0].costs[1].amount = -5;
    await expect(reviewPrimaryTrades(m, stable, null, reader(m, raw))).rejects.toThrow(/quantity/);
    expect(() => primaryTradeFingerprint([])).toThrow(/nonempty/);
    expect(() => primaryTradeFingerprint([stable[0], stable[0]])).toThrow(/duplicate/);
    const invalid = normalized(); invalid[0].requirements[0].isBlueprint = "false";
    expect(() => primaryTradeFingerprint(invalid)).toThrow(/flags/);
  });

  it("rejects PTU/EPTU and non-source bundle URLs", async () => {
    for (const channel of ["PTU", "EPTU"]) expect(() => primaryReviewKey({ ...manifest(), remoteVersion: `4.11.0 ${channel}.1` })).toThrow(/LIVE/);
    expect(() => primaryReviewKey({ ...manifest(), primaryBundleUrl: "https://other.example/remote.js" })).toThrow(/URL/);
    expect(primaryBundleUrl('<script type="module" src="/assets/index-source_1.js"></script>')).toBe("https://dumpers-repo.com/assets/index-source_1.js");
    expect(() => primaryBundleUrl("unavailable")).toThrow();
  });

  it("uses HEAD validators only, and conservatively rechecks bodies without validators", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 200, headers: { etag: 'W/"v1"', "last-modified": "Mon, 19 Oct 2026 00:00:00 GMT" } }));
    expect(await primaryPublication(manifest().primaryBundleUrl, fetcher)).toMatchObject({ etag: 'W/"v1"', cacheable: true });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "HEAD", redirect: "error" });
    const noValidators = await primaryPublication(manifest().primaryBundleUrl, async () => new Response(null, { status: 200 }));
    const m = { ...manifest(), primaryPublication: noValidators }; m.primaryReviewKey = primaryReviewKey(m);
    const first = await reviewPrimaryTrades(m, normalized(), null, reader(m));
    expect(first.primaryTradesChanged).toBe(false); expect(first.review).toBeNull();
    for (const status of [405, 501]) expect(await primaryPublication(m.primaryBundleUrl, async () => new Response(null, { status }))).toEqual(noValidators);
    await expect(primaryPublication(m.primaryBundleUrl, async () => { throw new Error("HEAD offline"); })).rejects.toThrow(/offline/);
  });

  it("supports a Last-Modified-only publication and rejects a changed GET validator", async () => {
    const m = { ...manifest(), primaryPublication: { etag: null, lastModified: "2026-10-19T00:00:00.000Z", cacheable: true } };
    m.primaryReviewKey = primaryReviewKey(m);
    const good = async () => ({ text: bundle(), fromCache: false, lastModified: "Mon, 19 Oct 2026 00:00:00 GMT" });
    expect((await reviewPrimaryTrades(m, normalized(), null, good)).primaryTradesChanged).toBe(false);
    await expect(reviewPrimaryTrades(m, normalized(), null, async () => ({ ...(await good()), lastModified: "Mon, 19 Oct 2026 00:01:00 GMT" }))).rejects.toThrow(/changed during/);
  });

  it("keeps GET validators for the race check without changing HTTP text consumers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("source body", { headers: { etag: 'W/"test"', "last-modified": "Mon, 19 Oct 2026 00:00:00 GMT" } })));
    try { expect(await fetchText("https://fixture.example/source")).toMatchObject({ text: "source body", fromCache: false, etag: 'W/"test"' }); }
    finally { vi.unstubAllGlobals(); }
  });
});
