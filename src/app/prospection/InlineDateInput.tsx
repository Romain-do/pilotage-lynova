"use client";

// Saisie de date INLINE robuste (listes de prospection).
//
// BUG corrigé : un `<input type="date">` CONTRÔLÉ (`value=…`) referme le calendrier natif
// dès que le composant parent se re-render pendant que le picker est ouvert — y compris
// en cliquant sur les flèches « mois précédent / suivant ». En effet React réassigne
// alors la propriété `.value` du DOM, ce que Chrome interprète comme un changement
// programmatique et ferme le calendrier. Or nos listes se re-render en permanence
// (mise à jour optimiste des rappels, recherche, filtres…).
//
// CORRECTIF : input NON CONTRÔLÉ (`defaultValue`). React ne touche plus jamais `.value`
// pendant l'édition → le calendrier reste ouvert (changement de mois fluide, un seul clic).
// La valeur enregistrée est reflétée par `key` : quand elle change côté serveur, l'input
// est remonté proprement ; pendant l'édition (avant sélection) elle ne change pas, donc
// aucun remontage intempestif.
//
// Fermeture UNIQUEMENT sur sélection (onChange → server action) ou Échap (blur). JAMAIS
// au onBlur brut.

export function InlineDateInput({
  value,
  onSelect,
  className = "",
  title,
  ariaLabel,
}: {
  /** Valeur enregistrée au format `yyyy-mm-dd`, ou "" si aucune. */
  value: string;
  /** Appelé à la SÉLECTION d'une date (déclenche la sauvegarde). null = champ vidé. */
  onSelect: (date: string | null) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      // Remonte l'input quand la valeur change côté serveur (jamais pendant l'édition).
      key={value}
      type="date"
      // NON contrôlé : empêche la réassignation de `.value` qui ferme le calendrier.
      defaultValue={value}
      // Évite d'ouvrir le tiroir/fiche au clic sur la date.
      onClick={(e) => e.stopPropagation()}
      // Échap referme le calendrier (blur) sans rien fermer d'autre.
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      // Sauvegarde à la sélection d'une date.
      onChange={(e) => onSelect(e.target.value || null)}
      title={title}
      aria-label={ariaLabel}
      className={className}
    />
  );
}
