"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { checkMagicLinkRateLimit } from "@/lib/ratelimit";

export interface LoginState {
  ok: boolean;
  message: string;
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

const GENERIC_SUCCESS =
  "Si un compte existe pour cette adresse, un lien de connexion vient d'être envoyé. Vérifiez votre boîte mail.";

export async function requestMagicLink(
  _prev: LoginState | null,
  formData: FormData
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
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

  const origin =
    h.get("origin") ??
    (h.get("host") ? `https://${h.get("host")}` : process.env.NEXT_PUBLIC_SITE_URL ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Application privée : seuls les comptes déjà invités (étape 3) peuvent se connecter.
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=/`,
    },
  });

  if (error) {
    // On NE révèle PAS si l'adresse existe (anti-énumération §8). Log côté serveur seulement.
    console.error("[magic-link] signInWithOtp:", error.message);
  }

  return { ok: true, message: GENERIC_SUCCESS };
}
