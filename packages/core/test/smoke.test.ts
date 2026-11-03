import { expect, test } from "vitest";
import { VERSION } from "../src";

test("VERSION is a non-empty string", () => {
  expect(typeof VERSION).toBe("string");
  expect(VERSION.length).toBeGreaterThan(0);
});
