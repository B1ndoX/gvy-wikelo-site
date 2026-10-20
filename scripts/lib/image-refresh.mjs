import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fetchJson, sha256 } from "./http.mjs";
import { semanticFingerprint } from "./semantic-fingerprint.mjs";
import { isVersionOlder } from "./version.mjs";

const API = "https://api.star-citizen.wiki/api";
export const IMAGE_BATCH_SIZE = 4;
export const IMAGE_RETRY_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const keyFor = (item, version) => sha256(JSON.stringify([item.id, item.name.en, version]));

export function imageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "media.starcitizen.tools" || url.port || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    if (/(?:placeholder|no[_ -]?image|missing[_ -]?image|favicon|logo)/i.test(decodeURIComponent(url.pathname))) return null;
    return url.href;
  } catch { return null; }
}

// The record must name this exact class/UUID, including its paint variant.
// Slugs are only lookup aliases; a similar English name is not identity proof.
export function exactImageRecord(item, record, gameVersion) {
  const id = String(item.id).toLowerCase();
  return Boolean(record?.uuid
    && [record.class_name, record.uuid].some(value => String(value ?? "").toLowerCase() === id)
    && /^\d+\.\d+\.\d+[- ]LIVE\.\d+$/i.test(record.version ?? "")
    && (!gameVersion || !isVersionOlder(gameVersion, record.version)));
}

export function imageCandidates(record) {
  const originals = [], thumbnails = [];
  for (const candidate of record?.images ?? []) {
    const original = imageUrl(candidate.original_url);
    const thumbnail = imageUrl(candidate.thumbnail_url);
    if (original) originals.push({ url: original, sourceUrl: original });
    if (thumbnail) thumbnails.push({ url: thumbnail, sourceUrl: original || thumbnail });
  }
  const unique = new Map();
  for (const entry of [...originals.sort((a, b) => cmp(a.url, b.url)), ...thumbnails.sort((a, b) => cmp(a.url, b.url))]) {
    if (!unique.has(entry.url)) unique.set(entry.url, entry);
  }
  return [...unique.values()].slice(0, 3);
}

export function rejectedImage(item, candidate, rules = []) {
  return rules.some(rule => rule.id === item.id && (
    (candidate.localPath && candidate.localPath === rule.localPath)
    || (candidate.sourceUrl && imageUrl(candidate.sourceUrl) && imageUrl(candidate.sourceUrl) === imageUrl(rule.sourceUrl))
  ));
}

export async function inspectImage(bytes, contentType) {
  const signatures = [
    ["png", "image/png", bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))],
    ["jpeg", "image/jpeg", bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255],
    ["webp", "image/webp", bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"],
  ];
  const signature = signatures.find(([, , matches]) => matches);
  if (!signature || String(contentType).split(";")[0].trim().toLowerCase() !== signature[1]) throw new Error("Image MIME/signature mismatch");
  if (bytes.length > MAX_BYTES) throw new Error("Image byte limit exceeded");
  const input = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELS });
  const metadata = await input.metadata();
  const { width, height, format, pages = 1 } = metadata;
  if (format !== signature[0] || pages !== 1 || !width || !height
    || Math.min(width, height) < 96 || Math.max(width, height) < 256
    || Math.max(width / height, height / width) > 8) throw new Error("Image dimensions/format unsuitable");
  // metadata alone accepts some truncated images. Decode every pixel, without
  // resizing, cropping, re-encoding or enlarging the original asset.
  const stats = await input.timeout({ seconds: 5 }).stats();
  if (stats.channels.slice(0, 3).every(channel => channel.stdev < 0.5)
    || (metadata.hasAlpha && stats.channels.at(-1).max === 0)) throw new Error("Blank/transparent placeholder image");
  return { width, height, bytes: bytes.length, sha256: sha256(bytes), extension: format === "jpeg" ? "jpg" : format };
}

