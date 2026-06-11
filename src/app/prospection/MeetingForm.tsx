"use client";

import { useState, useTransition } from "react";
import type { ProspectDTO } from "@/lib/prospection";
import { createMeeting, type MeetingActionState } from "./meeting-actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputCls =
  "mt-1 w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40";
const labelCls = "text-xs font-medium uppercase tracking-wide text-navy/50";

/** Objet auto « Lynova x {société} : Démonstration ». */
function defaultSubject(prospect: ProspectDTO): string {
  return `Lynova x ${prospect.company || prospect.name} : Démonstration`;
}

export function MeetingForm({ prospect }: { prospect: ProspectDTO }) {
  const [open, setOpen] = useState(false);

  const [subject, setSubject] = useState(defaultSubject(prospect));
  const [prospectEmail, setProspectEmail] = useState(prospect.email ?? "");
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [extraDraft, setExtraDraft] = useState("");
  const [mode, setMode] = useState<"visio" | "physique">("visio");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);

  const [result, setResult] = useState<MeetingActionState | null>(null);
  const [pending, start] = useTransition();

  function addExtra() {
    const email = extraDraft.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setResult({ ok: false, message: `E-mail invalide : ${email}` });
      return;
    }
    if (email === prospectEmail.trim().toLowerCase() || extraEmails.includes(email)) {
      setExtraDraft("");
      return;
    }
    setExtraEmails((prev) => [...prev, email]);
    setExtraDraft("");
    setResult(null);
  }

  function submit() {
    setResult(null);
    start(async () => {
      const state = await createMeeting({
        subject,
        prospectEmail,
        additionalEmails: extraEmails,
        mode,
        address,
        date,
        time,
        durationMinutes: duration,
      });
      setResult(state);
    });
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-navy/10 bg-white p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan/20 px-4 py-2 text-sm font-medium text-navy hover:bg-cyan/30"
        >
          📅 Inviter à un RDV
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-cyan/40 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">Inviter à un RDV</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-navy/40 hover:text-navy"
          aria-label="Replier"
        >
          ✕
        </button>
      </div>

      {/* Objet */}
      <div>
        <label className={labelCls}>Objet</label>
        <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      {/* E-mail prospect */}
      <div>
        <label className={labelCls}>E-mail du prospect</label>
        <input
          className={inputCls}
          type="email"
          value={prospectEmail}
          onChange={(e) => setProspectEmail(e.target.value)}
          placeholder="prenom@societe.fr"
        />
      </div>

      {/* Destinataires additionnels */}
      <div>
        <label className={labelCls}>Destinataires additionnels</label>
        {extraEmails.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {extraEmails.map((email) => (
              <li
                key={email}
                className="inline-flex items-center gap-1 rounded-full bg-navy/[0.06] px-2 py-0.5 text-xs text-navy/80"
              >
                {email}
                <button
                  type="button"
                  onClick={() => setExtraEmails((prev) => prev.filter((x) => x !== email))}
                  className="text-navy/40 hover:text-red-600"
                  aria-label={`Retirer ${email}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex gap-2">
          <input
            className={`${inputCls} mt-0`}
            type="email"
            value={extraDraft}
            onChange={(e) => setExtraDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExtra();
              }
            }}
            placeholder="ajouter un e-mail puis Entrée"
          />
          <button
            type="button"
            onClick={addExtra}
            className="shrink-0 rounded-lg border border-navy/15 px-3 text-sm font-medium text-navy hover:bg-navy/5"
          >
            Ajouter
          </button>
        </div>
      </div>

      {/* Mode visio / physique */}
      <div>
        <label className={labelCls}>Format</label>
        <div className="mt-1 flex gap-2">
          {(["visio", "physique"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                mode === m
                  ? "border-cyan bg-cyan/15 text-navy"
                  : "border-navy/15 text-navy/60 hover:bg-navy/5"
              }`}
            >
              {m === "visio" ? "Visio (Teams)" : "Physique"}
            </button>
          ))}
        </div>
      </div>

      {mode === "physique" && (
        <div>
          <label className={labelCls}>Adresse</label>
          <input
            className={inputCls}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="12 rue… , ville"
          />
        </div>
      )}

      {/* Date / heure / durée */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Date</label>
          <input
            className={inputCls}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Heure</label>
          <input
            className={inputCls}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Durée</label>
          <select
            className={inputCls}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 h</option>
            <option value={90}>1 h 30</option>
            <option value={120}>2 h</option>
          </select>
        </div>
      </div>

      {/* Résultat */}
      {result && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          <p>{result.message}</p>
          {result.ok && result.joinUrl && (
            <a
              href={result.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-medium underline"
            >
              Lien Teams
            </a>
          )}
          {result.ok && result.webLink && (
            <a
              href={result.webLink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 ml-3 inline-block font-medium underline"
            >
              Ouvrir dans Outlook
            </a>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !date || !prospectEmail}
        className="w-full rounded-lg bg-navy px-4 py-2 font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Envoi de l'invitation…" : "Envoyer l'invitation"}
      </button>
    </div>
  );
}
