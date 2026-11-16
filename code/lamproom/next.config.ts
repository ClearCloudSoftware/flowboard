import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // The shadcn components import from the radix-ui barrel; lucide-react is already on Next's own list.
    optimizePackageImports: ["radix-ui"],
  },
  cacheComponents: true,
  // `/settings/connections` opens its first page; a page that redirects as it renders fails instant validation.
  redirects: async () => [{ source: "/settings/connections", destination: "/settings/connections/repositories", permanent: false }],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
