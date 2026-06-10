"use client";

import { useEffect, useState, useTransition } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { refreshAll } from "@/app/refresh-action";
import { relativeTime } from "@/lib/relative-time";

// Bouton « Actualiser » générique (style Lynova navy/cyan) — utilisé sur la Prospection.
// Déclenche la synchro complète refreshAll (Evoliz factures + achats + Revolut).
export function RefreshButton({ initialLastSync }: { initialLastSync: string | null }) {
  const [pending, start] = useTransition();
  const [lastSync, setLastSync] = useState(initialLastSync);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => { cancelAnimationFrame(id); clearInterval(t); };
  }, []);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await refreshAll();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok && r.lastSync) setLastSync(r.lastSync);
      setTimeout(() => setMsg(null), 6000);
    });
  }

  const relStr = lastSync && now ? relativeTime(lastSync, now) : null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Synchroniser Evoliz (factures + achats) et Revolut"
        className="inline-flex items-center gap-2 rounded-card bg-navy px-3 py-1.5 text-sm font-medium text-white shadow-card transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <IconRefresh size={16} stroke={2} className={pending ? "animate-spin" : ""} />
        {pending ? "Actualisation…" : "Actualiser"}
      </button>
      {msg ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</span>
      ) : (
        relStr && <span className="text-xs text-ink-3" suppressHydrationWarning>maj {relStr}</span>
      )}
    </div>
  );
}
