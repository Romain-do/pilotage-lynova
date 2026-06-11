"use server";

import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { isMsGraphConnected } from "@/lib/msgraph/auth";
import { sendMail } from "@/lib/msgraph/mail";
import { GraphError } from "@/lib/msgraph/graph";
import { presentationEmail, PRESENTATION_CC } from "@/lib/email/templates";

// Envoi de l'e-mail de présentation (E). DIRIGEANT seul — part du compte connecté
// (romain@lynova.net). Joignable en POST direct → re-vérifie l'autorisation côté serveur.

export interface MailActionState {
  ok: boolean;
  message: string;
}

/** Envoie la présentation au prospect (CC meganne@leaya.fr). Contenu reconstruit en base. */
export async function sendPresentationEmail(prospectId: string): Promise<MailActionState> {
  await requireDirigeant();

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
