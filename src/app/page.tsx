import Link from "next/link";
import { redirect } from "next/navigation";

import { Mirage } from "@/components/Mirage";
import { PublicView } from "@/components/PublicView";
import { publicViewEnabled } from "@/lib/auth";
import { publicStats, publicValidity } from "@/lib/sanitise";
import * as up from "@/lib/upstream";

export const revalidate = 300;

export default async function PublicPage() {
  if (!publicViewEnabled()) redirect("/console");

  try {
    const [stats, validity] = await Promise.all([up.stats(), up.validity()]);

    return (
      <Mirage>
        <PublicView
          stats={publicStats(stats)}
          validity={publicValidity(validity)}
          live={up.isLive()}
        />
      </Mirage>
    );
  } catch {
    return (
      <Mirage>
        <main>
          <section className="hero">
            <div className="eyebrow">MIRAGE</div>
            <h1>The sensor is quiet just now.</h1>
            <p>Live figures will be back shortly. The published dataset is unaffected.</p>
          </section>
          <div className="foot">
            <a
              href="https://github.com/Mirage-Source/mirage-core"
              target="_blank"
              rel="noreferrer"
            >
              mirage-core
            </a>
            <Link href="/console">operator console</Link>
          </div>
        </main>
      </Mirage>
    );
  }
}
