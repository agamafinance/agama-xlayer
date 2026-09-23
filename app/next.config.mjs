import {dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// The app is served under app.agama.finance/xlayer, so every route and asset
// carries that prefix. Set NEXT_PUBLIC_BASE_PATH="" to serve it at the root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/xlayer";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath,
  // Next prefixes routes, next/link and next/image on its own. Plain fetch and
  // plain <img> do not, so the value is readable at runtime too.
  env: {NEXT_PUBLIC_BASE_PATH: basePath},
  // The Foundry repo sits one level up; pin the app root so Turbopack does
  // not guess a workspace from unrelated lockfiles.
  turbopack: {root},
};

export default nextConfig;
