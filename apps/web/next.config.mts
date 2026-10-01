import path from "path";
import type { NextConfig } from "next";

// An .mts file is an explicit ES module (what Next recommends for CommonJS packages like this one),
// so Node doesn't have to re-parse it, and __dirname is replaced by import.meta.dirname.
const here = import.meta.dirname;

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve(here, "../../"),
  },
  images: {
    unoptimized: true,
  },
  typescript: {
    // Type errors should fail the build (and CI) instead of shipping silently.
    ignoreBuildErrors: false,
  },
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
