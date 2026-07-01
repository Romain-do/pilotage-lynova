// Parseur des exports CSV Revolut (comptes perso) — Lot 1.
//
// Pièges réels traités (cf. cahier des charges) :
//  - vrai parseur CSV (RFC 4180) : champs entre guillemets pouvant contenir des virgules
//    (ex. « …Intérêts nets versés … le Nov 3, 2025 ») → surtout PAS un split(',') naïf ;
//  - décodage des entités HTML (&#39; → ', &amp; → &…) présentes dans « Description » ;
//  - séparation des comptes via la colonne « Produit » (Valeur actuelle / Dépôt) ;
//  - exclusion des lignes « État » = RENVOYÉ ;
//  - devises : on conserve EUR, on signale toute autre devise (ligne écartée) ;
//  - dédoublonnage : dedupeHash = sha256(startedAt|amount|description|balance), stable au
//    réimport (calculé sur les valeurs BRUTES du CSV pour ne pas dépendre du parsing des dates).

import { createHash } from "crypto";
import { PersoAccount } from "@prisma/client";

/** En-têtes attendus de l'export Revolut FR (l'ordre réel est déduit de la ligne d'en-tête). */
const HEADERS = {
  type: "Type",
  product: "Produit",
  startedAt: "Date de début",
  completedAt: "Date de fin",
  description: "Description",
  amount: "Montant",
  fee: "Frais",
  currency: "Devise",
  state: "État",
  balance: "Solde",
} as const;

/** Une transaction validée, prête à être stockée (montants en chaîne pour Prisma Decimal). */
export interface ParsedTx {
  account: PersoAccount;
  type: string;
  description: string;
  amount: string;
  fee: string;
  currency: string;
  startedAt: Date;
  completedAt: Date | null;
  balance: string;
  state: string;
  dedupeHash: string;
}

/** Résultat du parsing d'un fichier complet. */
export interface ParseResult {
  rows: ParsedTx[];
  excludedReverted: number; // lignes « RENVOYÉ »
  excludedOtherCurrency: number; // devise ≠ EUR
  excludedUnknownProduct: number; // « Produit » non reconnu
  malformed: number; // lignes illisibles (colonnes manquantes, montant/date invalide)
  warnings: string[]; // messages à remonter à l'utilisateur (devises exotiques…)
}

/**
 * Tokenise un texte CSV en lignes de champs, façon RFC 4180 :
 * guillemets doubles pour échapper virgules/retours-ligne, `""` = un guillemet littéral.
 */
export function tokenizeCsv(input: string): string[][] {
  // Retire un éventuel BOM UTF-8.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // au moins un caractère / séparateur vu sur la ligne courante

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consomme le second guillemet
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      started = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      started = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++; // CRLF → un seul saut
      if (started || field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
      started = false;
    } else {
      field += c;
      started = true;
    }
  }

  // Dernière ligne sans saut final.
  if (started || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Décode les entités HTML rencontrées dans les libellés (&#39;, &amp;, &quot;…). */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // en dernier : évite de ré-interpréter un `&` déjà décodé
}

function codePoint(n: number): string {
  return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/** Mappe la colonne « Produit » vers un compte, ou null si non reconnu. */
function mapAccount(product: string): PersoAccount | null {
  const p = product.trim().toLowerCase();
  if (p === "valeur actuelle") return PersoAccount.COURANT;
  if (p === "dépôt" || p === "depot") return PersoAccount.EPARGNE;
  return null;
}

/** Parse un horodatage « 2025-06-05 10:12:00 » (interprété en UTC pour un résultat déterministe). */
function parseDateTime(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalise un montant « -40.24 » / « 12000.00 » en chaîne décimale, ou null si invalide. */
function parseAmount(raw: string): string | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

/** Empreinte de dédoublonnage : valeurs BRUTES (hors devise/frais) → stable au réimport. */
export function computeDedupeHash(startedRaw: string, amountRaw: string, description: string, balanceRaw: string): string {
  return createHash("sha256")
    .update([startedRaw.trim(), amountRaw.trim(), description, balanceRaw.trim()].join("|"))
    .digest("hex");
}

/**
 * Parse un export CSV Revolut complet. Ne touche PAS à la base : renvoie les lignes valides
 * (dédoublonnées AU SEIN du fichier) + le décompte des lignes écartées et les avertissements.
 */
export function parseRevolutCsv(content: string): ParseResult {
  const result: ParseResult = {
    rows: [],
    excludedReverted: 0,
    excludedOtherCurrency: 0,
    excludedUnknownProduct: 0,
    malformed: 0,
    warnings: [],
  };

  const table = tokenizeCsv(content).filter((r) => r.some((c) => c.trim().length > 0));
  if (table.length === 0) {
    result.warnings.push("Fichier vide.");
    return result;
  }

  // En-tête : on mappe chaque colonne attendue vers son index réel (robuste à un ordre différent).
  const header = table[0].map((h) => h.trim());
  const col = {} as Record<keyof typeof HEADERS, number>;
  const missing: string[] = [];
  for (const [key, label] of Object.entries(HEADERS) as [keyof typeof HEADERS, string][]) {
    const idx = header.findIndex((h) => h.toLowerCase() === label.toLowerCase());
    if (idx === -1) missing.push(label);
    col[key] = idx;
  }
  if (missing.length) {
    result.warnings.push(`En-tête CSV non reconnu (colonnes manquantes : ${missing.join(", ")}).`);
    return result;
  }

  const currencies = new Set<string>();
  const seen = new Set<string>(); // dédoublonnage intra-fichier

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const get = (k: keyof typeof HEADERS) => (cells[col[k]] ?? "").trim();

    // Exclusion des lignes renvoyées (remboursées/annulées).
    const state = get("state");
    if (state.toUpperCase() === "RENVOYÉ") {
      result.excludedReverted++;
      continue;
    }

    const account = mapAccount(get("product"));
    if (!account) {
      result.excludedUnknownProduct++;
      continue;
    }

    const currency = get("currency").toUpperCase();
    if (currency !== "EUR") {
      currencies.add(currency || "(vide)");
      result.excludedOtherCurrency++;
      continue;
    }

    const amountRaw = get("amount");
    const balanceRaw = get("balance");
    const startedRaw = get("startedAt");
    const amount = parseAmount(amountRaw);
    const balance = parseAmount(balanceRaw);
    const fee = parseAmount(get("fee")) ?? "0";
    const startedAt = parseDateTime(startedRaw);
    if (amount === null || balance === null || startedAt === null) {
      result.malformed++;
      continue;
    }

    const description = decodeHtmlEntities(get("description"));
    const dedupeHash = computeDedupeHash(startedRaw, amountRaw, description, balanceRaw);

    // Doublon dans le fichier lui-même (ex. ligne dupliquée) → ignoré silencieusement.
    if (seen.has(dedupeHash)) continue;
    seen.add(dedupeHash);

    result.rows.push({
      account,
      type: get("type"),
      description,
      amount,
      fee,
      currency,
      startedAt,
      completedAt: parseDateTime(get("completedAt")),
      balance,
      state,
      dedupeHash,
    });
  }

  if (currencies.size > 0) {
    result.warnings.push(
      `Devise(s) autre(s) qu'EUR détectée(s) et ignorée(s) : ${[...currencies].join(", ")}.`,
    );
  }

  return result;
}
