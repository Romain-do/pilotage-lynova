"use client";

import Link from "next/link";
import {
  IconCoin,
  IconPigMoney,
  IconWallet,
  IconArrowsExchange,
  IconUsers,
  IconTrophy,
  IconCalendarEvent,
  IconPhoneCall,
  IconAlertTriangle,
  IconChevronRight,
  IconExternalLink,
  IconFileInvoice,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { KpiCard } from "@/components/KpiCard";
import { EtatCard } from "@/components/EtatCard";
import { MargeNetteCard } from "@/components/MargeNetteCard";
import { MrrCard } from "@/components/MrrCard";
import { CaProjectionCard, type CaProjection } from "@/components/CaProjectionCard";
import { FySelect } from "@/components/FySelect";
import type { RevolutCharges } from "@/lib/tresorerie";
import { CaVsN1Chart } from "@/components/CaVsN1Chart";
import { CaVsChargesChart, ChargesLegend, type ChargeSeries } from "@/components/CaVsChargesChart";
import { TresoAreaChart, type SeriePoint } from "@/components/TresoAreaChart";
import { RefreshButton } from "@/components/RefreshButton";
import { InfoTip } from "@/components/InfoTip";
import { euro, pct1 } from "@/lib/facturation";
import { prospectTitle, prospectContactName } from "@/lib/prospection";
import type { Freshness } from "@/lib/sync-state";

export interface CockpitData {
  fyLabel: string;
  fy: number;
  // Sélecteur d'exercice (LOT 4) : exercice en cours, exercice sélectionné == en cours ?, liste.
  currentFy: number;
  isCurrentFy: boolean;
  fyList: number[];
  // Cache vide (aucune source) → état vide dédié au lieu de « 0 € » partout.
  isEmpty: boolean;
  lastSync: string | null;
  // Fraîcheur par source (Evoliz / Revolut) + mention « partiellement à jour » pour les composites.
  freshness: Freshness;
  staleNote?: string;
  // « Versé à l'État » = TVA + charges sociales (URSSAF) + IS sur l'exercice (delta neutre vs N-1).
  etat: { total: number; totalPrev: number; tva: number; social: number; is: number };
  caFyCur: number[];
  caFyPrev: number[];
  // Évolution de la trésorerie (solde fin de mois, 12 derniers mois) — réutilise TresoAreaChart.
  tresoSeries: SeriePoint[];
  // Courbe N-1 trésorerie (mois sans données bancaires marqués `missing` → courbe interrompue).
  tresoSeriesPrev: SeriePoint[];
  // Évolution du MRR mensuel (abonnements facturés) + courbe N-1 — réutilise TresoAreaChart.
  mrrSeries: SeriePoint[];
  mrrSeriesPrev: SeriePoint[];
  // Projection CA HT (exercice en cours) — null si non applicable.
  caProjection: CaProjection | null;
  // CA vs charges mensuel HT (exercice en cours) — réutilise CaVsChargesChart.
  caVsCharges: ChargeSeries;
  // Charges Revolut de l'exercice (total + ventilation par catégorie) — détail de la marge nette.
  net: RevolutCharges;
  bankStart: string | null;
  finance: {
    caHt: number; caHtPrev: number; caHtAvg: number; caDelta: number | null;
    margeNette: number; margeNettePrev: number; margeNetteDelta: number | null; hasBank: boolean;
    remu: number; remuPrev: number; remuAvg: number; remuDelta: number | null;
    tauxNette: number | null; tauxNetteDeltaPts: number | null;
    mrr: number; mrrPrev: number; mrrDelta: number | null; mrrLabel: string | null;
    tresoTotal: number; fiatEur: number; cryptoEur: number;
    cashNetFy: number; cashNetFyPrev: number; cashNetFyDelta: number | null;
    unpaidTtc: number;
  };
  prospection: {
    totalProspects: number;
    clientsActuels: number;
    tauxReussite: number;
    aRencontrer: number;
    aRecontacter: number;
    recontacter: {
      id: string;
      company: string | null;
      genre: string | null;
      nom: string | null;
      prenom: string | null;
      dateLabel: string;
    }[];
  };
  alerts: { tone: "danger" | "warn" | "info"; text: string; href: string }[];
}

const ALERT_TONE: Record<string, string> = {
  danger: "border-red-200 bg-red-50 text-red-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function Cockpit({
  user,
  epargne,
  dateLabel,
  data,
}: {
  user: { name: string | null; email: string; role: string };
  epargne: boolean;
  dateLabel: string;
  data: CockpitData;
}) {
  const firstName = user.name?.trim().split(/\s+/)[0] ?? user.email;
  const f = data.finance;
  const p = data.prospection;

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <AppNav role={user.role} epargne={epargne} />

      <section className="mx-auto w-full max-w-7xl flex-1 overflow-x-hidden px-4 py-6 sm:px-6">
        {/* Salutation + actions prioritaires compactes + actualiser */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-none">
            <h1 className="text-2xl font-semibold text-ink">Bonjour {firstName}</h1>
            <p className="mt-1 text-sm capitalize text-ink-3">{dateLabel}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {!data.isEmpty && (
              <div className="grid grid-cols-2 gap-2.5 sm:flex">
                <HeaderAction href="/facturation" tint="bg-amber-50 text-amber-600"
                  icon={<IconFileInvoice size={18} stroke={2} />} label="Factures impayées" value={euro(f.unpaidTtc)} />
                <HeaderAction href="/prospection" tint="bg-sky-50 text-sky-600"
                  icon={<IconCalendarEvent size={18} stroke={2} />} label="À rencontrer" value={String(p.aRencontrer)} />
              </div>
            )}
            <RefreshButton initialLastSync={data.lastSync} freshness={data.freshness} />
          </div>
        </div>

        {data.isEmpty ? (
          <CockpitEmpty />
        ) : (
        <>
        {/* Actions prioritaires */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-ink">Actions prioritaires</h2>
          {data.alerts.length === 0 ? (
            <p className="mt-2 rounded-card border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
              Rien d&apos;urgent — tout est à jour. 👌
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.alerts.map((a, i) => (
                <Link key={i} href={a.href}
                  className={`group flex items-center gap-2.5 rounded-card border px-3.5 py-2.5 text-sm transition-shadow hover:shadow-card ${ALERT_TONE[a.tone]}`}>
                  <IconAlertTriangle size={18} stroke={2} className="flex-none" />
                  <span className="flex-1">{a.text}</span>
                  <IconChevronRight size={16} className="flex-none opacity-50 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Bloc Finances — sélecteur d'exercice global (pilote les indicateurs périodiques + graphes) */}
        <div className="mt-6">
          {/* Sélecteur d'exercice sur sa propre ligne, au-dessus du titre « Finances ». */}
          <FySelect fy={data.fy} currentFy={data.currentFy} fyList={data.fyList} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Finances</h2>
            <span className="text-xs text-ink-3">{data.fyLabel} · comparé à N-1</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Essentiels en tête : CA HT · Marge nette · Trésorerie · Cash net */}
            <KpiCard icon={<IconCoin size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="CA HT"
              value={euro(f.caHt)} valueRaw={f.caHt} valuePrev={f.caHtPrev} avgFoot={`⌀ ${euro(f.caHtAvg)}/mois`}
              info="Chiffre d'affaires hors taxes : somme des factures validées sur l'exercice. ⌀/mois = CA HT ÷ nombre de mois écoulés." />
            {/* Marge nette + taux de marge nette fusionnés dans une seule carte. */}
            <MargeNetteCard
              hasBank={f.hasBank}
              value={f.margeNette}
              valuePrev={f.margeNettePrev}
              delta={f.margeNetteDelta}
              caHtTotal={f.caHt}
              net={data.net}
              taux={f.tauxNette}
              tauxDeltaPts={f.tauxNetteDeltaPts}
              staleNote={data.staleNote}
            />
            <KpiCard icon={<IconWallet size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="Trésorerie totale"
              badge={data.isCurrentFy ? undefined : "actuel"}
              value={euro(f.tresoTotal)} foot={`fiat ${euro(f.fiatEur)} · crypto ${euro(f.cryptoEur)}`}
              info="Valeur de tous les comptes : liquidités fiat (EUR + devises converties) + cryptos valorisées au cours Revolut. Solde instantané (ne suit pas l'exercice sélectionné)." />
            <KpiCard icon={<IconArrowsExchange size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label={`Cash net · exercice ${data.fy}`}
              value={f.hasBank ? euro(f.cashNetFy) : "n/a"} muted={!f.hasBank}
              valueRaw={f.cashNetFy} valuePrev={f.cashNetFyPrev}
              foot={f.hasBank ? undefined : "pas de données bancaires avant nov. 2024"}
              info="Flux net cumulé sur l'exercice sélectionné : encaissements − décaissements externes (hors virements internes et crypto)." />
            {/* Colonne 1 de la rangée : Rémunération (compacte) + CA HT projeté empilés, alignés sur
                la hauteur de la grande carte MRR (col 2-3). */}
            <div className="flex h-full flex-col gap-3">
              <KpiCard icon={<IconPigMoney size={18} stroke={2} />} tint="bg-rose-50 text-rose-600" label="Rémunération" compact
                value={f.hasBank ? euro(f.remu) : "n/a"} muted={!f.hasBank}
                valueRaw={f.remu} valuePrev={f.remuPrev} deltaNeutral
                avgFoot={f.hasBank ? `⌀ ${euro(f.remuAvg)}/mois` : undefined}
                foot={f.hasBank ? undefined : "pas de données bancaires avant nov. 2024"}
                info="Total versé au dirigeant sur l'exercice : décaissements Revolut catégorisés « Rémunération »." />
              <CaProjectionCard fy={data.fy} projection={data.caProjection} className="flex-1" />
            </div>
            <MrrCard
              mrr={f.mrr} mrrPrev={f.mrrPrev} monthLabel={f.mrrLabel}
              series={data.mrrSeries}
              compare={data.mrrSeriesPrev.some((s) => s.endBalance > 0) ? data.mrrSeriesPrev : undefined}
            />
            <EtatCard
              total={data.etat.total} totalPrev={data.etat.totalPrev}
              tva={data.etat.tva} social={data.etat.social} is={data.etat.is}
              muted={!f.hasBank} foot={f.hasBank ? undefined : "pas de données bancaires avant nov. 2024"} />
          </div>
        </div>

        {/* Évolution de la trésorerie — exercice + N-1 (solde fiat EUR fin de mois) */}
        <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Évolution de la trésorerie</h2>
          <p className="text-xs text-ink-3">Solde fiat EUR fin de mois · exercice {data.fy}</p>
          <TresoAreaChart series={data.tresoSeries} compare={data.tresoSeriesPrev} />
        </div>

        {/* CA HT mensuel — exercice vs N-1 */}
        <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-ink">CA HT mensuel — exercice {data.fy} vs {data.fy - 1}</h2>
            <div className="flex items-center gap-3 text-xs text-ink-2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Exercice {data.fy}</span>
              <span className="inline-flex items-center gap-1.5 text-n1-text"><span className="h-2.5 w-2.5 rounded-sm bg-n1" /> Exercice {data.fy - 1}</span>
            </div>
          </div>
          <CaVsN1Chart current={data.caFyCur} previous={data.caFyPrev} fy={data.fy} />
        </div>

        {/* CA vs charges — mensuel HT (exercice en cours) */}
        <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
            <h2 className="text-sm font-semibold text-ink">CA vs charges — mensuel HT</h2>
            <ChargesLegend />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
            CA HT vs charges — marge nette du mois · exercice {data.fy}
            <InfoTip label="Détail CA vs charges">
              <strong className="font-semibold text-ink">CA</strong> en HT ; <strong className="font-semibold text-ink">charges &amp; dépenses</strong> en TTC
              (montants réellement décaissés). Marge nette = CA HT − charges d&apos;exploitation. <strong className="font-semibold text-ink">TVA</strong> reversée
              &amp; <strong className="font-semibold text-ink">IS</strong> affichés hors exploitation (visuels, hors marge).
            </InfoTip>
          </p>
          <CaVsChargesChart data={data.caVsCharges} bankStart={data.bankStart} />
        </div>

        {/* Bloc Prospection */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink">Prospection</h2>
              <Link href="/prospection" className="text-xs font-medium text-cyan-600 hover:underline">
                Ouvrir le pipeline →
              </Link>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <KpiCard icon={<IconUsers size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Clients actuels"
                value={String(p.clientsActuels)} foot={`${p.totalProspects} prospect(s) au total`}
                info="Prospects devenus clients : à installer + installés." />
              <KpiCard icon={<IconTrophy size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="Taux de réussite"
                value={`${pct1(p.tauxReussite)} %`} foot="clients ÷ (clients + refus)"
                info="Taux de conversion = clients actuels ÷ (clients actuels + refus)." />
              <KpiCard icon={<IconCalendarEvent size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label="À rencontrer"
                value={String(p.aRencontrer)} foot="rendez-vous à planifier"
                info="Prospects au stade « à rencontrer » : rendez-vous à planifier." />
              <KpiCard icon={<IconPhoneCall size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="À recontacter"
                value={String(p.aRecontacter)} foot="rappels échus"
                info="Prospects avec un rappel échu (date de relance dépassée, non traitée)." />
            </div>
          </div>

          {/* À recontacter en priorité */}
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">À recontacter en priorité</h2>
            <p className="text-xs text-ink-3">Rappels échus · le plus ancien d&apos;abord</p>
            {p.recontacter.length === 0 ? (
              <p className="mt-4 text-center text-sm text-ink-3">Aucun rappel échu. 🎉</p>
            ) : (
              <ul className="mt-3 divide-y divide-line/70">
                {p.recontacter.map((r) => (
                  <li key={r.id}>
                    <Link href={`/prospection?prospect=${r.id}`}
                      className="group flex items-center gap-2 py-2 transition-colors hover:bg-cloud">
                      <span className="h-1.5 w-1.5 flex-none rounded-full bg-red-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{prospectTitle(r)}</span>
                        {prospectContactName(r) && (
                          <span className="block truncate text-xs text-ink-3">{prospectContactName(r)}</span>
                        )}
                      </span>
                      <span className="flex-none text-xs font-medium text-red-600">{r.dateLabel}</span>
                      <IconExternalLink size={14} className="flex-none text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="mt-6 text-xs text-ink-3">
          <strong className="text-ink-2">Lecture seule</strong> · finances Evoliz + trésorerie Revolut · marge nette
          approchée (charges nettes captées depuis nov. 2024) · prospection native.
        </p>
        </>
        )}
      </section>
    </main>
  );
}

// Carte d'action compacte de l'en-tête (LOT 1) — « Factures impayées » & « À rencontrer » remontées
// près du salut. Même langage visuel que KpiCard (tuile d'icône, label capitales) en plus petit.
function HeaderAction({ href, tint, icon, label, value }: {
  href: string;
  tint: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-card border border-line bg-white px-3 py-2 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover"
    >
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] ${tint}`}>{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</span>
        <span className="block text-base font-semibold text-ink">{value}</span>
      </span>
    </Link>
  );
}

// État vide du Cockpit : aucune donnée d'aucune source (avant la 1re synchro). Évite d'afficher des
// « 0 € » trompeurs ; invite à synchroniser (le bouton « Actualiser » est déjà dans l'en-tête).
function CockpitEmpty() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center rounded-card border border-line bg-white px-6 py-16 text-center shadow-card">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan/15 text-cyan-600">
        <IconWallet size={24} stroke={2} />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-ink">Aucune donnée à afficher</h2>
      <p className="mt-2 max-w-md text-sm text-ink-3">
        Le cache est vide. Lancez une synchronisation (Evoliz + Revolut) avec « Actualiser » ci-dessus pour
        alimenter le Cockpit. La prospection apparaîtra dès le premier prospect ajouté.
      </p>
    </div>
  );
}
