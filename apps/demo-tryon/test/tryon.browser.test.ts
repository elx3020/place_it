import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig, serializeConfig } from "place-it";
import { chromium, type Browser, type Page } from "playwright";
import { build } from "vite";
import { afterEach, beforeAll, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const repo = join(root, "../..");
const sphere = join(repo, "packages/render/fixtures/sphere.glb");
// One fake https origin, served by request interception: the CDN bundle at /cdn/, fixtures at /fixtures/, the built demo at /.
const ORIGIN = "https://shop.test";
const dirs: [string, string][] = [
  ["/cdn/", join(repo, "packages/place-it/dist")],
  ["/fixtures/", join(repo, "packages/render/fixtures")],
  ["/", join(root, "dist")],
];

let browser: Browser | undefined;

beforeAll(() => build({ root, logLevel: "warn" }));
afterEach(() => browser?.close());

/** New-headless Chromium (it denies an ungranted camera like a real browser) with a fake camera device. */
async function open(args: string[], pages: Record<string, string> = {}): Promise<Page> {
  browser = await chromium.launch({ channel: "chromium", args: ["--use-fake-device-for-media-stream", ...args] });
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (pages[path]) return route.fulfill({ contentType: "text/html", body: pages[path] });
    const [prefix, dir] = dirs.find(([p]) => path.startsWith(p))!;
    await route.fulfill({ path: join(dir, path === "/" ? "index.html" : path.slice(prefix.length)) }).catch(() => route.fulfill({ status: 404 }));
  });
  page.on("pageerror", (e) => console.error("page error:", e));
  return page;
}

async function openDemoWithSphere(args: string[]): Promise<Page> {
  const page = await open(args);
  await page.goto(`${ORIGIN}/`);
  await page.setInputFiles("#file", sphere);
  await page.getByText("Click the preview").waitFor();
  return page;
}

it("exports a config that round-trips, then tries it on over the fake camera with no error", async () => {
  const page = await openDemoWithSphere(["--use-fake-ui-for-media-stream"]);
  await page.check("#mirror");
  await page.click("#preview", { position: { x: 180, y: 60 } }); // right of and above the model origin
  await page.click("#export");
  const json = await page.inputValue("#json");
  const config = parseConfig(JSON.parse(json));
  expect(serializeConfig(config)).toBe(json);
  expect(config).toMatchObject({ version: 1, target: "ear", mirror: true, scale: 1 });
  expect(config.anchor[0]).toBeGreaterThan(0);
  expect(config.anchor[1]).toBeGreaterThan(0);

  await page.click("#tryon");
  // models come from the network (MediaPipe on jsDelivr / Google storage); then the loop must run 3 s without an error event
  await page.locator("#status", { hasText: "Running" }).or(page.locator("#error:not(:empty)")).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  expect(await page.textContent("#error")).toBe("");
  expect(await page.textContent("#status")).toBe("Running");
  // the session sized the canvas to the camera frame (Chromium's fake device is 640x480)
  expect(await page.$eval("#view", (c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([640, 480]);
});

it("shows camera-denied when the camera permission is denied", async () => {
  const page = await openDemoWithSphere([]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Browser.setPermission", { permission: { name: "camera" }, setting: "denied", origin: ORIGIN });
  await page.click("#tryon");
  await expect.poll(() => page.textContent("#error"), { timeout: 10_000 }).toContain("camera-denied");
});

it("CDN script tag: engine files load next to the script and their errors are PlaceIt.PlaceItError", async () => {
  const page = await open([], { "/shop.html": `<canvas id="a"></canvas><canvas id="b"></canvas><script src="/cdn/place-it.global.js"></script>` });
  const requested: string[] = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto(`${ORIGIN}/shop.html`);
  const bad = await page.evaluate(async () => {
    const { createPlaceIt, PlaceItError } = (window as unknown as { PlaceIt: typeof import("place-it") }).PlaceIt;
    const config: import("place-it").PlacementConfig = { version: 1, target: "ear", anchor: [0, 0, 0] };
    const canvas = (id: string) => document.getElementById(id) as HTMLCanvasElement;
    const bad = await createPlaceIt({ canvas: canvas("a"), target: "ear" })
      .load("/fixtures/empty.glb", config)
      .then(() => "resolved", (e) => [e.code, e instanceof PlaceItError]);
    await createPlaceIt({ canvas: canvas("b"), target: "ear" }).load("/fixtures/sphere.glb", config);
    return bad;
  });
  expect(bad).toEqual(["model-invalid", true]);
  expect(requested).toEqual(expect.arrayContaining(["/cdn/render.js", "/cdn/tracking.js"]));
});
