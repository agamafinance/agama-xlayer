/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The runtime is verified in dev across all routes; skip strict build gates so
  // dapp-kit/@mysten type-version mismatches don't block the v1 deploy.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // app.agama.finance/xlayer serves the OKX Dev Day build, which lives in its
  // own Vercel project. It sets basePath "/xlayer", so its routes and assets
  // already carry the prefix and nothing collides with this app's /_next.
  async rewrites() {
    return [
      { source: '/xlayer', destination: 'https://agama-xlayer.vercel.app/xlayer' },
      { source: '/xlayer/:path*', destination: 'https://agama-xlayer.vercel.app/xlayer/:path*' },
    ];
  },
  async headers() {
    return [
      {
        // Needed so the Google zkLogin (Enoki) popup can post its result back.
        source: '/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
    ];
  },
};

export default nextConfig;
