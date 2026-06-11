import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { prisma } from "@/lib/prisma";
import {
  computeRange,
  computeMRR,
  fyOf,
  fyRange,
  fyLabel,
  shiftYear,
  presetRange,
  rel,
  euro,
  caHtByFiscalMonth,
  type FactDoc,
  type BuyDoc,
} from "@/lib/facturation";
import { buildTresorerie } from "@/lib/tresorerie-data";
import { lastSyncAll } from "@/lib/sync-state";
import {
  flowsInRange,
  netChargesInRange,
  earliestOutflowDate,
  leayaInRange,
} from "@/lib/tresorerie";
import { categoryOf, reminderStatus, formatDateFR, type KpiCategory } from "@/lib/prospection";
import { Cockpit, type CockpitData } from "./Cockpit";

// Accueil = Cockpit (§9.7) pour le DIRIGEANT. Le COMMERCIAL est redirigé vers la prospection.
// Dépend de la session (cookies) → jamais de cache statique.
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function Home() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  // Contrôle serveur (§3) — le middleware protège déjà, mais jamais que l'UI.
  const user = await requireUser();
  if (user.role !== "DIRIGEANT") redirect("/prospection");

  const data = await buildCockpitData();
  const todayISO = new Date().toISOString().slice(0, 10);
  const dateLabel = new Date(`${todayISO}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return <Cockpit user={{ name: user.name, email: user.email, role: user.role }} dateLabel={dateLabel} data={data} />;
}

const HIDDEN_CATS = new Set<KpiCategory>(["a_installer", "installes", "refus"]);

async function buildCockpitData(): Promise<CockpitData> {
  const todayISO = new Date().toISOString().slice(0, 10);

  const [docRows, buyRows, treso, pipeline, lastSync] = await Promise.all([
    prisma.evolizDocument.findMany({
      where: { kind: "INVOICE", included: true },
      select: { kind: true, documentDate: true, totalHt: true, totalTtc: true, paid: true, netToPay: true, clientId: true, clientName: true },
    }),
    prisma.evolizBuy.findMany({ where: { included: true }, select: { documentDate: true, totalHt: true, supplierId: true } }),
    buildTresorerie(prisma),
    prisma.pipeline.findFirst({
      where: { archived: false },
      orderBy: { createdAt: "asc" },
      include: {
        stages: {
          orderBy: { position: "asc" },
          include: { prospects: { where: { archived: false }, select: { id: true, company: true, genre: true, nom: true, prenom: true, reminderAt: true, reminderDone: true } } },
        },
      },
    }),
    lastSyncAll(prisma),
  ]);

  const docs: FactDoc[] = docRows.map((d) => ({
    kind: d.kind, date: d.documentDate.toISOString().slice(0, 10), ht: Number(d.totalHt), ttc: Number(d.totalTtc),
    paid: Number(d.paid), netToPay: Number(d.netToPay), clientId: d.clientId, clientName: d.clientName,
  }));
  const buys: BuyDoc[] = buyRows.map((b) => ({ date: b.documentDate.toISOString().slice(0, 10), ht: Number(b.totalHt), supplierId: b.supplierId }));

  // ── Finances : exercice en cours vs N-1 (définitions identiques à Facturation) ──
  const fy = fyOf(todayISO);
  const range = fyRange(fy, todayISO);
  const prevRange = shiftYear(range);
  const cur = computeRange(docs, buys, range, "all");
  const prev = computeRange(docs, buys, prevRange, "all");

  const bankStart = earliestOutflowDate(treso.outflows);
  const hasBank = bankStart != null && range.end >= bankStart;
  const hasBankPrev = bankStart != null && prevRange.end >= bankStart;
  const net = netChargesInRange(treso.outflows, range);
  const netPrev = netChargesInRange(treso.outflows, prevRange);
  const margeNette = cur.marge - net.total;
  const margeNettePrev = prev.marge - netPrev.total;
  const tauxNette = cur.caHtTotal > 0 ? (margeNette / cur.caHtTotal) * 100 : null;
  const tauxNettePrev = prev.caHtTotal > 0 ? (margeNettePrev / prev.caHtTotal) * 100 : null;
  const mrr = computeMRR(docs, range);
  const leaya = leayaInRange(treso.outflows, range);
  const leayaPrev = leayaInRange(treso.outflows, prevRange);
  // CA HT mensuel exercice vs N-1 (axe fiscal oct→sept).
  const caFyCur = caHtByFiscalMonth(docs, fy);
  const caFyPrev = caHtByFiscalMonth(docs, fy - 1);

  // ── Trésorerie (définitions identiques à la vue Trésorerie) ──
  const fiatEur = treso.accounts.filter((a) => a.kind === "FIAT").reduce((s, a) => s + (a.valoEur ?? 0), 0);
  const cryptoEur = treso.accounts.filter((a) => a.kind === "CRYPTO").reduce((s, a) => s + (a.valoEur ?? 0), 0);
  const monthRange = presetRange("current-month", todayISO);
  const monthPrev = shiftYear(monthRange);
  const cashNetMonth = flowsInRange(treso.months, monthRange).net;
  const cashNetMonthPrev = flowsInRange(treso.months, monthPrev).net;
  const hasBankMonthPrev = bankStart != null && monthPrev.end >= bankStart;

  const monthLabel = new Date(`${todayISO}T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // ── Prospection (définitions identiques à la liste) ──
  const rows = (pipeline?.stages ?? []).flatMap((s) =>
    s.prospects.map((pr) => ({ id: pr.id, company: pr.company, genre: pr.genre, nom: pr.nom, prenom: pr.prenom, reminderAt: pr.reminderAt, reminderDone: pr.reminderDone, kind: s.kind }))
  );
  const counts: Record<KpiCategory, number> = { a_rencontrer: 0, rencontres: 0, a_installer: 0, installes: 0, refus: 0 };
  for (const r of rows) {
    const c = categoryOf(r.kind);
    if (c) counts[c] += 1;
  }
  const clientsActuels = counts.a_installer + counts.installes;
  const tauxReussite =
    clientsActuels + counts.refus > 0 ? Math.round((clientsActuels / (clientsActuels + counts.refus)) * 100) : 0;

  const now = Date.now();
  const overdue = rows
    .filter((r) => {
      if (!r.reminderAt || r.reminderDone) return false;
      const c = categoryOf(r.kind);
      if (!c || HIDDEN_CATS.has(c)) return false;
      return reminderStatus(r.reminderAt.toISOString(), r.reminderDone, now) === "overdue";
    })
    .sort((a, b) => a.reminderAt!.getTime() - b.reminderAt!.getTime());

  const recontacter = overdue.slice(0, 6).map((r) => ({
    id: r.id,
    company: r.company,
    genre: r.genre,
    nom: r.nom,
    prenom: r.prenom,
    dateLabel: formatDateFR(r.reminderAt!.toISOString()) ?? "",
  }));

  // ── Actions prioritaires (déduites des données) ──
  const unpaidTtc = docs.reduce((s, d) => s + (d.kind === "INVOICE" ? d.netToPay : 0), 0);
  const alerts: CockpitData["alerts"] = [];
  if (cashNetMonth < 0) alerts.push({ tone: "danger", text: `Cash net négatif ce mois (${euro(cashNetMonth)})`, href: "/tresorerie" });
  if (overdue.length > 0) alerts.push({ tone: "warn", text: `${overdue.length} prospect${overdue.length > 1 ? "s" : ""} à recontacter (rappel échu)`, href: "/prospection" });
  if (unpaidTtc >= 1) alerts.push({ tone: "warn", text: `${euro(unpaidTtc)} de factures impayées (restant dû)`, href: "/facturation" });
  if (mrr.pct != null && mrr.pct < 0) alerts.push({ tone: "warn", text: `MRR en baisse vs N-1 (${mrr.pct.toFixed(0)} %)`, href: "/facturation" });
  if (counts.a_rencontrer > 0) alerts.push({ tone: "info", text: `${counts.a_rencontrer} prospect${counts.a_rencontrer > 1 ? "s" : ""} à rencontrer`, href: "/prospection" });

  return {
    fyLabel: fyLabel(fy),
    fy,
    lastSync,
    leaya,
    leayaPrev,
    caFyCur,
    caFyPrev,
    finance: {
      caHt: cur.caHtTotal,
      caDelta: rel(cur.caHtTotal, prev.caHtTotal),
      margeNette,
      margeNetteDelta: hasBank && hasBankPrev ? rel(margeNette, margeNettePrev) : null,
      hasBank,
      tauxNette,
      tauxNetteDeltaPts: hasBank && hasBankPrev && tauxNette != null && tauxNettePrev != null ? tauxNette - tauxNettePrev : null,
      mrr: mrr.mrr,
      mrrDelta: mrr.pct,
      mrrLabel: mrr.monthLabel,
      tresoTotal: fiatEur + cryptoEur,
      fiatEur,
      cryptoEur,
      cashNetMonth,
      cashNetMonthDelta: hasBankMonthPrev ? rel(cashNetMonth, cashNetMonthPrev) : null,
      monthLabel,
    },
    prospection: {
      totalProspects: rows.length,
      clientsActuels,
      tauxReussite,
      aRencontrer: counts.a_rencontrer,
      aRecontacter: overdue.length,
      recontacter,
    },
    alerts: alerts.slice(0, 5),
  };
}

function NotConfigured() {
  const steps = [
    "Créer un projet Supabase puis remplir DATABASE_URL et DIRECT_URL dans .env.local.",
    "Renseigner NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY.",
    "Lancer `npm run db:migrate` pour créer le schéma.",
    "Lancer `npm run seed:users` pour créer le compte dirigeant.",
    "Redémarrer `npm run dev` : l'authentification et le cloisonnement s'activent.",
  ];
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-navy/10 bg-white p-8 shadow-sm">
        <Logo className="text-2xl text-navy" />
        <h1 className="mt-6 text-xl font-semibold text-navy">Configuration requise</h1>
        <p className="mt-2 text-sm text-navy/70">
          L&apos;ossature est en place. Renseignez les secrets pour activer l&apos;application (mode bootstrap actif).
        </p>
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-navy/80">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-cyan/30 text-xs font-semibold text-navy">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
