"use client";

import { useMemo, useState } from "react";
import {
  IconUsers,
  IconFlame,
  IconCalendarEvent,
  IconTool,
  IconBan,
  IconTrophy,
  IconPhone,
  IconChevronDown,
  IconArchive,
} from "@tabler/icons-react";
import {
  formatDateFR,
  isoToDateInput,
  reminderStatus,
  reminderDotClass,
  temperatureBadgeClass,
  temperatureDotClass,
  categoryOf,
  groupColor,
  prospectTitle,
  prospectContactLabel,
  type KpiCategory,
  type ProspectRow,
  type GroupDTO,
  type CurrentUserDTO,
} from "@/lib/prospection";
import type { StageLite } from "./Prospection";
import { InlineDateInput } from "./InlineDateInput";

type SortKey = "name" | "stage" | "reminder";
type SortDir = "asc" | "desc";
type Filter = { t: "all" } | { t: "kpi"; key: string } | { t: "stage"; id: string };

const KPI_DEFS: {
  key: string;
  label: string;
  cats: KpiCategory[];
  Icon: typeof IconUsers;
  tint: string;
}[] = [
  { key: "clients", label: "Clients actuels", cats: ["a_installer", "installes"], Icon: IconUsers, tint: "bg-emerald-50 text-emerald-600" },
  { key: "rencontres", label: "Prospects rencontrés", cats: ["rencontres"], Icon: IconFlame, tint: "bg-amber-50 text-amber-600" },
  { key: "a_rencontrer", label: "À rencontrer", cats: ["a_rencontrer"], Icon: IconCalendarEvent, tint: "bg-cyan/15 text-cyan-600" },
  { key: "a_installer", label: "À installer", cats: ["a_installer"], Icon: IconTool, tint: "bg-sky-50 text-sky-600" },
  { key: "refus", label: "Refus", cats: ["refus"], Icon: IconBan, tint: "bg-red-50 text-red-600" },
];

// Statuts masqués de la liste de travail par défaut (réapparaissent via leur filtre/recherche).
const HIDDEN_CATS = new Set<KpiCategory>(["a_installer", "installes", "refus"]);

