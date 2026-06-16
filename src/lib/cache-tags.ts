// Source unique des tags de cache `unstable_cache`. Centralisé pour éviter qu'une divergence entre
// l'ÉCRITURE du cache (loaders, option `tags`) et son INVALIDATION (cron `revalidateTag`, `refreshAll`
// `updateTag`, mutations prospection) crée un tag mort silencieux suite à une faute de frappe.
// NB : la clé `source` de SyncState utilise un autre nommage (« evoliz_buys », underscore) — sans
// rapport avec ces tags de cache (tirets).
export const CACHE_TAGS = {
  evolizInvoices: "evoliz-invoices",
  evolizBuys: "evoliz-buys",
  revolut: "revolut",
  prospection: "prospection",
} as const;
