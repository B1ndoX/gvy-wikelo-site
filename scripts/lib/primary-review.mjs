import { fetchText, sha256 } from "./http.mjs";
import { normalizeTrades } from "./normalize.mjs";
import { parseAssignedLiteralBySourceLabel } from "./parse-static.mjs";

const sourceOrigin = "https://dumpers-repo.com";
const sourceLabel = "Star Citizen Game Files (TheCollector contract generator)";
const text = (value) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const sorted = (values) => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));

export function primaryTradeFingerprint(trades) {
  if (!Array.isArray(trades) || !trades.length) throw new Error("Primary trade review requires a nonempty stable dataset");
  const ids = new Set();
  const entries = (values) => {
    if (!Array.isArray(values)) throw new Error("Invalid primary trade entries");
    return sorted(values.map((entry) => {
      if (!text(entry.id) || !Number.isFinite(entry.quantity) || entry.quantity < 0 || !["x", "SCU", "套", "件"].includes(entry.unit)) throw new Error("Invalid primary trade quantity, ID or unit");
      if (!text(entry.category) || typeof entry.isBlueprint !== "boolean" || typeof entry.isGameBound !== "boolean") throw new Error("Invalid primary trade entry category or flags");
      // Names may legitimately be official RCMBNT codes instead of raw ASD
      // labels. Stable IDs, not localized/display labels, identify line items.
      return [entry.id, entry.quantity, entry.unit, entry.category, entry.isBlueprint, entry.isGameBound];
    }));
  };
  return sha256(JSON.stringify(sorted(trades.map((trade) => {
    if (!text(trade.id) || ids.has(trade.id) || !text(trade.name?.en) || !["active", "inactive"].includes(trade.status)) throw new Error("Invalid or duplicate primary trade identity");
    if (!text(trade.category) || (trade.minReputation !== null && typeof trade.minReputation !== "string")) throw new Error("Invalid primary trade category or standing");
    if (trade.reputationGain !== null && !Number.isFinite(trade.reputationGain)) throw new Error("Invalid primary trade reputation");
    ids.add(trade.id);
    return [trade.id, text(trade.name.en), trade.category, trade.status, trade.minReputation === null ? null : text(trade.minReputation), trade.reputationGain,
      entries(trade.requirements), entries(trade.rewards)];
  }))));
}

export function primaryBundleUrl(html) {
  const bundlePath = String(html).match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  if (!bundlePath) throw new Error("Dumper's Repo public bundle path was not found");
  return `${sourceOrigin}${bundlePath}`;
}

function assertBundleUrl(url) {
  if (!/^https:\/\/dumpers-repo\.com\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(url)) throw new Error("Invalid primary bundle URL");
}

export async function primaryPublication(bundleUrl, fetcher = fetch) {
  assertBundleUrl(bundleUrl);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(bundleUrl, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(25_000), headers: { "user-agent": "GVY-Wikelo/0.1 (+https://wikelo.gvyvoyagers.vip)", accept: "*/*" } });
      if ([405, 501].includes(response.status)) return { etag: null, lastModified: null, cacheable: false };
      if (!response.ok) throw new Error(`Primary manifest HEAD failed: ${response.status}`);
      const etag = response.headers.get("etag")?.trim() || null;
      const modified = Date.parse(response.headers.get("last-modified") || "");
      const lastModified = Number.isFinite(modified) ? new Date(modified).toISOString() : null;
      return { etag, lastModified, cacheable: Boolean(etag || lastModified) };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function primaryReviewKey(manifest) {
  assertBundleUrl(manifest.primaryBundleUrl);
  if (!/^\d+\.\d+\.\d+ LIVE\.\d+$/.test(manifest.remoteVersion) || !/^[a-f0-9]{64}$/.test(manifest.primaryAppliedFingerprint)) throw new Error("Invalid LIVE primary review manifest");
  const publication = manifest.primaryPublication;
  return sha256(JSON.stringify([1, manifest.remoteVersion, manifest.primaryBundleUrl,
    publication.etag || publication.lastModified, manifest.primaryAppliedFingerprint]));
}

export async function reviewPrimaryTrades(manifest, stableTrades, cachedReview, fetchBundle = fetchText) {
  const applied = primaryTradeFingerprint(stableTrades);
  if (manifest.primaryAppliedFingerprint !== applied || manifest.primaryReviewKey !== primaryReviewKey(manifest)) throw new Error("Primary review manifest no longer matches the applied dataset");
  if (manifest.primaryPublication.cacheable && cachedReview?.schemaVersion === 1 && cachedReview.key === manifest.primaryReviewKey
    && cachedReview.sourceFingerprint === applied && cachedReview.appliedFingerprint === applied) {
    return { primaryTradesChanged: false, primaryBundleRead: false, primaryReviewCacheHit: true, primarySourceFingerprint: applied, review: null };
  }
  const bundle = await fetchBundle(manifest.primaryBundleUrl, { timeoutMs: 120_000, retries: 3, allowStaleCache: false });
  if (bundle.fromCache) throw new Error("Primary review must not accept stale source data");
  const publication = manifest.primaryPublication;
  if (publication.etag && bundle.etag !== publication.etag) throw new Error("Primary publication changed between HEAD and GET; retry review");
  if (!publication.etag && publication.lastModified && Date.parse(bundle.lastModified || "") !== Date.parse(publication.lastModified)) throw new Error("Primary publication changed during review");
  const raw = parseAssignedLiteralBySourceLabel(bundle.text, sourceLabel, "trades");
  const incoming = normalizeTrades({ dumperData: raw, secondaryTrades: [], localization: { entries: new Map() }, gameVersion: manifest.remoteVersion, fetchedAt: manifest.checkedAt });
  const fingerprint = primaryTradeFingerprint(incoming);
  const primaryTradesChanged = fingerprint !== applied;
  return {
    primaryTradesChanged, primaryBundleRead: true, primaryReviewCacheHit: false, primarySourceFingerprint: fingerprint,
    review: !primaryTradesChanged && publication.cacheable ? { schemaVersion: 1, key: manifest.primaryReviewKey, sourceFingerprint: fingerprint, appliedFingerprint: applied } : null,
  };
}
