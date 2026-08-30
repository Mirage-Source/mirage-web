
export const SESSION_COOKIE = "mirage_op";
const TTL_SECONDS = 60 * 60 * 12;

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issue(): Promise<{ value: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(String(exp)));
  return { value: `${exp}.${b64url(sig)}`, maxAge: TTL_SECONDS };
}

export async function isValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot < 1) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  try {
    const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(String(exp)));
    return sameString(token.slice(dot + 1), b64url(sig));
  } catch {
    return false;
  }
}

export function passwordConfigured(): boolean {
  return Boolean(process.env.OPERATOR_PASSWORD && process.env.SESSION_SECRET);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.OPERATOR_PASSWORD ?? "";
  if (!expected) return false;
  return sameString(candidate, expected);
}

export function publicViewEnabled(): boolean {
  return process.env.PUBLIC_VIEW !== "false";
}
