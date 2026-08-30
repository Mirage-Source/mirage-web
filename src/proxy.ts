import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, isValid, passwordConfigured } from "@/lib/auth";

// Paths that render operator data and are already dynamic, so a per-request
// nonce costs nothing. Everything else -- the public page above all -- keeps a
// static policy so it can stay on ISR.
const NONCED = ["/console", "/login"];

// Paths behind the operator gate. Deliberately narrower than the matcher:
// /login is nonced but must stay reachable, or signing in is a redirect loop.
const GATED = ["/console", "/api/console"];

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

function policy(nonce: string | null): string {
  const isDev = process.env.NODE_ENV === "development";

  // 'unsafe-eval' is required in development only: React uses eval to
  // reconstruct server-side error stacks in the browser. Neither React nor
  // Next.js use it in a production build.
  const script = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`
    : // The public page is statically rendered, so there is no per-request
      // nonce to issue. 'unsafe-inline' is what Next.js's own hydration
      // bootstrap needs; this still blocks every externally-hosted or
      // attacker-injected <script src=...>.
      `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;

  return [
    "default-src 'self'",
    `script-src ${script}`,
    // next/font emits an un-nonced inline <style> for its @font-face block, so
    // style-src stays permissive on both paths. Inline CSS is a far weaker
    // vector than inline script, and the alternative is a broken typeface.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Next.js reads the nonce off the request's own CSP header and applies it to
  // the bootstrap <script> tags it emits, so nothing downstream has to call
  // headers() -- which matters, because doing that in the shared root layout
  // would drag the public page out of ISR along with it.
  const nonce = startsWithAny(pathname, NONCED)
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : null;
  const csp = policy(nonce);

  const withCSP = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const pass = () => {
    if (!nonce) return withCSP(NextResponse.next());

    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return withCSP(NextResponse.next({ request: { headers } }));
  };

  if (!startsWithAny(pathname, GATED)) return pass();

  if (!passwordConfigured()) {
    if (process.env.NODE_ENV !== "production") return pass();
    return withCSP(deny(req, "unconfigured"));
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValid(token)) return pass();

  return withCSP(deny(req, "signin"));
}

function deny(req: NextRequest, reason: "unconfigured" | "signin") {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error:
          reason === "unconfigured"
            ? "No operator password is configured on this deployment."
            : "Not signed in.",
      },
      { status: 401 },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = reason === "unconfigured" ? "?reason=unconfigured" : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Broad, because the CSP is now issued here rather than in next.config.mjs --
  // one place decides the policy for every document. Static assets, the image
  // optimiser and favicon are excluded: they are not documents and a CSP on
  // them buys nothing.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
