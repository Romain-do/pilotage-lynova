"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconChevronRight, IconArrowUpRight, IconArrowDownRight, IconArrowBackUp } from "@tabler/icons-react";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/epargne/categorize";
import { recategorizeMerchant, toggleExcluded, type RecategorizeResult, type ToggleExcludedResult } from "./actions";
import type { PeriodReport, CategorySlice, ReportTx } from "@/lib/epargne/report";

// Rapport mensuel des dépenses du compte COURANT joint. Sélecteur de mois (navigation ?mois=),
// donut par catégorie, total du mois + total « consommation » (hors virements Romain/Meg & impôts),
// drill-down au clic (transactions + re-catégorisation mémorisée + exclusion du budget).
// Charte alignée sur le Cockpit (tokens ink/line/cloud, cartes rounded-card/shadow-card).

// Couleurs par catégorie (ordre canonique). 1 source de vérité pour donut + pastilles.
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Alimentation: "#16a34a",
  "Restaurants & bars": "#f97316",
  "Transport & carburant": "#0ea5e9",
  "Logement & charges": "#6366f1",
  "Maison & bricolage": "#b45309",
  "Santé & pharmacie": "#ec4899",
  "Beauté / Coiffure": "#c026d3",
  Animaux: "#84cc16",
  "Loisirs & sorties": "#8b5cf6",
  "Shopping & vêtements": "#f43f5e",
  Amazon: "#ff9900",
  "Jouets / Cadeaux": "#ca8a04",
  "Cigarette électronique": "#0e7490",
  Abonnements: "#14b8a6",
  "Impôts / URSSAF": "#dc2626",
  "Virements Romain": "#2563eb",
  "Virements Meg": "#9333ea",
  "Virements divers": "#475569",
  Retraits: "#64748b",
  Autres: "#94a3b8",
};

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct1 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function EpargneReport({ report }: { report: PeriodReport }) {
  return (
    <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Dépenses du compte courant joint</h2>
          <p className="mt-0.5 text-xs text-ink-3">Débits par catégorie (hors virements épargne &amp; foyer). Choisissez une période.</p>
        </div>
        <PeriodControl report={report} />
      </div>

      {report.total === 0 ? (
        <p className="mt-5 rounded-card border border-line bg-cloud p-4 text-sm text-ink-2">
          Aucune dépense sur {report.periodLabel.toLowerCase()}.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
            <Donut report={report} />
            <TotalSummary report={report} />
          </div>

          <div className="mt-5 space-y-1.5">
            {report.categories.map((c) => (
              <CategoryRow key={c.category} slice={c} txs={report.txByCategory[c.category] ?? []} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// Sélecteur de période : Mois (avec menu déroulant), Année en cours, ou plage personnalisée.
const PERIOD_TABS: { mode: PeriodReport["mode"]; label: string }[] = [
  { mode: "mois", label: "Mois" },
  { mode: "annee", label: "Année" },
  { mode: "perso", label: "Personnalisé" },
];

function PeriodControl({ report }: { report: PeriodReport }) {
  const router = useRouter();
  const [pending, startNav] = useTransition();
  const go = (qs: string) => startNav(() => router.push(`/epargne?${qs}`, { scroll: false }));

  const onTab = (mode: PeriodReport["mode"]) => {
    if (mode === "mois") go(`vue=mois&mois=${report.monthKey}`);
    else if (mode === "annee") go("vue=annee");
    else go(`vue=perso&debut=${report.startISO}&fin=${report.endISO}`);
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="inline-flex rounded-md border border-line bg-white p-0.5">
        {PERIOD_TABS.map((p) => {
          const active = report.mode === p.mode;
          return (
            <button
              key={p.mode}
              type="button"
              onClick={() => onTab(p.mode)}
              disabled={pending}
              aria-pressed={active}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${active ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {report.mode === "mois" && (
        <select
          value={report.monthKey}
          onChange={(e) => go(`vue=mois&mois=${e.target.value}`)}
          disabled={pending}
          aria-label="Mois"
          className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium capitalize text-ink shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-50"
        >
          {report.months.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      )}

      {report.mode === "perso" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            go(`vue=perso&debut=${f.get("debut")}&fin=${f.get("fin")}`);
          }}
          className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3"
        >
          <input key={report.startISO} type="date" name="debut" defaultValue={report.startISO} disabled={pending} aria-label="Début"
            className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan" />
          <span aria-hidden>→</span>
          <input key={report.endISO} type="date" name="fin" defaultValue={report.endISO} disabled={pending} aria-label="Fin"
            className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan" />
          <button type="submit" disabled={pending}
            className="rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50">
            {pending ? "…" : "Appliquer"}
          </button>
        </form>
      )}
    </div>
  );
}

// Donut SVG : segments proportionnels au montant, couleur par catégorie, total au centre.
function Donut({ report }: { report: PeriodReport }) {
  const size = 176;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="relative mx-auto h-44 w-44 flex-none">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-cloud)" strokeWidth={stroke} />
        {report.categories.map((slice) => {
          if (slice.amount <= 0) return null;
          const len = (slice.amount / report.total) * c;
          const el = (
            <circle
              key={slice.category}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={CATEGORY_COLORS[slice.category]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] uppercase tracking-wide text-ink-3">Total</span>
        <span className="text-lg font-semibold text-ink">{eur.format(report.total)}</span>
      </div>
    </div>
  );
}

// Total de la période + total « consommation » (hors impôts) + variation vs mois précédent (mode mois).
function TotalSummary({ report }: { report: PeriodReport }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Dépenses de la période</div>
      <div className="text-3xl font-semibold text-ink">{eur.format(report.total)}</div>
      <div className="mt-1.5 text-sm text-ink-2">
        dont consommation&nbsp;<span className="font-semibold text-ink">{eur.format(report.consumptionTotal)}</span>
        <span className="text-ink-3"> — hors impôts</span>
      </div>
      <div className="mt-1 text-xs capitalize text-ink-3">{report.periodLabel}</div>
      {report.totalDelta !== null && report.prevMonthLabel ? (
        <div className="mt-2 inline-flex items-center gap-1.5 text-sm">
          <Delta value={report.totalDelta} invert />
          <span className="text-ink-3">vs {report.prevMonthLabel} ({eur.format(report.prevTotal)})</span>
        </div>
      ) : report.mode === "mois" ? (
        <div className="mt-2 text-sm text-ink-3">Pas de repère (mois précédent absent)</div>
      ) : null}
    </div>
  );
}

// Ligne catégorie : pastille + libellé + montant + part, barre, chevron. Clic → drill-down.
// Exportée pour être réutilisée par la vue « Top 10 — 12 derniers mois » (EpargneTop10).
export function CategoryRow({ slice, txs }: { slice: CategorySlice; txs: ReportTx[] }) {
  const [open, setOpen] = useState(false);
  const color = CATEGORY_COLORS[slice.category];

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cloud focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan"
      >
        {open ? <IconChevronDown size={16} className="flex-none text-ink-3" /> : <IconChevronRight size={16} className="flex-none text-ink-3" />}
        <span className="h-3 w-3 flex-none rounded-sm" style={{ backgroundColor: color }} aria-hidden />
        <span className="flex-none text-sm font-medium text-ink">{slice.category}</span>
        <span className="flex-none text-xs text-ink-3">· {slice.count}</span>
        <div className="mx-2 hidden h-1.5 flex-1 overflow-hidden rounded-full bg-cloud sm:block">
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, slice.pct)}%`, backgroundColor: color }} />
        </div>
        <span className="ml-auto flex-none text-sm font-semibold text-ink sm:ml-0">{eur.format(slice.amount)}</span>
        <span className="flex-none text-xs tabular-nums text-ink-3">{pct1(slice.pct)} %</span>
        {slice.monthlyAvg != null && (
          <span className="hidden flex-none whitespace-nowrap text-xs tabular-nums text-ink-3 sm:inline" title="Moyenne mensuelle sur les 12 derniers mois (total ÷ 12)">
            ⌀ {eur0.format(slice.monthlyAvg)}/mois
          </span>
        )}
        {slice.delta !== null && (
          <span className="hidden flex-none sm:inline-flex"><Delta value={slice.delta} invert small /></span>
        )}
      </button>

      {open && (
        <div className="border-t border-line bg-cloud/40 px-3 py-2">
          <ul className="divide-y divide-line">
            {txs.map((tx) => (
              <TxRow key={tx.id} tx={tx} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Détail d'une transaction : re-catégorisation mémorisée du marchand + exclusion du budget.
// Une transaction exclue reste visible mais grisée et barrée (hors total).
function TxRow({ tx }: { tx: ReportTx }) {
  const [state, action, pending] = useActionState<RecategorizeResult | null, FormData>(recategorizeMerchant, null);
  const [exState, exAction, exPending] = useActionState<ToggleExcludedResult | null, FormData>(toggleExcluded, null);

  return (
    <li className={`flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between ${tx.excluded ? "opacity-55" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`truncate text-sm text-ink ${tx.excluded ? "line-through" : ""}`}>{tx.description}</span>
          {tx.excluded && (
            <span className="flex-none rounded-full bg-cloud px-2 py-0.5 text-[10px] font-medium text-ink-3">exclu du budget</span>
          )}
          {tx.refundCandidate && !tx.excluded && (
            <span className="flex-none rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title="Un virement entrant de Meg/Romain de montant proche (±1 €) existe à ±3 jours">
              remboursement probable ?
            </span>
          )}
        </div>
        <div className="text-xs text-ink-3">{tx.dateLabel}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`flex-none text-sm font-medium tabular-nums ${tx.excluded ? "text-ink-3 line-through" : "text-ink"}`}>{eur.format(tx.amount)}</span>

        {/* Exclure / réintégrer du budget */}
        <form action={exAction}>
          <input type="hidden" name="id" value={tx.id} />
          <button
            type="submit"
            disabled={exPending}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
              tx.excluded
                ? "border-line text-ink-2 hover:bg-white"
                : "border-amber-300 text-amber-800 hover:bg-amber-50"
            }`}
            title={tx.excluded ? "Réintégrer au budget" : "Exclure du budget (avance remboursée)"}
          >
            <IconArrowBackUp size={13} />
            {exPending ? "…" : tx.excluded ? "Réintégrer" : "Exclure du budget"}
          </button>
          {exState && !exState.ok && <span className="ml-1 text-xs text-red-700" role="status">{exState.error}</span>}
        </form>

        {/* Re-catégorisation du marchand */}
        <form action={action} className="flex items-center gap-1.5">
          <input type="hidden" name="merchantKey" value={tx.merchantKey} />
          <label className="sr-only" htmlFor={`cat-${tx.id}`}>Catégorie du marchand</label>
          <select
            id={`cat-${tx.id}`}
            name="category"
            defaultValue={tx.category}
            disabled={pending}
            className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-50"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-50"
          >
            {pending ? "…" : "Enregistrer"}
          </button>
          {state?.ok && <span className="text-xs text-emerald-700" role="status">✓</span>}
          {state && !state.ok && <span className="text-xs text-red-700" role="status">{state.error}</span>}
        </form>
      </div>
    </li>
  );
}

// Puce de variation (% coloré). `invert` : hausse de dépense = défavorable (rouge).
function Delta({ value, invert, small }: { value: number; invert?: boolean; small?: boolean }) {
  const up = value >= 0;
  const bad = invert ? up : !up;
  const cls = bad ? "text-red-700" : "text-emerald-700";
  const Icon = up ? IconArrowUpRight : IconArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${cls} ${small ? "text-xs" : "text-sm"}`}>
      <Icon size={small ? 13 : 15} />
      {pct1(Math.abs(value))} %
    </span>
  );
}
