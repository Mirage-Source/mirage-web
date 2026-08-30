import { NextResponse, type NextRequest } from "next/server";

import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const after = p.get("after") ?? undefined;
  const limit = Number(p.get("limit") ?? 100);
  const search = (p.get("q") ?? "").trim().toLowerCase();
  const baitOnly = p.get("bait") === "true";
  const action = p.get("action");

  try {
    const page = await up.commandExport(after, Number.isFinite(limit) ? limit : 100);

    const commands = page.commands.filter((c) => {
      if (baitOnly && !c.bait_hit) return false;
      if (action && c.deception_action !== action) return false;
      if (search) {
        const hay = `${c.raw_command} ${c.client_ip} ${c.attacker_class ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    return NextResponse.json({ ...page, commands, command_count: commands.length });
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "Could not read commands.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
