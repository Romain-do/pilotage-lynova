"use client";

import { useEffect, useState, useTransition } from "react";
import { IconRefresh, IconAlertTriangle } from "@tabler/icons-react";
import { refreshAll } from "@/app/refresh-action";
import { relativeTime } from "@/lib/relative-time";
import type { Freshness, SourceFreshness } from "@/lib/sync-state";

// Bouton « Actualiser » générique (style Lynova navy/cyan) — utilisé sur toutes les vues.
// Déclenche la synchro complète refreshAll (Evoliz factures + achats + Revolut).
// `freshness` (optionnel) : affiche la maj PAR SOURCE (Evoliz / Revolut), la source périmée en
// ambre — au lieu d'un « maj » global qui masquerait une source en échec. Sans cette prop
// (ex. Prospection), on garde le libellé global `initialLastSync`.
export function RefreshButton({ initialLastSync, freshness }: { initialLastSync: string | null; freshness?: Freshness }) {
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
      try {
        const r = await refreshAll();
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok && r.lastSync) setLastSync(r.lastSync);
      } catch {
        // Erreur réseau / timeout : message propre, pas de plantage de page.
        setMsg({ ok: false, text: "Échec de la synchronisation. Réessayez." });
      }
      setTimeout(() => setMsg(null), 6000);
    });
  }

  const relStr = lastSync && now ? relativeTime(lastSync, now) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      ) : freshness ? (
        <div className="flex items-center gap-1.5">
          <FreshChip label="Evoliz" f={freshness.evoliz} now={now} />
          <FreshChip label="Revolut" f={freshness.revolut} now={now} />
        </div>
      ) : (
        relStr && <span className="text-xs text-ink-3" suppressHydrationWarning>maj {relStr}</span>
      )}
    </div>
  );
}

// Puce de fraîcheur d'une source : maj relative, ambre + alerte si périmée.
function FreshChip({ label, f, now }: { label: string; f: SourceFreshness; now: number | null }) {
  const rel = f.at && now ? relativeTime(f.at, now) : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs ${f.stale ? "bg-amber-50 text-amber-700" : "text-ink-3"}`}
      title={f.stale ? `${label} : synchro possiblement périmée (dernière réussite ${rel ?? "jamais"})` : `${label} à jour`}
      suppressHydrationWarning
    >
      {f.stale && <IconAlertTriangle size={11} stroke={2.5} />}
      <span className="font-medium">{label}</span>
      <span>{rel ?? "—"}</span>
    </span>
  );
}
