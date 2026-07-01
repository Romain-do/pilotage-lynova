import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";
import { requireEpargneAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppNavServer } from "@/components/AppNavServer";
import { getPeriodReport, getSavingsEvolution, getCourantEvolution, getRollingCategoryReport } from "@/lib/epargne/report";
import { TresoAreaChart } from "@/components/TresoAreaChart";
import { EpargneUpload } from "./EpargneUpload";
import { EpargneReport } from "./EpargneReport";
import { EpargneTop10 } from "./EpargneTop10";

// Espace « Notre épargne » (comptes Revolut PERSO, import CSV).
// Vue d'ensemble 12 mois en haut (évolution épargne, solde courant vs N-1, top 10 catégories),
// puis rapport mensuel détaillé conservé en dessous. Accès liste blanche (requireEpargneAccess),
// vérifié CÔTÉ SERVEUR. Charte alignée sur le Cockpit (rounded-card / shadow-card / tokens ink).
export const dynamic = "force-dynamic";

const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

export default async function EpargnePage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; mois?: string; debut?: string; fin?: string }>;
}) {
  await requireEpargneAccess();

  const sp = await searchParams;

  const [counts, savings, courant, rolling, report] = await Promise.all([
    prisma.persoTransaction.groupBy({ by: ["account"], _count: { _all: true } }),
    getSavingsEvolution(),
    getCourantEvolution(),
    getRollingCategoryReport(),
    getPeriodReport(sp),
  ]);

  const countByAccount = new Map(counts.map((c) => [c.account, c._count._all]));
  const hasData = counts.length > 0;

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <AppNavServer />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold text-ink">Notre épargne</h1>
          <p className="mt-1 text-sm text-ink-3">
            Suivi des comptes Revolut personnels par import CSV. Espace privé et cloisonné.
          </p>
        </header>

        {!hasData && (
          <p className="mb-5 rounded-card border border-line bg-white p-4 text-sm text-ink-2 shadow-card">
            Aucune donnée pour l&apos;instant. Importez un export CSV Revolut ci-dessous pour démarrer.
          </p>
        )}

        {/* Comptes en un coup d'œil */}
        <section className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Compte courant joint</div>
            <div className="mt-1 text-2xl font-semibold text-ink">
              {courant ? eur2.format(courant.currentBalance) : "—"}
            </div>
            <div className="mt-1 text-xs text-ink-3">{countByAccount.get("COURANT") ?? 0} transaction(s)</div>
          </div>
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Compte épargne</div>
            <div className="mt-1 text-2xl font-semibold text-ink">
              {savings ? eur2.format(savings.currentBalance) : "—"}
            </div>
            <div className="mt-1 text-xs text-ink-3">
              {savings ? `Intérêts cumulés ${eur2.format(savings.totalInterest)}` : `${countByAccount.get("EPARGNE") ?? 0} transaction(s)`}
            </div>
            {savings && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {savings.yoyDelta != null && savings.prevYearBalance != null ? (
                  <>
                    <YoyBadge delta={savings.yoyDelta} />
                    <span className="text-ink-3">vs {savings.prevYearLabel} : {eur0.format(savings.prevYearBalance)}</span>
                  </>
                ) : (
                  <span className="text-ink-3">Variation N-1 : — <span className="opacity-70">(historique épargne &lt; 12 mois)</span></span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Évolution de l'épargne — 12 derniers mois */}
        {savings && savings.series.length > 0 && (
          <section className="mb-4 rounded-card border border-line bg-white p-4 shadow-card">
            <ChartHeader
              title="Évolution de l'épargne"
              subtitle="Solde du compte épargne · fin de mois · 12 derniers mois"
              stats={[
                { label: "Solde actuel", value: eur0.format(savings.currentBalance), tone: "ink" },
                { label: "Intérêts cumulés", value: eur2.format(savings.totalInterest), tone: "emerald" },
              ]}
            />
            <TresoAreaChart series={savings.series} title="Évolution de l'épargne" valueLabel="Solde" deltaInTooltip />
          </section>
        )}

        {/* Solde du compte courant — 12 derniers mois (courbe épurée) */}
        {courant && courant.series.length > 0 && (
          <section className="mb-4 rounded-card border border-line bg-white p-4 shadow-card">
            <ChartHeader
              title="Solde du compte courant"
              subtitle="Fin de mois · 12 derniers mois"
              stats={[{ label: "Solde actuel", value: eur0.format(courant.currentBalance), tone: "ink" }]}
            />
            <TresoAreaChart series={courant.series} title="Solde du compte courant" valueLabel="Solde" />
          </section>
        )}

        {/* Top 10 dépenses par catégorie — 12 derniers mois */}
        {rolling && (
          <div className="mb-8">
            <EpargneTop10 report={rolling} />
          </div>
        )}

        {/* Détail des dépenses par période (mois / année / personnalisé) */}
        {report && (
          <div className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-ink">Détail des dépenses</h2>
            <EpargneReport report={report} />
          </div>
        )}

        <EpargneUpload />
      </div>
    </main>
  );
}

// Badge de variation annuelle du solde épargne (vs même mois N-1), style N-1 du Cockpit (flèche + %).
// Pour l'épargne, une hausse est favorable → vert.
function YoyBadge({ delta }: { delta: number }) {
  const up = delta >= 0;
  const Icon = up ? IconArrowUpRight : IconArrowDownRight;
  const pct = Math.abs(delta).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span
      className={`inline-flex flex-none items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
      title="Variation du solde épargne vs le même mois l'an dernier"
    >
      <Icon size={12} stroke={2.2} />
      {up ? "+" : "−"}{pct} %
    </span>
  );
}

// En-tête de carte-graphe : titre + sous-titre à gauche, statistiques à droite.
function ChartHeader({
  title,
  subtitle,
  stats,
}: {
  title: string;
  subtitle: string;
  stats: { label: string; value: string; tone: "ink" | "emerald" }[];
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-xs text-ink-3">{subtitle}</p>
      </div>
      <div className="flex gap-6 sm:gap-8">
        {stats.map((s) => (
          <div key={s.label} className="sm:text-right">
            <div className="text-[11px] uppercase tracking-wide text-ink-3">{s.label}</div>
            <div className={`text-lg font-semibold ${s.tone === "emerald" ? "text-emerald-700" : "text-ink"}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
