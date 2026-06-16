"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, requireDirigeant } from "@/lib/auth";
import { isMsGraphConnected } from "@/lib/msgraph/auth";
import { sendMail } from "@/lib/msgraph/mail";
import { GraphError } from "@/lib/msgraph/graph";
import { presentationEmail, PRESENTATION_CC, rdvSynthesisEmail, RDV_SYNTHESIS_CC } from "@/lib/email/templates";

// Envoi de l'e-mail de présentation (E). Tout utilisateur authentifié — part du compte
// Microsoft partagé (signature « Romain IOLI » inchangée). Joignable en POST direct →
// re-vérifie l'authentification côté serveur (requireUser).

export interface MailActionState {
  ok: boolean;
  message: string;
}

/** Envoie la présentation au prospect (CC meganne@leaya.fr). Contenu reconstruit en base. */
export async function sendPresentationEmail(prospectId: string): Promise<MailActionState> {
  await requireUser();

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

  try {
    await sendMail({ subject, html, to: [to], cc: [PRESENTATION_CC] });
    return { ok: true, message: `Présentation envoyée à ${to} (CC ${PRESENTATION_CC}).` };
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
    const bytes = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { contentBytes: bytes };
  } catch (e) {
    console.error("[msgraph] fetchPresentationPdf:", e instanceof Error ? e.message : e);
    return { error: "Impossible de récupérer la présentation PDF." };
  }
}

/** Envoie la synthèse RDV au prospect (CC support@lynova.net) avec la présentation PDF jointe. */
export async function sendRdvSynthesisEmail(prospectId: string): Promise<MailActionState> {
  await requireDirigeant();

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

  // ⚠️ SÉCURITÉ TEST : par défaut l'envoi est REDIRIGÉ vers romain@lynova.net (jamais un vrai
  // prospect). Pour activer l'envoi réel en production, poser la variable d'env RDV_SYNTHESIS_LIVE=true.
  const live = process.env.RDV_SYNTHESIS_LIVE === "true";
  const recipient = live ? to : "romain@lynova.net";

  const { subject, html } = rdvSynthesisEmail(prospect);

  try {
    await sendMail({
      subject,
      html,
      to: [recipient],
      cc: [RDV_SYNTHESIS_CC],
      attachments: [{ name: PDF_ATTACHMENT_NAME, contentType: "application/pdf", contentBytes: pdf.contentBytes }],
    });
    const mode = live ? "" : ` · MODE TEST (destinataire réel « ${to} » ignoré)`;
    return { ok: true, message: `Synthèse RDV envoyée à ${recipient} (CC ${RDV_SYNTHESIS_CC})${mode}.` };
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
