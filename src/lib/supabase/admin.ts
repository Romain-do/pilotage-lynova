import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Client Supabase à privilèges élevés (clé API SECRET, ex-« service_role »).
//
// ⚠️ USAGE SERVEUR UNIQUEMENT (server actions / route handlers). Ne jamais l'importer
// depuis un composant client : la clé secret contourne toute sécurité (RLS incluse).
// Ce fichier ne porte pas la directive "use client" et n'est référencé que par du code serveur.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !secretKey) {
    throw new Error(
      "Supabase admin non configuré (NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY manquant)."
    );
  }
  return createClient(SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
