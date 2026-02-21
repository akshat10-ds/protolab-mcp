import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensure bundle.json is included in the serverless function
  outputFileTracingIncludes: {
    '/api/*': ['./data/bundle.json'],
  },

  // Cache headers for static source files and fonts
  headers: async () => [
    {
      source: '/source/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        { key: 'Access-Control-Allow-Origin', value: '*' },
      ],
    },
    {
      source: '/fonts/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        { key: 'Access-Control-Allow-Origin', value: '*' },
      ],
    },
  ],
};

export default nextConfig;
