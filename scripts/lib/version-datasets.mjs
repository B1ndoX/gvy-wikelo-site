import { semanticPatch } from "./version.mjs";

function channelOf(version) {
  if (/\bLIVE\b/i.test(version)) return "LIVE";
  if (/\bPTU\b/i.test(version)) return "PTU";
  if (/\bEPTU\b/i.test(version)) return "EPTU";
  return "UNKNOWN";
}

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
    const channelRank = { LIVE: 3, PTU: 2, EPTU: 1, UNKNOWN: 0 };
    const channelOrder = channelRank[channelOf(right.gameVersion)] - channelRank[channelOf(left.gameVersion)];
    if (channelOrder) return channelOrder;
    return buildNumber(right.gameVersion) - buildNumber(left.gameVersion);
  })[0] ?? null;
}

export function mergeVersionDatasets(previousDatasets, incomingDataset) {
  const incomingChannel = channelOf(incomingDataset.gameVersion);
  if (incomingChannel === "UNKNOWN") throw new Error(`Unsupported data channel: ${incomingDataset.gameVersion}`);

  const previousLive = newest(previousDatasets.filter((dataset) => channelOf(dataset.gameVersion) === "LIVE"));
  const live = incomingChannel === "LIVE"
    ? newest([previousLive, incomingDataset].filter(Boolean))
    : previousLive;
  const test = ["PTU", "EPTU"].includes(incomingChannel) ? incomingDataset : null;
  const result = [];
  if (live) result.push(live);
  if (test && (!live || comparePatch(test.gameVersion, live.gameVersion) > 0)) result.push(test);
  return result;
}

export function activeLiveVersion(datasets) {
  return newest(datasets.filter((dataset) => channelOf(dataset.gameVersion) === "LIVE"))?.gameVersion
    ?? newest(datasets)?.gameVersion
    ?? null;
}

export function anomalyBaselineForVersion(previousDatasets, legacyDocument, incomingVersion) {
  const sameChannel = previousDatasets.find((dataset) => channelOf(dataset.gameVersion) === channelOf(incomingVersion));
  if (sameChannel) return { gameVersion: sameChannel.gameVersion, trades: sameChannel.trades };
  return legacyDocument ? { ...legacyDocument, gameVersion: incomingVersion } : null;
}
