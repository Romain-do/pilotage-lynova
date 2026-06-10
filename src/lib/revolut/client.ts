// Client Revolut Business — LECTURE SEULE STRICTE.
// Auth : client assertion JWT RS256 + refresh_token (access token ~40 min).
// Transposé de reference/revolut/auth.ts. AUCUN endpoint d'écriture (pas de
// virement, paiement ni transfer) — uniquement GET (accounts, transactions, rate).
// USAGE SERVEUR uniquement.

import { createSign } from "node:crypto";

const BASE = "https://b2b.revolut.com/api/1.0";
const ASSERTION_TTL_S = 120;
const TOKEN_MARGIN_MS = 5 * 60_000;
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/** Devises fiat (tout le reste = crypto). */
export const FIAT_CURRENCIES = new Set([
  "EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN",
]);

export class RevolutApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "RevolutApiError";
  }
}

interface RevolutConfig {
  clientId: string;
  iss: string;
  privateKeyPem: string;
  refreshToken: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class RevolutClient {
  private token: string | null = null;
  private expiresAt = 0;

  constructor(private readonly cfg: RevolutConfig) {}

  private assertion(): string {
    const h = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const p = base64url(
      JSON.stringify({
        iss: this.cfg.iss,
        sub: this.cfg.clientId,
        aud: "https://revolut.com",
        exp: Math.floor(Date.now() / 1000) + ASSERTION_TTL_S,
      })
    );
    const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(this.cfg.privateKeyPem);
    return `${h}.${p}.${base64url(sig)}`;
  }

  private async refresh(): Promise<string> {
    const res = await fetch(`${BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.cfg.refreshToken,
        client_assertion_type: CLIENT_ASSERTION_TYPE,
        client_assertion: this.assertion(),
      }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      const d = [body.error, body.error_description].filter(Boolean).join(" — ");
      throw new RevolutApiError(`Auth Revolut échouée (HTTP ${res.status})${d ? ` : ${d}` : "."}`, res.status);
    }
    this.token = body.access_token;
    this.expiresAt = Date.now() + (body.expires_in ?? 2399) * 1000;
    return this.token;
  }

  private async getToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.expiresAt - TOKEN_MARGIN_MS) return this.token;
    return this.refresh();
  }

  /** GET lecture seule. */
  async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

    let res = await this.doFetch(url, await this.getToken());
    if (res.status === 401) res = await this.doFetch(url, await this.getToken(true));

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = (body as { message?: string }).message ?? "";
      throw new RevolutApiError(`Erreur API Revolut (${res.status})${m ? ` : ${m}` : "."}`, res.status);
    }
    return body as T;
  }

  private async doFetch(url: URL, token: string): Promise<Response> {
    try {
      return await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new RevolutApiError(
        `Impossible de joindre l'API Revolut : ${e instanceof Error ? e.message : String(e)}`,
        0
      );
    }
  }

  /** Cours d'une devise vers EUR (lecture seule). null si indisponible. */
  async rateToEur(from: string): Promise<number | null> {
    if (from === "EUR") return 1;
    try {
      const r = await this.get<Record<string, unknown>>("rate", { from, to: "EUR", amount: 1 });
      const rate = (r.rate as number) ?? ((r.to as Record<string, unknown>)?.amount as number);
      return typeof rate === "number" ? rate : null;
    } catch {
      return null;
    }
  }
}

export function isRevolutConfigured(): boolean {
  return Boolean(
    process.env.REVOLUT_CLIENT_ID &&
      process.env.REVOLUT_ISS &&
      process.env.REVOLUT_PRIVATE_KEY &&
      process.env.REVOLUT_REFRESH_TOKEN
  );
}

export function createRevolutClient(): RevolutClient {
  const clientId = process.env.REVOLUT_CLIENT_ID;
  const iss = process.env.REVOLUT_ISS;
  const privateKeyPem = process.env.REVOLUT_PRIVATE_KEY;
  const refreshToken = process.env.REVOLUT_REFRESH_TOKEN;
  if (!clientId || !iss || !privateKeyPem || !refreshToken) {
    throw new RevolutApiError(
      "Revolut non configuré (REVOLUT_CLIENT_ID / ISS / PRIVATE_KEY / REFRESH_TOKEN).",
      0
    );
  }
  return new RevolutClient({ clientId, iss, privateKeyPem, refreshToken });
}
