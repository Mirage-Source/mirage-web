import { NextResponse, type NextRequest } from "next/server";

import { querySessions } from "@/lib/corpus";
import { UpstreamError } from "@/lib/upstream";
import type { SessionQuery, SessionSort } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS: SessionSort[] = ["recent", "duration", "commands", "bait", "severity"];

function list(params: URLSearchParams, key: string): string[] | undefined {
  const raw = params.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
  return raw.length ? raw : undefined;
}

function num(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const sort = p.get("sort") as SessionSort | null;

  const query: SessionQuery = {
    search: p.get("q") ?? undefined,
    classes: list(p, "class"),
    outcomes: list(p, "outcome"),
    severities: list(p, "severity"),
    technique: p.get("technique") ?? undefined,
    cluster: p.get("cluster") ?? undefined,
    bait: p.get("bait") === "true",
    shell: p.get("shell") === "true",
    since_ms: num(p, "since_ms"),
    until_ms: num(p, "until_ms"),
    sort: sort && SORTS.includes(sort) ? sort : "recent",
    order: p.get("order") === "asc" ? "asc" : "desc",
    limit: num(p, "limit") ?? 50,
    offset: num(p, "offset") ?? 0,
    withGeo: p.get("geo") !== "false",
  };

  try {
    return NextResponse.json(await querySessions(query));
  } catch (err) {
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not read the corpus." }, { status: 500 });
  }
}
