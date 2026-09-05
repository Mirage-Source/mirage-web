
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

// Folded into the signed message (not the token itself) so a cookie issued
// under the old password stops verifying the moment OPERATOR_PASSWORD is
// rotated -- no session store, no revocation list, nothing to remember to
// clear by hand.
async function passwordFingerprint(): Promise<string> {
  const pw = process.env.OPERATOR_PASSWORD ?? "";
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(pw)));
}

export async function issue(): Promise<{ value: string; maxAge: number }> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const fp = await passwordFingerprint();
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(`${exp}.${fp}`));
  return { value: `${exp}.${b64url(sig)}`, maxAge: TTL_SECONDS };
}

export async function isValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot < 1) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  try {
    const fp = await passwordFingerprint();
    const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(`${exp}.${fp}`));
    return sameString(token.slice(dot + 1), b64url(sig));
  } catch {
    return false;
  }
}

export function passwordConfigured(): boolean {
  // Length floors, not just truthiness -- SETUP.md's own quick-demo line
  // ("OPERATOR_PASSWORD=whatever SESSION_SECRET=whatever-long-string") is
  // exactly the kind of value that could otherwise survive into a reachable
  // deployment with no warning. Falling short is treated identically to
  // "not configured" (same fail-closed path callers already handle).
  const pw = process.env.OPERATOR_PASSWORD ?? "";
  const secretVal = process.env.SESSION_SECRET ?? "";
  return pw.length >= 12 && secretVal.length >= 24;
}

// Compares HMACs rather than the passwords themselves. sameString returns
// early on a length mismatch, which over a byte-at-a-time comparison leaks
// the length of OPERATOR_PASSWORD to anyone who can time the endpoint.
// Hashing first makes both sides a fixed 64 hex characters, so the early
// return can no longer fire on a real attempt and the comparison time is
// independent of the candidate.
export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.OPERATOR_PASSWORD ?? "";
  if (!expected) return false;

  const k = await key();
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", k, enc.encode(candidate)),
    crypto.subtle.sign("HMAC", k, enc.encode(expected)),
  ]);

  return sameString(b64url(a), b64url(b));
}

export function publicViewEnabled(): boolean {
  return process.env.PUBLIC_VIEW !== "false";
}
