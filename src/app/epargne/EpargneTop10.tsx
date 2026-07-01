"use client";

import { CategoryRow } from "./EpargneReport";
import type { RollingReport } from "@/lib/epargne/report";

// Tableau « Top 10 dépenses par catégorie — 12 derniers mois glissants ».
// Réutilise CategoryRow (drill-down + recatégorisation + exclusion) de EpargneReport.
// Charte Cockpit (rounded-card / shadow-card / tokens ink).

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });

export function EpargneTop10({ report }: { report: RollingReport }) {
  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Top 10 dépenses par catégorie — 12 derniers mois</h2>
          <p className="mt-0.5 text-xs capitalize text-ink-3">{report.rangeLabel}</p>
        </div>
        <div className="text-sm text-ink-2 sm:text-right">
          <span className="font-semibold text-ink">{eur.format(report.total)}</span>
          <span className="text-ink-3"> au total</span>
          <span className="mx-1.5 text-line">·</span>
          dont consommation&nbsp;<span className="font-semibold text-ink">{eur.format(report.consumptionTotal)}</span>
        </div>
      </div>

      {report.categories.length === 0 ? (
        <p className="mt-5 rounded-card border border-line bg-cloud p-4 text-sm text-ink-2">
          Aucune dépense sur les 12 derniers mois.
        </p>
      ) : (
        <div className="mt-5 space-y-1.5">
          {report.categories.map((c) => (
            <CategoryRow key={c.category} slice={c} txs={report.txByCategory[c.category] ?? []} />
          ))}
        </div>
      )}
    </section>
  );
}
