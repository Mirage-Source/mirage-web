import { NextResponse } from "next/server";

import { clusters } from "@/lib/corpus";
import { UpstreamError } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ clusters: await clusters() });
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "Could not group clusters.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
