import { isVersionOlder } from "./version.mjs";

export function detectDataAnomalies({ previousTrades, previousMetadata, trades, gameVersion, localizationCoverage }) {
  const anomalies = [];
  if (previousTrades?.trades?.length && trades.length < previousTrades.trades.length * 0.85) {
    anomalies.push(`Trade count dropped from ${previousTrades.trades.length} to ${trades.length}`);
  }
  if (previousTrades?.gameVersion && isVersionOlder(gameVersion, previousTrades.gameVersion)) {
    anomalies.push(`Version regressed from ${previousTrades.gameVersion} to ${gameVersion}`);
  }
  if (previousMetadata?.localizationCoverage && localizationCoverage < previousMetadata.localizationCoverage - 0.15) {
    anomalies.push("Official localization coverage dropped by more than 15 percentage points");
  }
  const missingRewardRate = trades.length
    ? trades.filter((trade) => !trade.rewards.length && trade.reputationGain === 0).length / trades.length
    : 1;
  if (missingRewardRate > 0.05) {
    anomalies.push(`Too many records have neither reward items nor reputation: ${(missingRewardRate * 100).toFixed(1)}%`);
  }
  return anomalies;
}

export function blockingRefreshReasons(anomalies, sourceStatus) {
  return [
    ...anomalies,
    ...sourceStatus
      .filter((source) => source.status === "partial" || source.status === "failed")
      .map((source) => `${source.url}: ${source.status}`),
  ];
}