async function fetchImage(url) {
  const response = await fetch(url, {
    redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "GVY-Wikelo/0.1 (+https://wikelo.gvyvoyagers.vip)", accept: "image/*" },
  });
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Image byte limit exceeded");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("Image byte limit exceeded");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  return { ...await inspectImage(bytes, response.headers.get("content-type")), bytes };
}

export function imageQueue(items, state, gameVersion, reviewItemIds = [], now = Date.now()) {
  const reviews = new Set(reviewItemIds);
  return items.filter(item => !item.id.startsWith("bp_reward_") && item.category !== "blueprint"
    && (!item.imagePath || reviews.has(item.id)))
    .map(item => ({ item, key: keyFor(item, gameVersion), reviewOnly: Boolean(item.imagePath) }))
    .filter(entry => {
      const attempt = state?.attempts?.[entry.key];
      // A success without a published image must be retried, e.g. after a
      // later test failure or rollback. Cache state is never publication proof.
      return !attempt || attempt.status === "applied"
        || !["missing", "failed", "review"].includes(attempt.status)
        || !Number.isFinite(attempt.checkedAt) || attempt.checkedAt > now
        || now - attempt.checkedAt >= IMAGE_RETRY_MS;
    })
    .sort((a, b) => (state?.attempts?.[a.key]?.checkedAt ?? 0) - (state?.attempts?.[b.key]?.checkedAt ?? 0) || cmp(a.item.id, b.item.id))
    .slice(0, IMAGE_BATCH_SIZE);
}

export function imageOnlyDocuments({ tradeDocument, itemDocument, metadata, localization, versionedData, items, generatedAt }) {
  const version = tradeDocument.gameVersion;
  if (!/^\d+\.\d+\.\d+ LIVE\.\d+$/.test(version) || metadata.gameVersion !== version
    || versionedData.datasets?.length !== 1 || versionedData.datasets[0].gameVersion !== version
    || JSON.stringify(versionedData.datasets[0].items) !== JSON.stringify(itemDocument.items)
    || JSON.stringify(versionedData.datasets[0].trades) !== JSON.stringify(tradeDocument.trades)) throw new Error("Image refresh requires synchronized LIVE data");
  if (items.length !== itemDocument.items.length) throw new Error("Images cannot change the item set");
  const withoutImage = ({ imagePath, imageSourceUrl, imageKind, ...rest }) => rest;
  for (let index = 0; index < items.length; index++) {
    const before = itemDocument.items[index], after = items[index];
    if (JSON.stringify(withoutImage(before)) !== JSON.stringify(withoutImage(after))
      || (before.imagePath && JSON.stringify(before) !== JSON.stringify(after))
      || (!before.imagePath && after.imagePath && after.imageKind !== "exact")) throw new Error(`Forbidden image-only change: ${before.id}`);
  }
  return {
    itemDocument: { ...itemDocument, generatedAt, items },
    versionedData: { ...versionedData, generatedAt, datasets: [{ ...versionedData.datasets[0], generatedAt, items }] },
    metadata: { ...metadata, generatedAt, imageCoverage: items.filter(item => item.imagePath).length / items.length,
      sourceFingerprint: semanticFingerprint({ gameVersion: version, trades: tradeDocument.trades, items, localizationDictionary: localization.entries }) },
  };
}

async function exactRecord(item, cacheDir, gameVersion) {
  const slug = item.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const vehicle = /vehicle|ship/i.test(item.category);
  let failure = null;
  for (const candidate of [...new Set([item.id, slug])]) {
    try {
      const result = await fetchJson(`${API}/${vehicle ? "vehicles" : "items"}/${encodeURIComponent(candidate)}?locale=en_EN`, {
        cacheDir, preferCache: false, allowStaleCache: false, retries: 1, timeoutMs: 8_000,
      });
      const record = result.data?.data;
      if (exactImageRecord(item, record, gameVersion)) return record;
      if (record?.uuid) failure = new Error("API identity/version mismatch");
    } catch (error) {
      if (!/\b404\b/.test(String(error))) failure = error;
    }
  }
  if (failure) throw failure;
  return null;
}

