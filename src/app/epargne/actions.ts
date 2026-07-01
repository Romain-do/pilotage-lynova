"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEpargneAccess } from "@/lib/auth";
import { parseRevolutCsv } from "@/lib/epargne/csv";
import { categoryForRow, applyMerchantCategory } from "@/lib/epargne/report";
import { isExpenseCategory, merchantKeyOf } from "@/lib/epargne/categorize";

// Import CSV des comptes perso (Revolut) — Lot 1.
// Garde requireEpargneAccess : l'action est joignable en POST direct → l'autorisation est
// RE-vérifiée ici, pas seulement en masquant l'UI (§3). Aucune suppression : insert idempotent.

const CHUNK = 1000; // sous la limite de paramètres Postgres pour createMany

/** Résultat d'un import, sérialisable (renvoyé au client via useActionState). */
export interface ImportResult {
  ok: boolean;
  imported: number; // lignes réellement insérées
  duplicates: number; // lignes valides déjà présentes (fichier + base) → ignorées
  excluded: number; // total écarté (RENVOYÉ + devise + produit inconnu + illisible)
  breakdown: {
    reverted: number;
    otherCurrency: number;
    unknownProduct: number;
    malformed: number;
  };
  warnings: string[];
  error?: string;
}

export async function importEpargneCsv(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  await requireEpargneAccess();

  const empty: ImportResult = {
    ok: false,
    imported: 0,
    duplicates: 0,
    excluded: 0,
    breakdown: { reverted: 0, otherCurrency: 0, unknownProduct: 0, malformed: 0 },
    warnings: [],
  };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...empty, error: "Aucun fichier fourni." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ...empty, error: "Fichier trop volumineux (max 10 Mo)." };
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    return { ...empty, error: "Lecture du fichier impossible." };
  }

  const parsed = parseRevolutCsv(content);
  const excluded =
    parsed.excludedReverted + parsed.excludedOtherCurrency + parsed.excludedUnknownProduct + parsed.malformed;

  // Catégorisation à l'import (Lot 2) : chaque dépense COURANT reçoit sa catégorie (mapping mémorisé
  // → règles → « Autres ») ; les non-dépenses restent nulles. Le mapping est chargé une fois.
  const mapping = new Map((await prisma.merchantCategory.findMany()).map((m) => [m.merchantKey, m.category]));
  const data = parsed.rows.map((r) => ({ ...r, category: categoryForRow(r, mapping) }));

  // Insert idempotent : la contrainte UNIQUE sur dedupeHash + skipDuplicates garantit qu'un
  // réimport n'ajoute aucun doublon. `count` = lignes réellement insérées.
  let imported = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const batch = data.slice(i, i + CHUNK);
    const { count } = await prisma.persoTransaction.createMany({ data: batch, skipDuplicates: true });
    imported += count;
  }

  if (imported > 0) revalidatePath("/epargne");

  return {
    ok: true,
    imported,
    duplicates: parsed.rows.length - imported,
    excluded,
    breakdown: {
      reverted: parsed.excludedReverted,
      otherCurrency: parsed.excludedOtherCurrency,
      unknownProduct: parsed.excludedUnknownProduct,
      malformed: parsed.malformed,
    },
    warnings: parsed.warnings,
  };
}

/** Résultat d'une correction de catégorie (marchand). */
export interface RecategorizeResult {
  ok: boolean;
  updated?: number;
  error?: string;
}

/**
 * Correction manuelle mémorisée : réassigne la catégorie d'un marchand. Enregistre merchantKey →
 * category dans MerchantCategory et recatégorise toutes les transactions de ce marchand (→ automatique
 * les mois suivants). Garde requireEpargneAccess (joignable en POST direct).
 */
export async function recategorizeMerchant(_prev: RecategorizeResult | null, formData: FormData): Promise<RecategorizeResult> {
  await requireEpargneAccess();

  const category = String(formData.get("category") ?? "");
  // Accepte soit une merchantKey déjà normalisée, soit une description brute (normalisée ici).
  const rawKey = String(formData.get("merchantKey") ?? "");
  const description = String(formData.get("description") ?? "");
  const merchantKey = rawKey.trim() || merchantKeyOf(description);

  if (!merchantKey) return { ok: false, error: "Marchand introuvable." };
  if (!isExpenseCategory(category)) return { ok: false, error: "Catégorie invalide." };

  const updated = await applyMerchantCategory(merchantKey, category);
  revalidatePath("/epargne");
  return { ok: true, updated };
}

/** Résultat d'un basculement d'exclusion. */
export interface ToggleExcludedResult {
  ok: boolean;
  excluded?: boolean;
  error?: string;
}

/**
 * Exclut / réintègre une transaction du budget (avance remboursée). Bascule `excluded`.
 * Une transaction exclue reste stockée et visible (grisée) mais hors total/catégories du rapport.
 * Garde requireEpargneAccess (joignable en POST direct).
 */
export async function toggleExcluded(_prev: ToggleExcludedResult | null, formData: FormData): Promise<ToggleExcludedResult> {
  await requireEpargneAccess();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Transaction introuvable." };

  const tx = await prisma.persoTransaction.findUnique({ where: { id }, select: { excluded: true } });
  if (!tx) return { ok: false, error: "Transaction introuvable." };

  const excluded = !tx.excluded;
  await prisma.persoTransaction.update({ where: { id }, data: { excluded } });
  revalidatePath("/epargne");
  return { ok: true, excluded };
}
