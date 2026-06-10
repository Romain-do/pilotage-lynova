// Client HTTP Evoliz : login par clés (JWT ~15 min) + GET lecture seule.
// Transposé du prototype (reference/evoliz). USAGE SERVEUR uniquement.
//
//   POST https://www.evoliz.io/api/login  { public_key, secret_key } → { access_token, expires_at }
//   GET  https://www.evoliz.io/api/v1/[companies/{id}/]<resource>?... (Bearer)
//
// Les listes renvoient une pagination Laravel : { data, links, meta }.

const BASE_URL = "https://www.evoliz.io";
const REQUEST_TIMEOUT_MS = 30_000;

interface AccessToken {
  token: string;
  expiresAt: number; // epoch ms
}

export interface ListResponse<T = Record<string, unknown>> {
  data: T[];
  meta?: { current_page?: number; last_page?: number; per_page?: number; total?: number };
}

export class EvolizApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "EvolizApiError";
  }
}

export class EvolizClient {
  private accessToken: AccessToken | null = null;

  constructor(
    private readonly publicKey: string,
    private readonly secretKey: string,
    private readonly companyId?: string
  ) {}

  async get<T>(resource: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const token = await this.getValidToken();
    const url = this.buildUrl(resource, query);

    let response = await this.fetchWithTimeout(url, token);
    if (response.status === 401) {
      this.accessToken = null;
      response = await this.fetchWithTimeout(url, await this.getValidToken());
    }

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new EvolizApiError(this.extractErrorMessage(body, response.status), response.status);
    }
    return body as T;
  }

  private buildUrl(resource: string, query: Record<string, string | number | undefined>): string {
    const prefix = this.companyId ? `companies/${encodeURIComponent(this.companyId)}/` : "";
    const url = new URL(`${BASE_URL}/api/v1/${prefix}${resource}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async fetchWithTimeout(url: string, token: string): Promise<Response> {
    try {
      return await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EvolizApiError(
        `Impossible de joindre l'API Evoliz : ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }
  }

  private async getValidToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > Date.now()) {
      return this.accessToken.token;
    }
    return this.login();
  }

  private async login(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ public_key: this.publicKey, secret_key: this.secretKey }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EvolizApiError(
        `Échec de connexion à l'API Evoliz : ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }

    const body = await this.parseJson(response);
    if (!response.ok) {
      const hint =
        response.status === 401 || response.status === 403
          ? " Vérifiez EVOLIZ_PUBLIC_KEY et EVOLIZ_SECRET_KEY (Applications > Connecteurs > Evoliz API)."
          : "";
      throw new EvolizApiError(this.extractErrorMessage(body, response.status) + hint, response.status);
    }

    const accessToken = (body as { access_token?: string }).access_token;
    const expiresAt = (body as { expires_at?: string }).expires_at;
    if (!accessToken) throw new EvolizApiError("Réponse de login inattendue : access_token absent.", 422);

    this.accessToken = {
      token: accessToken,
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : Date.now() + 15 * 60_000,
    };
    return accessToken;
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  private extractErrorMessage(body: unknown, status: number): string {
    const { error, message } = (body ?? {}) as { error?: string; message?: unknown };
    const details = Array.isArray(message)
      ? message.flat().join(" ; ")
      : typeof message === "string"
        ? message
        : "";
    if (error || details) {
      return `Erreur API Evoliz (${status}) : ${[error, details].filter(Boolean).join(" — ")}`;
    }
    return `Erreur API Evoliz : statut HTTP ${status}.`;
  }
}

/** Construit un client à partir des variables d'environnement (serveur). */
export function createEvolizClient(): EvolizClient {
  const publicKey = process.env.EVOLIZ_PUBLIC_KEY;
  const secretKey = process.env.EVOLIZ_SECRET_KEY;
  const companyId = process.env.EVOLIZ_COMPANY_ID || undefined;
  if (!publicKey || !secretKey) {
    throw new EvolizApiError(
      "EVOLIZ_PUBLIC_KEY et EVOLIZ_SECRET_KEY requis (Applications > Connecteurs > Evoliz API).",
      0
    );
  }
  return new EvolizClient(publicKey, secretKey, companyId);
}

export function isEvolizConfigured(): boolean {
  return Boolean(process.env.EVOLIZ_PUBLIC_KEY && process.env.EVOLIZ_SECRET_KEY);
}
