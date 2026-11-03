import { describe, it, expect } from "vitest";
import { parseConfig, serializeConfig, PlaceItError } from "../src/index";

const codeOf = (f: () => unknown) => {
  try { f(); } catch (e) { return e instanceof PlaceItError ? e.code : "other"; }
  return "none";
};

describe("config", () => {
  it("round-trips and applies defaults", () => {
    const c = parseConfig({ version: 1, target: "ear", anchor: [0, 1, 2] });
    expect(c).toEqual({ version: 1, target: "ear", anchor: [0, 1, 2], scale: 1, mirror: false });
    expect(parseConfig(JSON.parse(serializeConfig(c)))).toEqual(c);
  });
  it("neck gets no mirror default but accepts one", () => {
    expect(parseConfig({ version: 1, target: "neck", anchor: [0, 0, 0] }).mirror).toBeUndefined();
    expect(parseConfig({ version: 1, target: "neck", anchor: [0, 0, 0], mirror: true }).mirror).toBe(true);
  });
  it("rejects future version", () => {
    expect(codeOf(() => parseConfig({ version: 2, target: "ear", anchor: [0, 0, 0] }))).toBe("config-version");
  });
  it.each([
    ["target", { version: 1, target: "wrist", anchor: [0, 0, 0] }],
    ["NaN", { version: 1, target: "ear", anchor: [NaN, 0, 0] }],
    ["Infinity", { version: 1, target: "ear", anchor: [0, Infinity, 0] }],
    ["scale 0", { version: 1, target: "ear", anchor: [0, 0, 0], scale: 0 }],
    ["scale neg", { version: 1, target: "ear", anchor: [0, 0, 0], scale: -1 }],
    ["string", "x"],
    ["null", null],
    ["array", []],
  ])("rejects invalid %s", (_n, input) => {
    expect(codeOf(() => parseConfig(input))).toBe("config-invalid");
  });
});
