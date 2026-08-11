/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [65, 75, 100],
  },
  async headers() {
    return [
      {
        source: '/templates/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/polibatam.jpg',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
