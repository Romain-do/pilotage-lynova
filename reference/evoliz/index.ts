#!/usr/bin/env node
/**
 * Serveur MCP Evoliz — lecture seule.
 *
 * Outils : factures, clients, devis, paiements (liste + détail).
 * Transport : stdio (usage local avec Claude Desktop / Cowork).
 *
 * Variables d'environnement requises :
 *   EVOLIZ_PUBLIC_KEY, EVOLIZ_SECRET_KEY
 * Optionnelle :
 *   EVOLIZ_COMPANY_ID (préfixe companies/{id} sur les routes, forme documentée)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EvolizApiError, EvolizClient, type ListResponse } from "./client.js";

const CHARACTER_LIMIT = 100_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const publicKey = process.env.EVOLIZ_PUBLIC_KEY;
const secretKey = process.env.EVOLIZ_SECRET_KEY;
const companyId = process.env.EVOLIZ_COMPANY_ID;

if (!publicKey || !secretKey) {
  console.error(
    "ERREUR : les variables d'environnement EVOLIZ_PUBLIC_KEY et EVOLIZ_SECRET_KEY sont requises.\n" +
      "Créez vos clés API dans Evoliz : Applications > Connecteurs disponibles > Evoliz API."
  );
  process.exit(1);
}

const client = new EvolizClient(publicKey, secretKey, companyId);

const server = new McpServer({
  name: "evoliz-mcp-server",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Schémas partagés
// ---------------------------------------------------------------------------

const paginationFields = {
  page: z.number().int().min(1).default(1).describe("Numéro de page (défaut : 1)"),
  per_page: z.number().int().min(1).max(100).default(25).describe("Résultats par page, 1-100 (défaut : 25)"),
};

const searchField = z
  .string()
  .max(200)
  .optional()
  .describe("Recherche libre (numéro de document, nom de client, référence…)");

/* Filtres de période documentés par l'API Evoliz (défaut implicite : période en cours).
   Pour l'historique complet : period=custom + date_min + date_max. */
const periodFields = {
  period: z
    .enum(["lastmonth", "currentmonth", "last3months", "last6months", "currentyear", "lastyear", "fiscalyear", "lastfiscalyear", "vatperiod", "custom"])
    .optional()
    .describe("Période des documents. IMPORTANT : sans ce paramètre l'API ne renvoie que la période courante. Utilisez 'custom' avec date_min/date_max pour tout l'historique."),
  date_min: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD").optional()
    .describe("Date min (YYYY-MM-DD), requiert period=custom et date_max"),
  date_max: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD").optional()
    .describe("Date max (YYYY-MM-DD), requiert period=custom et date_min"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      truncation_message:
        `Réponse tronquée de ${items.length} à ${truncated.length} éléments. ` +
        `Réduisez per_page ou affinez la recherche.`,
    };
    text = JSON.stringify(payload, null, 2);
  }

  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
  };
}

function failure(error: unknown): ToolResult {
  const message =
    error instanceof EvolizApiError
      ? error.status === 404
        ? `${error.message} Vérifiez que l'identifiant existe (utilisez l'outil de liste correspondant).`
        : error.message
      : `Erreur inattendue : ${error instanceof Error ? error.message : String(error)}`;

  return { content: [{ type: "text", text: message }], isError: true };
}

function listPayload(response: ListResponse, page: number): Record<string, unknown> {
  const meta = response.meta ?? {};
  const items = response.data ?? [];
  const currentPage = meta.current_page ?? page;
  const lastPage = meta.last_page ?? currentPage;

  return {
    total: meta.total ?? items.length,
    count: items.length,
    page: currentPage,
    last_page: lastPage,
    has_more: currentPage < lastPage,
    items,
  };
}

/** Résumé compact d'un document de vente (facture/devis) pour les listes. */
function compactSaleDocument(item: Record<string, unknown>): Record<string, unknown> {
  const client = item.client as Record<string, unknown> | undefined;
  const total = item.total as Record<string, unknown> | undefined;
  return {
    ...(item.invoiceid !== undefined ? { invoiceid: item.invoiceid } : {}),
    ...(item.quoteid !== undefined ? { quoteid: item.quoteid } : {}),
    document_number: item.document_number,
    object: item.object,
    documentdate: item.documentdate,
    duedate: item.duedate,
    status: item.status,
    ...(item.enabled === false ? { enabled: false } : {}),
    client: client ? { clientid: client.clientid, name: client.name } : undefined,
    total: total
      ? {
          vat_exclude: total.vat_exclude,
          vat_include: total.vat_include,
          paid: total.paid,
          net_to_pay: total.net_to_pay,
        }
      : undefined,
    ...(typeof item.recovery_number === "number" && item.recovery_number > 0
      ? { recovery_number: item.recovery_number }
      : {}),
  };
}

/** Résumé compact d'une fiche client pour les listes. */
function compactClient(item: Record<string, unknown>): Record<string, unknown> {
  const address = item.address as Record<string, unknown> | undefined;
  return {
    clientid: item.clientid,
    code: item.code,
    name: item.name,
    type: item.type,
    email: item.email,
    ...(address ? { town: address.town, postcode: address.postcode } : {}),
  };
}

