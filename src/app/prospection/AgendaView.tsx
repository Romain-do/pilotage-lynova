"use client";

import { useMemo, useState } from "react";
import {
  formatDateFR,
  reminderStatus,
  reminderDotClass,
  temperatureBadgeClass,
  dateInDays,
  prospectTitle,
  type ProspectRow,
  type GroupDTO,
} from "@/lib/prospection";
import { InlineDateInput } from "./InlineDateInput";

export function AgendaView({
  rows,
  groups,
  onOpen,
  onMarkDone,
  onReschedule,
}: {
  rows: ProspectRow[];
  groups: GroupDTO[];
  onOpen: (id: string) => void;
  onMarkDone: (id: string, done: boolean) => void;
  onReschedule: (id: string, dateISO: string | null) => void;
}) {
  const groupName = useMemo(() => {
    const m = new Map(groups.map((g) => [g.id, g.name]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [groups]);

  const buckets = useMemo(() => {
    const pending = rows
      .filter((r) => r.reminderAt && !r.reminderDone)
      .sort((a, b) => new Date(a.reminderAt!).getTime() - new Date(b.reminderAt!).getTime());

    return {
      overdue: pending.filter((r) => reminderStatus(r.reminderAt, false) === "overdue"),
      soon: pending.filter((r) => reminderStatus(r.reminderAt, false) === "soon"),
      later: pending.filter((r) => reminderStatus(r.reminderAt, false) === "scheduled"),
    };
  }, [rows]);

  const empty = !buckets.overdue.length && !buckets.soon.length && !buckets.later.length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 sm:px-6">
      {empty && (
        <div className="rounded-xl border border-navy/10 bg-white p-10 text-center text-sm text-navy/50 shadow-sm">
          Aucune relance planifiée. Ajoutez une date de rappel sur une fiche prospect.
        </div>
      )}

      <Group title="En retard" accent="text-red-600" items={buckets.overdue} groupName={groupName} onOpen={onOpen} onMarkDone={onMarkDone} onReschedule={onReschedule} />
      <Group title="Cette semaine" accent="text-amber-600" items={buckets.soon} groupName={groupName} onOpen={onOpen} onMarkDone={onMarkDone} onReschedule={onReschedule} />
      <Group title="Plus tard" accent="text-navy/60" items={buckets.later} groupName={groupName} onOpen={onOpen} onMarkDone={onMarkDone} onReschedule={onReschedule} />
    </div>
  );
}

function Group({
  title,
  accent,
  items,
  groupName,
  onOpen,
  onMarkDone,
  onReschedule,
}: {
  title: string;
  accent: string;
  items: ProspectRow[];
  groupName: (id: string | null) => string | null;
  onOpen: (id: string) => void;
  onMarkDone: (id: string, done: boolean) => void;
  onReschedule: (id: string, dateISO: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6 first:mt-2">
      <h2 className={`mb-2 text-sm font-semibold uppercase tracking-wide ${accent}`}>
        {title} <span className="text-navy/30">({items.length})</span>
      </h2>
      <div className="space-y-2">
        {items.map((r) => (
          <Item
            key={r.id}
            row={r}
            groupName={groupName}
            onOpen={onOpen}
            onMarkDone={onMarkDone}
            onReschedule={onReschedule}
          />
        ))}
      </div>
    </section>
  );
}

function Item({
  row,
  groupName,
  onOpen,
  onMarkDone,
  onReschedule,
}: {
  row: ProspectRow;
  groupName: (id: string | null) => string | null;
  onOpen: (id: string) => void;
  onMarkDone: (id: string, done: boolean) => void;
  onReschedule: (id: string, dateISO: string | null) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const status = reminderStatus(row.reminderAt, false);
  const contact = row.name?.trim() ?? ""; // contact réel seulement (pas de placeholder dans l'agenda)

  return (
    <div className="rounded-xl border border-navy/10 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => onOpen(row.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 flex-none rounded-full ${reminderDotClass(status)}`} />
            <span className="truncate font-medium text-navy">{prospectTitle(row)}</span>
            <span
              className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${temperatureBadgeClass(
                row.stageKind
              )}`}
            >
              {row.stageName}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 pl-4 text-xs text-navy/55">
            <span>⏰ {formatDateFR(row.reminderAt)}</span>
            {contact && <span>· {contact}</span>}
            {groupName(row.groupId) && <span>· {groupName(row.groupId)}</span>}
          </div>
        </button>

        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => onMarkDone(row.id, true)}
            className="rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            ✓ Fait
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setReporting((v) => !v)}
              className="rounded-md border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy/5"
            >
              Reporter
            </button>
            {reporting && (
              <>
                {/* Clic ailleurs = fermeture propre (le calendrier natif est hors-DOM,
                    cliquer dedans ne déclenche donc PAS ce backdrop). */}
                <div className="fixed inset-0 z-10" onClick={() => setReporting(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-navy/10 bg-white p-1.5 shadow-lg">
                {[
                  { label: "À demain", days: 1 },
                  { label: "Dans 3 jours", days: 3 },
                  { label: "Dans 1 semaine", days: 7 },
                  { label: "Dans 2 semaines", days: 14 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => {
                      onReschedule(row.id, dateInDays(opt.days));
                      setReporting(false);
                    }}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-navy/80 hover:bg-navy/[0.06]"
                  >
                    {opt.label}
                  </button>
                ))}
                <label className="mt-1 block border-t border-navy/10 px-2.5 pt-2 text-xs text-navy/50">
                  Date précise
                  <InlineDateInput
                    value=""
                    onSelect={(date) => {
                      if (date) {
                        onReschedule(row.id, date);
                        setReporting(false);
                      }
                    }}
                    ariaLabel={`Reporter ${prospectTitle(row)} à une date précise`}
                    className="mt-1 w-full rounded-md border border-navy/15 px-2 py-1 text-sm text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
                  />
                </label>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
