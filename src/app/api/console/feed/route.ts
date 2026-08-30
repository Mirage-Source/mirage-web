import { NextResponse, type NextRequest } from "next/server";

import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 25);

  try {
    return NextResponse.json(await up.feed(Number.isFinite(limit) ? limit : 25));
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "Could not read the feed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
