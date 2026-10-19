import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8"));
const lock = JSON.parse(readFileSync(`${process.cwd()}/package-lock.json`, "utf8"));

// Offline guards for the reviewed advisories; registry audit is still required
// before release because this list cannot predict future vulnerabilities.
const patches = [
  ["fast-uri", "3.1.8"],
  ["nanoid", "3.3.18"],
  ["source-map-js", "1.2.2"],
  ["undici", "8.10.2"],
  ["vitest", "4.1.11"],
  ["@vitest/mocker", "4.1.11"],
];

function atLeast(version: string, minimum: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const installed = version.split(".").map(Number), required = minimum.split(".").map(Number);
  const difference = installed.map((value, index) => value - required[index]).find(value => value !== 0);
  return difference === undefined || difference > 0;
}

describe("reviewed dependency security patches", () => {
  it.each(patches)("never locks a known affected %s version below %s", (name, minimum) => {
    const entries = Object.entries(lock.packages).filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`));
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(atLeast((value as { version: string }).version, minimum), key).toBe(true);
    }
  });

  it("pins the reviewed Vitest release and aligns its internal packages", () => {
    const version = lock.packages["node_modules/vitest"].version;
    expect(manifest.devDependencies.vitest).toBe(version);
    expect(lock.packages[""].devDependencies.vitest).toBe(version);
    for (const [key, value] of Object.entries(lock.packages)) {
      if (key.startsWith("node_modules/@vitest/")) expect((value as { version: string }).version, key).toBe(version);
    }
  });
});
