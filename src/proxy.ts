import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, isValid, passwordConfigured } from "@/lib/auth";

export default async function proxy(req: NextRequest) {
  if (!passwordConfigured()) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return deny(req, "unconfigured");
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValid(token)) return NextResponse.next();

  return deny(req, "signin");
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
  matcher: ["/console/:path*", "/api/console/:path*"],
};
