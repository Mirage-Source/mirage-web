import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import * as fx from "./fixtures";
import { commandExport, sensorConfig } from "./upstream";
import { isLive } from "./upstream";
import type { PolicySummary, RuntimeConfig, WeakCredentials } from "./types";

const POLICY_SAMPLE = 500;

const ACTIONS = ["MINIMAL", "ENRICH", "STALL", "SURFACE_BAIT", "FAKE_SUCCESS"] as const;

export async function policySummary(): Promise<PolicySummary> {
  if (!isLive()) return fx.policy;

  const page = await commandExport(undefined, POLICY_SAMPLE);
  const scanned = page.commands ?? [];
  const decided = scanned.filter((c) => c.deception_action !== null);

  const counts = new Map<string, number>(ACTIONS.map((a) => [a, 0]));
  for (const c of decided) {
    counts.set(c.deception_action!, (counts.get(c.deception_action!) ?? 0) + 1);
  }

  return {
    sample_commands: scanned.length,
    total_decisions: decided.length,
    actions: ACTIONS.map((name) => ({ name, count: counts.get(name) ?? 0 })),
    recent: decided.slice(0, 8).map((c) => ({
      command: c.raw_command,
      category: c.attacker_class,
      action: c.deception_action!,
      step: c.sequence_number,
    })),
    shadow_mode: process.env.MIRAGE_DECEPTION_APPLY_ACTIONS !== "true",
    latency_p95_ms: null,
    timeouts: null,
    checkpoint: process.env.MIRAGE_DECEPTION_CHECKPOINT?.split("/").pop() ?? null,
  };
}

const flag = (name: string, fallback: boolean): boolean => {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
};

export async function runtimeConfig(): Promise<RuntimeConfig> {
  if (!isLive()) return fx.config;

  // deception_enabled/deception_apply_actions are DB-backed now (mirage-api
  // GET /api/config, see docs/API-GAPS.md §4) -- these two, and only these
  // two, are what the Control tab can actually write. Everything else on
  // this object is still this app's own environment, which only agrees with
  // the sensor's when both are deployed from the same .env (see the note
  // the view itself renders when writable is empty).
  const sensor = await sensorConfig().catch(() => null);

  return {
    deception_enabled: sensor?.deception_enabled ?? flag("MIRAGE_DECEPTION_ENABLED", false),
    deception_apply_actions:
      sensor?.deception_apply_actions ?? flag("MIRAGE_DECEPTION_APPLY_ACTIONS", false),
    llm_shell_enabled: flag("MIRAGE_LLM_SHELL_ENABLED", false),
    stix_enabled: flag("MIRAGE_STIX_ENABLED", true),
    intel_use_llm: flag("MIRAGE_INTEL_USE_LLM", false),
    public_view: process.env.PUBLIC_VIEW !== "false",
    writable: sensor ? ["deception_enabled", "deception_apply_actions"] : [],
    updated_at: sensor?.updated_at ?? null,
    updated_by: sensor?.updated_by ?? null,
    limits: {
      completions_per_session: Number(process.env.MIRAGE_LLM_SHELL_MAX_PER_SESSION ?? 25),
      global_rate_limit: Number(process.env.MIRAGE_LLM_SHELL_GLOBAL_RATE_LIMIT ?? 600),
      rate_window_s: Number(process.env.MIRAGE_LLM_SHELL_RATE_WINDOW_S ?? 60),
      policy_timeout_ms: Number(process.env.MIRAGE_DECEPTION_TIMEOUT_MS ?? 200),
      completion_timeout_ms: Number(process.env.MIRAGE_LLM_SHELL_TIMEOUT_MS ?? 4000),
      commands_per_session: 500,
      auth_delay_ms: [500, 3000],
    },
  };
}


// config/weak_credentials.txt on the sensor -- the exact list the SSH server
// accepts (internal/server/server.go PasswordCallback). The file's own header
// says it is deliberately public bait data, so displaying it leaks nothing.
//
// Read from disk the same way geo.ts finds the DB-IP tables: honour the
// sensor's own WEAK_CREDENTIALS_FILE if this app shares its environment, then
// look next to the repo. When it is not reachable the console says so rather
// than showing a guess -- the previous hardcoded ten-pair list was wrong in
// both directions, listing git:git (not in the file) and omitting 38 entries
// that are.
const CRED_CANDIDATES = [
  path.resolve(process.cwd(), "..", "mirage-core", "config", "weak_credentials.txt"),
  path.resolve(process.cwd(), "config", "weak_credentials.txt"),
];

let credCache: { at: number; value: WeakCredentials } | null = null;
const CRED_TTL_MS = 5 * 60 * 1000;

export function weakCredentials(): WeakCredentials {
  if (credCache && Date.now() - credCache.at < CRED_TTL_MS) return credCache.value;

  const configured = process.env.WEAK_CREDENTIALS_FILE;
  const candidates = configured ? [configured, ...CRED_CANDIDATES] : CRED_CANDIDATES;

  let value: WeakCredentials = { path: null, pairs: null, total: 0 };

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const pairs = readFileSync(file, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#") && line.includes(":"));
      value = { path: file, pairs, total: pairs.length };
      break;
    } catch {
      // Unreadable is the same as absent for display purposes; keep looking.
    }
  }

  credCache = { at: Date.now(), value };
  return value;
}
