import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, cp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { sha256 } from "../scripts/lib/http.mjs";
import { exactImageRecord, fillMissingImages, imageCandidates, imageOnlyDocuments, imageQueue, imageUrl, inspectImage, rejectedImage, IMAGE_RETRY_MS } from "../scripts/lib/image-refresh.mjs";
import { buildItemIndex } from "../scripts/lib/enrich.mjs";

const roots: string[] = [];
async function temporary() {
  const root = await mkdtemp(path.join(tmpdir(), "wikelo-image-test-"));
  roots.push(root);
  return root;
}
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const LIVE = "4.10.2 LIVE.12913470";
const now = Date.parse("2026-10-20T12:00:00Z");
const url = "https://media.starcitizen.tools/a/ab/Shadowflux_Arms.png";
const item = (id = "armor_shadowflux") => ({ id, name: { en: "Armor Shadowflux", zh: "护甲 Shadowflux", localizationSource: "official_global_ini" },
  category: "Arms (Armor)", imagePath: null, imageKind: "none", imageSourceUrl: null,
  acquisition: [{ type: "craft", sourceUrl: "https://api.star-citizen.wiki/blueprints/armor" }],
  crafting: { ingredients: [{ id: "ore", quantity: 2, unit: "SCU" }] }, requiredBy: [], rewardedBy: [], descriptionZh: "护甲" });
const record = (id = "armor_shadowflux") => ({ uuid: "uuid-123", class_name: id, name: "Armor Shadowflux", version: "4.10.2-LIVE.12913470",
  web_url: "https://api.star-citizen.wiki/items/armor-shadowflux", images: [{ original_url: url, thumbnail_url: "https://media.starcitizen.tools/thumb/a/ab/Shadowflux_Arms.png/600px.webp" }] });
const mapping = () => ({ schemaVersion: "1.0.0", reviewItemIds: [] as string[], items: [] as unknown[] });
let png: Buffer;
beforeAll(async () => {
  const pixels = Buffer.alloc(320 * 240 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + Math.floor(i / 13)) % 256;
  png = await sharp(pixels, { raw: { width: 320, height: 240, channels: 3 } }).png().toBuffer();
});
function network() {
  return vi.fn(async (input: string) => input.startsWith("https://api.star-citizen.wiki/api/")
    ? new Response(JSON.stringify({ data: record() }), { headers: { "content-type": "application/json" } })
    : new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } }));
}

