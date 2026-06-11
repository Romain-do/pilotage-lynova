// Présence de la configuration Supabase. Tant que les secrets ne sont pas remplis
// (avant le premier déploiement), l'app boote en mode « non configuré » : le middleware
// laisse passer et l'écran d'accueil affiche les instructions de configuration.
// Une fois les variables renseignées, l'authentification et le cloisonnement s'activent.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Clé API « publishable » (remplace l'ancienne « anon »). Exposée au navigateur (NEXT_PUBLIC_).
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
}
