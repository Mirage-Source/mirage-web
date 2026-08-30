/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
          // Defense-in-depth against this app's own threat model: it
          // deliberately renders attacker-supplied strings (usernames, SSH
          // banners, credentials). React's escaping already prevents XSS
          // from that content; this is a second layer, not the only one.
          {
            key: "Content-Security-Policy",
            // 'unsafe-inline' on script-src is required for Next.js's own
            // hydration/RSC bootstrap <script> tags (no src attribute) --
            // without it the app never hydrates and renders blank. A
            // nonce-based CSP would avoid this but needs per-request
            // generation in proxy.ts; this static policy still blocks
            // every externally-hosted or attacker-injected <script src=...>.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
          },
          // Served exclusively over Cloudflare's TLS -- safe unconditionally.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
