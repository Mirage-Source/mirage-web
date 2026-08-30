"use client";

import { useCallback, useEffect, useState } from "react";

import { Clock, ToastHost } from "../ui";
import { Clusters } from "./Clusters";
import { Commands } from "./Commands";
import { Geography } from "./Geography";
import { Sessions } from "./Sessions";
import { Control, Overview, Policy, Validity } from "./views";
import type {
  Facets,
  HoneypotStats,
  LLMProviderListing,
  PolicySummary,
  RuntimeConfig,
  SensorList,
  SessionsPage,
  ValiditySummary,
} from "@/lib/types";

export interface ConsoleData {
  stats: HoneypotStats;
  validity: ValiditySummary;
  sensors: SensorList;
  providers: LLMProviderListing;
  policy: PolicySummary;
  config: RuntimeConfig;
  sessions: SessionsPage;
  facets: Facets;
  geoAvailable: boolean;
  live: boolean;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sessions", label: "Sessions" },
  { id: "geography", label: "Geography" },
  { id: "clusters", label: "Clusters" },
  { id: "commands", label: "Commands" },
  { id: "validity", label: "Validity" },
  { id: "policy", label: "Policy" },
  { id: "control", label: "Control" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Console({ data }: { data: ConsoleData }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [sensor, setSensor] = useState(data.validity.sensor);
  const [validity, setValidity] = useState(data.validity);
  const [cluster, setCluster] = useState<string | null>(null);

  useEffect(() => {
    if (sensor === validity.sensor) return;

    let cancelled = false;
    fetch(`/api/console/validity?sensor=${encodeURIComponent(sensor)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((v: ValiditySummary) => {
        if (!cancelled) setValidity(v);
      })
      .catch(() => {
        if (!cancelled) setSensor(validity.sensor);
      });

    return () => {
      cancelled = true;
    };
  }, [sensor, validity.sensor]);

  const openCluster = useCallback((id: string) => {
    setCluster(id);
    setTab("sessions");
    window.scrollTo({ top: 0 });
  }, []);

  const go = (id: TabId) => {
    setTab(id);
    if (id !== "sessions") setCluster(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <ToastHost>
      <header className="top">
        <span className="wordmark">MIRAGE</span>

        <nav className="tabs" aria-label="Console sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <span className="status">
          {data.sensors.sensors.length > 1 ? (
            <select
              className="sensor"
              value={sensor}
              onChange={(e) => setSensor(e.target.value)}
              aria-label="Sensor"
            >
              {data.sensors.sensors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <span>{sensor}</span>
          )}
          <span className="beacon" data-live={data.live} />
          <Clock />
          {!data.live && <span>fixtures</span>}
        </span>
      </header>

      <main>
        {tab === "overview" && <Overview data={data} validity={validity} />}
        {tab === "sessions" && (
          <Sessions
            initial={data.sessions}
            facets={data.facets}
            geoAvailable={data.geoAvailable}
            cluster={cluster}
            onClearCluster={() => setCluster(null)}
          />
        )}
        {tab === "geography" && <Geography available={data.geoAvailable} />}
        {tab === "clusters" && <Clusters onOpen={openCluster} />}
        {tab === "commands" && <Commands />}
        {tab === "validity" && <Validity v={validity} />}
        {tab === "policy" && <Policy policy={data.policy} providers={data.providers} />}
        {tab === "control" && <Control config={data.config} />}
      </main>
    </ToastHost>
  );
}
