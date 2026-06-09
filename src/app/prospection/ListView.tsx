"use client";

import { useMemo, useState } from "react";
import {
  formatDateFR,
  reminderStatus,
  reminderDotClass,
  temperatureBadgeClass,
  categoryOf,
  groupColor,
  type KpiCategory,
  type ProspectRow,
  type GroupDTO,
} from "@/lib/prospection";
import type { StageLite } from "./Prospection";

type SortKey = "name" | "stage" | "reminder";
type SortDir = "asc" | "desc";
type Filter = { t: "all" } | { t: "kpi"; key: string } | { t: "stage"; id: string };

const KPI_DEFS: { key: string; label: string; accent: string; cats: KpiCategory[] }[] = [
  { key: "clients", label: "Clients actuels", accent: "text-emerald-600", cats: ["a_installer", "installes"] },
  { key: "rencontres", label: "Prospects rencontrés", accent: "text-amber-600", cats: ["rencontres"] },
  { key: "a_rencontrer", label: "À rencontrer", accent: "text-cyan-600", cats: ["a_rencontrer"] },
  { key: "a_installer", label: "À installer", accent: "text-sky-600", cats: ["a_installer"] },
  { key: "refus", label: "Refus", accent: "text-red-600", cats: ["refus"] },
];

export function ListView({
  rows,
  stages,
  groups,
  onOpen,
  onAssignGroup,
  onManageGroups,
}: {
  rows: ProspectRow[];
  stages: StageLite[];
  groups: GroupDTO[];
  onOpen: (id: string) => void;
  onAssignGroup: (ids: string[], groupId: string | null) => void;
  onManageGroups: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ t: "all" });
  const [groupBy, setGroupBy] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("reminder");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // KPIs sur l'ensemble.
  const counts = useMemo(() => {
    const c: Record<KpiCategory, number> = {
      a_rencontrer: 0,
      rencontres: 0,
      a_installer: 0,
      installes: 0,
      refus: 0,
    };
    for (const r of rows) {
      const cat = categoryOf(r.stageKind);
      if (cat) c[cat] += 1;
    }
    return c;
  }, [rows]);

  const clientsActuels = counts.a_installer + counts.installes;
  const pctRefus =
    clientsActuels + counts.refus > 0
      ? Math.round((counts.refus / (clientsActuels + counts.refus)) * 100)
      : 0;
  const kpiValue = (cats: KpiCategory[]) => cats.reduce((s, c) => s + counts[c], 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (filter.t === "kpi") {
      const def = KPI_DEFS.find((k) => k.key === filter.key);
      if (def) list = list.filter((r) => {
        const cat = categoryOf(r.stageKind);
        return cat !== null && def.cats.includes(cat);
      });
    } else if (filter.t === "stage") {
      list = list.filter((r) => r.stageId === filter.id);
    }
    if (q) {
      list = list.filter((r) =>
        [r.name, r.company, r.contact, r.email, r.phone, groupsById.get(r.groupId ?? "")?.name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => dir * compare(a, b, sortKey));
  }, [rows, query, filter, sortKey, sortDir, groupsById]);

  // Regroupement.
  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, ProspectRow[]>();
    for (const r of filtered) {
      const key = r.groupId ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()]
      .map(([gid, items]) => ({ group: gid ? groupsById.get(gid) ?? null : null, items }))
      .sort((a, b) => {
        if (!a.group) return 1;
        if (!b.group) return -1;
        return a.group.name.localeCompare(b.group.name, "fr");
      });
  }, [filtered, groupBy, groupsById]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((prev) => {
      if (filtered.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      }
      return new Set([...prev, ...filtered.map((r) => r.id)]);
    });
  }
  function assignTo(groupId: string | null) {
    onAssignGroup([...selected], groupId);
    setSelected(new Set());
    setAssignOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 sm:px-6">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {KPI_DEFS.map((k) => {
          const active = filter.t === "kpi" && filter.key === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setFilter(active ? { t: "all" } : { t: "kpi", key: k.key })}
              className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-colors ${
                active ? "border-navy ring-1 ring-navy" : "border-navy/10 hover:border-navy/30"
              }`}
            >
              <div className={`text-2xl font-semibold ${k.accent}`}>
                {k.key === "clients" ? clientsActuels : kpiValue(k.cats)}
              </div>
              <div className="mt-0.5 text-xs font-medium text-navy/60">{k.label}</div>
            </button>
          );
        })}
        <div className="rounded-xl border border-navy/10 bg-navy px-4 py-3 text-left shadow-sm">
          <div className="text-2xl font-semibold text-cyan">{pctRefus}%</div>
          <div className="mt-0.5 text-xs font-medium text-white/70">Taux de refus</div>
        </div>
      </div>

      {/* Filtre par statut */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-navy/40">Statut</span>
        <Chip label="Tous" active={filter.t === "all"} onClick={() => setFilter({ t: "all" })} />
        {stages.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            active={filter.t === "stage" && filter.id === s.id}
            onClick={() =>
              setFilter(filter.t === "stage" && filter.id === s.id ? { t: "all" } : { t: "stage", id: s.id })
            }
          />
        ))}
      </div>

      {/* Recherche + regroupement */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (nom, société, groupe, contact…)"
          className="w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 sm:max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-navy/70">
          <input
            type="checkbox"
            checked={groupBy}
            onChange={(e) => setGroupBy(e.target.checked)}
            className="h-4 w-4 rounded border-navy/30 text-navy focus:ring-cyan"
          />
          Grouper par groupe
        </label>
        <span className="text-sm text-navy/50 sm:ml-auto">{filtered.length} prospect(s)</span>
      </div>

      {/* Barre d'actions sélection */}
      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-cyan/40 bg-cyan/10 px-4 py-2.5">
          <span className="text-sm font-medium text-navy">{selected.size} sélectionné(s)</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAssignOpen((v) => !v)}
              className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700"
            >
              Ajouter au groupe ▾
            </button>
            {assignOpen && (
              <div className="absolute left-0 z-10 mt-1 w-56 rounded-lg border border-navy/10 bg-white p-1.5 shadow-lg">
                {groups.length === 0 && (
                  <p className="px-2.5 py-1.5 text-xs text-navy/50">Aucun groupe. Créez-en un.</p>
                )}
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => assignTo(g.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-navy/80 hover:bg-navy/[0.06]"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${groupColor(g.color).swatch}`} />
                    {g.name}
                  </button>
                ))}
                <div className="my-1 border-t border-navy/10" />
                <button
                  type="button"
                  onClick={() => assignTo(null)}
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-navy/60 hover:bg-navy/[0.06]"
                >
                  Retirer du groupe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignOpen(false);
                    onManageGroups();
                  }}
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-cyan-600 hover:bg-navy/[0.06]"
                >
                  + Nouveau groupe…
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-navy/50 hover:text-navy"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Tableau */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-navy/10 bg-white shadow-sm">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="border-b border-navy/10 bg-navy/[0.02] text-xs uppercase tracking-wide text-navy/50">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-navy/30 text-navy focus:ring-cyan"
                  aria-label="Tout sélectionner"
                />
              </th>
              <Th label="Prospect" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
              <Th label="Statut" active={sortKey === "stage"} dir={sortDir} onClick={() => toggleSort("stage")} />
              <Th label="Prochain rappel" active={sortKey === "reminder"} dir={sortDir} onClick={() => toggleSort("reminder")} />
            </tr>
          </thead>

          {grouped ? (
            grouped.map(({ group, items }) => {
              const color = groupColor(group?.color ?? null);
              return (
                <tbody key={group?.id ?? "__none__"} className="divide-y divide-navy/5">
                  <tr className={`border-y ${color.border} ${color.band}`}>
                    <td colSpan={4} className="px-4 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                        <span className={`text-sm font-semibold ${color.text}`}>
                          {group?.name ?? "Sans groupe"}
                        </span>
                        <span className="text-xs text-navy/40">{items.length} société(s)</span>
                      </span>
                    </td>
                  </tr>
                  {items.map((r) => (
                    <Row
                      key={r.id}
                      row={r}
                      checked={selected.has(r.id)}
                      onToggle={() => toggleOne(r.id)}
                      onOpen={onOpen}
                    />
                  ))}
                </tbody>
              );
            })
          ) : (
            <tbody className="divide-y divide-navy/5">
              {filtered.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  checked={selected.has(r.id)}
                  onToggle={() => toggleOne(r.id)}
                  onOpen={onOpen}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-navy/40">
                    Aucun prospect ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

function Row({
  row,
  checked,
  onToggle,
  onOpen,
}: {
  row: ProspectRow;
  checked: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const status = reminderStatus(row.reminderAt, row.reminderDone);
  return (
    <tr className="transition-colors hover:bg-cyan/5">
      <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-navy/30 text-navy focus:ring-cyan"
          aria-label={`Sélectionner ${row.name}`}
        />
      </td>
      <td className="cursor-pointer px-4 py-2.5" onClick={() => onOpen(row.id)}>
        <div className="font-medium text-navy">{row.name}</div>
        {(row.company || row.contact) && (
          <div className="text-xs text-navy/55">
            {[row.company, row.contact].filter(Boolean).join(" · ")}
          </div>
        )}
      </td>
      <td className="cursor-pointer px-4 py-2.5" onClick={() => onOpen(row.id)}>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${temperatureBadgeClass(
            row.stageKind
          )}`}
        >
          {row.stageName}
        </span>
      </td>
      <td className="cursor-pointer px-4 py-2.5" onClick={() => onOpen(row.id)}>
        {row.reminderAt ? (
          <span className="inline-flex items-center gap-2 text-sm text-navy/80">
            <span className={`h-2 w-2 rounded-full ${reminderDotClass(status)}`} />
            <span className={status === "done" ? "text-navy/40 line-through" : ""}>
              {formatDateFR(row.reminderAt)}
            </span>
          </span>
        ) : (
          <span className="text-sm text-navy/30">—</span>
        )}
      </td>
    </tr>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-navy text-white" : "bg-white text-navy/60 ring-1 ring-navy/10 hover:bg-navy/[0.06]"
      }`}
    >
      {label}
    </button>
  );
}

function Th({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-navy ${active ? "text-navy" : ""}`}
      >
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function compare(a: ProspectRow, b: ProspectRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "fr");
    case "stage":
      return a.stageName.localeCompare(b.stageName, "fr");
    case "reminder": {
      const ta = a.reminderAt ? new Date(a.reminderAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.reminderAt ? new Date(b.reminderAt).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    }
  }
}
