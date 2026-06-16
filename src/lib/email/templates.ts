// Gabarits d'e-mails (HTML) — PURS et partagés client ↔ serveur.
// Aucun secret ici : la prévisualisation (client) et l'envoi (server action) utilisent
// EXACTEMENT le même rendu. Styles INLINE (les clients mail ignorent <style>/classes).
// Charte Lynova : navy #0a1733, cyan accent #6fd6f2 / cyan-600 #0b7c9e.

export const PRESENTATION_CC = "meganne@leaya.fr";
export const MEETING_NOTIFY_TO = "support@lynova.net";
export const RDV_SYNTHESIS_CC = "support@lynova.net";

const LINKEDIN_URL = "https://www.linkedin.com/in/romain-ioli/";

export interface ProspectContact {
  company: string | null;
  genre: string | null;
  nom: string | null;
  prenom: string | null;
  email?: string | null;
}

/** Échappe le HTML des valeurs dynamiques (anti-injection / markup cassé). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Salutation : « Bonjour {Genre} {Nom}, ». Replis :
 * - nom vide → utilise le prénom ; genre vide → on l'omet ;
 * - nom ET prénom vides → « Bonjour, ».
 */
export function salutation(p: Pick<ProspectContact, "genre" | "nom" | "prenom">): string {
  const who = p.nom?.trim() || p.prenom?.trim() || "";
  if (!who) return "Bonjour,";
  const genre = p.genre?.trim();
  return genre ? `Bonjour ${genre} ${who},` : `Bonjour ${who},`;
}

/** Durée en libellé court : 30→« 30 min », 90→« 1 h 30 », 120→« 2 h ». */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} min`;
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Date « yyyy-mm-dd » → « 12 juin 2026 » (fr-FR). */
export function frDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Signature HTML sobre (charte Lynova), liens cliquables mailto:/https://. */
export const SIGNATURE_HTML = `
<div style="margin-top:20px;padding-top:12px;border-top:2px solid #6fd6f2;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#0a1733;">
  <div style="font-weight:bold;font-size:15px;color:#0a1733;">Romain IOLI</div>
  <div style="color:#43506b;">Dirigeant · <span style="color:#0b7c9e;font-weight:bold;letter-spacing:0.5px;">LYNOVA</span></div>
  <div style="margin-top:8px;color:#43506b;">
    +33&nbsp;(0)6&nbsp;47&nbsp;53&nbsp;27&nbsp;62&nbsp;&nbsp;|&nbsp;&nbsp;<a href="mailto:romain@lynova.net" style="color:#0b7c9e;text-decoration:none;">romain@lynova.net</a>
  </div>
  <div style="color:#43506b;">
    <a href="https://www.lynova.net" style="color:#0b7c9e;text-decoration:none;">www.lynova.net</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="${LINKEDIN_URL}" style="color:#0b7c9e;text-decoration:none;">LinkedIn</a>
  </div>
  <div style="margin-top:8px;color:#8893a8;font-size:12px;">1 rue de Dion, 78490 Montfort-l'Amaury</div>
</div>`.trim();

function wrap(inner: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:640px;">${inner}</div>`;
}

function p(html: string): string {
  return `<p style="margin:0 0 14px;">${html}</p>`;
}

/** Liste à puces stylée inline (clients mail). `items` = HTML déjà construit (statique, non échappé). */
function ul(items: string[]): string {
  return `<ul style="margin:0 0 14px;padding-left:20px;">${items
    .map((i) => `<li style="margin:0 0 8px;">${i}</li>`)
    .join("")}</ul>`;
}

// ───────────────────────── E-mail de présentation (E) ─────────────────────────

export interface PresentationEmail {
  subject: string;
  html: string;
}

export function presentationEmail(prospect: Pick<ProspectContact, "genre" | "nom" | "prenom">): PresentationEmail {
  const body =
    p(escapeHtml(salutation(prospect))) +
    p("Je suis Romain IOLI, de la société Lynova.") +
    p(
      "Nous sommes spécialisés dans l'analyse de données pour le secteur des fruits et légumes, et accompagnons aujourd'hui des grossistes, importateurs et producteurs partout en France. Nous ne remplaçons pas votre logiciel de gestion, nous intervenons en complément."
    ) +
    p(
      "Notre solution, leader sur le marché, s'adapte précisément aux besoins de nos clients. Elle leur permet d'accroître leurs parts de marché tout en gagnant un confort de travail significatif, grâce à une automatisation complète de leurs analyses et de leurs process."
    ) +
    p(
      "Nous comptons parmi nos 80+ clients, plusieurs des plus belles structures françaises du secteur. C'est pourquoi je serais ravi de pouvoir vous présenter concrètement ce que nous faisons à travers une démonstration."
    ) +
    p(
      'Vous pouvez également consulter notre site internet pour plus d\'informations : <a href="https://www.lynova.net" style="color:#0b7c9e;">www.lynova.net</a>'
    ) +
    p("Auriez-vous une disponibilité prochainement afin que nous puissions organiser une présentation ?") +
    p("Merci d'avance pour votre retour.") +
    p("Bonne journée,") +
    SIGNATURE_HTML;

  return { subject: "Présentation de Lynova à votre demande", html: wrap(body) };
}

