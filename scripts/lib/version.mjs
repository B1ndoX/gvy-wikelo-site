export function versionFromHtml(html) {
  const exact = String(html).match(/\b(\d+\.\d+\.\d+)[-\s]+(live|ptu|eptu)\.(\d+)\b/i);
  if (!exact) throw new Error("Dumper's Repo did not expose an exact LIVE/PTU build version");
  return `${exact[1]} ${exact[2].toUpperCase()}.${exact[3]}`;
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
