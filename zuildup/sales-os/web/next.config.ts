import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  // Sales-team feedback 2026-05-29: top-filter pills (Y2G/ZuildUp) and
  // the search bar appeared to "not work" — clicking changed the URL
  // but the list didn't update. Root cause: Next 15 App Router
  // **Router Cache** prefetches and caches RSC payloads per-href. With
  // the default `staleTimes.dynamic = 30`, even though our /leads page
  // is `dynamic = 'force-dynamic'` on the server, the client serves
  // the prefetched cached payload for up to 30s after navigation. The
  // FilterBar already calls `router.refresh()` to invalidate; the
  // partner-pill `<Link>`s do NOT. Setting `staleTimes.dynamic = 0`
  // makes every dynamic-route navigation re-fetch the RSC from the
  // server, which is the behaviour the sales team expects.
  // Docs: https://nextjs.org/docs/app/api-reference/next-config-js/staleTimes
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
};

export default nextConfig;
