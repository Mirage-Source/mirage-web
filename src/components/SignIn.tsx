"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignIn({ configured, reason }: { configured: boolean; reason?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="gate">
        <div style={{ width: "min(420px, 100%)" }}>
          <div className="eyebrow">MIRAGE</div>
          <h1 style={{ fontSize: 22, fontWeight: 400, margin: "10px 0 12px" }}>
            The console is not configured.
          </h1>
          <p className="note" style={{ marginBottom: 0 }}>
            Set <b>OPERATOR_PASSWORD</b> and <b>SESSION_SECRET</b> in the environment, then
            restart. Until then the console stays closed rather than open —{" "}
            {reason === "unconfigured"
              ? "which is why this deployment refused the request."
              : "see .env.example."}
          </p>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace("/console");
        router.refresh();
        return;
      }

      setMsg(
        res.status === 429
          ? "Too many attempts. Wait a minute."
          : "That password was not accepted.",
      );
      setPassword("");
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form onSubmit={submit}>
        <div className="eyebrow">Operator console</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          aria-label="Operator password"
          autoComplete="current-password"
          autoFocus
        />
        <button type="submit" disabled={busy || password.length === 0}>
          {busy ? "checking" : "enter"}
        </button>
        <div className="msg" role="status" aria-live="polite">
          {msg}
        </div>
      </form>
    </div>
  );
}