export function ListView({
  rows,
  stages,
  groups,
  currentUser,
  onOpen,
  onAssignGroup,
  onManageGroups,
  onChangeStage,
  onSetReminder,
  onDeleteProspect,
}: {
  rows: ProspectRow[];
  stages: StageLite[];
  groups: GroupDTO[];
  currentUser: CurrentUserDTO;
  onOpen: (id: string) => void;
  onAssignGroup: (ids: string[], groupId: string | null) => void;
  onManageGroups: () => void;
  onChangeStage: (id: string, toStageId: string) => void;
  onSetReminder: (id: string, dateISO: string | null) => void;
  onDeleteProspect: (id: string) => void;
}) {
  const isDirigeant = currentUser.role === "DIRIGEANT";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ t: "all" });
  const [groupBy, setGroupBy] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("reminder");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

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
  const tauxReussite =
    clientsActuels + counts.refus > 0
      ? Math.round((clientsActuels / (clientsActuels + counts.refus)) * 100)
      : 0;
  const kpiValue = (cats: KpiCategory[]) => cats.reduce((s, c) => s + counts[c], 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searchActive = q.length > 0;

    const revealsCat = (cat: KpiCategory): boolean => {
      if (searchActive) return true;
      if (filter.t === "kpi") {
        const def = KPI_DEFS.find((k) => k.key === filter.key);
        return def ? def.cats.includes(cat) : false;
      }
      if (filter.t === "stage") {
        const st = stages.find((s) => s.id === filter.id);
        return st ? categoryOf(st.kind) === cat : false;
      }
      return false;
    };

    let list = rows;
    if (filter.t === "kpi") {
      const def = KPI_DEFS.find((k) => k.key === filter.key);
      if (def)
        list = list.filter((r) => {
          const cat = categoryOf(r.stageKind);
          return cat !== null && def.cats.includes(cat);
        });
    } else if (filter.t === "stage") {
      list = list.filter((r) => r.stageId === filter.id);
    }
    if (q) {
      list = list.filter((r) =>
        [r.name, r.company, r.contact, r.phone, r.email, groupsById.get(r.groupId ?? "")?.name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      );
    }
    // Masque les statuts non-actifs sauf si explicitement demandés.
    list = list.filter((r) => {
      const cat = categoryOf(r.stageKind);
      return !(cat && HIDDEN_CATS.has(cat) && !revealsCat(cat));
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => dir * compare(a, b, sortKey));
  }, [rows, query, filter, sortKey, sortDir, groupsById, stages]);

  const recontact = useMemo(
    () =>
      rows
        .filter((r) => {
          if (!r.reminderAt || r.reminderDone) return false;
          const cat = categoryOf(r.stageKind);
          // Seulement les statuts actifs (À rencontrer, Chaud, Tiède, Froid).
          return cat !== null && !HIDDEN_CATS.has(cat);
        })
        .sort((a, b) => new Date(a.reminderAt!).getTime() - new Date(b.reminderAt!).getTime()),
    [rows]
  );

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, ProspectRow[]>();
    for (const r of filtered) {
      const k = r.groupId ?? "";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return [...map.entries()]
      .map(([gid, items]) => ({ group: gid ? groupsById.get(gid) ?? null : null, items }))
      .sort((a, b) => {
        if (!a.group) return 1;
        if (!b.group) return -1;
        return a.group.name.localeCompare(b.group.name, "fr");
      });
  }, [filtered, groupBy, groupsById]);

  const colCount = isDirigeant ? 5 : 4;

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
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6">
      {/* KPI — bande connectée */}
      <div className="overflow-hidden rounded-2xl border border-navy/10 shadow-sm">
        <div className="grid grid-cols-2 gap-px bg-navy/10 sm:grid-cols-3 lg:grid-cols-6">
          {KPI_DEFS.map((k) => {
            const active = filter.t === "kpi" && filter.key === k.key;
            const value = k.key === "clients" ? clientsActuels : kpiValue(k.cats);
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setFilter(active ? { t: "all" } : { t: "kpi", key: k.key })}
                className={`flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  active ? "bg-cyan/10" : "bg-white hover:bg-navy/[0.03]"
                }`}
              >
                <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${k.tint}`}>
                  <k.Icon size={18} stroke={2} />
                </span>
                <span className="min-w-0">
                  <div className="text-xl font-semibold leading-none text-navy">{value}</div>
                  <div className="mt-1 truncate text-xs font-medium text-navy/55">{k.label}</div>
                </span>
              </button>
            );
          })}
          <div className="flex items-center gap-3 bg-navy px-4 py-3.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/10 text-cyan">
              <IconTrophy size={18} stroke={2} />
            </span>
            <span className="min-w-0">
              <div className="text-xl font-semibold leading-none text-cyan">{tauxReussite}%</div>
              <div className="mt-1 truncate text-xs font-medium text-white/70">Taux de réussite</div>
            </span>
          </div>
        </div>
      </div>

      {/* Filtre par statut */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-navy/40">Statut</span>
        <Chip label="Tous" active={filter.t === "all"} onClick={() => setFilter({ t: "all" })} />
        {stages.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            dot={temperatureDotClass(s.kind)}
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
          placeholder="Rechercher (tous statuts, Refus compris)…"
          className="w-full rounded-lg border border-navy/15 bg-white px-3.5 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 sm:max-w-sm"
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
        <span className="text-sm text-navy/50 sm:ml-auto">{filtered.length} affiché(s)</span>
      </div>

      {/* Barre sélection */}
      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-cyan/40 bg-cyan/10 px-4 py-2.5">
          <span className="text-sm font-medium text-navy">{selected.size} sélectionné(s)</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAssignOpen((v) => !v)}
              className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700"
            >
              Ajouter au groupe ▾
            </button>
            {assignOpen && (
              <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-navy/10 bg-white p-1.5 shadow-lg">
                {groups.length === 0 && <p className="px-2.5 py-1.5 text-xs text-navy/50">Aucun groupe.</p>}
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
                <button type="button" onClick={() => assignTo(null)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-navy/60 hover:bg-navy/[0.06]">
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
          <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-navy/50 hover:text-navy">
            Annuler
          </button>
        </div>
      )}

      {/* Deux colonnes */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* À recontacter */}
        <aside className="rounded-2xl border border-navy/10 bg-white p-3 shadow-sm">
          <header className="px-1 pb-2">
            <h2 className="text-sm font-semibold text-navy">À recontacter</h2>
            <p className="text-xs text-navy/50">{recontact.length} relance(s) à traiter</p>
          </header>
          <div className="space-y-2">
            {recontact.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-navy/40">Aucune relance en attente.</p>
            )}
            {recontact.map((r) => {
              const status = reminderStatus(r.reminderAt, false);
              return (
                <div key={r.id} className="rounded-xl border border-navy/10 bg-cloud/60 p-2.5 transition-colors hover:border-cyan/50">
                  <button type="button" onClick={() => onOpen(r.id)} className="block w-full text-left">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-none rounded-full ${reminderDotClass(status)}`} />
                      <span className="truncate text-sm font-medium text-navy">{prospectTitle(r)}</span>
                    </div>
                    <ContactLine row={r} className="mt-1 pl-4" />
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
                    <InlineDateInput
                      value={isoToDateInput(r.reminderAt)}
                      onSelect={(date) => onSetReminder(r.id, date)}
                      ariaLabel={`Modifier le rappel de ${prospectTitle(r)}`}
                      className="rounded-md border border-navy/15 bg-white px-2 py-1 text-xs text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
                    />
                    <StatusBadgeMenu row={r} stages={stages} onChange={(sid) => onChangeStage(r.id, sid)} />
                    {isDirigeant && <DeleteBtn name={prospectTitle(r)} onDelete={() => onDeleteProspect(r.id)} />}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Liste principale */}
        <div className="overflow-x-auto rounded-2xl border border-navy/10 bg-white shadow-sm">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-navy/10 bg-navy/[0.02] text-xs uppercase tracking-wide text-navy/45">
                <th className="w-10 px-3 py-3">
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
                {isDirigeant && <th className="w-12 px-3 py-3" />}
              </tr>
            </thead>

            {grouped ? (
              grouped.map(({ group, items }) => {
                const color = groupColor(group?.color ?? null);
                return (
                  <tbody key={group?.id ?? "__none__"} className="divide-y divide-navy/[0.06]">
                    <tr className={`border-y ${color.border} ${color.band}`}>
                      <td colSpan={colCount} className="px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                          <span className={`text-sm font-semibold ${color.text}`}>{group?.name ?? "Sans groupe"}</span>
                          <span className="text-xs text-navy/40">{items.length} société(s)</span>
                        </span>
                      </td>
                    </tr>
                    {items.map((r) => (
                      <Row key={r.id} row={r} stages={stages} isDirigeant={isDirigeant} checked={selected.has(r.id)} onToggle={() => toggleOne(r.id)} onOpen={onOpen} onChangeStage={onChangeStage} onSetReminder={onSetReminder} onDeleteProspect={onDeleteProspect} />
                    ))}
                  </tbody>
                );
              })
            ) : (
              <tbody className="divide-y divide-navy/[0.06]">
                {filtered.map((r) => (
                  <Row key={r.id} row={r} stages={stages} isDirigeant={isDirigeant} checked={selected.has(r.id)} onToggle={() => toggleOne(r.id)} onOpen={onOpen} onChangeStage={onChangeStage} onSetReminder={onSetReminder} onDeleteProspect={onDeleteProspect} />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-navy/40">
                      Aucun prospect ne correspond.
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  stages,
  isDirigeant,
  checked,
  onToggle,
  onOpen,
  onChangeStage,
  onSetReminder,
  onDeleteProspect,
}: {
  row: ProspectRow;
  stages: StageLite[];
  isDirigeant: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onChangeStage: (id: string, toStageId: string) => void;
  onSetReminder: (id: string, dateISO: string | null) => void;
  onDeleteProspect: (id: string) => void;
}) {
  const status = reminderStatus(row.reminderAt, row.reminderDone);
  return (
    <tr className="transition-colors hover:bg-cyan/[0.04]">
      <td className="w-10 px-3 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-navy/30 text-navy focus:ring-cyan"
          aria-label={`Sélectionner ${prospectTitle(row)}`}
        />
      </td>
      <td className="cursor-pointer px-4 py-3" onClick={() => onOpen(row.id)}>
        <div className="font-medium text-navy">{prospectTitle(row)}</div>
        <ContactLine row={row} className="mt-0.5" />
      </td>
      <td className="px-4 py-3">
        <StatusBadgeMenu row={row} stages={stages} onChange={(sid) => onChangeStage(row.id, sid)} />
      </td>
      <td className="px-4 py-3">
        {row.reminderAt ? (
          <button
            type="button"
            onClick={() => onOpen(row.id)}
            className="inline-flex items-center gap-2 text-sm text-navy/80 hover:text-navy"
          >
            <span className={`h-2 w-2 rounded-full ${reminderDotClass(status)}`} />
            <span className={status === "done" ? "text-navy/40 line-through" : ""}>{formatDateFR(row.reminderAt)}</span>
          </button>
        ) : (
          <InlineDateInput
            value=""
            onSelect={(date) => date && onSetReminder(row.id, date)}
            title="Planifier un rappel"
            ariaLabel={`Planifier un rappel pour ${prospectTitle(row)}`}
            className="rounded-md border border-navy/15 bg-white px-2 py-1 text-xs text-navy/50 focus:border-cyan focus:text-navy focus:outline-none focus:ring-2 focus:ring-cyan/40"
          />
        )}
      </td>
      {isDirigeant && (
        <td className="w-12 px-3 py-3 text-right">
          <DeleteBtn name={prospectTitle(row)} onDelete={() => onDeleteProspect(row.id)} />
        </td>
      )}
    </tr>
  );
}

function ContactLine({ row, className = "" }: { row: ProspectRow; className?: string }) {
  const contact = prospectContactLabel(row); // contact (name), ou « Contact à renseigner »
  const isPlaceholder = contact !== "" && !row.name?.trim();
  if (!contact && !row.phone) return null;
  return (
    <div className={`flex items-center gap-2 text-xs text-navy/50 ${className}`}>
      {contact && (
        <span className={`truncate ${isPlaceholder ? "italic text-navy/35" : ""}`}>{contact}</span>
      )}
      {row.phone && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <IconPhone size={12} stroke={2} className="text-navy/35" />
          {row.phone}
        </span>
      )}
    </div>
  );
}

function StatusBadgeMenu({
  row,
  stages,
  onChange,
}: {
  row: ProspectRow;
  stages: StageLite[];
  onChange: (toStageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${temperatureBadgeClass(
          row.stageKind
        )}`}
      >
        {row.stageName}
        <IconChevronDown size={13} className="opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-44 rounded-xl border border-navy/10 bg-white p-1 shadow-lg">
            {stages.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id !== row.stageId) onChange(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-navy/[0.05]"
              >
                <span className={`h-2 w-2 flex-none rounded-full ${temperatureDotClass(s.kind)}`} />
                <span className={s.id === row.stageId ? "font-semibold text-navy" : "text-navy/70"}>{s.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DeleteBtn({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (
          confirm(
            `Archiver « ${name} » ?\nIl sera retiré de la liste mais conservé en base (réversible).`
          )
        )
          onDelete();
      }}
      className="rounded-lg p-1.5 text-navy/30 transition-colors hover:bg-amber-50 hover:text-amber-600"
      aria-label={`Archiver ${name}`}
      title="Archiver (retiré de la liste, conservé en base)"
    >
      <IconArchive size={16} stroke={2} />
    </button>
  );
}

function Chip({
  label,
  active,
  dot,
  onClick,
}: {
  label: string;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-navy text-white" : "bg-white text-navy/60 ring-1 ring-navy/10 hover:bg-navy/[0.06]"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-cyan" : dot}`} />}
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
    <th className="px-4 py-3 font-medium">
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-navy ${active ? "text-navy" : ""}`}>
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function compare(a: ProspectRow, b: ProspectRow, key: SortKey): number {
  switch (key) {
    case "name":
      return prospectTitle(a).localeCompare(prospectTitle(b), "fr");
    case "stage":
      return a.stageName.localeCompare(b.stageName, "fr");
    case "reminder": {
      const ta = a.reminderAt ? new Date(a.reminderAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.reminderAt ? new Date(b.reminderAt).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    }
  }
}
