"use server";

import { prisma } from "@/lib/prisma";
import type { ContactType } from "@prisma/client";
import { requireUser, requireDirigeant } from "@/lib/auth";
import { isMsGraphConnected } from "@/lib/msgraph/auth";
import { sendMail } from "@/lib/msgraph/mail";
import { GraphError } from "@/lib/msgraph/graph";
import { presentationEmail, PRESENTATION_CC, rdvSynthesisEmail, RDV_SYNTHESIS_CC } from "@/lib/email/templates";
import { emailsLive, TEST_RECIPIENT, testModeMessage } from "@/lib/email/delivery";
import { logContact } from "@/lib/contact-log";

// Envoi de l'e-mail de présentation (E). Tout utilisateur authentifié — part du compte
// Microsoft partagé (signature « Romain IOLI » inchangée). Joignable en POST direct →
// re-vérifie l'authentification côté serveur (requireUser).

export interface MailActionState {
  ok: boolean;
  message: string;
}

/** Envoie la présentation au prospect (CC meganne@leaya.fr en live). Contenu reconstruit en base.
 *  Mode test (EMAILS_LIVE ≠ true) : redirigé vers romain, sans CC. Trace l'envoi (ContactLog). */
export async function sendPresentationEmail(prospectId: string): Promise<MailActionState> {
  const user = await requireUser();

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { genre: true, nom: true, prenom: true, email: true },
  });
  if (!prospect) return { ok: false, message: "Prospect introuvable." };

  const to = prospect.email?.trim();
  if (!to) return { ok: false, message: "Aucun e-mail renseigné pour ce prospect." };

  if (!(await isMsGraphConnected())) {
    return { ok: false, message: "Outlook n'est pas connecté (voir /admin)." };
  }

  const { subject, html } = presentationEmail(prospect);
  const live = emailsLive();
  const recipient = live ? to : TEST_RECIPIENT;

  try {
    await sendMail({ subject, html, to: [recipient], cc: live ? [PRESENTATION_CC] : [] });
    await logContact({ prospectId, type: "PRESENTATION", recipient, live, sentById: user.id, sentByName: user.name });
    return {
      ok: true,
      message: live ? `Présentation envoyée à ${to} (CC ${PRESENTATION_CC}).` : testModeMessage(to),
    };
  } catch (e) {
    if (e instanceof GraphError) {
      console.error("[msgraph] sendPresentationEmail:", e.status, e.message);
      return {
        ok: false,
        message:
          e.status === 401 || e.status === 403
            ? "Accès Microsoft refusé. Reconnectez le compte dans /admin."
            : `Microsoft a refusé l'envoi : ${e.message}`,
      };
    }
    console.error("[msgraph] sendPresentationEmail:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Échec de l'envoi. Réessayez." };
  }
}

// ───────────────────────── Synthèse RDV (C) — DIRIGEANT only ─────────────────────────
// Récapitulatif post-démo envoyé au prospect, avec la présentation PDF en pièce jointe. Réservé au
// DIRIGEANT (garde serveur requireDirigeant, en plus de la condition UI). Joignable en POST direct.

const PDF_PUBLIC_PATH = "/presentation-lynova.pdf";
const PDF_ATTACHMENT_NAME = "presentation-lynova.pdf";

/** Récupère la présentation PDF (public/ non garanti en serverless → fetch de l'URL publique) et
 *  l'encode en base64 pour une pièce jointe Graph « inline ». */
