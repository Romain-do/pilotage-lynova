// Authentification Microsoft Graph — authorization-code flow + refresh token.
//
// SERVER-ONLY. Flux (doc Microsoft identity platform, OAuth 2.0 auth code) :
//  1. /connect   → redirige le dirigeant vers l'endpoint /authorize (consentement).
//  2. /callback  → échange le `code` contre { access_token, refresh_token } sur /token.
//                  Le refresh token (offline_access) est persisté en base (server-only).
//  3. à l'usage  → refreshAccessToken() échange le refresh token contre un access token
//                  court (~1 h), mis en cache mémoire. Microsoft peut faire tourner le
//                  refresh token : on re-persiste celui renvoyé le cas échéant.

import { prisma } from "@/lib/prisma";
import {
  msAuthority,
  msAppCredentials,
  msRedirectUri,
  MS_SCOPE_STRING,
} from "./config";

const SINGLETON_ID = "default";
/** Marge : on renouvelle l'access token 5 min avant son expiration réelle. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

// ───────────────────────── Persistance de la connexion ─────────────────────────

export interface MsGraphConnectionInfo {
  accountEmail: string | null;
  accountName: string | null;
  scope: string | null;
  connectedAt: Date;
}

/** Statut de connexion (sans jamais exposer le refresh token). */
export async function getMsGraphConnection(): Promise<MsGraphConnectionInfo | null> {
  const row = await prisma.msGraphConnection.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) return null;
  return {
    accountEmail: row.accountEmail,
    accountName: row.accountName,
    scope: row.scope,
    connectedAt: row.connectedAt,
  };
}

/** Connecté = une ligne avec refresh token présent. */
export async function isMsGraphConnected(): Promise<boolean> {
  return (await getMsGraphConnection()) !== null;
}

/** Supprime la connexion (déconnexion depuis /admin). */
export async function clearMsGraphConnection(): Promise<void> {
  await prisma.msGraphConnection.deleteMany({ where: { id: SINGLETON_ID } });
  cachedAccessToken = null;
  cachedExpiresAt = 0;
}

interface UpsertConnectionArgs {
  refreshToken: string;
  accountEmail: string | null;
  accountName: string | null;
  scope: string | null;
  connectedById?: string | null;
}

async function upsertConnection(args: UpsertConnectionArgs): Promise<void> {
  await prisma.msGraphConnection.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...args },
    update: {
      refreshToken: args.refreshToken,
      accountEmail: args.accountEmail,
      accountName: args.accountName,
      scope: args.scope,
      ...(args.connectedById ? { connectedById: args.connectedById } : {}),
    },
  });
}

// ───────────────────────── Endpoints OAuth ─────────────────────────

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${msAuthority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    const detail = [body.error, body.error_description].filter(Boolean).join(" — ");
    throw new Error(`Échec OAuth Microsoft (HTTP ${res.status})${detail ? ` : ${detail}` : "."}`);
  }
  return body;
}

/** Construit l'URL /authorize (étape 1). `state` = anti-CSRF (vérifié au callback). */
export function buildAuthorizeUrl(state: string, origin: string): string {
  const { clientId } = msAppCredentials();
  const qs = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: msRedirectUri(origin),
    response_mode: "query",
    scope: MS_SCOPE_STRING,
    state,
    prompt: "select_account",
  });
  return `${msAuthority()}/authorize?${qs.toString()}`;
}

/**
 * Échange le `code` reçu au callback contre des tokens, récupère l'identité du compte
 * (GET /me) et persiste la connexion. Appelé par la route /callback (DIRIGEANT).
 */
export async function exchangeCodeAndStore(
  code: string,
  origin: string,
  connectedById: string | null
): Promise<MsGraphConnectionInfo> {
  const { clientId, clientSecret } = msAppCredentials();
  const token = await postToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: msRedirectUri(origin),
    scope: MS_SCOPE_STRING,
  });

  if (!token.refresh_token) {
    throw new Error(
      "Microsoft n'a pas renvoyé de refresh token : vérifiez que le scope offline_access est demandé et consenti."
    );
  }

  const me = await fetchMe(token.access_token!);

  await upsertConnection({
    refreshToken: token.refresh_token,
    accountEmail: me.email,
    accountName: me.name,
    scope: token.scope ?? MS_SCOPE_STRING,
    connectedById,
  });

  // Amorce le cache mémoire avec l'access token tout juste obtenu.
  cachedAccessToken = token.access_token!;
  cachedExpiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;

  return {
    accountEmail: me.email,
    accountName: me.name,
    scope: token.scope ?? MS_SCOPE_STRING,
    connectedAt: new Date(),
  };
}

// ───────────────────────── Access token (refresh + cache) ─────────────────────────

let cachedAccessToken: string | null = null;
let cachedExpiresAt = 0;

/**
 * Access token valide à partir du refresh token stocké. Lève si non connecté.
 * Met en cache en mémoire et renouvelle automatiquement avant expiration.
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedAccessToken && Date.now() < cachedExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedAccessToken;
  }

  const row = await prisma.msGraphConnection.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    throw new Error("Outlook non connecté : connectez un compte Microsoft 365 depuis /admin.");
  }

  const { clientId, clientSecret } = msAppCredentials();
  const token = await postToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
    scope: MS_SCOPE_STRING,
  });

  cachedAccessToken = token.access_token!;
  cachedExpiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;

  // Rotation éventuelle du refresh token : on re-persiste celui renvoyé.
  if (token.refresh_token && token.refresh_token !== row.refreshToken) {
    await prisma.msGraphConnection.update({
      where: { id: SINGLETON_ID },
      data: { refreshToken: token.refresh_token },
    });
  }

  return cachedAccessToken;
}

// ───────────────────────── /me (identité) ─────────────────────────

async function fetchMe(accessToken: string): Promise<{ email: string | null; name: string | null }> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { email: null, name: null };
    const me = (await res.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    return { email: me.mail ?? me.userPrincipalName ?? null, name: me.displayName ?? null };
  } catch {
    return { email: null, name: null };
  }
}
