"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

// Server actions de gestion des utilisateurs (§3, DIRIGEANT seul).
//
// SÉCURITÉ : une server action est joignable par POST direct, hors UI. Chaque action
// re-vérifie donc l'autorisation (requireDirigeant) — le masquage UI ne suffit jamais.
// Aucune suppression physique : la « révocation » est un archivage logique (active=false).

export interface ActionState {
  ok: boolean;
  message: string;
}

const ROLES = ["DIRIGEANT", "COMMERCIAL"] as const;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  role: z.enum(ROLES),
});

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

const statusSchema = z.object({
  userId: z.string().uuid(),
  active: z.enum(["true", "false"]),
});

/** Nombre de DIRIGEANT actifs — sert au filet anti-verrouillage (§3). */
async function countActiveDirigeants(): Promise<number> {
  return prisma.user.count({ where: { role: "DIRIGEANT", active: true } });
}

/** Recherche un compte Supabase Auth par e-mail (pagination). */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<SupabaseAuthUser | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

/**
 * Invite un utilisateur : crée le compte Supabase Auth (sans mot de passe → magic link)
 * et le profil applicatif (rôle). L'invité se connecte ensuite via l'écran de connexion.
 */
export async function inviteUser(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireDirigeant();

  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Authentification non configurée." };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Champs invalides : vérifiez l'e-mail et le rôle." };
  }
  const { email, name, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return existing.active
      ? { ok: false, message: `${email} est déjà membre.` }
      : {
          ok: false,
          message: `${email} existe mais est archivé. Réactivez-le depuis la liste ci-dessous.`,
        };
  }

  try {
    const admin = createAdminClient();

    // Création directe du compte, SANS aucun e-mail (l'accès est partagé manuellement).
    // Le compte Auth peut déjà exister (créé hors app, ou lors de tests précédents).
    let authUser = await findAuthUserByEmail(admin, email);
    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true, // confirmé d'office : la connexion se fera par magic link
      });
      if (error) throw error;
      authUser = data.user;
    }

    await prisma.user.create({
      data: { id: authUser.id, email, name, role: role as Role, active: true },
    });
  } catch (e) {
    console.error("[admin] inviteUser:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Échec de la création du compte. Réessayez." };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    message: `Compte créé pour ${email} (${roleLabel(
      role as Role
    )}). Aucun e-mail envoyé — communiquez-lui l'accès vous-même.`,
  };
}

/** Change le rôle d'un utilisateur. Protège le dernier DIRIGEANT actif. */
export async function updateUserRole(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  await requireDirigeant();

  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Requête invalide." };
  }
  const { userId, role } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, message: "Utilisateur introuvable." };
  }
  if (target.role === role) {
    return { ok: true, message: "Rôle inchangé." };
  }

  // Filet anti-verrouillage : ne pas rétrograder le dernier DIRIGEANT actif.
  if (target.role === "DIRIGEANT" && role === "COMMERCIAL" && target.active) {
    if ((await countActiveDirigeants()) <= 1) {
      return {
        ok: false,
        message: "Impossible : il doit rester au moins un dirigeant actif.",
      };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role: role as Role } });
  revalidatePath("/admin");
  return { ok: true, message: `Rôle mis à jour : ${roleLabel(role as Role)}.` };
}

/** Révoque (archive) ou réactive un utilisateur. Jamais de suppression physique (§3/§8). */
export async function setUserActive(
  _prev: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const me = await requireDirigeant();

  const parsed = statusSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Requête invalide." };
  }
  const { userId } = parsed.data;
  const active = parsed.data.active === "true";

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return { ok: false, message: "Utilisateur introuvable." };
  }

  if (!active) {
    // Révocation : garde-fous.
    if (target.id === me.id) {
      return { ok: false, message: "Vous ne pouvez pas révoquer votre propre compte." };
    }
    if (target.role === "DIRIGEANT" && target.active && (await countActiveDirigeants()) <= 1) {
      return {
        ok: false,
        message: "Impossible : il doit rester au moins un dirigeant actif.",
      };
    }
  }

  if (target.active === active) {
    return { ok: true, message: active ? "Déjà actif." : "Déjà archivé." };
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/admin");
  return {
    ok: true,
    message: active ? "Utilisateur réactivé." : "Utilisateur révoqué (archivé).",
  };
}

function roleLabel(role: Role): string {
  return role === "DIRIGEANT" ? "Dirigeant" : "Commercial";
}
