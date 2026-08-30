import { Mirage } from "@/components/Mirage";
import { Console, type ConsoleData } from "@/components/console/Console";
import { facets, querySessions } from "@/lib/corpus";
import { policySummary, runtimeConfig } from "@/lib/derived";
import { geoAvailable } from "@/lib/geo";
import * as up from "@/lib/upstream";
import { UpstreamError } from "@/lib/upstream";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  let data: ConsoleData;

  try {
    const [stats, validity, sensors, providers, policy, config, sessions, facetted] =
      await Promise.all([
        up.stats(),
        up.validity(),
        up.sensors(),
        up.providers(),
        policySummary(),
        runtimeConfig(),
        querySessions({ limit: 50, offset: 0, sort: "recent", withGeo: false }),
        facets(),
      ]);

    data = {
      stats,
      validity,
      sensors,
      providers,
      policy,
      config,
      sessions,
      facets: facetted,
      geoAvailable: geoAvailable(),
      live: up.isLive(),
    };
  } catch (err) {
    return (
      <Mirage>
        <Fault err={err} />
      </Mirage>
    );
  }

  return (
    <Mirage>
      <Console data={data} />
    </Mirage>
  );
}

function Fault({ err }: { err: unknown }) {
  const upstream = err instanceof UpstreamError;
  const detail = err instanceof Error ? err.message : String(err);

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Console</div>
        <h1>The sensor did not answer.</h1>
      </section>

      <div className="fault">
        <h2>{upstream ? `Upstream ${err.status}` : "Unexpected failure"}</h2>
        <p>{detail}</p>
      </div>

      <div className="fault">
        <h2>Worth checking</h2>
        <p>
          <code>MIRAGE_API_URL</code> points at the Go API from mirage-core — it binds to{" "}
          <code>127.0.0.1:8080</code>, so this app has to run on the same host or reach it over a
          tunnel. <code>MIRAGE_API_KEY</code> must match the sensor&rsquo;s <code>API_KEY</code>.
          Unset both to run against bundled fixtures instead.
        </p>
      </div>
    </main>
  );
}
