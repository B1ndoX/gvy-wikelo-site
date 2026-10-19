import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(`${process.cwd()}/.github/workflows/refresh-watchdog.yml`, "utf8");
const primary = readFileSync(`${process.cwd()}/.github/workflows/refresh-data.yml`, "utf8");
const script = workflow.split("      - name: Recover an overdue refresh check\n")[1]
  .split("      - name:")[0].split("        run: |\n")[1].split("\n")
  .map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
const now = "2026-10-19T05:00:00Z";
const success = { status: "completed", conclusion: "success", created_at: "2026-10-18T12:00:00Z", updated_at: "2026-10-19T04:00:00Z" };

function runWatchdog(runs: object[], apiFailure = false) {
  const directory = mkdtempSync(join(tmpdir(), "wikelo-watchdog-test-"));
  try {
    writeFileSync(join(directory, "runs.json"), JSON.stringify({ workflow_runs: runs }));
    // Execute the checked-in shell verbatim; only external API and wall clock are fixtures.
    writeFileSync(join(directory, "gh"), `#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv[2]==='api'){
  if(process.env.WATCHDOG_TEST_API_FAILURE==='true')process.exit(1);
  process.stdout.write(fs.readFileSync(process.env.WATCHDOG_TEST_RUNS));
}else if(process.argv.slice(2,4).join(' ')==='workflow run'){
  fs.appendFileSync(process.env.WATCHDOG_TEST_DISPATCH,JSON.stringify(process.argv.slice(2))+'\\n');
}else process.exit(2);
`, { mode: 0o755 });
    writeFileSync(join(directory, "date"), `#!/usr/bin/env node
const args=process.argv.slice(2), index=args.indexOf('-d');
const time=index>=0?args[index+1]:process.env.WATCHDOG_TEST_NOW;
const seconds=Math.floor(Date.parse(time)/1000);
if(!Number.isFinite(seconds))process.exit(1);
console.log(seconds);
`, { mode: 0o755 });
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], { encoding: "utf8", env: {
      ...process.env, PATH: `${directory}:${process.env.PATH}`, GITHUB_REPOSITORY: "fixture/wikelo",
      REFRESH_WORKFLOW: "refresh-data.yml", MAX_REFRESH_AGE_SECONDS: "28800",
      GITHUB_STEP_SUMMARY: join(directory, "summary"), WATCHDOG_TEST_NOW: now,
      WATCHDOG_TEST_RUNS: join(directory, "runs.json"), WATCHDOG_TEST_DISPATCH: join(directory, "dispatch"),
      WATCHDOG_TEST_API_FAILURE: String(apiFailure),
    } });
    let dispatch = "";
    try { dispatch = readFileSync(join(directory, "dispatch"), "utf8"); } catch { /* No dispatch expected on healthy/blocked paths. */ }
    return { ...result, dispatch };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("existing refresh watchdog recovery", () => {
  it("checks only GitHub metadata hourly while preserving the primary 6-hour cadence", () => {
    expect(workflow).toContain('cron: "53 * * * *"');
    expect(primary).toContain('cron: "23 */6 * * *"');
    expect(script).not.toMatch(/refresh:data|fetch\(|curl |wget /);
    expect(() => execFileSync("bash", ["-n"], { input: script })).not.toThrow();
  });
  it("uses actual successful completion time rather than an old queued creation time", () => {
    const result = runWatchdog([success]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("heartbeat is healthy");
    expect(result.dispatch).toBe("");
  });
  it("dispatches one normal lightweight recovery after more than eight hours", () => {
    const result = runWatchdog([{ ...success, updated_at: "2026-10-18T20:59:00Z" }]);
    expect(result.status).toBe(0);
    expect(result.dispatch.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.dispatch)).toEqual(["workflow", "run", "refresh-data.yml", "--repo", "fixture/wikelo", "--ref", "main", "-f", "force_refresh=false"]);
  });
  it("does not dispatch a duplicate while a primary check is queued or running", () => {
    for (const status of ["queued", "in_progress"]) {
      const result = runWatchdog([{ ...success, status, conclusion: null }]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("already queued or running");
      expect(result.dispatch).toBe("");
    }
  });
  it("recovers an empty history or a history with no success", () => {
    for (const runs of [[], [{ ...success, conclusion: "failure" }]]) {
      const result = runWatchdog(runs);
      expect(result.status).toBe(0);
      expect(result.dispatch).not.toBe("");
    }
  });
  it("fails closed on an API failure without pretending the history is empty", () => {
    const result = runWatchdog([], true);
    expect(result.status).not.toBe(0);
    expect(result.dispatch).toBe("");
  });
});
