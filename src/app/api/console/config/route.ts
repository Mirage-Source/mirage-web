import { NextResponse, type NextRequest } from "next/server";

import { runtimeConfig } from "@/lib/derived";
import { updateSensorConfig, UpstreamError } from "@/lib/upstream";
import type { WritableConfigKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITABLE_KEYS: WritableConfigKey[] = ["deception_enabled", "deception_apply_actions"];

export async function GET() {
  return NextResponse.json(await runtimeConfig());
}

export async function PATCH(req: NextRequest) {
  const config = await runtimeConfig();
  if (config.writable.length === 0) {
    return NextResponse.json(
      {
        error:
          "The sensor has no runtime-config endpoint reachable right now, or MIRAGE_API_URL/MIRAGE_API_KEY isn't set -- see docs/API-GAPS.md §4.",
        writable: [],
      },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const patch: Partial<Record<WritableConfigKey, boolean>> = {};
  for (const key of Object.keys(body)) {
    if (!WRITABLE_KEYS.includes(key as WritableConfigKey)) {
      return NextResponse.json(
        { error: `${key} is not writable -- see the note on the Control tab for why` },
        { status: 400 },
      );
    }
    const value = body[key];
    if (typeof value !== "boolean") {
      return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 });
    }
    patch[key as WritableConfigKey] = value;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "expected at least one writable key" }, { status: 400 });
  }

  try {
    await updateSensorConfig(patch);
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "failed to reach the sensor";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json(await runtimeConfig());
}
