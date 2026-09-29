import { NextResponse, type NextRequest } from "next/server";

import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";
import { parseProtocol } from "@/lib/session-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 25);

  try {
    const protocol = parseProtocol(req.nextUrl.searchParams.get("protocol"));
    return NextResponse.json(await up.feed(Number.isFinite(limit) ? limit : 25, protocol));
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "Could not read the feed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
