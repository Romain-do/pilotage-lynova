"use client";

import { useState } from "react";
import { useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  formatDateFR,
  reminderStatus,
  type ProspectDTO,
  type StageDTO,
} from "@/lib/prospection";
import { createProspect } from "./actions";

export function PipelineView({
  stages,
  onOpen,
  onAdd,
  onMove,
}: {
  stages: StageDTO[];
  onOpen: (id: string) => void;
  onAdd: (dto: ProspectDTO) => void;
  onMove: (prospectId: string, toStageId: string, beforeId: string | null) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeProspect = activeId
    ? stages.flatMap((s) => s.prospects).find((p) => p.id === activeId) ?? null
    : null;

  function stageOf(prospectId: string): string | undefined {
    return stages.find((s) => s.prospects.some((p) => p.id === prospectId))?.id;
  }

  function handleDragStart(e: DragStartEvent) {
    const id = parseCardId(e.active.id);
    if (id) setActiveId(id);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const pid = parseCardId(active.id);
    if (!pid) return;

    const overId = String(over.id);
    let toStageId: string | undefined;
    let beforeId: string | null = null;

    if (overId.startsWith("col:")) toStageId = overId.slice(4);
    else if (overId.startsWith("card:")) {
      beforeId = overId.slice(5);
      toStageId = stageOf(beforeId);
    }
    if (!toStageId || beforeId === pid) return;
    onMove(pid, toStageId, beforeId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-x-auto px-4 pb-8 sm:px-6">
        <div className="flex min-h-full gap-4">
          {stages.map((stage) => (
            <Column key={stage.id} stage={stage} onOpen={onOpen} onAdd={onAdd} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeProspect ? <CardContent prospect={activeProspect} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  onOpen,
  onAdd,
}: {
  stage: StageDTO;
  onOpen: (id: string) => void;
  onAdd: (dto: ProspectDTO) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage.id}` });

  return (
    <section className="flex w-72 flex-none flex-col rounded-xl bg-navy/[0.04]">
      <header className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy">{stage.name}</span>
          <span className="rounded-full bg-navy/10 px-1.5 text-xs text-navy/60">
            {stage.prospects.length}
          </span>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 px-2 pb-2 transition-colors ${
          isOver ? "rounded-lg bg-cyan/10" : ""
        }`}
      >
        {stage.prospects.map((p) => (
          <Card key={p.id} prospect={p} onOpen={onOpen} />
        ))}
      </div>

      <AddCard stageId={stage.id} onAdd={onAdd} />
    </section>
  );
}

function Card({ prospect, onOpen }: { prospect: ProspectDTO; onOpen: (id: string) => void }) {
  const drag = useDraggable({ id: `card:${prospect.id}` });
  const drop = useDroppable({ id: `card:${prospect.id}` });

  const setRefs = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  const style = {
    transform: CSS.Translate.toString(drag.transform),
    opacity: drag.isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setRefs}
      style={style}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => onOpen(prospect.id)}
      className="cursor-grab rounded-lg border border-navy/10 bg-white p-3 shadow-sm hover:border-cyan/60 active:cursor-grabbing"
    >
      <CardContent prospect={prospect} />
    </div>
  );
}

function CardContent({ prospect, dragging }: { prospect: ProspectDTO; dragging?: boolean }) {
  const status = reminderStatus(prospect.reminderAt, prospect.reminderDone);

  return (
    <div className={dragging ? "w-64 rounded-lg border border-cyan bg-white p-3 shadow-lg" : ""}>
      <p className="text-sm font-medium text-navy">{prospect.name}</p>
      {prospect.company && <p className="text-xs text-navy/55">{prospect.company}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {prospect.reminderAt && <ReminderBadge status={status} iso={prospect.reminderAt} />}
        {prospect.comments.length > 0 && (
          <span className="text-xs text-navy/40">💬 {prospect.comments.length}</span>
        )}
      </div>
    </div>
  );
}

function ReminderBadge({ status, iso }: { status: string; iso: string }) {
  const label = formatDateFR(iso);
  const cls =
    status === "overdue"
      ? "bg-red-100 text-red-700"
      : status === "soon"
        ? "bg-amber-100 text-amber-700"
        : status === "done"
          ? "bg-emerald-50 text-emerald-600 line-through"
          : "bg-navy/[0.06] text-navy/60";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>⏰ {label}</span>;
}

function AddCard({ stageId, onAdd }: { stageId: string; onAdd: (dto: ProspectDTO) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const name = value.trim();
    if (!name) return;
    const fd = new FormData();
    fd.set("stageId", stageId);
    fd.set("name", name);
    start(async () => {
      const dto = await createProspect(fd);
      if (dto) onAdd(dto);
      setValue("");
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 mt-0 rounded-lg px-2 py-1.5 text-left text-sm text-navy/50 hover:bg-navy/[0.06] hover:text-navy/80"
      >
        + Ajouter un prospect
      </button>
    );
  }

  return (
    <div className="m-2 mt-0">
      <textarea
        autoFocus
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Nom du prospect…"
        disabled={pending}
        className="w-full resize-none rounded-lg border border-navy/15 bg-white px-2.5 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "…" : "Ajouter"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-navy/50 hover:text-navy"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function parseCardId(id: string | number): string | null {
  const s = String(id);
  return s.startsWith("card:") ? s.slice(5) : null;
}
