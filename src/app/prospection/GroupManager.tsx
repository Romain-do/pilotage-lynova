"use client";

import { useState, useTransition } from "react";
import { GROUP_COLOR_KEYS, groupColor, type GroupDTO } from "@/lib/prospection";

export function GroupManager({
  groups,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  groups: GroupDTO[];
  onClose: () => void;
  onCreate: (name: string, color: string | null) => Promise<GroupDTO | null>;
  onUpdate: (id: string, name: string, color: string | null) => Promise<GroupDTO | null>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-navy/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-navy">Gérer les groupes</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-navy/50 hover:bg-navy/5 hover:text-navy"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <CreateForm onCreate={onCreate} />

          <div className="mt-5 space-y-2">
            {groups.length === 0 && (
              <p className="text-sm text-navy/40">Aucun groupe pour l&apos;instant.</p>
            )}
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Swatches({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {GROUP_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-label={key}
          className={`h-5 w-5 rounded-full ${groupColor(key).swatch} ${
            value === key ? "ring-2 ring-navy ring-offset-1" : ""
          }`}
        />
      ))}
    </div>
  );
}

function CreateForm({
  onCreate,
}: {
  onCreate: (name: string, color: string | null) => Promise<GroupDTO | null>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(GROUP_COLOR_KEYS[0]);
  const [pending, start] = useTransition();

  function submit() {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      const g = await onCreate(n, color);
      if (g) setName("");
    });
  }

  return (
    <div className="rounded-xl border border-navy/10 bg-cloud p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-navy/50">Nouveau groupe</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Nom du groupe"
          className="flex-1 rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
        />
        <Swatches value={color} onChange={setColor} />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

function GroupRow({
  group,
  onUpdate,
  onDelete,
}: {
  group: GroupDTO;
  onUpdate: (id: string, name: string, color: string | null) => Promise<GroupDTO | null>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState<string | null>(group.color);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const dirty = name.trim() !== group.name || color !== group.color;

  function save() {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      await onUpdate(group.id, n, color);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }
  function remove() {
    if (!confirm(`Supprimer le groupe « ${group.name} » ? Les prospects seront conservés (sans groupe).`))
      return;
    start(() => {
      void onDelete(group.id);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-navy/10 p-3 sm:flex-row sm:items-center">
      <span className={`h-3 w-3 flex-none rounded-full ${groupColor(color).swatch}`} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-lg border border-navy/15 bg-white px-3 py-1.5 text-sm text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
      />
      <Swatches value={color} onChange={setColor} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md border border-navy/15 px-2.5 py-1.5 text-sm font-medium text-navy hover:bg-navy/5 disabled:opacity-40"
        >
          {saved ? "✓" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-md px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          aria-label="Supprimer"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