async function fetchPresentationPdfBase64(): Promise<{ contentBytes: string } | { error: string }> {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (!base) return { error: "NEXT_PUBLIC_SITE_URL non configuré (URL du PDF)." };
  try {
    const res = await fetch(`${base}${PDF_PUBLIC_PATH}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { error: `Présentation PDF introuvable (HTTP ${res.status}).` };
    const buf = Buffer.from(await res.arrayBuffer());
    // Garde anti-corruption : on n'attache QUE si c'est réellement un PDF (magic bytes « %PDF »).
    // Sinon (ex. middleware → page /login HTML), on échoue clairement au lieu de joindre du HTML.
    if (buf.subarray(0, 4).toString("latin1") !== "%PDF") {
      const ct = res.headers.get("content-type") ?? "inconnu";
      console.error(`[msgraph] fetchPresentationPdf: réponse non-PDF (content-type: ${ct}, ${buf.length} o)`);
      return { error: "Le fichier récupéré n'est pas un PDF (réponse inattendue). Vérifiez l'accès public au PDF." };
    }
    return { contentBytes: buf.toString("base64") };
  } catch (e) {
    console.error("[msgraph] fetchPresentationPdf:", e instanceof Error ? e.message : e);
    return { error: "Impossible de récupérer la présentation PDF." };
  }
}

/** Envoie la synthèse RDV au prospect (CC support@lynova.net en live) avec la présentation PDF
 *  jointe. Mode test : redirigé vers romain, sans CC. Trace l'envoi (ContactLog). */
export async function sendRdvSynthesisEmail(prospectId: string): Promise<MailActionState> {
  const user = await requireDirigeant();

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { genre: true, nom: true, prenom: true, email: true, company: true },
  });
  if (!prospect) return { ok: false, message: "Prospect introuvable." };

  const to = prospect.email?.trim();
  if (!to) return { ok: false, message: "Aucun e-mail renseigné pour ce prospect." };

  if (!(await isMsGraphConnected())) {
    return { ok: false, message: "Outlook n'est pas connecté (voir /admin)." };
  }

  const pdf = await fetchPresentationPdfBase64();
  if ("error" in pdf) return { ok: false, message: pdf.error };

  const live = emailsLive();
  const recipient = live ? to : TEST_RECIPIENT;

  const { subject, html } = rdvSynthesisEmail(prospect);

  try {
    await sendMail({
      subject,
      html,
      to: [recipient],
      cc: live ? [RDV_SYNTHESIS_CC] : [],
      attachments: [{ name: PDF_ATTACHMENT_NAME, contentType: "application/pdf", contentBytes: pdf.contentBytes }],
    });
    await logContact({ prospectId, type: "RDV_SYNTHESIS", recipient, live, sentById: user.id, sentByName: user.name });
    if (live) {
      const who = prospect.company?.trim() || to;
      return { ok: true, message: `Synthèse RDV envoyée à ${who} (CC ${RDV_SYNTHESIS_CC}).` };
    }
    return { ok: true, message: testModeMessage(to) };
  } catch (e) {
    if (e instanceof GraphError) {
      console.error("[msgraph] sendRdvSynthesisEmail:", e.status, e.message);
      return {
        ok: false,
        message:
          e.status === 401 || e.status === 403
            ? "Accès Microsoft refusé. Reconnectez le compte dans /admin."
            : `Microsoft a refusé l'envoi : ${e.message}`,
      };
    }
    console.error("[msgraph] sendRdvSynthesisEmail:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Échec de l'envoi. Réessayez." };
  }
}

// ───────────────────────── Anti-double-envoi : dernier envoi par type ─────────────────────────

export interface ProspectContactLog {
  /** ISO du dernier envoi de chaque type pour ce prospect (ou null). */
  presentation: string | null;
  rdvSynthesis: string | null;
  meeting: string | null;
}

/** Dernier envoi (sentAt) par type pour un prospect — alimente la mention « Dernier envoi le … »
 *  et la confirmation avant renvoi dans la fiche. Tout utilisateur authentifié. */
export async function getProspectContactLog(prospectId: string): Promise<ProspectContactLog> {
  await requireUser();
  const rows = await prisma.contactLog.findMany({
    where: { prospectId },
    orderBy: { sentAt: "desc" },
    select: { type: true, sentAt: true },
  });
  const last = (t: ContactType) => rows.find((r) => r.type === t)?.sentAt.toISOString() ?? null;
  return {
    presentation: last("PRESENTATION"),
    rdvSynthesis: last("RDV_SYNTHESIS"),
    meeting: last("MEETING"),
  };
}
