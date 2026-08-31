import { isVersionOlder, semanticPatch } from "./version.mjs";

function comparePatch(left, right) {
  const a = semanticPatch(left);
  const b = semanticPatch(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function buildNumber(version) {
  return Number(String(version).match(/\.(\d+)$/)?.[1] ?? 0);
}

function newest(datasets) {
  return [...datasets].sort((left, right) => {
    const patchOrder = comparePatch(right.gameVersion, left.gameVersion);
    if (patchOrder) return patchOrder;
    return buildNumber(right.gameVersion) - buildNumber(left.gameVersion);
  })[0] ?? null;
}

export function mergeVersionDatasets(previousDatasets, incomingDataset) {
  if (!/\bLIVE\.\d+$/i.test(incomingDataset.gameVersion)) {
    throw new Error(`Wikelo refresh accepts LIVE data only: ${incomingDataset.gameVersion}`);
  }
  const previousLive = newest(previousDatasets.filter((dataset) => /\bLIVE\.\d+$/i.test(dataset.gameVersion)));
  if (previousLive && isVersionOlder(incomingDataset.gameVersion, previousLive.gameVersion)) return [previousLive];
  return [incomingDataset];
}

export function activeLiveVersion(datasets) {
  return newest(datasets.filter((dataset) => /\bLIVE\.\d+$/i.test(dataset.gameVersion)))?.gameVersion ?? null;
}

export function buildStableVersionDataset({ gameVersion, generatedAt, sourceStatus, persistedTradeDocument, items }) {
  return {
    gameVersion,
    generatedAt,
    sourceStatus: persistedTradeDocument?.sourceStatus ?? sourceStatus,
    trades: persistedTradeDocument?.trades ?? [],
    items,
  };
}

export function anomalyBaselineForVersion(previousDatasets, legacyDocument, incomingVersion) {
  if (!/\bLIVE\.\d+$/i.test(incomingVersion)) throw new Error(`Wikelo anomaly checks accept LIVE data only: ${incomingVersion}`);
  const live = newest(previousDatasets.filter((dataset) => /\bLIVE\.\d+$/i.test(dataset.gameVersion)));
  if (live) return { gameVersion: live.gameVersion, trades: live.trades };
  return legacyDocument ? { ...legacyDocument, gameVersion: incomingVersion } : null;
}
