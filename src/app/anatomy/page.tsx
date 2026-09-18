import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Anatomy } from "@/components/anatomy/Anatomy";
import { Mirage } from "@/components/Mirage";
import type { LiveFacts } from "@/lib/anatomy/types.ts";
import { publicViewEnabled } from "@/lib/auth";
import { publicStats } from "@/lib/sanitise";
import * as up from "@/lib/upstream";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "MIRAGE · Anatomy of a breach",
  description:
    "How data actually leaves a phone and a company, drawn as small worlds you can attack, with the honeypot's live figures where they apply.",
};

// The explainer cites the sensor only when the sensor is really there. With
// fixtures or an unreachable upstream it says so, in the same words `/` uses.
async function facts(): Promise<LiveFacts | null> {
  if (!up.isLive()) return null;
  try {
    const [stats, validity] = await Promise.all([up.stats(), up.validity()]);
    const s = publicStats(stats, validity.accept_rate.at(-1)?.rate ?? null);
    return {
      sessions_7d: s.sessions_last_7d,
      sessions_24h: s.sessions_last_24h,
      total_sessions: s.total_sessions,
      unique_ips: s.unique_ips,
      shell_reached: s.shell_reached,
      top_usernames: s.top_usernames.slice(0, 3).map((u) => u.username),
    };
  } catch {
    return null;
  }
}

export default async function AnatomyPage() {
  if (!publicViewEnabled()) redirect("/console");
  const f = await facts();
  return (
    <Mirage>
      <Anatomy facts={f} live={up.isLive()} />
    </Mirage>
  );
}
