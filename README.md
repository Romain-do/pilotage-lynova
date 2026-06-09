# Cockpit Lynova

Application web privée de pilotage de Lynova : **finances** (Revolut), **facturation** (Evoliz) et
**prospection** native (remplace Trello). Spécification complète : [`SPECIFICATION.md`](./SPECIFICATION.md).

## Stack

- **Next.js 16** (App Router, TypeScript) · **Tailwind CSS v4**
- **Supabase** — Auth (magic link) + Postgres
- **Prisma 6** (ORM)
- Déploiement cible : **Vercel**

## Mise en route (développement)

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Copier `.env.example` en `.env.local` et renseigner les secrets Supabase :
   - `DATABASE_URL` (pooler PgBouncer, port 6543) et `DIRECT_URL` (direct, port 5432)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
3. Créer le schéma en base :
   ```bash
   npm run db:migrate
   ```
4. Lancer le serveur de dev :
   ```bash
   npm run dev
   ```

> Tant que Supabase n'est pas configuré, l'application démarre en **mode bootstrap** et affiche les
> instructions de configuration sur la page d'accueil.

## Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (génère le client Prisma puis compile) |
| `npm run start` | Serveur de production |
| `npm run db:migrate` | Migration Prisma (dev) |
| `npm run db:deploy` | Migration Prisma (prod / CI) |
| `npm run db:studio` | Prisma Studio |

## Structure

```
src/
  app/            Routes (App Router) : / (accueil sécurisé), /login, /auth/signout
  components/     Composants UI (Logo…)
  lib/
    auth.ts       Gardes d'authentification CÔTÉ SERVEUR (cloisonnement des rôles)
    prisma.ts     Singleton Prisma
    supabase/     Clients Supabase (server / browser / middleware) + détection config
middleware.ts     Protection des routes + rafraîchissement de session
prisma/
  schema.prisma   Modèle de données (étape 1 : utilisateurs + rôles)
reference/        Code d'auth des API externes du prototype (à transposer, hors compilation)
```

## État de construction (ordre du §9)

- [x] **1. Ossature** — Next.js + Tailwind + Prisma + Supabase + accueil sécurisé
- [x] **2. Auth magic link** — Supabase OTP, modèle User + rôles, écran de connexion, rate limiting
- [x] **3. Gestion des utilisateurs** — écran /admin (DIRIGEANT) : ajouter, changer le rôle, révoquer/réactiver (archivage logique)
- [~] **4. Prospection native** — 3 vues (Liste / Agenda / Pipeline), 7 statuts, groupes, rappels, commentaires (import Trello à suivre)
- [ ] 5. Intégration Evoliz (facturation)
- [ ] 6. Intégration Revolut (trésorerie)
- [ ] 7. Vue Cockpit
- [ ] 8. Cron de rafraîchissement nocturne
- [ ] 9. Responsive + polish + tests métier (§5)
- [ ] 10. Recette → résiliation Trello
