import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { prisma } from "@/lib/prisma";
import {
  computeRange,
  computeMRR,
  mrrByMonth,
  monthCa,
  monthLabelShort,
  fyOf,
  fyRange,
  fyLabel,
  listFiscalYears,
  shiftYear,
  presetRange,
  rel,
  euro,
  pct1,
  caHtByFiscalMonth,
} from "@/lib/facturation";
import { getTresorerie } from "@/lib/tresorerie-data";
import { getEvolizInvoices, getEvolizBuys } from "@/lib/facturation-data";
import { getCockpitProspection } from "@/lib/prospection-data";
import { lastSyncAll, sourceFreshness, staleSourcesLabel } from "@/lib/sync-state";
import {
  flowsInRange,
  netChargesInRange,
  chargeComponentsByMonth,
  horsExploitationByMonth,
  seriesForRange,
  earliestOutflowDate,
  etatInRange,
} from "@/lib/tresorerie";
import { runRateBasis } from "@/lib/projections";
import { categoryOf, reminderStatus, formatDateFR, type KpiCategory } from "@/lib/prospection";
import { Cockpit, type CockpitData } from "./Cockpit";

// Accueil = Cockpit (§9.7) pour le DIRIGEANT. Le COMMERCIAL est redirigé vers la prospection.
// Dépend de la session (cookies) → jamais de cache statique.
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  // Contrôle serveur (§3) — le middleware protège déjà, mais jamais que l'UI.
  const user = await requireUser();
  if (user.role !== "DIRIGEANT") redirect("/prospection");

  // Sélecteur d'exercice global (LOT 4) : ?fy=YYYY pilote tous les indicateurs périodiques.
  // Valeur brute (string|string[]) → number ou undefined ; la validation finale (exercice connu)
  // est faite dans buildCockpitData, qui retombe sur l'exercice en cours si absent/invalide.
  const fyRaw = (await searchParams).fy;
  const fyParam = Number(Array.isArray(fyRaw) ? fyRaw[0] : fyRaw);
  const requestedFy = Number.isFinite(fyParam) ? fyParam : undefined;

  const data = await buildCockpitData(requestedFy);
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

