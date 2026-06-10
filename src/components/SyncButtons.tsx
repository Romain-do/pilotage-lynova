"use client";

import { useEffect, useState, useTransition } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { refreshAll } from "@/app/refresh-action";
import { relativeTime } from "@/lib/relative-time";

// Deux boutons de marque côte à côte (Cockpit / Facturation / Trésorerie). Les DEUX
// déclenchent la MÊME synchro complète refreshAll (Evoliz factures + achats + Revolut) ;
// seul l'habillage diffère. Un unique indicateur d'état partagé (maj / succès / erreur).
export function SyncButtons({ initialLastSync }: { initialLastSync: string | null }) {
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
  const spin = pending ? "animate-spin" : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Evoliz — bleu nuit + accent jaune banane */}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Synchroniser Evoliz (factures + achats) et Revolut"
        className="inline-flex items-center gap-2 rounded-card px-3 py-1.5 text-sm font-medium text-white shadow-card transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        style={{ backgroundColor: "#23344D" }}
      >
        <IconRefresh size={16} stroke={2.4} className={spin} style={{ color: "#FFD43B" }} />
        <span>Evoliz</span>
      </button>

      {/* Revolut Business — noir minimaliste */}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Synchroniser Evoliz (factures + achats) et Revolut"
        className="inline-flex items-center gap-2 rounded-card px-3 py-1.5 text-sm text-white shadow-card transition hover:brightness-150 disabled:cursor-not-allowed disabled:opacity-70"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <IconRefresh size={16} stroke={2} className={spin} />
        <span><span className="font-bold">Revolut</span> <span className="font-normal">Business</span></span>
      </button>

      {/* Indicateur d'état partagé */}
      {msg ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</span>
      ) : (
        relStr && <span className="text-xs text-ink-3" suppressHydrationWarning>maj {relStr}</span>
      )}
    </div>
  );
}
