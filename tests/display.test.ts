import { describe, expect, it } from "vitest";
import { formatVersion } from "../src/lib/display";

describe("public version labels", () => {
  it("keeps the release channel while hiding internal build numbers", () => {
    expect(formatVersion("4.9.0 LIVE.12344265")).toBe("4.9.0 LIVE");
    expect(formatVersion("4.10.0 PTU.9876543")).toBe("4.10.0 PTU");
    expect(formatVersion("4.10.0 EPTU.1234")).toBe("4.10.0 EPTU");
  });
});
