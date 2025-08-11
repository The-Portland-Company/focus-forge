/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath: '',
  assetPrefix: '',
  // Disable API routes for static export
  experimental: {
    // Skip API routes during static export
  }
}

module.exports = nextConfig