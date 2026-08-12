import { describe, expect, it } from "vitest";
import { formatVersion } from "../src/lib/display";

describe("public version labels", () => {
  it("keeps the release channel while hiding internal build numbers", () => {
    expect(formatVersion("4.9.0 LIVE.12344265")).toBe("4.9.0 LIVE");
  });
});
