#!/usr/bin/env node
/**
 * Serveur MCP Revolut Business — lecture seule.
 *
 * Outils : comptes (+ soldes), transactions, contreparties.
 * Transport : stdio. Aucune écriture : pas de virement, pas de paiement, jamais.
 *
 * Configuration : ~/.revolut-mcp/config.json (créé par revolut-setup.cjs),
 * surchargable par REVOLUT_CONFIG_PATH.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, PROD_API_BASE, TokenManager } from "./auth.js";

const CHARACTER_LIMIT = 100_000;

let tokenManager: TokenManager;
try {
  tokenManager = new TokenManager(loadConfig(), PROD_API_BASE);
} catch (error) {
  console.error(`ERREUR : ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Client API
// ---------------------------------------------------------------------------

class RevolutApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "RevolutApiError";
  }
}

async function apiGet<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(`${PROD_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let token = await tokenManager.getAccessToken();
  let response = await doFetch(url, token);

  // Access token périmé côté serveur : refresh forcé puis un seul retry.
  if (response.status === 401) {
    token = await tokenManager.getAccessToken(true);
    response = await doFetch(url, token);
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (body as { message?: string }).message ?? "";
    throw new RevolutApiError(`Erreur API Revolut (${response.status})${message ? ` : ${message}` : "."}`, response.status);
  }

  return body as T;
}

async function doFetch(url: URL, token: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RevolutApiError("Délai d'attente dépassé en contactant l'API Revolut. Réessayez.", 0);
    }
    throw new RevolutApiError(
      `Impossible de joindre l'API Revolut : ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }
}

// ---------------------------------------------------------------------------
// Serveur et outils
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "revolut-mcp-server", version: "1.0.0" });

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function success(payload: Record<string, unknown>): ToolResult {
  let text = JSON.stringify(payload, null, 2);
  if (text.length > CHARACTER_LIMIT && Array.isArray(payload.items)) {
    const items = payload.items as unknown[];
    const truncated = items.slice(0, Math.max(1, Math.floor(items.length / 2)));
    payload = {
      ...payload,
      items: truncated,
      truncated: true,
      truncation_message: `Réponse tronquée de ${items.length} à ${truncated.length} éléments. Réduisez 'count' ou la période.`,
    };
    text = JSON.stringify(payload, null, 2);
  }
  return { content: [{ type: "text", text }], structuredContent: payload };
}

function failure(error: unknown): ToolResult {
  const message =
    error instanceof RevolutApiError || error instanceof Error
      ? error.message
      : `Erreur inattendue : ${String(error)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

server.registerTool(
  "revolut_list_accounts",
  {
    title: "Lister les comptes Revolut Business",
    description: `Liste tous les comptes Revolut Business avec leur solde actuel.

Chaque compte contient : id, name, balance, currency (EUR, USD…), state (active/inactive), created_at, updated_at.
C'est l'outil à appeler en premier pour connaître le solde de trésorerie.

Retour (JSON) : { count, items: [compte…] }`,
    inputSchema: {},
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async () => {
    try {
      const accounts = await apiGet<Record<string, unknown>[]>("accounts");
      return success({ count: accounts.length, items: accounts });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "revolut_get_account_details",
  {
    title: "Coordonnées bancaires d'un compte Revolut",
    description: `Récupère les coordonnées bancaires (IBAN, BIC, bénéficiaire…) d'un compte Revolut Business.

L'account_id s'obtient via revolut_list_accounts.

Retour (JSON) : { account, bank_details }`,
    inputSchema: {
      account_id: z.string().uuid().describe("Identifiant du compte (UUID, champ id de revolut_list_accounts)"),
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ account_id }) => {
    try {
      const [account, bankDetails] = await Promise.all([
        apiGet<Record<string, unknown>>(`accounts/${account_id}`),
        apiGet<Record<string, unknown>[]>(`accounts/${account_id}/bank-details`),
      ]);
      return success({ account, bank_details: bankDetails });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "revolut_list_transactions",
  {
    title: "Lister les transactions Revolut Business",
    description: `Liste les transactions du compte Revolut Business, de la plus récente à la plus ancienne.

Chaque transaction contient : id, type (transfer, card_payment, topup, fee, exchange…), state (completed, pending,
declined…), created_at, completed_at, reference (libellé), legs (montant, devise, compte, contrepartie, solde après opération).

Filtres : période (from/to, format YYYY-MM-DD), compte précis (account_id), nombre de résultats (count, défaut 50).
Pour remonter plus loin dans l'historique, utilisez 'to' avec la date de la transaction la plus ancienne reçue.

Utile pour : vérifier les encaissements (rapprochement avec les factures Evoliz), suivre les dépenses, analyser la trésorerie.

Retour (JSON) : { count, items: [transaction…] }`,
    inputSchema: {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD").optional()
        .describe("Date de début (incluse), format YYYY-MM-DD"),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD").optional()
        .describe("Date de fin (incluse), format YYYY-MM-DD"),
      account_id: z.string().uuid().optional().describe("Limiter à un compte précis (UUID)"),
      count: z.number().int().min(1).max(1000).default(100).describe("Nombre max de transactions (défaut : 100, max : 1000)"),
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ from, to, account_id, count }) => {
    try {
      const transactions = await apiGet<RevolutTransaction[]>("transactions", {
        from,
        to,
        account: account_id,
        count,
      });
      if (transactions.length === 0) {
        return success({ count: 0, items: [], message: "Aucune transaction sur cette période." });
      }
      return success({ count: transactions.length, items: transactions.map(compactTransaction) });
    } catch (error) {
      return failure(error);
    }
  }
);

interface RevolutTransaction {
  id: string;
  type: string;
  state: string;
  created_at: string;
  completed_at?: string;
  reference?: string;
  merchant?: { name?: string; category_code?: string };
  legs?: {
    account_id?: string;
    amount?: number;
    currency?: string;
    description?: string;
    balance?: number;
  }[];
}

/** Allège une transaction : champs essentiels uniquement (analyse trésorerie/dépenses). */
function compactTransaction(t: RevolutTransaction): Record<string, unknown> {
  return {
    id: t.id,
    type: t.type,
    state: t.state,
    created_at: t.created_at,
    ...(t.completed_at ? { completed_at: t.completed_at } : {}),
    ...(t.reference ? { reference: t.reference } : {}),
    ...(t.merchant?.name ? { merchant: t.merchant.name, merchant_category: t.merchant.category_code } : {}),
    legs: (t.legs ?? []).map((leg) => ({
      account_id: leg.account_id,
      amount: leg.amount,
      currency: leg.currency,
      ...(leg.description ? { description: leg.description } : {}),
      ...(leg.balance !== undefined ? { balance: leg.balance } : {}),
    })),
  };
}

server.registerTool(
  "revolut_list_counterparties",
  {
    title: "Lister les contreparties Revolut Business",
    description: `Liste les contreparties (bénéficiaires et émetteurs enregistrés) du compte Revolut Business.

Chaque contrepartie contient : id, name, state, accounts (IBAN/coordonnées associés), created_at.
Utile pour identifier qui sont les destinataires/émetteurs récurrents des virements.

Retour (JSON) : { count, items: [contrepartie…] }`,
    inputSchema: {},
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async () => {
    try {
      const counterparties = await apiGet<Record<string, unknown>[]>("counterparties");
      return success({ count: counterparties.length, items: counterparties });
    } catch (error) {
      return failure(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Serveur MCP Revolut Business (lecture seule) démarré via stdio.");
}

main().catch((error) => {
  console.error("Erreur fatale du serveur :", error);
  process.exit(1);
});
