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

export const createWorker = (url: string): Worker => new Worker(url, { type: "module" });
