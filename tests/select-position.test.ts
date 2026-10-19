import { describe, expect, it } from "vitest";
import { selectMenuPosition } from "../src/components/CustomSelect";

describe("select viewport placement", () => {
  it("keeps ordinary menus below their trigger", () => {
    expect(selectMenuPosition({ left: 100, top: 200, bottom: 240, width: 220 }, 1440, 900, 4))
      .toEqual({ left: 100, top: 245, width: 220, maxHeight: 647 });
  });
  it("opens the bottom mobile sort menu upwards instead of forcing 80px off screen", () => {
    expect(selectMenuPosition({ left: 31, top: 493, bottom: 531, width: 258 }, 320, 568, 4))
      .toEqual({ left: 31, bottom: 80, width: 258, maxHeight: 480 });
  });
  it("bounds width and internal scrolling in a narrow, low-height window", () => {
    const style = selectMenuPosition({ left: 290, top: 120, bottom: 160, width: 360 }, 300, 220, 124);
    expect(style).toEqual({ left: 8, bottom: 105, width: 284, maxHeight: 107 });
    expect(Number(style.maxHeight) + Number(style.bottom)).toBeLessThanOrEqual(212);
  });
  it("does not impose a minimum menu height greater than the available space", () => {
    expect(selectMenuPosition({ left: 8, top: 30, bottom: 70, width: 190 }, 220, 100, 4))
      .toEqual({ left: 8, top: 75, width: 190, maxHeight: 17 });
  });
});
