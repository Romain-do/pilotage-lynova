import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Client Supabase à privilèges élevés (clé SERVICE ROLE).
//
// ⚠️ USAGE SERVEUR UNIQUEMENT (server actions / route handlers). Ne jamais l'importer
// depuis un composant client : la clé service role contourne toute sécurité (RLS incluse).
// Ce fichier ne porte pas la directive "use client" et n'est référencé que par du code serveur.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceKey) {
    throw new Error(
      "Supabase admin non configuré (NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant)."
    );
  }
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