describe("bounded image discovery policy", () => {
  it("only queues missing physical items, not blueprints, exact/AI/community/reference images", () => {
    const missing = item();
    const items = [missing, { ...item("bp_reward_x"), category: "blueprint" }, ...["exact", "ai_redraw", "community", "base_model"].map(kind => ({ ...item(kind), imagePath: "/existing.webp", imageKind: kind }))];
    expect(imageQueue(items, {}, LIVE, [], now).map((entry: any) => entry.item.id)).toEqual([missing.id]);
  });
  it("batches four, fairly rotates the rest, observes cooldown and retries after 24h", async () => {
    const items = Array.from({ length: 7 }, (_, n) => item(`missing-${n}`));
    const root = await temporary();
    const result = await fillMissingImages({ items, mapping: mapping(), gameVersion: LIVE, projectRoot: root, now, lookup: async () => null });
    expect(result.outcomes).toHaveLength(4);
    expect(imageQueue(items, result.state, LIVE, [], now + 6 * 3600_000).map((entry: any) => entry.item.id)).toEqual(["missing-4", "missing-5", "missing-6"]);
    expect(imageQueue(items.slice(0, 4), result.state, LIVE, [], now + IMAGE_RETRY_MS - 1)).toHaveLength(0);
    expect(imageQueue(items.slice(0, 4), result.state, LIVE, [], now + IMAGE_RETRY_MS)).toHaveLength(4);
  });
  it("cache loss, future clock, new identity/version or an unpublished success cannot permanently hide missing images", async () => {
    const original = item(); const root = await temporary();
    const result = await fillMissingImages({ items: [original], mapping: mapping(), gameVersion: LIVE, projectRoot: root, now, lookup: async () => null });
    expect(imageQueue([original], result.state, LIVE, [], now)).toHaveLength(0);
    expect(imageQueue([original], {}, LIVE, [], now)).toHaveLength(1);
    expect(imageQueue([original], result.state, LIVE, [], now - 1)).toHaveLength(1);
    expect(imageQueue([{ ...original, name: { ...original.name, en: "Different Variant" } }], result.state, LIVE, [], now)).toHaveLength(1);
    expect(imageQueue([original], result.state, "4.11.0 LIVE.1", [], now)).toHaveLength(1);
    Object.values(result.state.attempts).forEach((attempt: any) => { attempt.status = "applied"; });
    expect(imageQueue([original], result.state, LIVE, [], now)).toHaveLength(1);
    const corrupt = await fillMissingImages({ items: [original], mapping: mapping(), state: null, gameVersion: LIVE, projectRoot: root, now, lookup: async () => null });
    expect(corrupt.outcomes).toHaveLength(1);
  });
  it("requires exact class/UUID and LIVE provenance, never similar names or PTU/EPTU variants", () => {
    expect(exactImageRecord(item(), record())).toBe(true);
    expect(exactImageRecord(item("uuid-123"), record())).toBe(true);
    expect(exactImageRecord(item(), { ...record(), class_name: "armor_base" })).toBe(false);
    expect(exactImageRecord(item(), { ...record(), version: "4.11.0-LIVE.1" }, LIVE)).toBe(false);
    for (const version of ["4.11.0-PTU.1", "4.11.0-EPTU.1", "4.11.0", "LIVE.1 PTU"]) expect(exactImageRecord(item(), { ...record(), version })).toBe(false);
  });
  it("prefers original URLs, ignores API order/cache parameters and excludes placeholders/untrusted hosts", () => {
    const entries = [record().images[0], { original_url: `${url}?new#x` }, { thumbnail_url: "https://media.starcitizen.tools/Placeholderv2.png" }];
    expect(imageCandidates({ images: entries })).toEqual(imageCandidates({ images: [...entries].reverse() }));
    expect(imageCandidates(record())[0].url).toBe(url);
    for (const bad of ["http://media.starcitizen.tools/a.png", "https://evil.test/a.png", "https://media.starcitizen.tools:999/a.png", "https://user@media.starcitizen.tools/a.png", "https://media.starcitizen.tools/%50laceholder.png"]) expect(imageUrl(bad)).toBeNull();
  });
});

