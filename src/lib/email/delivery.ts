// Garde-fou TEST unifié des envois sortants (présentation, synthèse RDV, RDV Outlook).
//
// EMAILS_LIVE=true  → envoi RÉEL (au prospect, CC normal, prospect invité au RDV).
// défaut (non posée) → MODE TEST : tout est redirigé vers romain@lynova.net, le CC externe est
//                      supprimé, et le prospect n'est PAS invité au RDV. Aucun vrai prospect contacté.
//
// ⚠️ En production, poser EMAILS_LIVE=true (Vercel) — sinon tous les envois sont redirigés en test.

export const TEST_RECIPIENT = "romain@lynova.net";

export function emailsLive(): boolean {
  return process.env.EMAILS_LIVE === "true";
}

/** Message de confirmation en mode test pour un e-mail (présentation / synthèse). Précise le
 *  prospect réel seulement s'il diffère de l'adresse de test (sinon mention redondante). */
export function testModeMessage(realTo: string): string {
  const note = realTo.toLowerCase() !== TEST_RECIPIENT ? ` (prospect réel : ${realTo}, non contacté)` : "";
  return `Mode test — e-mail envoyé à toi (${TEST_RECIPIENT}), le prospect ne reçoit rien${note}.`;
}
