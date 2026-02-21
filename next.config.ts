import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ensure bundle.json is included in the serverless function
  outputFileTracingIncludes: {
    '/api/*': ['./data/bundle.json'],
  },
};

export default nextConfig;
