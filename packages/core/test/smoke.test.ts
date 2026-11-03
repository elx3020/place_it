import { expect, test } from "vitest";
import { VERSION } from "../src";

test("VERSION is a non-empty string", () => {
  expect(typeof VERSION).toBe("string");
  expect(VERSION.length).toBeGreaterThan(0);
});

test("PlaceItError carries the physics-failed code", async () => {
  const { PlaceItError } = await import("../src");
  const e = new PlaceItError("physics-failed", "boom");
  expect(e.code).toBe("physics-failed");
  expect(e).toBeInstanceOf(Error);
});
