"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  ProspectDTO,
  StageDTO,
  ProspectRow,
  CurrentUserDTO,
  GroupDTO,
} from "@/lib/prospection";
import {
  moveProspect,
  toggleReminderDone,
  setReminder,
  createGroup,
  updateGroup,
  deleteGroup,
  assignGroup,
  deleteProspect,
} from "./actions";
import { RefreshButton } from "@/components/RefreshButton";
import { ProspectDrawer } from "./ProspectDrawer";
import { ListView } from "./ListView";
import { AgendaView } from "./AgendaView";
import { PipelineView } from "./PipelineView";
import { GroupManager } from "./GroupManager";

type View = "list" | "agenda" | "pipeline";

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "list", label: "Liste", icon: "▤" },
  { key: "agenda", label: "Agenda", icon: "◔" },
  { key: "pipeline", label: "Pipeline", icon: "▦" },
];

export interface StageLite {
  id: string;
  name: string;
  kind: string | null;
}

export function Prospection({
  pipelineName,
  currentUser,
  initialGroups,
  initialStages,
  initialSelectedId = null,
  lastSync = null,
}: {
  pipelineName: string;
  currentUser: CurrentUserDTO;
  initialGroups: GroupDTO[];
  initialStages: StageDTO[];
  initialSelectedId?: string | null;
  lastSync?: string | null;
}) {
  const [stages, setStages] = useState<StageDTO[]>(initialStages);
  const [groups, setGroups] = useState<GroupDTO[]>(initialGroups);
  const [view, setView] = useState<View>("list");
  // Deep-link depuis le Cockpit (/prospection?prospect=<id>) : ouvre la fiche directement.
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [managerOpen, setManagerOpen] = useState(false);
  const [, startTx] = useTransition();

  const allProspects = useMemo(() => stages.flatMap((s) => s.prospects), [stages]);

  const rows = useMemo<ProspectRow[]>(
    () =>
      stages.flatMap((s) =>
        s.prospects.map((p) => ({ ...p, stageName: s.name, stageKind: s.kind }))
      ),
    [stages]
  );

  const stageList = useMemo<StageLite[]>(
    () => stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    [stages]
  );

  const selected = selectedId ? allProspects.find((p) => p.id === selectedId) ?? null : null;

  // ── Mutations prospects ──

  function handleAdd(dto: ProspectDTO) {
    setStages((prev) =>
      prev.map((s) => (s.id === dto.stageId ? { ...s, prospects: [...s.prospects, dto] } : s))
    );
  }
  function handleUpdated(dto: ProspectDTO) {
    setStages((prev) =>
      prev.map((s) => ({ ...s, prospects: s.prospects.map((p) => (p.id === dto.id ? dto : p)) }))
    );
  }
  function handleArchived(id: string) {
    setStages((prev) => prev.map((s) => ({ ...s, prospects: s.prospects.filter((p) => p.id !== id) })));
    setSelectedId(null);
  }
  function handleMove(prospectId: string, toStageId: string, beforeId: string | null) {
    setStages((prev) => moveLocally(prev, prospectId, toStageId, beforeId));
    startTx(() => void moveProspect(prospectId, toStageId, beforeId));
  }
  function handleMarkDone(id: string, done: boolean) {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        prospects: s.prospects.map((p) => (p.id === id ? { ...p, reminderDone: done } : p)),
      }))
    );
    startTx(async () => {
      const dto = await toggleReminderDone(id, done);
      if (dto) handleUpdated(dto);
    });
  }
  function handleReschedule(id: string, dateISO: string | null) {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        prospects: s.prospects.map((p) =>
          p.id === id ? { ...p, reminderAt: dateISO, reminderDone: false } : p
        ),
      }))
    );
    startTx(async () => {
      const dto = await setReminder(id, dateISO);
      if (dto) handleUpdated(dto);
    });
  }

  function handleChangeStage(id: string, toStageId: string) {
    handleMove(id, toStageId, null);
  }
  function handleDeleteProspect(id: string) {
    setStages((prev) => prev.map((s) => ({ ...s, prospects: s.prospects.filter((p) => p.id !== id) })));
    if (selectedId === id) setSelectedId(null);
    startTx(() => void deleteProspect(id));
  }

  // ── Mutations groupes ──

  async function handleAssignGroup(ids: string[], groupId: string | null) {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        prospects: s.prospects.map((p) => (ids.includes(p.id) ? { ...p, groupId } : p)),
      }))
    );
    await assignGroup(ids, groupId);
  }
  async function handleCreateGroup(name: string, color: string | null) {
    const g = await createGroup(name, color);
    if (g) setGroups((prev) => [...prev, g].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    return g;
  }
  async function handleUpdateGroup(id: string, name: string, color: string | null) {
    const g = await updateGroup(id, name, color);
    if (g)
      setGroups((prev) =>
        prev.map((x) => (x.id === id ? g : x)).sort((a, b) => a.name.localeCompare(b.name, "fr"))
      );
    return g;
  }
  async function handleDeleteGroup(id: string) {
    await deleteGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        prospects: s.prospects.map((p) => (p.groupId === id ? { ...p, groupId: null } : p)),
      }))
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-navy sm:text-2xl">{pipelineName}</h1>
            <p className="text-sm text-navy/55">{allProspects.length} prospect(s)</p>
          </div>
          <div className="flex items-center gap-2">
            {currentUser.role === "DIRIGEANT" && (
              <RefreshButton variant="generic" initialLastSync={lastSync} />
            )}
            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              className="rounded-lg border border-navy/15 bg-white px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy/5"
            >
              Gérer les groupes
            </button>
            <div className="inline-flex rounded-lg border border-navy/10 bg-white p-1 shadow-sm">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === v.key
                      ? "bg-navy text-white"
                      : "text-navy/60 hover:bg-navy/[0.06] hover:text-navy"
                  }`}
                >
                  <span className="mr-1.5" aria-hidden>
                    {v.icon}
                  </span>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {view === "list" && (
        <ListView
          rows={rows}
          stages={stageList}
          groups={groups}
          currentUser={currentUser}
          onOpen={setSelectedId}
          onAssignGroup={handleAssignGroup}
          onManageGroups={() => setManagerOpen(true)}
          onChangeStage={handleChangeStage}
          onSetReminder={handleReschedule}
          onDeleteProspect={handleDeleteProspect}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          rows={rows}
          groups={groups}
          onOpen={setSelectedId}
          onMarkDone={handleMarkDone}
          onReschedule={handleReschedule}
        />
      )}
      {view === "pipeline" && (
        <PipelineView stages={stages} onOpen={setSelectedId} onAdd={handleAdd} onMove={handleMove} />
      )}

      {selected && (
        <ProspectDrawer
          key={selected.id}
          prospect={selected}
          currentUser={currentUser}
          groups={groups}
          onClose={() => setSelectedId(null)}
          onUpdated={handleUpdated}
          onArchived={handleArchived}
        />
      )}

      {managerOpen && (
        <GroupManager
          groups={groups}
          onClose={() => setManagerOpen(false)}
          onCreate={handleCreateGroup}
          onUpdate={handleUpdateGroup}
          onDelete={handleDeleteGroup}
        />
      )}
    </>
  );
}

function moveLocally(
  stages: StageDTO[],
  prospectId: string,
  toStageId: string,
  beforeId: string | null
): StageDTO[] {
  let moving: ProspectDTO | undefined;
  const without = stages.map((s) => {
    const idx = s.prospects.findIndex((p) => p.id === prospectId);
    if (idx === -1) return s;
    moving = s.prospects[idx];
    return { ...s, prospects: s.prospects.filter((p) => p.id !== prospectId) };
  });
  if (!moving) return stages;
  const card: ProspectDTO = { ...moving, stageId: toStageId };
  return without.map((s) => {
    if (s.id !== toStageId) return s;
    const list = [...s.prospects];
    const at = beforeId ? list.findIndex((p) => p.id === beforeId) : -1;
    if (at === -1) list.push(card);
    else list.splice(at, 0, card);
    return { ...s, prospects: list };
  });
}
