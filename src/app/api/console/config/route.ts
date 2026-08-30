import { NextResponse } from "next/server";

import { runtimeConfig } from "@/lib/derived";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await runtimeConfig());
}

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "The sensor has no runtime-config endpoint. These flags are environment variables read at process start; changing one means editing .env and restarting the service.",
      writable: false,
    },
    { status: 501 },
  );
}
