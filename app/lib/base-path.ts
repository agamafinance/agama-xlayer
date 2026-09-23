/// The prefix the app is mounted under (app.agama.finance/xlayer). Next adds it
/// to routes, next/link and next/image by itself; anything hand written, a
/// fetch to our own API or a plain <img>, has to go through here.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
