import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { prisma } from "@/lib/prisma";

// Garde d'authentification + d'autorisation CÔTÉ SERVEUR.
//
// RÈGLE NON NÉGOCIABLE (§3) : le cloisonnement des rôles est appliqué côté serveur,
// dans chaque server component et chaque route handler. Le masquage UI ne suffit jamais.
// - getCurrentUser() : identité + rôle (table app_user), ou null. Ne redirige pas → usage API.
// - requireUser()    : exige une session valide, redirige vers /login sinon.
// - requireRole()    : exige un rôle, redirige vers l'accueil sinon (usage page).

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
}

/**
 * Utilisateur courant : croise la session Supabase avec le profil applicatif (rôle).
 * Renvoie null si non authentifié, ou si le profil est absent / désactivé.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile || !profile.active) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    active: profile.active,
  };
}

/** Exige un utilisateur authentifié et habilité ; redirige vers /login sinon. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige l'un des rôles fournis ; redirige vers l'accueil si non autorisé (usage page). */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

/** Raccourci : exige le rôle DIRIGEANT. */
export async function requireDirigeant(): Promise<SessionUser> {
  return requireRole("DIRIGEANT");
}
