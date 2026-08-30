import "server-only";

import * as fx from "./fixtures";
import { commandExport } from "./upstream";
import { isLive } from "./upstream";
import type { PolicySummary, RuntimeConfig } from "./types";

const ACTIONS = ["MINIMAL", "ENRICH", "STALL", "SURFACE_BAIT", "FAKE_SUCCESS"] as const;

export async function policySummary(): Promise<PolicySummary> {
  if (!isLive()) return fx.policy;

  const page = await commandExport(undefined, 500);
  const decided = (page.commands ?? []).filter((c) => c.deception_action !== null);

  const counts = new Map<string, number>(ACTIONS.map((a) => [a, 0]));
  for (const c of decided) {
    counts.set(c.deception_action!, (counts.get(c.deception_action!) ?? 0) + 1);
  }

  return {
    window_days: 7,
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

  return {
    deception_enabled: flag("MIRAGE_DECEPTION_ENABLED", false),
    deception_apply_actions: flag("MIRAGE_DECEPTION_APPLY_ACTIONS", false),
    llm_shell_enabled: flag("MIRAGE_LLM_SHELL_ENABLED", false),
    stix_enabled: flag("MIRAGE_STIX_ENABLED", true),
    intel_use_llm: flag("MIRAGE_INTEL_USE_LLM", false),
    public_view: process.env.PUBLIC_VIEW !== "false",
    writable: false,
    limits: {
      completions_per_session: Number(process.env.MIRAGE_LLM_SHELL_MAX_PER_SESSION ?? 25),
      global_rate_limit: Number(process.env.MIRAGE_LLM_SHELL_GLOBAL_RATE_LIMIT ?? 600),
      policy_timeout_ms: Number(process.env.MIRAGE_DECEPTION_TIMEOUT_MS ?? 200),
      completion_timeout_ms: Number(process.env.MIRAGE_LLM_SHELL_TIMEOUT_MS ?? 4000),
      commands_per_session: 500,
      auth_delay_ms: [500, 3000],
    },
  };
}
