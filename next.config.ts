import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standalone output — traces the minimal set of files/deps needed to run
  // `node server.js`, so the production Docker image doesn't need the full
  // node_modules tree or the Next.js CLI. Additive: `next dev` is unaffected.
  output: "standalone",
  // App pages moved from flat top-level routes (e.g. /analytics) to nested
  // routes under /dashboard (e.g. /dashboard/analytics) so the root URL
  // could become the public marketing site. These redirects keep any
  // existing bookmarks/links to the old URLs working.
  async redirects() {
    const moved = [
      "analytics", "inventory", "menu", "forecast", "scheduling",
      "compliance", "settings", "chat", "alerts", "data-center",
      "integrations", "restaurant-profile",
    ];
    return [
      ...moved.map((path) => ({
        source: `/${path}`,
        destination: `/dashboard/${path}`,
        permanent: true,
      })),
      // Availability was already folded into the Scheduling page's tabs
      // (see the old src/app/availability/page.tsx client redirect this
      // replaces) — now Scheduling itself lives under /dashboard.
      { source: "/availability", destination: "/dashboard/scheduling", permanent: true },
    ];
  },
  // Baseline security headers. CSP is intentionally not set here — Next.js
  // needs inline/hashed scripts for its own runtime and a correct CSP would
  // require per-build nonce wiring; that's a larger change than this pass
  // scopes. These headers are cheap, safe defaults with no such tradeoff.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
