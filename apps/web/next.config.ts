import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS || false;

let assetPrefix = '';
let basePath = '';

if (isGithubActions) {
  const repo = process.env.GITHUB_REPOSITORY?.replace(/.*?\//, '') || 'Torvaix';
  assetPrefix = `/${repo}/`;
  basePath = `/${repo}`;
}

const nextConfig: NextConfig = {
  assetPrefix,
  basePath,
  output: isGithubActions ? "export" : undefined,
  images: {
    unoptimized: true, // Required for static export
  },
  typescript: {
    ignoreBuildErrors: !!isGithubActions,
  },
  devIndicators: false
};

export default nextConfig;
