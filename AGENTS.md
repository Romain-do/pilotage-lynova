<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cockpit Lynova — contexte projet

Application web privée de pilotage (finances Revolut, facturation Evoliz, prospection native).
**`SPECIFICATION.md` est la référence métier** — la lire avant toute évolution. Construction suivant
l'ordre du §9, étape par étape.

## Stack
- Next.js 16 (App Router, TypeScript), Tailwind v4 (config charte dans `src/app/globals.css`).
- **Supabase Auth** (magic link) pour l'authentification utilisateur — choix retenu à la place de NextAuth.
- **Prisma 6** sur Postgres Supabase (`prisma/schema.prisma`). Connexion poolée (`DATABASE_URL`) pour l'app,
  directe (`DIRECT_URL`) pour les migrations.

## Règles non négociables (§3, §8)
- Cloisonnement des rôles (`DIRIGEANT` / `COMMERCIAL`) vérifié **CÔTÉ SERVEUR** dans chaque route et server
  component (helpers dans `src/lib/auth.ts`). Le masquage UI ne suffit jamais.
- Aucune suppression physique : archivage logique uniquement.
- Secrets uniquement en variables d'environnement (voir `.env.example`). Jamais committés.

## Repères
- `reference/` = code d'auth des API externes (Evoliz/Revolut/Trello) du prototype, **à transposer** aux
  étapes 4-6. Exclu de la compilation (`tsconfig.json`). La logique métier financière (§5) y est implémentée.
- Mode « bootstrap » : tant que Supabase n'est pas configuré, l'app boote et affiche les instructions
  (`isSupabaseConfigured()` dans `src/lib/supabase/config.ts`).
