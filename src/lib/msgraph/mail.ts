// Envoi d'e-mail via Microsoft Graph (POST /me/sendMail). SERVER-ONLY.
// Le mail part du compte connecté (romain@lynova.net). Permission Mail.Send déléguée.

import { GRAPH_API_BASE } from "./config";
import { getAccessToken } from "./auth";
import { GraphError } from "./graph";

export interface SendMailInput {
  subject: string;
  /** Corps HTML. */
  html: string;
  to: string[];
  cc?: string[];
}

/**
 * Envoie un e-mail HTML et l'enregistre dans « Éléments envoyés ».
 * Lève une GraphError en cas d'échec (statut HTTP conservé pour le mapping d'erreur).
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  const accessToken = await getAccessToken();

  const toRecipients = input.to.map((address) => ({ emailAddress: { address } }));
  const ccRecipients = (input.cc ?? []).map((address) => ({ emailAddress: { address } }));

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
