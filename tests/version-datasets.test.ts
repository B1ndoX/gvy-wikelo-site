import { describe, expect, it } from "vitest";
import { activeLiveVersion, anomalyBaselineForVersion, mergeVersionDatasets } from "../scripts/lib/version-datasets.mjs";

const dataset = (gameVersion: string) => ({ gameVersion, trades: [], items: [] });

describe("LIVE and PTU Wikelo dataset isolation", () => {
  it("keeps LIVE alone while no PTU Wikelo dataset exists", () => {
    const live = dataset("4.9.0 LIVE.12344265");
    expect(mergeVersionDatasets([], live).map((entry: { gameVersion: string }) => entry.gameVersion)).toEqual([live.gameVersion]);
  });

  it("adds a newer PTU dataset without overwriting LIVE", () => {
    const live = dataset("4.9.0 LIVE.12344265");
    const ptu = dataset("4.10.0 PTU.12388491");
    const merged = mergeVersionDatasets([live], ptu);
    expect(merged.map((entry: { gameVersion: string }) => entry.gameVersion)).toEqual([live.gameVersion, ptu.gameVersion]);
    expect(activeLiveVersion(merged)).toBe(live.gameVersion);
  });

  it("replaces the old LIVE and same-generation PTU when that patch becomes LIVE", () => {
    const previous = [dataset("4.9.0 LIVE.12344265"), dataset("4.10.0 PTU.12388491")];
    const live = dataset("4.10.0 LIVE.12400000");
    expect(mergeVersionDatasets(previous, live).map((entry: { gameVersion: string }) => entry.gameVersion)).toEqual([live.gameVersion]);
  });

  it("removes a stale PTU when the current refresh exposes only LIVE", () => {
    const previous = [dataset("4.10.0 LIVE.12400000"), dataset("4.11.0 PTU.12500000")];
    const refreshedLive = dataset("4.10.0 LIVE.12410000");
    expect(mergeVersionDatasets(previous, refreshedLive).map((entry: { gameVersion: string }) => entry.gameVersion)).toEqual([
      refreshedLive.gameVersion,
    ]);
  });

  it("shows PTU again only when that PTU dataset is observed in the current refresh", () => {
    const liveOnly = mergeVersionDatasets(
      [dataset("4.10.0 LIVE.12400000"), dataset("4.11.0 PTU.12500000")],
      dataset("4.10.0 LIVE.12410000"),
    );
    const withObservedPtu = mergeVersionDatasets(liveOnly, dataset("4.11.0 PTU.12510000"));
    expect(withObservedPtu.map((entry: { gameVersion: string }) => entry.gameVersion)).toEqual([
      "4.10.0 LIVE.12410000",
      "4.11.0 PTU.12510000",
    ]);
  });

  it("compares LIVE updates with LIVE and PTU updates with PTU", () => {
    const live = { ...dataset("4.9.0 LIVE.12344265"), trades: [{ id: "live" }] };
    const ptu = { ...dataset("4.10.0 PTU.12388491"), trades: [{ id: "ptu" }] };
    expect(anomalyBaselineForVersion([live, ptu], ptu, "4.9.0 LIVE.12350000")).toEqual({
      gameVersion: live.gameVersion,
      trades: live.trades,
    });
    expect(anomalyBaselineForVersion([live, ptu], live, "4.10.0 PTU.12390000")).toEqual({
      gameVersion: ptu.gameVersion,
      trades: ptu.trades,
    });
  });
});