async function saveAsset(projectRoot, image) {
  // Content addressing prevents byte changes behind a stable URL from silently
  // overwriting a deployed file. Equal bytes always reuse the exact same path.
  const relative = `/images/auto/${image.sha256}.${image.extension}`;
  const absolute = path.join(projectRoot, "public", relative);
  try {
    if (sha256(await readFile(absolute)) === image.sha256) return relative;
    throw new Error("Content-addressed image hash mismatch");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(`${absolute}.next`, image.bytes);
  await rename(`${absolute}.next`, absolute);
  return relative;
}

export async function fillMissingImages({ items, gameVersion, projectRoot, cacheDir, state = {}, mapping,
  now = Date.now(), lookup = exactRecord, download = fetchImage }) {
  if (!/^\d+\.\d+\.\d+ LIVE\.\d+$/.test(gameVersion)) throw new Error("Images require an exact LIVE dataset");
  if (!state || state.schemaVersion !== "1.0.0" || !state.attempts || typeof state.attempts !== "object" || Array.isArray(state.attempts)) state = { attempts: {} };
  const queue = imageQueue(items, state, gameVersion, mapping.reviewItemIds, now);
  const attempts = { ...state.attempts };
  const nextItems = [...items], records = new Map(mapping.items.map(entry => [entry.id, entry]));
  const reviewed = [], outcomes = [];
  for (const { item, key, reviewOnly } of queue) {
    let status = "missing", reason = null;
    try {
      const record = await lookup(item, cacheDir, gameVersion);
      if (record && !exactImageRecord(item, record, gameVersion)) throw new Error("API identity/version mismatch");
      if (record) {
        for (const candidate of imageCandidates(record)) {
          if (rejectedImage(item, candidate, mapping.rejectedImages)) continue;
          try {
            const image = await download(candidate.url);
            const provenance = { id: item.id, pageUrl: record.web_url, imageUrl: candidate.sourceUrl,
              downloadedUrl: candidate.url, imageKind: "exact", sha256: image.sha256,
              width: image.width, height: image.height, bytes: image.bytes.length,
              identity: { className: record.class_name, uuid: record.uuid, sourceVersion: record.version },
              hasWatermark: "unknown", sourceType: "wiki_api_exact_identity" };
            if (reviewOnly) {
              reviewed.push(provenance);
              status = "review"; // Never auto-replace AI/base-model/manual/verified images.
            } else {
              const localPath = await saveAsset(projectRoot, image);
              records.set(item.id, { ...provenance, localPath });
              nextItems[items.indexOf(item)] = { ...item, imagePath: localPath, imageSourceUrl: candidate.sourceUrl, imageKind: "exact" };
              status = "applied";
            }
            reason = null;
            break;
          } catch (error) { status = "failed"; reason = String(error).slice(0, 240); } // Never bypass a WAF.
        }
      }
    } catch (error) { status = "failed"; reason = String(error).slice(0, 240); }
    attempts[key] = { checkedAt: now, status };
    outcomes.push({ id: item.id, status, ...(reason ? { reason } : {}) });
  }
  // Bound disposable cache growth to currently eligible entity/version keys.
  const active = new Set(items.filter(item => !item.imagePath || mapping.reviewItemIds.includes(item.id)).map(item => keyFor(item, gameVersion)));
  return { items: nextItems, mapping: { ...mapping, items: [...records.values()].sort((a, b) => cmp(a.id, b.id)) },
    state: { schemaVersion: "1.0.0", attempts: Object.fromEntries(Object.entries(attempts).filter(([key]) => active.has(key))) },
    reviewed, outcomes, changed: nextItems.some((item, index) => item !== items[index]) };
}
