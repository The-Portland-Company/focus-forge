/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Cloudflare Pages — no server runtime.
  output: "export",
  trailingSlash: true,
  images: {
    // next/image optimization is unavailable in static export.
    unoptimized: true,
  },
};

export default nextConfig;