/** Enregistre une paire d'outils liste + détail pour une ressource Evoliz. */
function registerResourceTools(options: {
  resource: string;
  singularFr: string;
  pluralFr: string;
  idParamName: string;
  listDescription: string;
  detailDescription: string;
  compact?: (item: Record<string, unknown>) => Record<string, unknown>;
}): void {
  const { resource, singularFr, pluralFr, idParamName, listDescription, detailDescription, compact } = options;
  const toolBase = resource.replace(/-/g, "_");

  const isSaleDocument = resource !== "clients";
  server.registerTool(
    `evoliz_list_${toolBase}`,
    {
      title: `Lister les ${pluralFr} Evoliz`,
      description: listDescription,
      inputSchema: isSaleDocument
        ? { search: searchField, ...paginationFields, ...periodFields }
        : { search: searchField, ...paginationFields },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (rawParams: unknown) => {
      const params = rawParams as {
        search?: string;
        page?: number;
        per_page?: number;
        period?: string;
        date_min?: string;
        date_max?: string;
      };
      const page = params.page ?? 1;
      try {
        const response = await client.get<ListResponse>(resource, {
          search: params.search,
          page,
          per_page: params.per_page ?? 25,
          period: params.period,
          date_min: params.date_min,
          date_max: params.date_max,
        });
        const items = response.data ?? [];
        if (items.length === 0) {
          return success({
            total: 0,
            count: 0,
            page,
            last_page: page,
            has_more: false,
            items: [],
            message: params.search
              ? `Aucun(e) ${singularFr} ne correspond à « ${params.search} ».`
              : `Aucun(e) ${singularFr} trouvé(e).`,
          });
        }
        const payload = listPayload(response, page);
        if (compact) {
          payload.items = (payload.items as Record<string, unknown>[]).map(compact);
          payload.note = `Liste compacte — utilisez evoliz_get_${toolBase.replace(/s$/, "")} pour le détail complet d'un élément.`;
        }
        return success(payload);
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    `evoliz_get_${toolBase.replace(/s$/, "")}`,
    {
      title: `Détail d'un(e) ${singularFr} Evoliz`,
      description: detailDescription,
      inputSchema: {
        [idParamName]: z.number().int().positive().describe(`Identifiant Evoliz (champ ${idParamName})`),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (params) => {
      try {
        const id = params[idParamName] as number;
        const detail = await client.get<Record<string, unknown>>(`${resource}/${id}`);
        return success(detail);
      } catch (error) {
        return failure(error);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

registerResourceTools({
  resource: "invoices",
  singularFr: "facture",
  pluralFr: "factures",
  idParamName: "invoiceid",
  listDescription: `Liste les factures de vente Evoliz, de la plus récente à la plus ancienne.

Chaque facture contient notamment : invoiceid, document_number, documentdate, duedate (échéance),
status (ex. draft, create, sent, paid…), client (nom + clientid) et total (montants HT/TTC, restant dû).
Utilisez 'search' pour filtrer par numéro de facture ou nom de client.

Pour repérer les impayés : lister les factures puis examiner le statut et le restant dû de chacune.

Retour (JSON) : { total, count, page, last_page, has_more, items: [facture…] }`,
  detailDescription: `Récupère le détail complet d'une facture Evoliz par son invoiceid : lignes d'articles,
montants HT/TVA/TTC, échéance, paiements liés, client.

L'invoiceid s'obtient via evoliz_list_invoices (ne pas confondre avec le numéro de document type F-2026-001).`,
  compact: compactSaleDocument,
});

registerResourceTools({
  resource: "clients",
  singularFr: "client",
  pluralFr: "clients",
  idParamName: "clientid",
  listDescription: `Liste les clients Evoliz (fiches clients de facturation).

Chaque client contient notamment : clientid, code, name, type (Professionnel/Particulier), adresse, email.
Utilisez 'search' pour chercher par nom.

Retour (JSON) : { total, count, page, last_page, has_more, items: [client…] }`,
  detailDescription: `Récupère la fiche complète d'un client Evoliz par son clientid : coordonnées, conditions
de paiement, encours. Le clientid s'obtient via evoliz_list_clients.`,
  compact: compactClient,
});

registerResourceTools({
  resource: "quotes",
  singularFr: "devis",
  pluralFr: "devis",
  idParamName: "quoteid",
  listDescription: `Liste les devis Evoliz.

Chaque devis contient notamment : quoteid, document_number, documentdate, status, client et total.
Utile pour suivre les devis en attente de signature (pipeline commercial).

Retour (JSON) : { total, count, page, last_page, has_more, items: [devis…] }`,
  detailDescription: `Récupère le détail complet d'un devis Evoliz par son quoteid : lignes, montants, statut, client.
Le quoteid s'obtient via evoliz_list_quotes.`,
  compact: compactSaleDocument,
});

server.registerTool(
  "evoliz_list_payments",
  {
    title: "Lister les paiements Evoliz",
    description: `Liste les paiements (règlements) enregistrés dans Evoliz, du plus récent au plus ancien.

Chaque paiement contient notamment : paymentid, paydate, label, amount, paytype et la ou les factures liées.
Utile pour vérifier ce qui a été encaissé sur une période ou rapprocher une facture d'un règlement.

Retour (JSON) : { total, count, page, last_page, has_more, items: [paiement…] }`,
    inputSchema: { search: searchField, ...paginationFields },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  async ({ search, page, per_page }) => {
    try {
      const response = await client.get<ListResponse>("payments", { search, page, per_page });
      return success(listPayload(response, page));
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
  console.error("Serveur MCP Evoliz (lecture seule) démarré via stdio.");
}

main().catch((error) => {
  console.error("Erreur fatale du serveur :", error);
  process.exit(1);
});
