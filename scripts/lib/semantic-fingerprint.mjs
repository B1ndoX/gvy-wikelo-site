import { sha256 } from "./http.mjs";

const volatileKeys = new Set([
  "checkedAt",
  "fetchedAt",
  "generatedAt",
  "sourceUpdatedAt",
  "updatedAt",
  "sourceGameVersion",
]);

const entityNoiseKeys = new Set([...volatileKeys, "gameVersion"]);

function canonicalize(value, ignoredKeys = volatileKeys) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => canonicalize(entry, ignoredKeys))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ignoredKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry, ignoredKeys)]),
  );
}

export function semanticFingerprint({ gameVersion, trades, items, localizationDictionary }) {
  return sha256(JSON.stringify(canonicalize({
    gameVersion,
    trades,
    items,
    localizationDictionary,
  })));
}

export function preserveSemanticallyUnchangedEntities(previous = [], next = []) {
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  return next.map((entry) => {
    const stable = previousById.get(entry.id);
    if (!stable) return entry;
    return JSON.stringify(canonicalize(stable, entityNoiseKeys)) === JSON.stringify(canonicalize(entry, entityNoiseKeys))
      ? stable
      : entry;
  });
}

export function semanticChangeSummary(previous, next) {
  const summarize = (before = [], after = []) => {
    const beforeById = new Map(before.map((entry) => [entry.id, entry]));
    const afterById = new Map(after.map((entry) => [entry.id, entry]));
    const added = [...afterById.keys()].filter((id) => !beforeById.has(id));
    const removed = [...beforeById.keys()].filter((id) => !afterById.has(id));
    const modified = [...afterById.keys()].filter((id) => (
      beforeById.has(id)
      && JSON.stringify(canonicalize(beforeById.get(id), entityNoiseKeys)) !== JSON.stringify(canonicalize(afterById.get(id), entityNoiseKeys))
    ));
    return { added: added.length, modified: modified.length, removed: removed.length };
  };
  return {
    versionChanged: previous?.gameVersion !== next.gameVersion,
    trades: summarize(previous?.trades, next.trades),
    items: summarize(previous?.items, next.items),
  };
}