describe("image byte validation and immutable assets", () => {
  it("fully decodes PNG/JPEG/WebP while preserving natural dimensions and original hash", async () => {
    for (const [format, mime] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]]) {
      const bytes = await sharp(png).toFormat(format as any).toBuffer();
      expect(await inspectImage(bytes, mime)).toMatchObject({ width: 320, height: 240, sha256: sha256(bytes) });
    }
  });
  it("rejects HTML-200, mislabeled MIME, truncated data, tiny/blank/transparent and extreme-ratio images", async () => {
    for (const [bytes, mime] of [[Buffer.from("<html>".repeat(300)), "image/png"], [png, "text/html"], [png.subarray(0, 60), "image/png"]] as const) await expect(inspectImage(bytes, mime)).rejects.toThrow();
    for (const options of [{ width: 40, height: 40, channels: 3 }, { width: 320, height: 240, channels: 3 }, { width: 320, height: 240, channels: 4 }, { width: 1800, height: 100, channels: 3 }]) {
      const bytes = await sharp({ create: { ...options, background: { r: 0, g: 0, b: 0, alpha: 0 } } } as any).png().toBuffer();
      await expect(inspectImage(bytes, "image/png")).rejects.toThrow();
    }
  });
  it("uses a fresh API read and exact original bytes; repeat runs do not fetch or mutate published images", async () => {
    const root = await temporary(); const fetch = network(); vi.stubGlobal("fetch", fetch);
    const original = item();
    const result = await fillMissingImages({ items: [original], gameVersion: LIVE, projectRoot: root, cacheDir: path.join(root, "http"), mapping: mapping(), now });
    expect(result.changed).toBe(true); expect(result.outcomes[0].status).toBe("applied");
    const updated = result.items[0];
    expect(updated.imagePath).toBe(`/images/auto/${sha256(png)}.png`);
    expect(await readFile(path.join(root, "public", updated.imagePath))).toEqual(png);
    expect(result.mapping.items[0]).toMatchObject({ sha256: sha256(png), width: 320, height: 240, sourceType: "wiki_api_exact_identity", hasWatermark: "unknown" });
    expect(fetch.mock.calls.map(call => call[0])).toEqual(["https://api.star-citizen.wiki/api/items/armor_shadowflux?locale=en_EN", url]);
    fetch.mockClear();
    const second = await fillMissingImages({ items: result.items, mapping: result.mapping, state: result.state, gameVersion: LIVE, projectRoot: root, now });
    expect(second.changed).toBe(false); expect(second.items).toEqual(result.items); expect(second.mapping).toEqual(result.mapping); expect(fetch).not.toHaveBeenCalled();
  });
  it("network failure/old HTTP cache/bad media never blocks LIVE facts or manufactures a picture", async () => {
    const root = await temporary(); const cacheDir = path.join(root, "http"); await mkdir(cacheDir);
    const api = "https://api.star-citizen.wiki/api/items/armor_shadowflux?locale=en_EN";
    await writeFile(path.join(cacheDir, `${sha256(api)}.txt`), JSON.stringify({ data: record() }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Missing", { status: 404 })));
    const options = { items: [item()], gameVersion: LIVE, projectRoot: root, cacheDir, mapping: mapping(), now };
    const missing = await fillMissingImages(options);
    expect(missing.changed).toBe(false); expect(missing.items).toEqual(options.items);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.startsWith("https://api.") ? new Response(JSON.stringify({ data: record() })) : new Response("<html>blocked</html>".repeat(100), { headers: { "content-type": "text/html" } })));
    const bad = await fillMissingImages(options);
    expect(bad.changed).toBe(false); expect(bad.outcomes[0].status).toBe("failed");
    await expect(readdir(path.join(root, "public/images/auto"))).rejects.toThrow();
  });
  it("only records discovery candidates for explicitly reviewed existing AI/reference images", async () => {
    const root = await temporary(); const fetch = network(); vi.stubGlobal("fetch", fetch);
    const original = { ...item(), imagePath: "/existing-ai.webp", imageKind: "ai_redraw" };
    const result = await fillMissingImages({ items: [original], mapping: { ...mapping(), reviewItemIds: [original.id] }, gameVersion: LIVE, projectRoot: root, now });
    expect(result.changed).toBe(false); expect(result.items).toEqual([original]); expect(result.reviewed).toHaveLength(1); expect(result.mapping.items).toHaveLength(0);
  });
  it("rejects non-LIVE datasets before any request", async () => {
    const root = await temporary(); const lookup = vi.fn();
    await expect(fillMissingImages({ items: [item()], mapping: mapping(), gameVersion: "4.11.0 PTU.1", projectRoot: root, now, lookup })).rejects.toThrow("LIVE");
    expect(lookup).not.toHaveBeenCalled();
  });
});

function baseline() {
  const tradeDocument = { schemaVersion: "1.0.0", gameVersion: LIVE, generatedAt: "old", sourceStatus: [], trades: [] };
  const itemDocument = { schemaVersion: "1.0.0", generatedAt: "old", items: [item()] };
  const metadata = { gameVersion: LIVE, generatedAt: "old", totalTrades: 0, totalItems: 1 };
  const localization = { entries: { [item().id]: item().name } };
  const versionedData = { schemaVersion: "1.0.0", generatedAt: "old", datasets: [{ gameVersion: LIVE, generatedAt: "old", sourceStatus: [], trades: [], items: itemDocument.items }] };
  return { tradeDocument, itemDocument, metadata, localization, versionedData };
}

