import { NextResponse, type NextRequest } from "next/server";

import { geography } from "@/lib/corpus";
import { UpstreamError } from "@/lib/upstream";
import { parseProtocol } from "@/lib/session-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await geography(parseProtocol(req.nextUrl.searchParams.get("protocol"))));
  } catch (err) {
    const message =
      err instanceof UpstreamError ? err.message : "Could not build the geography rollup.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
