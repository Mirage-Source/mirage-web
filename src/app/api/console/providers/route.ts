import { NextResponse } from "next/server";

import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await up.providers());
  } catch {
    return NextResponse.json({
      configured: false,
      reachable: false,
      active: null,
      providers: [],
    });
  }
}

export async function POST(req: Request) {
  let name = "";
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === "string") name = body.name.trim();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Name a provider to switch to." }, { status: 400 });
  }

  try {
    return NextResponse.json(await up.setActiveProvider(name));
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 400) {
      return NextResponse.json({ error: `The sensor does not know "${name}".` }, { status: 400 });
    }
    return NextResponse.json(
      { error: "The sensor did not accept the switch." },
      { status: 502 },
    );
  }
}
