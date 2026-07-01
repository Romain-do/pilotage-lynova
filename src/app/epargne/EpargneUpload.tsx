"use client";

import { useActionState, useRef } from "react";
import { IconUpload, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import { importEpargneCsv, type ImportResult } from "./actions";

// UI d'import CSV Revolut. Reçoit un export, l'envoie à l'action serveur, affiche le résumé.
// Charte alignée sur le Cockpit (carte rounded-card/shadow-card, tokens ink/line).

export function EpargneUpload() {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importEpargneCsv, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-sm font-semibold text-ink">Importer un export CSV Revolut</h2>
      <p className="mt-0.5 text-xs text-ink-3">
        Export « Relevé de compte » au format CSV. Les deux comptes (courant joint et épargne) sont
        séparés automatiquement. Un réimport ne crée pas de doublons.
      </p>

      <form
        ref={formRef}
        action={action}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-navy-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex flex-none items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600/90 disabled:opacity-50"
        >
          <IconUpload size={16} stroke={2} />
          {pending ? "Import en cours…" : "Importer"}
        </button>
      </form>

      {result && <ImportSummary result={result} />}
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  if (result.error) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
        <IconAlertTriangle size={18} stroke={2} className="mt-0.5 flex-none" />
        <span>{result.error}</span>
      </div>
    );
  }

  const b = result.breakdown;
  return (
    <div className="mt-4 rounded-card border border-line bg-cloud p-4 text-sm text-ink">
      <div className="flex items-center gap-2 font-medium text-ink">
        <IconCheck size={18} stroke={2} className="flex-none text-emerald-700" />
        Import terminé
      </div>
      <ul className="mt-2 space-y-1">
        <li>
          <strong>{result.imported}</strong> transaction{result.imported > 1 ? "s" : ""} importée
          {result.imported > 1 ? "s" : ""}
        </li>
        <li>
          <strong>{result.duplicates}</strong> doublon{result.duplicates > 1 ? "s" : ""} ignoré
          {result.duplicates > 1 ? "s" : ""}
        </li>
        <li>
          <strong>{result.excluded}</strong> ligne{result.excluded > 1 ? "s" : ""} exclue
          {result.excluded > 1 ? "s" : ""}
          {result.excluded > 0 && (
            <span className="text-ink-3">
              {" "}
              (renvoyées : {b.reverted} · devise ≠ EUR : {b.otherCurrency} · produit inconnu :{" "}
              {b.unknownProduct} · illisibles : {b.malformed})
            </span>
          )}
        </li>
      </ul>
      {result.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-amber-700">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <IconAlertTriangle size={15} stroke={2} className="mt-0.5 flex-none" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
