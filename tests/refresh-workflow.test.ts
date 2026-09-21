import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(`${process.cwd()}/.github/workflows/refresh-data.yml`, "utf8");
// Exercise the actual checked-in GitHub expressions, not a duplicate policy.
function condition(name: string, options: { current?: string; remote?: string; changed?: string; candidate?: string; hit?: string; outcome?: string; force?: boolean } = {}) {
  const { current = "4.10.1 LIVE.12660092", remote = current, changed = "true", candidate = "false", hit = "false", outcome = "success", force = false } = options;
  const block = workflow.split(`- name: ${name}\n`)[1]?.split("\n      - name:")[0];
  const expression = block?.match(/^\s*if: (.+)$/m)?.[1];
  if (!expression) throw new Error(`Missing workflow condition: ${name}`);
  const evaluate = new Function("steps", "inputs", "success", `return (${expression.replaceAll("outputs.cache-hit", 'outputs["cache-hit"]')})`);
  return evaluate({ live_version: { outputs: { current_version: current, remote_version: remote, changed } }, candidate: { outputs: { changed: candidate } }, localization_review: { outputs: { "cache-hit": hit } }, refresh_data: { outcome } }, { force_refresh: force }, () => outcome === "success");
}

describe("localization no-op cache workflow policy", () => {
  it("can remember an identical-LIVE successful semantic no-op", () => {
    expect(condition("Remember successfully reviewed input")).toBe(true);
    expect(condition("Refresh staging data and enforce publish gates", { hit: "true" })).toBe(false);
  });
  it("never skips a new LIVE or a main rollback even with a matching old cache", () => {
    const rollback = { current: "4.9.0 LIVE.123", remote: "4.10.1 LIVE.12660092", hit: "true" };
    expect(condition("Recall successfully reviewed localization input", rollback)).toBe(false);
    expect(condition("Refresh staging data and enforce publish gates", rollback)).toBe(true);
    expect(condition("Remember successfully reviewed input", rollback)).toBe(false);
  });
  it("does not cache material changes, skipped/failed gates or forced runs", () => {
    for (const change of [{ candidate: "true" }, { outcome: "failure" }, { outcome: "skipped" }, { force: true }]) {
      expect(condition("Mark a no-op input as reviewed without a production commit", change)).toBe(false);
      expect(condition("Remember successfully reviewed input", change)).toBe(false);
    }
  });
});
