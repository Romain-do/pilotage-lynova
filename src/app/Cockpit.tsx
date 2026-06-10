"use client";

import Link from "next/link";
import {
  IconCoin,
  IconReportMoney,
  IconPercentage,
  IconRepeat,
  IconWallet,
  IconArrowsExchange,
  IconCurrencyBitcoin,
  IconUsers,
  IconTrophy,
  IconCalendarEvent,
  IconPhoneCall,
  IconAlertTriangle,
  IconChevronRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { Logo } from "@/components/Logo";
import { KpiCard } from "@/components/KpiCard";
import { euro } from "@/lib/facturation";

export interface CockpitData {
  fyLabel: string;
  finance: {
    caHt: number; caDelta: number | null;
    margeNette: number; margeNetteDelta: number | null; hasBank: boolean;
    tauxNette: number | null; tauxNetteDeltaPts: number | null;
    mrr: number; mrrDelta: number | null; mrrLabel: string | null;
    tresoTotal: number; fiatEur: number; cryptoEur: number;
    cashNetMonth: number; cashNetMonthDelta: number | null; monthLabel: string;
    cryptoPnl: number; cryptoPct: number | null; cryptoTransferredOut: number;
  };
  prospection: {
    totalProspects: number;
    clientsActuels: number;
    tauxReussite: number;
    aRencontrer: number;
    aRecontacter: number;
    recontacter: { id: string; name: string; company: string | null; dateLabel: string }[];
  };
  alerts: { tone: "danger" | "warn" | "info"; text: string; href: string }[];
}

const QUICK = [
  { href: "/facturation", label: "Facturation", Icon: IconCoin },
  { href: "/tresorerie", label: "Trésorerie", Icon: IconWallet },
  { href: "/prospection", label: "Prospection", Icon: IconUsers },
];

const ALERT_TONE: Record<string, string> = {
  danger: "border-red-200 bg-red-50 text-red-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function Cockpit({
  user,
  dateLabel,
  data,
}: {
  user: { name: string | null; email: string; role: string };
  dateLabel: string;
  data: CockpitData;
}) {
  const firstName = user.name?.trim().split(/\s+/)[0] ?? user.email;
  const f = data.finance;
  const p = data.prospection;

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      {/* En-tête */}
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo className="text-lg text-white" />
            <span className="text-sm text-white/50">/ Cockpit</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/70 sm:inline">{user.email}</span>
            {user.role === "DIRIGEANT" && (
              <Link href="/admin" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10">
                Administration
              </Link>
            )}
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* Salutation + accès rapide */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Bonjour {firstName}</h1>
            <p className="mt-1 text-sm capitalize text-ink-3">{dateLabel}</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {QUICK.map(({ href, label, Icon }) => (
              <Link key={href} href={href}
                className="inline-flex items-center gap-2 rounded-card border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-card transition-all hover:border-cyan/60 hover:shadow-card-hover">
                <Icon size={16} stroke={2} className="text-cyan-600" />
                {label}
                <IconChevronRight size={14} className="text-ink-3" />
              </Link>
            ))}
          </nav>
        </div>

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

        {/* Bloc Finances */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Finances</h2>
            <span className="text-xs text-ink-3">{data.fyLabel} · comparé à N-1</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard icon={<IconCoin size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="CA HT"
              value={euro(f.caHt)} delta={f.caDelta} />
            <KpiCard icon={<IconReportMoney size={18} stroke={2} />} tint="bg-violet-50 text-violet-600" label="Marge nette (approchée)"
              value={f.hasBank ? euro(f.margeNette) : "n/a"} muted={!f.hasBank}
              delta={f.hasBank ? f.margeNetteDelta : null}
              foot={f.hasBank ? undefined : "pas de données bancaires avant nov. 2024"} />
            <KpiCard icon={<IconPercentage size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="Taux de marge nette"
              value={f.hasBank && f.tauxNette != null ? `${f.tauxNette.toFixed(1)} %` : "n/a"} muted={!f.hasBank}
              delta={f.tauxNetteDeltaPts} deltaUnit="pts"
              foot={f.hasBank ? undefined : "pas de données bancaires avant nov. 2024"} />
            <KpiCard icon={<IconRepeat size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label={`MRR · ${f.mrrLabel ?? "—"}`}
              value={euro(f.mrr)} delta={f.mrrDelta} />
            <KpiCard icon={<IconWallet size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="Trésorerie totale"
              value={euro(f.tresoTotal)} foot={`fiat ${euro(f.fiatEur)} · crypto ${euro(f.cryptoEur)}`} />
            <KpiCard icon={<IconArrowsExchange size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label={`Cash net · ${f.monthLabel}`}
              value={euro(f.cashNetMonth)} delta={f.cashNetMonthDelta} />
            <KpiCard icon={<IconCurrencyBitcoin size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="P&L crypto (global)"
              value={euro(f.cryptoPnl)} delta={f.cryptoPct} deltaLabel="rendement"
              foot={`~${euro(f.cryptoTransferredOut)} transférés hors plateforme`} />
          </div>
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
                value={String(p.clientsActuels)} foot={`${p.totalProspects} prospect(s) au total`} />
              <KpiCard icon={<IconTrophy size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="Taux de réussite"
                value={`${p.tauxReussite} %`} foot="clients ÷ (clients + refus)" />
              <KpiCard icon={<IconCalendarEvent size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label="À rencontrer"
                value={String(p.aRencontrer)} foot="rendez-vous à planifier" />
              <KpiCard icon={<IconPhoneCall size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="À recontacter"
                value={String(p.aRecontacter)} foot="rappels échus" />
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
                        <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                        {r.company && <span className="block truncate text-xs text-ink-3">{r.company}</span>}
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
      </section>
    </main>
  );
}
