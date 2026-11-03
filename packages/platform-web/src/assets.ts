export const DEFAULT_ASSET_BASE = `https://cdn.jsdelivr.net/npm/place-it@${__VERSION__}/assets/`;

export function resolveAssetUrl(path: string, baseUrl: string = DEFAULT_ASSET_BASE): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/**
 * Base URL for files shipped beside a classic script: that script's URL while it first runs (the CDN bundle), else the
 * page's base URL. Read once, when this module is evaluated; undefined outside a browser.
 */
export const scriptBase: string | undefined =
  typeof document === "undefined" ? undefined : (document.currentScript as HTMLScriptElement | null)?.src || document.baseURI;

/**
 * Browsers refuse a Worker whose script is on another origin (the CDN case). A same-origin blob that imports the
 * script works instead, provided the CDN sends CORS headers (jsDelivr does).
 */
export function createWorker(url: string): Worker {
  const abs = new URL(url, document.baseURI);
  if (abs.origin === location.origin) return new Worker(abs, { type: "module" });
  const shim = URL.createObjectURL(new Blob([`import ${JSON.stringify(abs.href)};`], { type: "text/javascript" }));
  return new Worker(shim, { type: "module" });
}
