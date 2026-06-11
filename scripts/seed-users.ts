/**
 * Seed des premiers utilisateurs (§3 : « Première liste : Romain (DIRIGEANT), Méganne (COMMERCIAL) »).
 *
 * Crée le compte côté Supabase Auth (email confirmé, sans mot de passe → connexion par magic link)
 * puis le profil applicatif (table app_user) avec le rôle. Idempotent : relançable sans risque.
 *
 * Lancer :  npm run seed:users
 *
 * Variables (depuis .env.local) :
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY   (requis)
 *   SEED_DIRIGEANT_EMAIL   (défaut: romain@lynova.net)
 *   SEED_DIRIGEANT_NAME    (défaut: Romain)
 *   SEED_COMMERCIAL_EMAIL  (optionnel — ex. l'adresse de Méganne)
 *   SEED_COMMERCIAL_NAME   (défaut: Méganne)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type User } from "@supabase/supabase-js";
import { PrismaClient, Role } from "@prisma/client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "ERREUR : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis dans .env.local."
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  name: string;
  role: Role;
}

const seedUsers: SeedUser[] = [
  {
    email: (process.env.SEED_DIRIGEANT_EMAIL ?? "romain@lynova.net").toLowerCase(),
    name: process.env.SEED_DIRIGEANT_NAME ?? "Romain",
    role: Role.DIRIGEANT,
  },
];

if (process.env.SEED_COMMERCIAL_EMAIL) {
  seedUsers.push({
    email: process.env.SEED_COMMERCIAL_EMAIL.toLowerCase(),
    name: process.env.SEED_COMMERCIAL_NAME ?? "Méganne",
    role: Role.COMMERCIAL,
  });
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  for (const u of seedUsers) {
    let authUser = await findAuthUserByEmail(u.email);

    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        email_confirm: true,
      });
      if (error) throw error;
      authUser = data.user;
      console.log(`✔ Compte Auth créé        : ${u.email}`);
    } else {
      console.log(`• Compte Auth déjà présent : ${u.email}`);
    }

    await prisma.user.upsert({
      where: { id: authUser.id },
      update: { email: u.email, name: u.name, role: u.role, active: true },
      create: { id: authUser.id, email: u.email, name: u.name, role: u.role, active: true },
    });
    console.log(`✔ Profil app_user           : ${u.email} → ${u.role}`);
  }

  console.log("\nSeed terminé. Ces utilisateurs peuvent se connecter par magic link.");
}

main()
  .catch((e) => {
    console.error("Échec du seed :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
