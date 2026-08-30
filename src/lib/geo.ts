import "server-only";

import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

export interface GeoRecord {
  ip: string;
  country: string | null;
  asn: number | null;
  asnName: string | null;
}

const UNKNOWN = "ZZ";

const cache = new Map<string, GeoRecord>();

function geoDir(): string | null {
  const configured = process.env.MIRAGE_GEO_DIR;
  const candidates = configured
    ? [configured]
    : [
        path.resolve(process.cwd(), "..", "mirage-core-main", "mirage-core-main", "data", "geo"),
        path.resolve(process.cwd(), "..", "mirage-core", "data", "geo"),
        path.resolve(process.cwd(), "data", "geo"),
      ];

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "dbip-country-lite.csv"))) return dir;
  }
  return null;
}

export function geoAvailable(): boolean {
  return geoDir() !== null;
}

function toInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = n * 256 + octet;
  }
  return n;
}

function splitRow(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

async function sweep(
  file: string,
  pending: { ip: string; n: number }[],
  apply: (target: GeoRecord, row: string[]) => void,
): Promise<void> {
  const sorted = [...pending].sort((a, b) => a.n - b.n);
  let cursor = 0;

  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (cursor >= sorted.length) break;
    if (!line) continue;

    const row = splitRow(line);
    const start = toInt(row[0]);
    const end = toInt(row[1]);
    if (start === null || end === null) continue;

    while (cursor < sorted.length && sorted[cursor].n < start) cursor += 1;

    while (cursor < sorted.length && sorted[cursor].n <= end) {
      const target = cache.get(sorted[cursor].ip);
      if (target) apply(target, row);
      cursor += 1;
    }
  }

  rl.close();
}

let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export async function resolve(ips: string[]): Promise<Map<string, GeoRecord>> {
  const unique = Array.from(new Set(ips));
  const result = new Map<string, GeoRecord>();

  const dir = geoDir();
  if (!dir) {
    for (const ip of unique) result.set(ip, { ip, country: null, asn: null, asnName: null });
    return result;
  }

  return serialise(async () => {
    const pending: { ip: string; n: number }[] = [];

    for (const ip of unique) {
      const hit = cache.get(ip);
      if (hit) {
        result.set(ip, hit);
        continue;
      }

      const n = toInt(ip);
      const record: GeoRecord = { ip, country: null, asn: null, asnName: null };
      cache.set(ip, record);
      result.set(ip, record);

      if (n !== null) pending.push({ ip, n });
    }

    if (pending.length === 0) return result;

    await sweep(path.join(dir, "dbip-country-lite.csv"), pending, (target, row) => {
      const code = row[2]?.trim().toUpperCase();
      if (code && code !== UNKNOWN) target.country = code;
    });

    const asnFile = path.join(dir, "dbip-asn-lite.csv");
    if (existsSync(asnFile)) {
      await sweep(asnFile, pending, (target, row) => {
        const asn = Number(row[2]);
        if (Number.isFinite(asn)) target.asn = asn;
        if (row[3]) target.asnName = row[3].trim();
      });
    }

    return result;
  });
}
