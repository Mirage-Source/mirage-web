import { NextResponse } from "next/server";

import { behaviourOf } from "@/lib/behaviour";
import * as geo from "@/lib/geo";
import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";
import type { SessionEnvelope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing session id." }, { status: 400 });
  }

  try {
    const detail = await up.session(id);
    const located = geo.geoAvailable() ? await geo.resolve([detail.client_ip]) : null;
    const hit = located?.get(detail.client_ip);

    const envelope: SessionEnvelope = {
      detail,
      behaviour: behaviourOf(detail),
      geo: {
        country: hit?.country ?? null,
        asn: hit?.asn ?? null,
        asn_name: hit?.asnName ?? null,
      },
    };

    return NextResponse.json(envelope);
  } catch (err) {
    if (err instanceof UpstreamError) {
      return NextResponse.json(
        { error: err.status === 404 ? "No such session." : err.message },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    if (err instanceof Error && err.message === "session not found") {
      return NextResponse.json({ error: "No such session." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not read that session." }, { status: 500 });
  }
}
