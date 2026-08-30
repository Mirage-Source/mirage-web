import { NextResponse, type NextRequest } from "next/server";

import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sensor = req.nextUrl.searchParams.get("sensor") ?? undefined;

  try {
    return NextResponse.json(await up.validity(sensor));
  } catch (err) {
    if (err instanceof UpstreamError) {
      return NextResponse.json(
        { error: err.status === 404 ? "No such sensor." : err.message },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    return NextResponse.json({ error: "Could not read validity." }, { status: 500 });
  }
}
