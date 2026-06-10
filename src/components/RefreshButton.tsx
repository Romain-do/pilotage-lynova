"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { refreshAll } from "@/app/refresh-action";

export type RefreshVariant = "evoliz" | "revolut" | "generic";

// Bouton « Actualiser » unifié : un clic lance la synchro complète (Evoliz factures +
// achats ET Revolut) via refreshAll. Seul l'habillage change selon `variant`.
const CHROME: Record<RefreshVariant, string> = {
  generic: "border-transparent bg-navy text-white hover:bg-navy-700",
  evoliz: "border-line bg-white text-navy hover:bg-cloud",
  revolut: "border-black bg-black text-white hover:bg-neutral-800",
};

const LABEL: Record<RefreshVariant, string> = {
  generic: "Actualiser",
  evoliz: "Evoliz",
  revolut: "Revolut Business",
};

const LOGO: Partial<Record<RefreshVariant, { src: string; w: number; h: number }>> = {
  evoliz: { src: "/logos/evoliz.png", w: 243, h: 126 },
  revolut: { src: "/logos/revolut-business.png", w: 251, h: 124 },
};

export function RefreshButton({
  variant = "generic",
  initialLastSync,
}: {
  variant?: RefreshVariant;
  initialLastSync: string | null;
}) {
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

  const logo = LOGO[variant];
  const relStr = lastSync && now ? relativeTime(lastSync, now) : null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Synchroniser Evoliz (factures + achats) et Revolut"
        className={`inline-flex items-center gap-2 rounded-card border px-3 py-1.5 text-sm font-medium shadow-card transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${CHROME[variant]}`}
      >
        {pending ? (
          <IconRefresh size={16} stroke={2} className="animate-spin" />
        ) : logo ? (
          <Image src={logo.src} alt="" width={logo.w} height={logo.h} className="h-[18px] w-auto" />
        ) : (
          <IconRefresh size={16} stroke={2} />
        )}
        <span>{pending ? "Actualisation…" : LABEL[variant]}</span>
      </button>
      {msg ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</span>
      ) : (
        relStr && <span className="text-xs text-ink-3" suppressHydrationWarning>maj {relStr}</span>
      )}
    </div>
  );
}

function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
