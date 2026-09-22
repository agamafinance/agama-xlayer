import {dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Foundry repo sits one level up; pin the app root so Turbopack does
  // not guess a workspace from unrelated lockfiles.
  turbopack: {root},
};

export default nextConfig;
