#!/usr/bin/env node
/**
 * Serveur MCP Trello — suivi de prospection.
 *
 * Lecture + écriture maîtrisée : créer/déplacer/mettre à jour des cartes, commenter.
 * AUCUNE suppression possible (ni carte, ni liste, ni tableau).
 *
 * Auth API Trello : clé + jeton en query params (https://trello.com/power-ups/admin).
 * Variables d'environnement requises : TRELLO_API_KEY, TRELLO_TOKEN.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://api.trello.com/1";
const CHARACTER_LIMIT = 25_000;

const apiKey = process.env.TRELLO_API_KEY;
const apiToken = process.env.TRELLO_TOKEN;

if (!apiKey || !apiToken) {
  console.error(
    "ERREUR : les variables d'environnement TRELLO_API_KEY et TRELLO_TOKEN sont requises.\n" +
      "Voir INSTALLATION.md pour les obtenir (https://trello.com/power-ups/admin)."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Client API
// ---------------------------------------------------------------------------

class TrelloApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "TrelloApiError";
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

async function api<T>(method: "GET" | "POST" | "PUT", path: string, query: QueryParams = {}): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("key", apiKey as string);
  url.searchParams.set("token", apiToken as string);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TrelloApiError("Délai d'attente dépassé en contactant l'API Trello. Réessayez.", 0);
    }
    throw new TrelloApiError(
      `Impossible de joindre l'API Trello : ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const hints: Record<number, string> = {
      401: " Vérifiez TRELLO_API_KEY et TRELLO_TOKEN (le jeton a pu être révoqué).",
      404: " L'identifiant n'existe pas ou n'est pas accessible — vérifiez avec trello_list_boards / trello_get_board.",
      429: " Limite de débit Trello atteinte, patientez quelques secondes.",
    };
    throw new TrelloApiError(`Erreur API Trello (${response.status})${text ? ` : ${text}` : "."}${hints[response.status] ?? ""}`, response.status);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Serveur et helpers
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "trello-mcp-server", version: "1.0.0" });

const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;

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
      truncation_message: `Réponse tronquée de ${items.length} à ${truncated.length} éléments. Ciblez une liste ou affinez la recherche.`,
    };
    text = JSON.stringify(payload, null, 2);
  }
  return { content: [{ type: "text", text }], structuredContent: payload };
}

function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : `Erreur inattendue : ${String(error)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

const CARD_FIELDS = "name,desc,due,dueComplete,idList,idBoard,labels,url,dateLastActivity,closed";

interface TrelloCard {
  id: string;
  name: string;
  desc?: string;
  due?: string | null;
  dueComplete?: boolean;
  idList: string;
  idBoard?: string;
  labels?: { name: string; color: string }[];
  url?: string;
  dateLastActivity?: string;
  closed?: boolean;
}

/** Allège une carte pour limiter la taille des réponses. */
function compactCard(card: TrelloCard): Record<string, unknown> {
  return {
    id: card.id,
    name: card.name,
    ...(card.desc ? { desc: card.desc.length > 300 ? `${card.desc.slice(0, 300)}…` : card.desc } : {}),
    ...(card.due ? { due: card.due, due_complete: card.dueComplete ?? false } : {}),
    list_id: card.idList,
    ...(card.labels?.length ? { labels: card.labels.map((l) => l.name || l.color) } : {}),
    last_activity: card.dateLastActivity,
    url: card.url,
  };
}

// ---------------------------------------------------------------------------
// Outils — lecture
// ---------------------------------------------------------------------------

