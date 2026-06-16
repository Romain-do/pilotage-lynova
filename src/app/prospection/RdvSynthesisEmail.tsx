"use client";

import { useState, useTransition } from "react";
import type { ProspectDTO } from "@/lib/prospection";
import { rdvSynthesisEmail, RDV_SYNTHESIS_CC } from "@/lib/email/templates";
import { sendRdvSynthesisEmail, type MailActionState } from "./mail-actions";

// Bouton « Envoyer la synthèse RDV » (DIRIGEANT only — rendu conditionnel dans ProspectDrawer +
// garde serveur requireDirigeant). Aperçu (objet + corps + mention PJ) puis envoi, avec la
// présentation PDF jointe. L'aperçu utilise le MÊME gabarit pur que l'envoi serveur.
export function RdvSynthesisEmail({ prospect }: { prospect: ProspectDTO }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<MailActionState | null>(null);
  const [pending, start] = useTransition();

  const { subject, html } = rdvSynthesisEmail(prospect);
  const to = prospect.email?.trim() ?? "";

  function send() {
    setResult(null);
    start(async () => setResult(await sendRdvSynthesisEmail(prospect.id)));
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-navy/10 bg-white p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan/20 px-4 py-2 text-sm font-medium text-navy hover:bg-cyan/30"
        >
          📄 Envoyer la synthèse RDV
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-cyan/40 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">Aperçu — synthèse RDV</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-navy/40 hover:text-navy"
          aria-label="Replier"
        >
          ✕
        </button>
      </div>

      {/* En-têtes */}
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-navy/50">À</dt>
          <dd className="text-navy">{to || <span className="text-red-600">aucun e-mail renseigné</span>}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-navy/50">CC</dt>
          <dd className="text-navy">{RDV_SYNTHESIS_CC}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-navy/50">Objet</dt>
          <dd className="font-medium text-navy">{subject}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-navy/50">PJ</dt>
          <dd className="text-navy">📎 presentation-lynova.pdf <span className="text-navy/50">(≈ 2,5 Mo)</span></dd>
        </div>
      </dl>

      {/* Corps rendu */}
      <div className="max-h-80 overflow-y-auto rounded-lg border border-navy/10 bg-cloud/40 p-3">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {result && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={pending || !to}
        className="w-full rounded-lg bg-navy px-4 py-2 font-medium text-white hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Envoyer la synthèse RDV"}
      </button>
    </div>
  );
}
