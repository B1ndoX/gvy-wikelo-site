import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const theme = readFileSync(resolve(process.cwd(), "src/blueprint-theme.css"), "utf8");

describe("public document metadata", () => {
  it("describes the current query flow without claiming removed inventory features", () => {
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    expect(description).toContain("物品获取方式");
    expect(description).not.toMatch(/库存|缺口|账号/);
  });
  it("uses the approved page background for browser chrome", () => {
    const background = theme.match(/--bg:\s*(#[a-f\d]+);/)?.[1];
    expect(background).toBeTruthy();
    expect(html).toContain(`<meta name="theme-color" content="${background}"`);
  });
});