server.registerTool(
  "trello_list_boards",
  {
    title: "Lister les tableaux Trello",
    description: `Liste les tableaux Trello ouverts de l'utilisateur (id, name, url).

C'est le point d'entrée : récupérer l'id du tableau de prospection avant d'appeler trello_get_board.

Retour (JSON) : { count, items: [{ id, name, url }…] }`,
    inputSchema: {},
    annotations: READ_ANNOTATIONS,
  },
  async () => {
    try {
      const boards = await api<{ id: string; name: string; url: string }[]>("GET", "members/me/boards", {
        filter: "open",
        fields: "name,url",
      });
      return success({ count: boards.length, items: boards });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "trello_get_board",
  {
    title: "Vue complète d'un tableau Trello",
    description: `Récupère un tableau Trello complet : ses listes (colonnes) avec leurs cartes.

Vue idéale du pipeline de prospection : chaque liste contient ses cartes (nom, échéance, étiquettes,
dernière activité). Les list_id retournés servent à créer ou déplacer des cartes.

Le board_id s'obtient via trello_list_boards.

Retour (JSON) : { board_id, lists: [{ id, name, cards: [carte…] }…] }`,
    inputSchema: {
      board_id: z.string().min(8).describe("Identifiant du tableau (via trello_list_boards)"),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ board_id }) => {
    try {
      const [lists, cards] = await Promise.all([
        api<{ id: string; name: string }[]>("GET", `boards/${board_id}/lists`, { filter: "open", fields: "name" }),
        api<TrelloCard[]>("GET", `boards/${board_id}/cards`, { filter: "open", fields: CARD_FIELDS }),
      ]);
      const cardsByList = new Map<string, Record<string, unknown>[]>();
      for (const card of cards) {
        const bucket = cardsByList.get(card.idList) ?? [];
        bucket.push(compactCard(card));
        cardsByList.set(card.idList, bucket);
      }
      return success({
        board_id,
        total_cards: cards.length,
        lists: lists.map((list) => ({ id: list.id, name: list.name, cards: cardsByList.get(list.id) ?? [] })),
      });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "trello_get_card",
  {
    title: "Détail d'une carte Trello",
    description: `Récupère le détail complet d'une carte : description entière, échéance, étiquettes,
checklists et les 20 derniers commentaires (historique des échanges avec le prospect).

Retour (JSON) : { card, comments: [{ date, member, text }…] }`,
    inputSchema: {
      card_id: z.string().min(8).describe("Identifiant de la carte"),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ card_id }) => {
    try {
      const [card, actions] = await Promise.all([
        api<TrelloCard & { checklists?: unknown[] }>("GET", `cards/${card_id}`, {
          fields: CARD_FIELDS,
          checklists: "all",
        }),
        api<{ date: string; memberCreator?: { fullName?: string }; data?: { text?: string } }[]>(
          "GET",
          `cards/${card_id}/actions`,
          { filter: "commentCard", limit: 20 }
        ),
      ]);
      return success({
        card: { ...compactCard(card), desc: card.desc ?? "", checklists: card.checklists ?? [] },
        comments: actions.map((a) => ({ date: a.date, member: a.memberCreator?.fullName ?? "?", text: a.data?.text ?? "" })),
      });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "trello_search_cards",
  {
    title: "Rechercher des cartes Trello",
    description: `Recherche des cartes par mots-clés dans tous les tableaux (nom, description, commentaires).

Utile pour retrouver un prospect par son nom d'entreprise sans parcourir tout le tableau.

Retour (JSON) : { count, items: [carte…] }`,
    inputSchema: {
      query: z.string().min(2).max(200).describe("Mots-clés (ex. nom de l'entreprise prospect)"),
      limit: z.number().int().min(1).max(50).default(20).describe("Nombre max de résultats (défaut : 20)"),
    },
    annotations: READ_ANNOTATIONS,
  },
  async ({ query, limit }) => {
    try {
      const result = await api<{ cards?: TrelloCard[] }>("GET", "search", {
        query,
        modelTypes: "cards",
        card_fields: CARD_FIELDS,
        cards_limit: limit,
      });
      const cards = result.cards ?? [];
      if (cards.length === 0) {
        return success({ count: 0, items: [], message: `Aucune carte ne correspond à « ${query} ».` });
      }
      return success({ count: cards.length, items: cards.map(compactCard) });
    } catch (error) {
      return failure(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Outils — écriture (jamais de suppression)
// ---------------------------------------------------------------------------

server.registerTool(
  "trello_create_card",
  {
    title: "Créer une carte Trello",
    description: `Crée une nouvelle carte (ex. nouveau prospect) dans une liste donnée.

Le list_id s'obtient via trello_get_board. La carte est ajoutée en haut de la liste.

Retour (JSON) : la carte créée (id, name, url…).`,
    inputSchema: {
      list_id: z.string().min(8).describe("Identifiant de la liste (colonne) de destination"),
      name: z.string().min(1).max(500).describe("Titre de la carte (ex. « Primeurs Dupont — Rungis »)"),
      desc: z.string().max(10_000).optional().describe("Description (contexte, contact, téléphone…)"),
      due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD").optional()
        .describe("Échéance (ex. date de relance), format YYYY-MM-DD"),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async ({ list_id, name, desc, due }) => {
    try {
      const card = await api<TrelloCard>("POST", "cards", { idList: list_id, name, desc, due, pos: "top" });
      return success({ created: true, card: compactCard(card) });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "trello_update_card",
  {
    title: "Mettre à jour / déplacer une carte Trello",
    description: `Met à jour une carte existante : déplacement vers une autre liste (changement d'étape du pipeline),
renommage, description, échéance de relance.

Seuls les champs fournis sont modifiés. Aucune suppression possible via cet outil.

Exemples :
  - Déplacer vers « Relancé » : { card_id, list_id: <id de la liste Relancé> }
  - Planifier une relance : { card_id, due: "2026-06-12" }

Retour (JSON) : la carte mise à jour.`,
    inputSchema: {
      card_id: z.string().min(8).describe("Identifiant de la carte à modifier"),
      list_id: z.string().min(8).optional().describe("Nouvelle liste (déplace la carte)"),
      name: z.string().min(1).max(500).optional().describe("Nouveau titre"),
      desc: z.string().max(10_000).optional().describe("Nouvelle description (remplace l'existante)"),
      due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD").optional()
        .describe("Nouvelle échéance, format YYYY-MM-DD"),
      due_complete: z.boolean().optional().describe("Marquer l'échéance comme traitée (true) ou non (false)"),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async ({ card_id, list_id, name, desc, due, due_complete }) => {
    try {
      if (!list_id && !name && desc === undefined && !due && due_complete === undefined) {
        return failure(new Error("Aucun champ à modifier : fournissez au moins list_id, name, desc, due ou due_complete."));
      }
      const card = await api<TrelloCard>("PUT", `cards/${card_id}`, {
        idList: list_id,
        name,
        desc,
        due,
        dueComplete: due_complete,
      });
      return success({ updated: true, card: compactCard(card) });
    } catch (error) {
      return failure(error);
    }
  }
);

server.registerTool(
  "trello_add_comment",
  {
    title: "Commenter une carte Trello",
    description: `Ajoute un commentaire sur une carte — idéal pour consigner le compte-rendu d'un appel
ou d'un échange avec le prospect, sans écraser la description.

Retour (JSON) : confirmation avec la date du commentaire.`,
    inputSchema: {
      card_id: z.string().min(8).describe("Identifiant de la carte"),
      text: z.string().min(1).max(10_000).describe("Texte du commentaire (ex. compte-rendu d'appel)"),
    },
    annotations: WRITE_ANNOTATIONS,
  },
  async ({ card_id, text }) => {
    try {
      const action = await api<{ id: string; date: string }>("POST", `cards/${card_id}/actions/comments`, { text });
      return success({ commented: true, comment_id: action.id, date: action.date });
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
  console.error("Serveur MCP Trello (lecture + écriture, sans suppression) démarré via stdio.");
}

main().catch((error) => {
  console.error("Erreur fatale du serveur :", error);
  process.exit(1);
});
