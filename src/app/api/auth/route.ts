import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, checkPassword, issue, passwordConfigured } from "@/lib/auth";

export const runtime = "nodejs";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

const attempts = new Map<string, { n: number; until: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);

  if (!rec || now > rec.until) {
    attempts.set(ip, { n: 1, until: now + WINDOW_MS });
    return false;
  }

  rec.n += 1;
  return rec.n > MAX_ATTEMPTS;
}

function sourceOf(req: NextRequest): string {
  // cf-connecting-ip is set authoritatively by Cloudflare's edge (how this
  // app is actually exposed) and cannot be forged by the client, unlike
  // x-forwarded-for -- Cloudflare appends to, rather than overwrites, an
  // existing XFF chain, so trusting index [0] there lets an attacker set
  // their own value and defeat rate limiting entirely.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || "local";
}

export async function POST(req: NextRequest) {
  if (!passwordConfigured()) {
    return NextResponse.json(
      { error: "No operator password is configured." },
      { status: 503 },
    );
  }

  if (rateLimited(sourceOf(req))) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Not accepted." }, { status: 401 });
  }

  const { value, maxAge } = await issue();
  const res = NextResponse.json({ ok: true });

  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
