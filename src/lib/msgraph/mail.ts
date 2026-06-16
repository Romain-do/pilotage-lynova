// Envoi d'e-mail via Microsoft Graph (POST /me/sendMail). SERVER-ONLY.
// Le mail part du compte connecté (romain@lynova.net). Permission Mail.Send déléguée.

import { GRAPH_API_BASE } from "./config";
import { getAccessToken } from "./auth";
import { GraphError } from "./graph";

/** Pièce jointe « inline » (fileAttachment) — contenu encodé en base64. Le message total doit
 *  rester < 4 Mo (limite Graph sendMail) ; au-delà, il faudrait une upload session. */
export interface MailAttachment {
  name: string;
  contentType: string;
  /** Contenu du fichier encodé en base64. */
  contentBytes: string;
}

export interface SendMailInput {
  subject: string;
  /** Corps HTML. */
  html: string;
  to: string[];
  cc?: string[];
  attachments?: MailAttachment[];
}

/**
 * Envoie un e-mail HTML et l'enregistre dans « Éléments envoyés ».
 * Lève une GraphError en cas d'échec (statut HTTP conservé pour le mapping d'erreur).
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const accessToken = await getAccessToken();

  const toRecipients = input.to.map((address) => ({ emailAddress: { address } }));
  const ccRecipients = (input.cc ?? []).map((address) => ({ emailAddress: { address } }));
  const attachments = (input.attachments ?? []).map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.name,
    contentType: a.contentType,
    contentBytes: a.contentBytes,
  }));

  const res = await fetch(`${GRAPH_API_BASE}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.html },
        toRecipients,
        ccRecipients,
        ...(attachments.length ? { attachments } : {}),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  // 202 Accepted (corps vide) en cas de succès.
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new GraphError(payload?.error?.message ?? `HTTP ${res.status}`, res.status);
  }
}
