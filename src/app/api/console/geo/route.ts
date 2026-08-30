import { NextResponse } from "next/server";

import { geography } from "@/lib/corpus";
import { UpstreamError } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await geography());
  } catch (err) {
    const message =
      err instanceof UpstreamError ? err.message : "Could not build the geography rollup.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
