export const DEFAULT_ASSET_BASE = `https://cdn.jsdelivr.net/npm/place-it@${__VERSION__}/assets/`;

export function resolveAssetUrl(path: string, baseUrl: string = DEFAULT_ASSET_BASE): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export const createWorker = (url: string): Worker => new Worker(url, { type: "module" });