// ───────────────────────── E-mail de synthèse RDV (C) ─────────────────────────
// Récapitulatif envoyé au prospect APRÈS la démonstration (DIRIGEANT only). Même gabarit/structure
// que la présentation, même signature Romain. La présentation PDF est jointe à l'envoi (server action).

export function rdvSynthesisEmail(prospect: Pick<ProspectContact, "genre" | "nom" | "prenom" | "company">): PresentationEmail {
  const company = prospect.company?.trim();
  const subject = company ? `Lynova x ${company} : Suite à notre rendez-vous` : "Lynova : Suite à notre rendez-vous";
  const body =
    p(escapeHtml(salutation(prospect))) +
    p("Merci pour votre temps, c'était un vrai plaisir d'échanger avec vous.") +
    p(
      'Comme convenu, je vous joins toute la présentation concernant la société. Voici notre site internet : <a href="https://www.lynova.net" style="color:#0b7c9e;">www.lynova.net</a>'
    ) +
    p(
      "1. Vous trouverez le récapitulatif de la valeur ajoutée de chaque module présenté et les captures d'écran de notre outil en pièce jointe."
    ) +
    p("2. Récapitulatif des prix :") +
    ul([
      "<strong>Développement sur mesure (frais fixes)</strong> : 2 000 € HT / module (chaque module = une page d'analyses personnalisée incluant développement, automatisation et mise à jour des données).",
      "<strong>Frais d'utilisation mensuels</strong> : accès plateforme + maintenance 405 € HT / mois (1 actualisation quotidienne).",
      "<strong>Comptes utilisateurs</strong> : Dirigeant 45 € HT / mois / compte (accès complet) · Employé 30 € HT / mois / compte (accès restreint).",
    ]) +
    p(
      "Depuis bientôt 6 ans, Lynova accompagne ses clients avec des résultats concrets : meilleure rentabilité, croissance du CA, réduction du risque crédit/client, gestion simplifiée. +80 clients actifs, aucun départ depuis la création. Service sans engagement, outil rentabilisé dans la grande majorité des cas en moins de 4 mois."
    ) +
    p(
      "Références clients joignables pour un retour d'expérience : Schneider, Paris Select, G Rungis, Lomme Primeurs, Tombarel, Goostar France, Vinas, Neta, Capexo, Laparra, Agruban, Mouneyrac, SMB, Paris Herbes, France Food, JH…"
    ) +
    p(
      "Livraison de votre outil sous 10 jours à compter de l'accès aux données — nous nous occupons de tout (contact prestataire données, processus complet jusqu'à la livraison)."
    ) +
    p("Excellente fin de journée, et je reste à votre disposition.") +
    SIGNATURE_HTML;

  return { subject, html: wrap(body) };
}

// ───────────────────────── Notification RDV → support (F) ─────────────────────────

export interface MeetingNotificationArgs {
  company: string | null;
  genre: string | null;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  dateISO: string; // yyyy-mm-dd
  time: string; // HH:MM
  durationMinutes: number;
  mode: "visio" | "physique";
  address?: string | null;
  joinUrl?: string | null;
}

export interface MeetingNotification {
  subject: string;
  html: string;
}

export function meetingNotificationEmail(a: MeetingNotificationArgs): MeetingNotification {
  const societe = a.company?.trim() || "Société à renseigner";
  const formatLabel = a.mode === "visio" ? "Visio (Teams)" : "Présentiel";
  const contactParts = [a.genre?.trim(), a.nom?.trim(), a.prenom?.trim()].filter(Boolean).join(" ");
  const contactStr = [contactParts, a.email?.trim()].filter(Boolean).join(" — ") || "—";

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#8893a8;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:4px 0;color:#0a1733;">${value}</td></tr>`;

  const formatValue =
    a.mode === "visio"
      ? "Visio (Teams)"
      : `Présentiel — ${escapeHtml(a.address?.trim() || "adresse non précisée")}`;

  let table =
    row("Société", `<strong>${escapeHtml(societe)}</strong>`) +
    row("Contact", escapeHtml(contactStr)) +
    row("Date", `${escapeHtml(frDate(a.dateISO))} à ${escapeHtml(a.time)} (${escapeHtml(durationLabel(a.durationMinutes))})`) +
    row("Format", formatValue);

  if (a.mode === "visio" && a.joinUrl) {
    table += row("Lien Teams", `<a href="${escapeHtml(a.joinUrl)}" style="color:#0b7c9e;">Rejoindre la réunion</a>`);
  }

  const body =
    p("Un nouveau rendez-vous vient d'être créé :") +
    `<table style="border-collapse:collapse;font-size:14px;margin:0 0 14px;">${table}</table>` +
    SIGNATURE_HTML;

  return {
    subject: `Nouveau RDV — ${societe} — ${frDate(a.dateISO)} — ${formatLabel}`,
    html: wrap(body),
  };
}
