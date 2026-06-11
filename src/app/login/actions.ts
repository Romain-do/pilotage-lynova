"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { checkMagicLinkRateLimit } from "@/lib/ratelimit";

// Connexion par CODE OTP à 8 chiffres (2 étapes), sans mot de passe.
//   Étape 1 : signInWithOtp({ email, shouldCreateUser: false }) → Supabase envoie le code.
//   Étape 2 : verifyOtp({ email, token, type: "email" }) → session + redirection home.
// Appli privée : shouldCreateUser=false → seuls les comptes déjà invités (§3) se connectent.

export interface RequestState {
  ok: boolean;
  message: string;
  email?: string; // renvoyé à l'étape 2 (pré-rempli côté client)
}

export interface VerifyState {
  ok: boolean;
  message: string;
}

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  token: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "Le code comporte 8 chiffres."),
});

const GENERIC_SENT =
  "Si un compte existe pour cette adresse, un code à 8 chiffres vient d'être envoyé. Vérifiez votre boîte mail.";

/** Étape 1 — demande d'un code OTP (rate-limité, anti-énumération). */
export async function requestOtp(
  _prev: RequestState | null,
  formData: FormData
): Promise<RequestState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, message: "Adresse e-mail invalide." };
  }
  const { email } = parsed.data;

  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Authentification non configurée. Contactez l'administrateur." };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const rl = await checkMagicLinkRateLimit(email, ip);
  if (!rl.allowed) {
    return { ok: false, message: rl.message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Pas de création auto : seuls les utilisateurs existants reçoivent un code.
    options: { shouldCreateUser: false },
  });

  if (error) {
    // On NE révèle PAS si l'adresse existe (anti-énumération §8). Log côté serveur seulement.
    console.error("[otp] signInWithOtp:", error.message);
  }

  // Toujours « ok » → on passe à l'étape code sans divulguer l'existence du compte.
  return { ok: true, message: GENERIC_SENT, email };
}

/** Étape 2 — vérification du code. Succès → session posée puis redirection home. */
export async function verifyOtp(
  _prev: VerifyState | null,
  formData: FormData
): Promise<VerifyState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Code invalide." };
  }
  const { email, token } = parsed.data;

  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Authentification non configurée. Contactez l'administrateur." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    console.error("[otp] verifyOtp:", error.message);
    return { ok: false, message: "Code invalide ou expiré. Réessayez ou renvoyez un code." };
  }

  // Session écrite dans les cookies (httpOnly) par le client serveur → on redirige.
  redirect("/");
}
