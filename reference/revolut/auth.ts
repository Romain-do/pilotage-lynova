/**
 * Authentification Revolut Business API.
 *
 * Flux vérifié sur la doc officielle (developer.revolut.com, "Make your first API request") :
 *  - client assertion JWT RS256 : { iss: domaine du redirect URI, sub: client_id, aud: "https://revolut.com", exp }
 *  - POST https://b2b.revolut.com/api/1.0/auth/token (x-www-form-urlencoded)
 *      grant_type=refresh_token + refresh_token + client_assertion_type + client_assertion
 *  - access_token valable 40 min ; le refresh_token n'expire pas.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PROD_API_BASE = "https://b2b.revolut.com/api/1.0";
export const DEFAULT_CONFIG_PATH = join(homedir(), ".revolut-mcp", "config.json");

const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
/** Marge de sécurité : on renouvelle le token 5 min avant son expiration réelle (40 min). */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
/** Durée de vie courte du JWT d'assertion (recommandation Revolut). */
const ASSERTION_TTL_S = 120;

export interface RevolutConfig {
  client_id: string;
  /** Domaine du redirect URI déclaré sur le certificat (sans https://) */
  iss: string;
  /** Clé privée RSA au format PEM (contenu inline) */
  private_key_pem: string;
  refresh_token: string;
}

export function loadConfig(configPath: string = process.env.REVOLUT_CONFIG_PATH ?? DEFAULT_CONFIG_PATH): RevolutConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    throw new Error(
      `Fichier de configuration introuvable : ${configPath}\n` +
        `Lancez d'abord l'assistant : node revolut-setup.cjs`
    );
  }

  const config = JSON.parse(raw) as Partial<RevolutConfig>;
  for (const field of ["client_id", "iss", "private_key_pem", "refresh_token"] as const) {
    if (!config[field]) {
      throw new Error(`Configuration invalide : champ "${field}" manquant dans ${configPath}. Relancez revolut-setup.cjs.`);
    }
  }
  return config as RevolutConfig;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Construit le client assertion JWT signé RS256 avec la clé privée. */
export function buildClientAssertion(config: Pick<RevolutConfig, "client_id" | "iss" | "private_key_pem">): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: config.iss,
      sub: config.client_id,
      aud: "https://revolut.com",
      exp: Math.floor(Date.now() / 1000) + ASSERTION_TTL_S,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(config.private_key_pem);
  return `${signingInput}.${base64url(signature)}`;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Échange générique sur /auth/token (utilisé par le setup et par le refresh). */
export async function requestToken(
  apiBase: string,
  params: Record<string, string>
): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const response = await fetch(`${apiBase}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await response.json().catch(() => ({}))) as TokenResponse & { refresh_token?: string };

  if (!response.ok || !body.access_token) {
    const detail = [body.error, body.error_description].filter(Boolean).join(" — ");
    throw new Error(
      `Échec d'obtention du token Revolut (HTTP ${response.status})${detail ? ` : ${detail}` : "."}` +
        (detail.includes("expired") ? " Le JWT a expiré : relancez la requête (il est régénéré automatiquement)." : "")
    );
  }

  return { access_token: body.access_token, expires_in: body.expires_in ?? 2399, refresh_token: body.refresh_token };
}

/** Gestionnaire de token d'accès avec cache mémoire et renouvellement automatique. */
export class TokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly config: RevolutConfig,
    private readonly apiBase: string = PROD_API_BASE
  ) {}

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.accessToken && Date.now() < this.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.accessToken;
    }

    const result = await requestToken(this.apiBase, {
      grant_type: "refresh_token",
      refresh_token: this.config.refresh_token,
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: buildClientAssertion(this.config),
    });

    this.accessToken = result.access_token;
    this.expiresAt = Date.now() + result.expires_in * 1000;
    return this.accessToken;
  }
}

export { CLIENT_ASSERTION_TYPE };
