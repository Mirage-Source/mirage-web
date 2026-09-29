import { NextResponse, type NextRequest } from "next/server";

import { clusters } from "@/lib/corpus";
import { UpstreamError } from "@/lib/upstream";
import { parseProtocol } from "@/lib/session-doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ clusters: await clusters(parseProtocol(req.nextUrl.searchParams.get("protocol"))) });
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "Could not group clusters.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
