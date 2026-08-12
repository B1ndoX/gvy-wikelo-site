export function versionFromHtml(html) {
  const matches = [...String(html).matchAll(/\b(\d+\.\d+\.\d+)[-\s]+live\.(\d+)\b/gi)]
    .map((match) => `${match[1]} LIVE.${match[2]}`);
  if (!matches.length) throw new Error("Dumper's Repo did not expose an exact LIVE build version");
  return matches.reduce((newest, candidate) => (isVersionOlder(candidate, newest) ? newest : candidate));
}

export function semanticPatch(version) {
  const match = String(version).match(/\d+\.\d+\.\d+/);
  return match ? match[0].split(".").map(Number) : [0, 0, 0];
}

export function isVersionOlder(next, previous) {
  const a = semanticPatch(next);
  const b = semanticPatch(previous);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index];
  }
  const channelRank = (version) => {
    if (/\bLIVE\b/i.test(version)) return 2;
    if (/\bPTU\b/i.test(version)) return 1;
    if (/\bEPTU\b/i.test(version)) return 0;
    return -1;
  };
  const nextChannel = channelRank(next);
  const previousChannel = channelRank(previous);
  if (nextChannel !== previousChannel) return nextChannel < previousChannel;
  const build = (version) => Number(String(version).match(/\.(\d+)$/)?.[1] ?? 0);
  return build(next) < build(previous);
}
