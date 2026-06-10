import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncEvoliz, syncEvolizBuys } from "@/lib/evoliz/sync";
import { syncRevolut } from "@/lib/revolut/sync";

// Cron horaire (Vercel) : rafraîchit le cache Evoliz (factures + achats) puis Revolut.
// Lecture seule côté API externes. Protégé par CRON_SECRET (Vercel envoie l'en-tête
// `Authorization: Bearer <CRON_SECRET>` automatiquement).
export const dynamic = "force-dynamic";
export const maxDuration = 300; // s — Vercel Pro autorise jusqu'à 300 s

type SourceResult = { ok: boolean; counters?: Record<string, number>; error?: string };

// Exécute une source ; une erreur est isolée (ne bloque pas les suivantes) et
// renvoyée sous forme de message court, sans détail sensible (stack loggé serveur).
async function runSource(name: string, fn: () => Promise<Record<string, number>>): Promise<SourceResult> {
  try {
    const counters = await fn();
    return { ok: true, counters };
  } catch (e) {
    console.error(`[cron/sync] ${name} a échoué :`, e);
    const error = (e instanceof Error ? e.message : "erreur inconnue").slice(0, 200);
    return { ok: false, error };
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

  // Séquentiel : Evoliz factures → Evoliz achats → Revolut.
  const evoliz = await runSource("evoliz", async () => {
    const s = await syncEvoliz(prisma);
    return { invoices: s.invoices, credits: s.credits, caHtNet: Math.round(s.caHtNet) };
  });
  const evolizBuys = await runSource("evolizBuys", async () => {
    const s = await syncEvolizBuys(prisma);
    return { buys: s.buys, included: s.buysIncluded, totalHt: Math.round(s.totalHt) };
  });
  const revolut = await runSource("revolut", async () => {
    const s = await syncRevolut(prisma);
    return { transactions: s.txCount, totalEur: Math.round(s.totalEur), internalLegs: s.internalLegs, exchanges: s.exchangeTx };
  });

  const sources = { evoliz, evolizBuys, revolut };
  const ok = Object.values(sources).every((r) => r.ok);

  return NextResponse.json(
    { ok, startedAt, finishedAt: new Date().toISOString(), sources },
    { status: 200 }
  );
}