async function buildCockpitData(requestedFy?: number): Promise<CockpitData> {
  const todayISO = new Date().toISOString().slice(0, 10);

  const [docs, buysData, treso, rows, lastSync, freshness] = await Promise.all([
    getEvolizInvoices(),
    getEvolizBuys(),
    getTresorerie(),
    getCockpitProspection(),
    lastSyncAll(prisma),
    sourceFreshness(prisma),
  ]);

  const buys = buysData.buys;

  // ── Exercice sélectionné (LOT 4) ──
  // Liste des exercices avec facturation (desc), exercice en cours garanti présent. L'exercice
  // demandé n'est retenu que s'il existe dans la liste, sinon retour à l'exercice en cours.
  const currentFy = fyOf(todayISO);
  const fyList = [...new Set([currentFy, ...listFiscalYears(docs)])].sort((a, b) => b - a);
  const fy = requestedFy != null && fyList.includes(requestedFy) ? requestedFy : currentFy;
  const isCurrentFy = fy === currentFy;

  // ── Finances : exercice sélectionné vs N-1 (définitions identiques à Facturation) ──
  const range = fyRange(fy, todayISO);
  const prevRange = shiftYear(range);
  const cur = computeRange(docs, buys, range, "all");
  const prev = computeRange(docs, buys, prevRange, "all");
  const nMonths = Math.max(1, cur.months.length); // nb de mois de l'exercice à date (pour les ⌀/mois)

  const bankStart = earliestOutflowDate(treso.outflows);
  const hasBank = bankStart != null && range.end >= bankStart;
  const hasBankPrev = bankStart != null && prevRange.end >= bankStart;
  const net = netChargesInRange(treso.outflows, range);
  const netPrev = netChargesInRange(treso.outflows, prevRange);
  // Marge nette = CA HT − charges Revolut (hors deny-list TVA/IS). Marge brute (cur.marge) séparée.
  const margeNette = cur.caHtTotal - net.total;
  const margeNettePrev = prev.caHtTotal - netPrev.total;
  // Rémunération versée (catégorie Revolut « Rémunération ») sur l'exercice à date, vs N-1 même fenêtre.
  const remu = net.byCategory["Rémunération"];
  const remuPrev = netPrev.byCategory["Rémunération"];
  const tauxNette = cur.caHtTotal > 0 ? (margeNette / cur.caHtTotal) * 100 : null;
  const tauxNettePrev = prev.caHtTotal > 0 ? (margeNettePrev / prev.caHtTotal) * 100 : null;
  const mrr = computeMRR(docs, range);
  // « Versé à l'État » = TVA + charges sociales (URSSAF) + IS sur l'exercice, vs N-1 même fenêtre.
  const etat = etatInRange(treso.outflows, range);
  const etatPrev = etatInRange(treso.outflows, prevRange);
  // CA HT mensuel exercice vs N-1 (axe fiscal oct→sept).
  const caFyCur = caHtByFiscalMonth(docs, fy);
  const caFyPrev = caHtByFiscalMonth(docs, fy - 1);

  // Évolution de la trésorerie : solde fin de mois sur l'exercice en cours (même période que les
  // autres graphes du Cockpit).
  const tresoSeries = seriesForRange(treso.months, range);
  // Courbe N-1 trésorerie (exercice précédent, même fenêtre fiscale décalée d'un an). Les mois
  // antérieurs au 1er mois de données bancaires sont marqués `missing` → la courbe N-1 est
  // INTERROMPUE sur ces mois (pas de chute artificielle à 0).
  const firstDataMonth = treso.months.reduce<string | null>((min, m) => (min == null || m.key < min ? m.key : min), null);
  const tresoSeriesPrev = seriesForRange(treso.months, prevRange).map((p) => ({
    ...p,
    missing: firstDataMonth == null || p.key < firstDataMonth,
  }));
  // Évolution du MRR : niveau mensuel (abonnements facturés) sur l'exercice + courbe N-1. Réutilise
  // le gabarit TresoAreaChart → la métrique est portée par `endBalance`.
  const toMrrPoint = (m: { key: string; label: string; mrr: number }) => ({ key: m.key, label: m.label, inflow: 0, outflow: 0, endBalance: m.mrr });
  const mrrSeries = mrrByMonth(docs, range).map(toMrrPoint);
  const mrrSeriesPrev = mrrByMonth(docs, prevRange).map(toMrrPoint);

  // ── Projections (exercice EN COURS uniquement) ──────────────────────────────────────────────
  // A · CA HT projeté : base (mois complets) + scénario mensuel × rem. Quasi certain = MRR acquis ;
  //   Potentiel = run-rate CA HT 6 mois glissants. B · prolongement du solde fiat EUR (cash net moyen).
  const earliestInvoiceMonth = docs.reduce<string | null>(
    (min, d) => (d.kind === "INVOICE" && (min == null || d.date.slice(0, 7) < min) ? d.date.slice(0, 7) : min),
    null,
  );
  const caBasis = isCurrentFy ? runRateBasis(fy, todayISO, (k) => monthCa(docs, k), earliestInvoiceMonth) : null;
  const caProjection =
    caBasis && caBasis.rem > 0 && caBasis.monthsUsed >= 1
      ? {
          // base = réalisé à date (mois courant inclus) ; rem = mois pleins restants (juil→sept).
          base: caBasis.base,
          rem: caBasis.rem,
          quasiCertain: caBasis.base + mrr.mrr * caBasis.rem,
          potentiel: caBasis.base + caBasis.runRate * caBasis.rem,
          monthsUsed: caBasis.monthsUsed,
          fewMonths: caBasis.fewMonths,
          hasMrr: mrr.mrr > 0,
        }
      : null;

  // Prolongement de la courbe trésorerie en FOURCHETTE : le cash futur = CA HT projeté × taux de marge
  // nette de l'exercice (`tauxNetRatio` = margeNette / CA HT). À partir du dernier solde réel, un point
  // par mois fiscal restant (jusqu'à sept.) :
  //   • quasi certaine (borne basse) = solde + (MRR × tauxNet) × k ;
  //   • potentielle    (borne haute) = solde + (runRate CA × tauxNet) × k.
  // Garde-fou : pas de données bancaires (hasBank faux) → pas de projection. Si tauxNet ≤ 0, on projette
  // quand même (courbe descendante honnête) — signalé dans la note. Bornage low=min / high=max.
  const tauxNetRatio = hasBank && cur.caHtTotal > 0 ? margeNette / cur.caHtTotal : null;
  const lastBal = tresoSeries.length ? tresoSeries[tresoSeries.length - 1].endBalance : 0;
  const tresoProjection =
    caBasis && hasBank && tauxNetRatio != null && caBasis.monthsUsed >= 1 && caBasis.futureMonths.length > 0
      ? caBasis.futureMonths.map((mk, j) => {
          const k = j + 1;
          const quasiVal = lastBal + mrr.mrr * tauxNetRatio * k; // CA récurrent (MRR) × marge nette
          const potentielVal = lastBal + caBasis.runRate * tauxNetRatio * k; // CA run-rate × marge nette
          return { label: monthLabelShort(mk), low: Math.min(quasiVal, potentielVal), high: Math.max(quasiVal, potentielVal) };
        })
      : [];
  // CA vs charges — mensuel HT (exercice en cours). Mêmes charges que la marge nette ⇒ cohérence.
  const chargeComps = chargeComponentsByMonth(treso.outflows, cur.months, range);
  // Reversements hors exploitation (TVA, IS) par mois — segments visuels du graphe, hors marge.
  const horsExploit = horsExploitationByMonth(treso.outflows, cur.months, range);
  const caVsCharges = {
    months: cur.months,
    abo: cur.aboByMonth,
    install: cur.installByMonth,
    charges: chargeComps,
    horsExploit,
  };

  // ── Trésorerie : soldes INSTANTANÉS (ne suivent pas l'exercice sélectionné) ──
  const fiatEur = treso.accounts.filter((a) => a.kind === "FIAT").reduce((s, a) => s + (a.valoEur ?? 0), 0);
  const cryptoEur = treso.accounts.filter((a) => a.kind === "CRYPTO").reduce((s, a) => s + (a.valoEur ?? 0), 0);

  // Cash net — CARTE : flux net cumulé sur l'exercice sélectionné, vs N-1 (suit le sélecteur, LOT 4).
  const cashNetFy = flowsInRange(treso.months, range).net;
  const cashNetFyPrev = flowsInRange(treso.months, prevRange).net;

  // Cash net du MOIS COURANT — uniquement pour l'alerte « cash net négatif ce mois » (instantané).
  const cashNetMonth = flowsInRange(treso.months, presetRange("current-month", todayISO)).net;

  // ── Prospection (définitions identiques à la liste) — `rows` = getCockpitProspection() ──
  const counts: Record<KpiCategory, number> = { a_rencontrer: 0, rencontres: 0, a_installer: 0, installes: 0, refus: 0 };
  for (const r of rows) {
    const c = categoryOf(r.kind);
    if (c) counts[c] += 1;
  }
  const clientsActuels = counts.a_installer + counts.installes;
  // Taux brut (non arrondi) → affiché à 1 décimale comme tous les pourcentages (règle pct1).
  const tauxReussite =
    clientsActuels + counts.refus > 0 ? (clientsActuels / (clientsActuels + counts.refus)) * 100 : 0;

  const now = Date.now();
  const overdue = rows
    .filter((r) => {
      if (!r.reminderAt || r.reminderDone) return false;
      const c = categoryOf(r.kind);
      if (!c || HIDDEN_CATS.has(c)) return false;
      return reminderStatus(r.reminderAt, r.reminderDone, now) === "overdue";
    })
    .sort((a, b) => Date.parse(a.reminderAt!) - Date.parse(b.reminderAt!));

  const recontacter = overdue.slice(0, 6).map((r) => ({
    id: r.id,
    company: r.company,
    genre: r.genre,
    nom: r.nom,
    prenom: r.prenom,
    dateLabel: formatDateFR(r.reminderAt!) ?? "",
  }));

  // ── Actions prioritaires (déduites des données) ──
  // « Factures impayées » et « Prospects à rencontrer » sont remontés en cartes compactes dans
  // l'en-tête (LOT 1) — ils ne figurent donc plus dans la liste d'alertes ci-dessous.
  const unpaidTtc = docs.reduce((s, d) => s + (d.kind === "INVOICE" ? d.netToPay : 0), 0);
  const alerts: CockpitData["alerts"] = [];
  if (cashNetMonth < 0) alerts.push({ tone: "danger", text: `Cash net négatif ce mois (${euro(cashNetMonth)})`, href: "/tresorerie" });
  if (overdue.length > 0) alerts.push({ tone: "warn", text: `${overdue.length} prospect${overdue.length > 1 ? "s" : ""} à recontacter (rappel échu)`, href: "/prospection" });
  if (mrr.pct != null && mrr.pct < 0) alerts.push({ tone: "warn", text: `MRR en baisse vs N-1 (${pct1(mrr.pct)} %)`, href: "/facturation" });

  // Aucune donnée d'aucune source (cache vide, avant toute synchro) → état vide dédié au Cockpit,
  // au lieu d'afficher des « 0 € » partout qui ressembleraient à de vraies valeurs.
  const isEmpty = docs.length === 0 && treso.accounts.length === 0 && treso.outflows.length === 0 && rows.length === 0;

  return {
    fyLabel: fyLabel(fy),
    fy,
    currentFy,
    isCurrentFy,
    fyList,
    isEmpty,
    lastSync,
    freshness,
    // Mention « partiellement à jour » pour les indicateurs composites (Evoliz × Revolut) si une
    // source est périmée — seulement quand la marge nette est effectivement affichée (hasBank).
    staleNote: hasBank ? (staleSourcesLabel(freshness) ? `Partiellement à jour — ${staleSourcesLabel(freshness)}` : undefined) : undefined,
    // total + total N-1 (la carte calcule le delta neutre) + 3 composantes affichées en clair.
    etat: { total: etat.total, totalPrev: etatPrev.total, tva: etat.tva, social: etat.social, is: etat.is },
    caFyCur,
    caFyPrev,
    tresoSeries,
    tresoSeriesPrev,
    tresoProjection,
    mrrSeries,
    mrrSeriesPrev,
    caProjection,
    caVsCharges,
    net,
    bankStart,
    finance: {
      caHt: cur.caHtTotal,
      caHtPrev: prev.caHtTotal,
      caHtAvg: cur.caHtTotal / nMonths,
      caDelta: rel(cur.caHtTotal, prev.caHtTotal),
      margeNette,
      margeNettePrev,
      margeNetteDelta: hasBank && hasBankPrev ? rel(margeNette, margeNettePrev) : null,
      remu,
      remuPrev,
      remuAvg: remu / nMonths,
      remuDelta: hasBank && hasBankPrev ? rel(remu, remuPrev) : null,
      hasBank,
      tauxNette,
      tauxNetteDeltaPts: hasBank && hasBankPrev && tauxNette != null && tauxNettePrev != null ? tauxNette - tauxNettePrev : null,
      mrr: mrr.mrr,
      mrrPrev: mrr.prev,
      mrrDelta: mrr.pct,
      mrrLabel: mrr.monthLabel,
      tresoTotal: fiatEur + cryptoEur,
      fiatEur,
      cryptoEur,
      unpaidTtc,
      // Cash net cumulé de l'exercice sélectionné — « n/a » avant les données bancaires (hasBank).
      cashNetFy,
      cashNetFyPrev,
      cashNetFyDelta: hasBank && hasBankPrev ? rel(cashNetFy, cashNetFyPrev) : null,
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
    "Renseigner NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY et SUPABASE_SECRET_KEY.",
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
