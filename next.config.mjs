/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker runner copies only .next/standalone + .next/static (see
  // Dockerfile) -- without this the image would need the full node_modules
  // tree instead of Next's pruned server bundle.
  output: "standalone",
  async headers() {
    return [
      {
        // The console renders operator data. Nothing here should ever be
        // framed, sniffed, or leak a referrer to the upstream sensor.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // Content-Security-Policy is NOT set here. It is issued per-request
          // in src/proxy.ts, which is the only place that can mint a nonce:
          // /console and /login get 'nonce-...' with 'strict-dynamic', the
          // public page keeps a static policy so it stays on ISR. Setting it
          // in both places would emit two CSP headers, and browsers enforce
          // the intersection -- easy to get wrong, hard to notice.
          // Served exclusively over Cloudflare's TLS -- safe unconditionally.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