describe("image-only persistence guards", () => {
  it("keeps snapshot/data synchronized and forbids changing acquisition, quantities, names, IDs or verified pictures", () => {
    const before = baseline();
    const updated = { ...item(), imagePath: "/images/auto/verified.png", imageSourceUrl: url, imageKind: "exact" };
    const result = imageOnlyDocuments({ ...before, items: [updated], generatedAt: "new" });
    expect(result.versionedData.datasets[0].items).toEqual(result.itemDocument.items);
    expect(result.metadata.totalItems).toBe(1); expect(result.metadata.imageCoverage).toBe(1);
    expect(result.itemDocument.items[0].acquisition).toEqual(item().acquisition);
    for (const change of [{ acquisition: [] }, { id: "wrong" }, { name: { en: "wrong" } }, { crafting: { ingredients: [{ quantity: 3 }] } }, { imageKind: "base_model" }]) expect(() => imageOnlyDocuments({ ...before, items: [{ ...updated, ...change }], generatedAt: "new" })).toThrow();
    expect(() => imageOnlyDocuments({ ...before, items: [], generatedAt: "new" })).toThrow();
    before.itemDocument.items[0] = updated as any; before.versionedData.datasets[0].items = before.itemDocument.items;
    expect(() => imageOnlyDocuments({ ...before, items: [{ ...updated, imagePath: "/different.png" }], generatedAt: "new" })).toThrow();
  });
  it("rejects stale version snapshots and PTU before persistence", () => {
    const before = baseline(); before.versionedData.datasets[0].items = [];
    expect(() => imageOnlyDocuments({ ...before, items: before.itemDocument.items, generatedAt: "new" })).toThrow("synchronized LIVE");
    before.tradeDocument.gameVersion = "4.11.0 EPTU.1";
    expect(() => imageOnlyDocuments({ ...before, items: before.itemDocument.items, generatedAt: "new" })).toThrow("LIVE");
  });
  it("the full enrichment path preserves existing exact and AI images despite an API image change", async () => {
    const root = await temporary(); vi.stubGlobal("fetch", network());
    for (const kind of ["exact", "base_model", "community", "ai_redraw"]) {
      const previous = { ...item(), imagePath: "/reviewed.webp", imageSourceUrl: "https://reviewed.test/photo", imageKind: kind };
      const trade = { id: "t", name: { en: "Trade", zh: "交易" }, requirements: [{ ...item(), quantity: 1, unit: "x" }], rewards: [] };
      const result = await buildItemIndex({ trades: [trade], localization: { entries: {} }, cacheDir: path.join(root, "http"), wikiImages: { items: [] }, previousItems: [previous] });
      expect(result[0]).toMatchObject({ imagePath: previous.imagePath, imageKind: kind, imageSourceUrl: previous.imageSourceUrl });
    }
  });
  it("never lends a contract's primary reward picture to unlisted bonus armor/ammunition", async () => {
    const root = await temporary(); vi.stubGlobal("fetch", network());
    const armor = item(), ship = { ...item("ship"), category: "vehicle" };
    const wrong = { ...armor, imagePath: "/ship.png", imageSourceUrl: url, imageKind: "exact" };
    const rules = [{ id: armor.id, localPath: wrong.imagePath, sourceUrl: url }];
    const trade = { id: "t", name: { en: "Trade", zh: "交易" }, requirements: [], rewards: [ship, armor, item("new-magazine")] };
    const images = { items: [{ title: "Trade", imageUrl: url, localPath: "/ship.png", itemIds: [ship.id] }] };
    const result = await buildItemIndex({ trades: [trade], localization: { entries: {} }, cacheDir: path.join(root, "http"), wikiImages: images, previousItems: [wrong], imageRejections: rules });
    expect(result.find((i: any) => i.id === ship.id).imagePath).toBe("/ship.png");
    expect(result.find((i: any) => i.id === armor.id).imageKind).toBe("none");
    expect(result.find((i: any) => i.id === "new-magazine").imageKind).toBe("none");
    expect(rejectedImage(armor, { sourceUrl: `${url}?cache=1` }, rules)).toBe(true);
    const blocked = await fillMissingImages({ items: [armor], mapping: { ...mapping(), rejectedImages: rules }, gameVersion: LIVE, projectRoot: root, lookup: async () => record(), download: async () => { throw new Error("Should not use rejected original"); } });
    expect(blocked.changed).toBe(false);
  });
  it("locks every current Image2 mapping, even if a contract/pinned source or rejection rule disagrees", async () => {
    const root = await temporary(); vi.stubGlobal("fetch", network());
    const current = JSON.parse(await readFile(path.join(process.cwd(), "src/data/generated/items.json"), "utf8")).items.filter((i: any) => i.imageKind === "ai_redraw");
    const trade = { id: "t", name: { en: "Trade", zh: "交易" }, requirements: [], rewards: current };
    const conflicting = current.map((i: any) => ({ id: i.id, localPath: "/wrong.png", imageKind: "exact", pageUrl: url }));
    const result = await buildItemIndex({ trades: [trade], localization: { entries: {} }, cacheDir: path.join(root, "http"), wikiImages: { items: [{ title: "Trade", localPath: "/wrong.png", imageUrl: url, itemIds: current.map((i: any) => i.id) }] }, wikiItemImages: { items: conflicting }, previousItems: current, imageRejections: current.map((i: any) => ({ id: i.id, localPath: i.imagePath })) });
    for (const before of current) expect(result.find((i: any) => i.id === before.id)).toMatchObject({ imagePath: before.imagePath, imageSourceUrl: before.imageSourceUrl, imageKind: before.imageKind });
    expect(current.length).toBeGreaterThan(0);
  });
  it("runs the real images-only command twice in an isolated repository, backs up provenance, and restores it", async () => {
    const root = await temporary(); const before = baseline();
    await cp(path.join(process.cwd(), "scripts"), path.join(root, "scripts"), { recursive: true });
    await symlink(path.join(process.cwd(), "node_modules"), path.join(root, "node_modules"), "dir");
    await mkdir(path.join(root, "src/data/generated"), { recursive: true });
    await mkdir(path.join(root, "data/source-snapshots"), { recursive: true });
    await cp(path.join(process.cwd(), "data/localization"), path.join(root, "data/localization"), { recursive: true });
    const documents = { "trades.json": before.tradeDocument, "items.json": before.itemDocument, "metadata.json": before.metadata, "localization.json": before.localization, "versioned-data.json": before.versionedData };
    for (const [name, value] of Object.entries(documents)) await writeFile(path.join(root, "src/data/generated", name), JSON.stringify(value));
    const mappingPath = path.join(root, "data/source-snapshots/automatic-item-images.json");
    await writeFile(mappingPath, JSON.stringify(mapping()));
    const preload = path.join(root, "fetch.mjs");
    await writeFile(preload, `globalThis.fetch=async(url)=>String(url).startsWith('https://api.')?new Response(${JSON.stringify(JSON.stringify({ data: record() }))}):new Response(Buffer.from(${JSON.stringify(png.toString("base64"))},'base64'),{headers:{'content-type':'image/png'}});`);
    const command = path.join(root, "scripts/refresh-data.mjs");
    const run = () => execFileSync(process.execPath, ["--import", preload, command, "--images-only", "--expected-live-version", LIVE], { cwd: root, encoding: "utf8" });
    expect(JSON.parse(run()).changed).toBe(true);
    const hashes = await Promise.all(Object.keys(documents).map(async name => sha256(await readFile(path.join(root, "src/data/generated", name)))));
    expect(JSON.parse(run()).changed).toBe(false);
    expect(await Promise.all(Object.keys(documents).map(async name => sha256(await readFile(path.join(root, "src/data/generated", name)))))).toEqual(hashes);
    for (const name of ["trades.json", "localization.json"]) expect(await readFile(path.join(root, "src/data/generated", name), "utf8")).toBe(JSON.stringify(documents[name as keyof typeof documents]));
    const backups = await readdir(path.join(root, "data/backups")); expect(backups).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(root, "data/backups", backups[0], "automatic-item-images.json"), "utf8"))).toEqual(mapping());
    execFileSync(process.execPath, [path.join(root, "scripts/restore-data.mjs"), backups[0]], { cwd: root });
    expect(JSON.parse(await readFile(mappingPath, "utf8"))).toEqual(mapping());
    expect(JSON.parse(await readFile(path.join(root, "src/data/generated/items.json"), "utf8"))).toEqual(before.itemDocument);
    expect(() => execFileSync(process.execPath, [command, "--images-only", "--expected-live-version", "4.11.0 LIVE.1"], { cwd: root, stdio: "pipe" })).toThrow();
  });
});
