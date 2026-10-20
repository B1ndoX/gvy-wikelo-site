import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

const workflow = readFileSync(`${process.cwd()}/.github/workflows/refresh-data.yml`, "utf8");
// Exercise the actual checked-in GitHub expressions, not a duplicate policy.
function condition(name: string, options: { current?: string; remote?: string; changed?: string; candidate?: string; hit?: string; outcome?: string; force?: boolean; primary?: string; primaryCache?: string; cacheable?: string; imageOutcome?: string } = {}) {
  const { current = "4.10.1 LIVE.12660092", remote = current, changed = "true", candidate = "false", hit = "false", outcome = "success", force = false, primary = "false", primaryCache = "false", cacheable = "true", imageOutcome = "skipped" } = options;
  const block = workflow.split(`- name: ${name}\n`)[1]?.split("\n      - name:")[0];
  const expression = block?.match(/^\s*if: (.+)$/m)?.[1]?.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "");
  if (!expression) throw new Error(`Missing workflow condition: ${name}`);
  const evaluate = new Function("steps", "inputs", "success", "always", `return (${expression.replaceAll("outputs.cache-hit", 'outputs["cache-hit"]')})`);
  return evaluate({ live_version: { outputs: { current_version: current, remote_version: remote, changed, primary_cacheable: cacheable } }, primary_review: { outcome, outputs: { primary_changed: primary } }, primary_cache: { outputs: { "cache-hit": primaryCache } }, candidate: { outputs: { changed: candidate } }, localization_review: { outputs: { "cache-hit": hit } }, refresh_data: { outcome }, image_refresh: { outcome: imageOutcome } }, { force_refresh: force }, () => outcome === "success", () => true);
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
  it("refreshes the same LIVE on a new official localization input without forcing a run", () => {
    expect(condition("Refresh staging data and enforce publish gates", { changed: "true", hit: "false" })).toBe(true);
    expect(condition("Refresh staging data and enforce publish gates", { changed: "false" })).toBe(false);
    expect(workflow).toContain("steps.live_version.outputs.localization_sha256");
  });
  it("does not cache material changes, skipped/failed gates or forced runs", () => {
    for (const change of [{ candidate: "true" }, { outcome: "failure" }, { outcome: "skipped" }, { force: true }]) {
      expect(condition("Mark a no-op input as reviewed without a production commit", change)).toBe(false);
      expect(condition("Remember successfully reviewed input", change)).toBe(false);
    }
  });
  it("scopes historical no-op reviews to the applied dataset on A -> B -> A switches", () => {
    const template = workflow.match(/key: (wikelo-localization-.+)/)?.[1];
    expect(template).toContain("src/data/generated/metadata.json");
    const key = (incoming: string, applied: string) => template!.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) => {
      const evaluate = new Function("steps", "hashFiles", `return (${expression})`);
      return evaluate({ live_version: { outputs: { localization_sha256: incoming, remote_version: "4.10.2 LIVE.2" } } },
        (...patterns: string[]) => createHash("sha256").update(JSON.stringify(patterns.map(pattern =>
          pattern === "src/data/generated/metadata.json" ? applied : "unchanged-reviewed-code-and-dictionary"))).digest("hex"));
    });
    expect(key("A", "applied-A")).not.toBe(key("A", "applied-B"));
    expect(key("A", "applied-A")).toBe(key("A", "applied-A"));
    expect(condition("Refresh staging data and enforce publish gates", { changed: "true", hit: "false" })).toBe(true);
  });

  it("refreshes a genuine same-LIVE recipe hotfix despite a localization no-op cache hit", () => {
    expect(condition("Refresh staging data and enforce publish gates", { changed: "false", primary: "true", hit: "true" })).toBe(true);
    expect(condition("Refresh staging data and enforce publish gates", { changed: "true", primary: "true", hit: "true" })).toBe(true);
    expect(condition("Refresh staging data and enforce publish gates", { changed: "false", primary: "false" })).toBe(false);
  });

  it("never caches an unreviewed, changed, uncacheable or failed primary publication", () => {
    const name = "Remember a verified unchanged primary publication";
    expect(condition(name)).toBe(true);
    for (const change of [{ primary: "true" }, { outcome: "failure" }, { outcome: "skipped" }, { force: true }, { cacheable: "false" }, { primaryCache: "true" }]) {
      expect(condition(name, change)).toBe(false);
    }
    expect(workflow).toContain("--manifest-only --github-output");
    expect(workflow).toContain("--review-primary --github-output");
  });

  it("keeps recoverable artifacts for real hotfixes even when the later refresh fails", () => {
    const name = "Keep a 14-day recoverable stable-data artifact";
    expect(condition(name, { changed: "false", primary: "true", outcome: "failure" })).toBe(true);
    expect(condition(name, { changed: "false", primary: "false" })).toBe(false);
  });

  it("only recalls same-LIVE publications and uses exactly the same code-scoped save key", () => {
    expect(condition("Recall a verified primary publication")).toBe(true);
    for (const change of [{ remote: "4.11.0 LIVE.2" }, { force: true }, { cacheable: "false" }]) {
      expect(condition("Recall a verified primary publication", change)).toBe(false);
    }
    const keys = [...workflow.matchAll(/key: (wikelo-primary-.+)/g)].map(match => match[1]);
    expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain("primary_review_key"); expect(keys[0]).toContain("hashFiles('scripts/**')");
  });

  it("only retries images separately when a full refresh was not run, without adding a scheduler", () => {
    const step = "Retry missing images without a full data refresh";
    expect(condition(step, { outcome: "skipped" })).toBe(true);
    for (const outcome of ["success", "failure", "cancelled"]) expect(condition(step, { outcome })).toBe(false);
    expect(workflow.match(/cron:/g)).toHaveLength(1);
    expect(workflow).toContain('node scripts/refresh-data.mjs --images-only --expected-live-version "$REMOTE_LIVE_VERSION"');
  });

  it("keeps disposable retry state off main, restores across runs and never saves failed image checks", () => {
    const step = "Remember bounded image retry cooldowns";
    expect(condition(step)).toBe(true);
    expect(condition(step, { outcome: "skipped", imageOutcome: "success" })).toBe(true);
    for (const outcome of ["failure", "skipped", "cancelled"]) expect(condition(step, { outcome, imageOutcome: "failure" })).toBe(false);
    const cacheBlocks = workflow.split(/\n      - name:/).filter(block => /image retry cooldowns/.test(block));
    expect(cacheBlocks).toHaveLength(2);
    for (const block of cacheBlocks) {
      expect(block).toContain("path: .cache/image-refresh/");
      expect(block).toContain("hashFiles('scripts/**')"); expect(block).toContain("github.run_id");
    }
    expect(cacheBlocks[0]).toContain("restore-keys: wikelo-images-v1-");
    const commit = workflow.split("- name: Commit only verified data changes")[1].split("- name:")[0];
    expect(commit).not.toContain("git add .cache");
  });

  it("requires audit/test/schema/build and a recoverable artifact for image-only material changes", () => {
    for (const name of ["Audit public content", "Test, validate, and build", "Commit only verified data changes"]) {
      expect(condition(name, { changed: "false", candidate: "true" })).toBe(true);
      expect(condition(name, { changed: "false", candidate: "false" })).toBe(false);
    }
    expect(condition("Keep a 14-day recoverable stable-data artifact", { changed: "false", candidate: "true" })).toBe(true);
    expect(workflow).toContain("git diff --quiet -- src/data/generated data/localization data/source-snapshots/automatic-item-images.json");
  });
});
