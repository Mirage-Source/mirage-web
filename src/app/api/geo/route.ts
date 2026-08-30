import { NextResponse } from "next/server";

import { geography } from "@/lib/corpus";
import { publicGeo } from "@/lib/sanitise";

export const runtime = "nodejs";
export const revalidate = 900;

export async function GET() {
  try {
    const geo = publicGeo(await geography());
    return NextResponse.json(geo ?? { countries: [], asns: [], resolved: 0 });
  } catch {
    return NextResponse.json({ countries: [], asns: [], resolved: 0 });
  }
}
