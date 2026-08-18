import { describe, expect, it } from "vitest";
import { sourceAwareMediaShape } from "../src/App";

describe("classified image proportions", () => {
  it("keeps 4:3 ground-vehicle artwork in a landscape frame", () => {
    expect(sourceAwareMediaShape("landscape", 640, 462)).toBe("landscape");
  });

  it("keeps portrait armor artwork in a portrait frame", () => {
    expect(sourceAwareMediaShape("portrait", 505, 783)).toBe("portrait");
  });

  it("does not force a square source into a landscape frame", () => {
    expect(sourceAwareMediaShape("landscape", 600, 600)).toBe("square");
  });
});
