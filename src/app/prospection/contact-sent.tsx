"use client";

// Briques partagées de l'anti-doublon (présentation / synthèse RDV / RDV Outlook) : format de la
// date du dernier envoi, ligne « Dernier envoi : le … », et confirmation inline avant un renvoi.

/** ISO → « 12 juin 2026 à 14:30 » (fr-FR, côté client). */
export function formatSentAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
}

/** Mention discrète sous un bouton d'envoi : rien si jamais envoyé. */
export function LastSent({ iso }: { iso: string | null }) {
  if (!iso) return null;
  return (
    <p className="mt-2 text-xs text-navy/50" suppressHydrationWarning>
      Dernier envoi : le {formatSentAt(iso)}
    </p>
  );
}

/** Garde-fou (pas de blocage dur) : demande confirmation avant un renvoi du même type. */
export function ResendConfirm({
  iso,
  onConfirm,
  onCancel,
  pending,
}: {
  iso: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm text-amber-800" suppressHydrationWarning>
        Déjà envoyé le {formatSentAt(iso)}. Renvoyer ?
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Envoi…" : "Confirmer le renvoi"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy/5 disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
