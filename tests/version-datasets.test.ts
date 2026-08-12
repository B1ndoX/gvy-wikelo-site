import { describe, expect, it } from "vitest";
import { activeLiveVersion, anomalyBaselineForVersion, mergeVersionDatasets } from "../scripts/lib/version-datasets.mjs";

const dataset = (gameVersion: string, id = "fixture") => ({ gameVersion, trades: [{ id }], items: [] });

describe("LIVE-only Wikelo dataset isolation", () => {
  it("keeps exactly one LIVE dataset", () => {
    const live = dataset("4.9.0 LIVE.12344265");
    expect(mergeVersionDatasets([], live)).toEqual([live]);
    expect(activeLiveVersion([live])).toBe(live.gameVersion);
  });

  it("rejects PTU and EPTU inputs instead of mixing channels", () => {
    expect(() => mergeVersionDatasets([], dataset("4.10.0 PTU.12388491"))).toThrow(/LIVE data only/);
    expect(() => mergeVersionDatasets([], dataset("4.10.0 EPTU.12388491"))).toThrow(/LIVE data only/);
  });

  it("replaces the old LIVE when a newer LIVE build appears", () => {
    const previous = dataset("4.9.0 LIVE.12344265", "old");
    const incoming = dataset("4.10.0 LIVE.12400000", "new");
    expect(mergeVersionDatasets([previous], incoming)).toEqual([incoming]);
  });

  it("uses refreshed records for the same LIVE build", () => {
    const previous = dataset("4.9.0 LIVE.12344265", "old");
    const incoming = dataset("4.9.0 LIVE.12344265", "corrected");
    expect(mergeVersionDatasets([previous], incoming)).toEqual([incoming]);
  });

  it("does not replace stable data with a regressed LIVE", () => {
    const previous = dataset("4.10.0 LIVE.12400000", "current");
    const incoming = dataset("4.9.0 LIVE.12344265", "old");
    expect(mergeVersionDatasets([previous], incoming)).toEqual([previous]);
  });

  it("always compares anomalies against the newest stable LIVE", () => {
    const live = dataset("4.9.0 LIVE.12344265", "live");
    expect(anomalyBaselineForVersion([live], live, "4.10.0 LIVE.12400000")).toEqual({
      gameVersion: live.gameVersion,
      trades: live.trades,
    });
    expect(() => anomalyBaselineForVersion([live], live, "4.10.0 PTU.12400000")).toThrow(/LIVE data only/);
  });
});
