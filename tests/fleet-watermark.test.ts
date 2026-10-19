import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const theme = readFileSync("src/blueprint-theme.css", "utf8");
const shared = theme.match(/\.results-section::before,\s*\.trade-modal::before,\s*\.item-modal::before\s*\{([^}]+)\}/)?.[1] ?? "";
const modalWatermark = theme.match(/\.trade-modal::before,\s*\.item-modal::before\s*\{([^}]+)\}/g)?.at(-1) ?? "";

describe("original-color decorative fleet watermark", () => {
  it("retains the exact approved transparent PNG, not the processed footer logo", () => {
    const png = readFileSync("public/assets/fleet-watermark.png");
    expect(createHash("sha256").update(png).digest("hex")).toBe("f611ece2d8422bb32032037cdaa91dac242585e6d608fed820ea299967e8ce4c");
    expect(png.readUInt32BE(16)).toBe(1254);
    expect(png.readUInt32BE(20)).toBe(1254);
    expect(png[25]).toBe(6); // Original PNG uses RGBA, including its blue halo.
  });

  it("uses one contained, nonrepeating original image behind content without pointer events", () => {
    expect(shared).toContain('background: url("/assets/fleet-watermark.png") center / contain no-repeat;');
    expect(shared).toMatch(/pointer-events:\s*none;/);
    expect(shared).toMatch(/z-index:\s*-1;/);
    expect(shared).toMatch(/left:\s*50%;/);
    expect(shared).toMatch(/bottom:\s*0;/);
    expect(shared).toMatch(/transform:\s*translateX\(-50%\);/);
    expect(shared).not.toMatch(/(?:mask|filter|mix-blend-mode)\s*:/);
  });

  it("limits the page watermark to six percent and responsive width/height caps", () => {
    expect(shared).toMatch(/opacity:\s*0\.06;/);
    expect(shared).toMatch(/width:\s*min\(88%, 1180px\);/);
    expect(shared).toMatch(/max-height:\s*85%;/);
    expect(shared).toMatch(/aspect-ratio:\s*1;/);
    expect(theme.match(/\.results-section\s*\{([^}]+)\}/)?.[1]).toMatch(/isolation:\s*isolate;/);
  });

  it("isolates both ordinary dialog backgrounds at five percent without changing card opacity", () => {
    expect(modalWatermark).toMatch(/opacity:\s*0\.05;/);
    expect(modalWatermark).toMatch(/width:\s*min\(86%, 640px\);/);
    expect(theme.match(/\.modal\s*\{([^}]+)\}/)?.[1]).toMatch(/isolation:\s*isolate;/);
    expect(theme).not.toMatch(/\.trade-card\s*\{[^}]*opacity\s*:/);
  });

  it("does not add watermark pseudo-elements to photographs, tables, or trade cards", () => {
    expect(theme).not.toMatch(/(?:\.image-lightbox[\w-]*|\.trade-card|table)::(?:before|after)/);
    expect(readFileSync("src/App.tsx", "utf8")).not.toContain("fleet-watermark");
  });
});
