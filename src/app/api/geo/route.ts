import { NextResponse } from "next/server";

import { geography } from "@/lib/corpus";
import { publicGeo } from "@/lib/sanitise";

export const runtime = "nodejs";

// Dynamic on purpose. This route reads the full session export, which is
// fetched with caching disabled, and Next cannot regenerate a static route
// around a no-store fetch: it prerendered an empty answer at build time
// (no sensor, no geo files inside `docker build`) and then failed every
// background regeneration, serving that empty answer for good. The corpus
// and the address lookups are cached in memory, so computing the rollup per
// request is cheap; the header below lets Cloudflare and browsers reuse it.
export const dynamic = "force-dynamic";

const EMPTY = { countries: [], asns: [], resolved: 0 };
const HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" };

export async function GET() {
  try {
    const geo = publicGeo(await geography());
    return NextResponse.json(geo ?? EMPTY, { headers: HEADERS });
  } catch (err) {
    // Never silent: an empty map should be explicable from the logs.
    console.error("[api/geo] rollup failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(EMPTY, { headers: { "Cache-Control": "no-store" } });
  }
}
