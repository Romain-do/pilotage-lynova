// Configuration Microsoft 365 / Graph (RDV Outlook + Teams).
//
// SERVER-ONLY : ce module lit MS_CLIENT_SECRET. Ne jamais l'importer dans un composant
// client. Les trois variables sont déclarées dans .env.local (local) et Vercel (prod),
// JAMAIS committées.

/** Endpoints OAuth v2 Microsoft (Azure AD), scopés au tenant. */
export function msAuthority(): string {
  const tenant = process.env.MS_TENANT_ID ?? "common";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

/**
 * Scopes demandés (authorization-code flow).
 * - offline_access            → obtention d'un refresh token (accès hors-ligne)
 * - User.Read                 → identité du compte connecté (e-mail affiché dans /admin)
 * - Calendars.ReadWrite       → création d'événements (POST /me/events)
 * - OnlineMeetings.ReadWrite  → réunion Teams attachée à l'événement
 */
export const MS_SCOPES = [
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
] as const;

export const MS_SCOPE_STRING = MS_SCOPES.join(" ");

/** Base de l'API Microsoft Graph. */
export const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

/** Fuseau horaire des RDV créés (Microsoft Graph attend un nom de fuseau Windows/IANA). */
export const MEETING_TIME_ZONE = "Europe/Paris";

/**
 * URL de redirection OAuth, à déclarer À L'IDENTIQUE dans Azure (App registration >
 * Authentication > Web > Redirect URIs). On la dérive de l'URL publique du site pour
 * éviter toute divergence entre le code et la config Azure.
 *  - local : http://localhost:3000/api/integrations/msgraph/callback
 *  - prod  : https://<domaine>/api/integrations/msgraph/callback
 * `origin` (en-tête de la requête) prime, avec NEXT_PUBLIC_SITE_URL en repli.
 */
export function msRedirectUri(origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/integrations/msgraph/callback`;
}

/** Les secrets d'app Microsoft sont-ils renseignés ? (mode bootstrap sinon). */
export function isMsGraphConfigured(): boolean {
  return Boolean(
    process.env.MS_CLIENT_ID && process.env.MS_TENANT_ID && process.env.MS_CLIENT_SECRET
  );
}

/** Identifiants d'app (throw si non configuré — appelé uniquement côté serveur). */
export function msAppCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph non configuré : MS_CLIENT_ID / MS_TENANT_ID / MS_CLIENT_SECRET manquants."
    );
  }
  return { clientId, clientSecret };
}
