"use client";

import { useState, useTransition } from "react";
import {
  isoToDateInput,
  formatDateFR,
  prospectTitle,
  type ProspectDTO,
  type CurrentUserDTO,
  type GroupDTO,
} from "@/lib/prospection";
import { updateProspect, addComment, archiveProspect } from "./actions";
import { MeetingForm } from "./MeetingForm";

export function ProspectDrawer({
  prospect,
  currentUser,
  groups,
  onClose,
  onUpdated,
  onArchived,
}: {
  prospect: ProspectDTO;
  currentUser: CurrentUserDTO;
  groups: GroupDTO[];
  onClose: () => void;
  onUpdated: (dto: ProspectDTO) => void;
  onArchived: (id: string) => void;
}) {
  const [company, setCompany] = useState(prospect.company ?? "");
  const [name, setName] = useState(prospect.name ?? ""); // contact (personne), optionnel
  const [groupId, setGroupId] = useState(prospect.groupId ?? "");
  const [phone, setPhone] = useState(prospect.phone ?? "");
  const [email, setEmail] = useState(prospect.email ?? "");
  const [reminderAt, setReminderAt] = useState(isoToDateInput(prospect.reminderAt));
  const [reminderDone, setReminderDone] = useState(prospect.reminderDone);
  const [notes, setNotes] = useState(prospect.notes ?? "");

  const [comment, setComment] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [commenting, startComment] = useTransition();
  const [archiving, startArchive] = useTransition();

  function save() {
    const fd = new FormData();
    fd.set("id", prospect.id);
    fd.set("company", company);
    fd.set("name", name);
    fd.set("groupId", groupId);
    fd.set("phone", phone);
    fd.set("email", email);
    fd.set("reminderAt", reminderAt);
    if (reminderDone) fd.set("reminderDone", "on");
    fd.set("notes", notes);
    startSave(async () => {
      const dto = await updateProspect(fd);
      if (dto) {
        onUpdated(dto);
        setSavedMsg("Enregistré ✓");
        setTimeout(() => setSavedMsg(null), 2000);
      }
    });
  }

  function postComment() {
    const body = comment.trim();
    if (!body) return;
    startComment(async () => {
      const dto = await addComment(prospect.id, body);
      if (dto) {
        onUpdated({ ...prospect, comments: [...prospect.comments, dto] });
        setComment("");
      }
    });
  }

  function archive() {
    if (!confirm(`Archiver « ${prospectTitle(prospect)} » ? (réversible, aucune suppression définitive)`)) return;
    startArchive(async () => {
      await archiveProspect(prospect.id);
      onArchived(prospect.id);
    });
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} aria-hidden />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-cloud shadow-xl">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-navy/10 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-navy">Fiche prospect</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-navy/50 hover:bg-navy/5 hover:text-navy"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-5">
          {/* Identité — société = titre (requis), contact = personne (optionnel) */}
          <div className="space-y-3 rounded-xl border border-navy/10 bg-white p-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-navy/50">Société *</label>
              <input
                className={inputCls}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Nom de la société (titre de la carte)"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-navy/50">Contact</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Personne à contacter (optionnel)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-navy/50">Téléphone</label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-navy/50">E-mail</label>
                <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-navy/50">
                Groupe
              </label>
              <select
                className={inputCls}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rappel */}
          <div className="space-y-3 rounded-xl border border-navy/10 bg-white p-4">
            <label className="text-xs font-medium uppercase tracking-wide text-navy/50">
              Date de rappel
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                className={`${inputCls} mt-0`}
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
              />
              {reminderAt && (
                <button
                  type="button"
                  onClick={() => setReminderAt("")}
                  className="text-sm text-navy/50 hover:text-navy"
                >
                  Effacer
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-navy/80">
              <input
                type="checkbox"
                checked={reminderDone}
                onChange={(e) => setReminderDone(e.target.checked)}
                className="h-4 w-4 rounded border-navy/30 text-navy focus:ring-cyan"
              />
              Relance faite
            </label>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-navy/10 bg-white p-4">
            <label className="text-xs font-medium uppercase tracking-wide text-navy/50">Notes</label>
            <textarea
              rows={3}
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Bouton enregistrer */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !company.trim()}
              className="rounded-lg bg-navy px-4 py-2 font-medium text-white hover:bg-navy-700 disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {!company.trim() && <span className="text-sm text-navy/50">La société est requise.</span>}
            {savedMsg && <span className="text-sm text-emerald-600">{savedMsg}</span>}
          </div>

          {/* RDV Outlook/Teams — DIRIGEANT seul (l'action serveur re-vérifie le rôle, §3) */}
          {currentUser.role === "DIRIGEANT" && <MeetingForm prospect={prospect} />}

          {/* Commentaires */}
          <div className="rounded-xl border border-navy/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-navy">Commentaires</h3>
            <div className="mt-3 space-y-3">
              {prospect.comments.length === 0 && (
                <p className="text-sm text-navy/40">Aucun commentaire pour l&apos;instant.</p>
              )}
              {prospect.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-navy/[0.03] px-3 py-2">
                  <div className="flex items-center justify-between text-xs text-navy/50">
                    <span className="font-medium text-navy/70">{c.authorName ?? "—"}</span>
                    <span>{formatDateFR(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-navy/80">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    postComment();
                  }
                }}
                placeholder={`Commenter en tant que ${currentUser.name ?? "moi"}…`}
                className={inputCls}
              />
              <button
                type="button"
                onClick={postComment}
                disabled={commenting}
                className="mt-2 rounded-lg border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy/5 disabled:opacity-60"
              >
                {commenting ? "Envoi…" : "Ajouter (⌘/Ctrl + Entrée)"}
              </button>
            </div>
          </div>

          {/* Archivage */}
          <div className="pt-2">
            <button
              type="button"
              onClick={archive}
              disabled={archiving}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              {archiving ? "Archivage…" : "Archiver ce prospect"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
