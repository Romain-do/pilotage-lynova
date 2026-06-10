# Lynova — Cockpit de pilotage · Spécification technique

Document de référence pour la construction de l'application web (à réaliser avec Claude Code).
Il capture toute la logique métier validée pendant la phase de prototypage. À lire en entier avant de coder.

---

## 1. Objectif

Application web privée permettant à Romain (dirigeant de Lynova) de piloter en un seul endroit :

- **Finances** de l'entreprise (trésorerie, liquidités, dépenses) — données Revolut Business
- **Facturation** (CA, abonnements vs installations, encours, retards) — données Evoliz
- **Prospection** (pipeline commercial, relances) — **natif dans l'app** (remplace Trello)

Accessible depuis ordinateur, tablette et mobile. Connexion sécurisée par lien magique (passwordless).
Deux rôles utilisateurs avec cloisonnement strict.

---

## 2. Stack technique recommandée

| Couche | Choix | Raison |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | SSR + API routes dans un seul projet, déploiement Vercel natif |
| Hébergement | **Vercel** | Cron intégré, variables d'env chiffrées, preview deployments |
| Base de données | **Supabase (Postgres)** — compte existant | Source de vérité prospection + cache snapshots ; Row Level Security en bonus |
| ORM | **Prisma** | Typage fort, migrations |
| Auth | **Supabase Auth — magic link** (e-mails via SMTP Resend) | Passwordless intégré, gestion utilisateurs & rôles native |
| Envoi e-mail | **Resend** — compte existant | SMTP des magic links + alertes (cron, expiration token) |
| UI | **Tailwind CSS** + composants maison | Responsive rapide, cohérent avec la charte |
| Graphiques | **Chart.js** (react-chartjs-2) | Déjà maîtrisé dans le prototype |
| Drag & drop kanban | **dnd-kit** | Léger, accessible, tactile (mobile) |

**Comptes existants à réutiliser : Vercel (hébergement), Supabase (base + auth), Resend (e-mail).**
Stack verrouillée : Supabase fournit la base de données **et** l'authentification magic link ;
Resend est branché comme SMTP custom dans Supabase Auth ; Vercel héberge + exécute le cron.

**Sécurité des rôles renforcée par Supabase RLS** : en plus du contrôle dans les API routes (§3),
activer des politiques Row Level Security pour que la base elle-même refuse à un `COMMERCIAL` toute
lecture des données financières — double barrière (application + base).

---

## 3. Authentification (magic link) & rôles

### Flux magic link
1. L'utilisateur saisit son e-mail sur la page de connexion.
2. Auth.js génère un jeton à usage unique, expirant (~10 min), envoyé par Resend.
3. Le clic sur le lien crée la session (cookie httpOnly, secure, sameSite=strict).
4. Aucun mot de passe n'existe nulle part.

### Rôles (RBAC)
| Rôle | Accès |
|---|---|
| `DIRIGEANT` | Cockpit, Trésorerie, Facturation, Prospection (lecture + écriture) |
| `COMMERCIAL` | Prospection uniquement (lecture + écriture) |

**Règle de sécurité non négociable :** le cloisonnement est appliqué **côté serveur**, dans chaque
API route et chaque server component. Un `COMMERCIAL` qui appelle `/api/finance/*` reçoit un `403`,
quelle que soit l'URL tapée. Le masquage UI ne suffit pas — il double le contrôle serveur, il ne le remplace pas.

### Gestion des utilisateurs
- Écran admin (DIRIGEANT seul) : lister, inviter (par e-mail), changer le rôle, révoquer.
- L'invitation envoie un magic link ; l'utilisateur n'a aucun mot de passe à définir.
- Première liste : Romain (DIRIGEANT), Méganne (COMMERCIAL).
- **Récupération d'accès** : le magic link seul = risque de verrouillage si la boîte mail est perdue.
  Prévoir au moins un de ces filets : un second e-mail admin de secours, ou des codes de récupération
  à usage unique générés à la création du compte dirigeant.
- Rate limiting sur l'envoi de magic links (anti-abus / anti-spam).

---

## 4. Intégrations & sources de données

Le code d'authentification des trois API a déjà été écrit dans les serveurs MCP du prototype —
**à réutiliser** (dossiers `evoliz-mcp-server`, `revolut-mcp-server`, `trello-mcp-server`, fichiers `src/`).

### 4.1 Evoliz (facturation) — lecture seule
- Auth : `POST https://www.evoliz.io/api/login` avec `public_key` + `secret_key` → JWT (valide 15 min, à mettre en cache et renouveler).
- Endpoint clé : `GET /api/v1/companies/{companyid}/invoices`
- **Piège majeur** : sans paramètre de période, l'API ne renvoie que la période courante.
  Pour tout l'historique : `period=custom` + `date_min` + `date_max`. Pagination `page` / `per_page`.
- Détail d'une facture : `GET /api/v1/.../invoices/{invoiceid}` (lignes d'articles).
- **Avoirs (notes de crédit)** : lire aussi `GET /api/v1/.../credits` (même pagination/période). Un avoir
  **réduit le CA** — voir §5.8. Ne jamais calculer un CA sans déduire les avoirs de la période.
- Secrets : `EVOLIZ_PUBLIC_KEY`, `EVOLIZ_SECRET_KEY`, `EVOLIZ_COMPANY_ID` (= 51987).

### 4.2 Revolut Business (trésorerie) — lecture seule
- **Compte confirmé 100 % Lynova** (pas de mélange Mon Primeur / personnel) : aucun filtrage de transactions
  nécessaire, tous les mouvements EUR sont de l'activité Lynova.
- Auth : client assertion JWT RS256 (certificat privé) → échange refresh_token → access_token (40 min).
  Voir `revolut-mcp-server/src/auth.ts` pour le flux complet (déjà fonctionnel).
- Endpoints : `GET /accounts`, `GET /accounts/{id}/bank-details`, `GET /transactions`, `GET /counterparties`.
- **Piège** : `count` max 200 par appel côté API ; découper les périodes pour l'historique complet.
- **Reconnexion** : le refresh_token peut être invalidé (re-consentement) et le certificat expire (5 ans).
  Prévoir un écran admin « Reconnecter Revolut » (re-générer assertion + refresh) **et une alerte** (e-mail)
  quand l'auth échoue, sinon les finances disparaissent sans explication le jour de l'expiration.
- Secrets : `REVOLUT_CLIENT_ID`, `REVOLUT_ISS`, `REVOLUT_PRIVATE_KEY` (PEM), `REVOLUT_REFRESH_TOKEN`.

### 4.3 Trello — IMPORT UNIQUE puis abandon
- Le pipeline devient **natif** (voir §6). Trello sert seulement à la migration initiale.
- Script d'import one-shot : `GET /1/boards/{id}/lists` + `GET /1/boards/{id}/cards` (avec `actions=commentCard`
  pour récupérer l'historique des commentaires). Mapper vers le modèle de données natif.
- Après import validé → Romain peut résilier Trello. L'app ne dépend plus de Trello.

### 4.4 Rafraîchissement
- **Vercel Cron** chaque nuit (ex. 5h) : rafraîchit les snapshots Evoliz + Revolut en base.
- Bouton « Actualiser » manuel disponible dans l'app.
- Les snapshots financiers sont stockés en base (table `finance_snapshot`) → ouverture instantanée,
  pas de dépendance au timing des API à chaque page.

---

## 5. Logique métier financière (À RESPECTER À LA LETTRE)

Ces règles ont été validées et testées dans le prototype. Toute déviation est un bug.

### 5.1 Exercice fiscal
- L'exercice **commence le 1er octobre et finit le 30 septembre**.
- Exercice N = du 1er oct (N-1) au 30 sept (N). Ex. « exercice 2026 » = 01/10/2025 → 30/09/2026.
- `fyOf(date)` = année civile + (mois >= octobre ? 1 : 0).
- Le graphique CA mensuel suit l'axe oct → sept (12 mois), comparé à l'exercice précédent.
- **Tout** filtre « année » du cockpit est un exercice fiscal, jamais une année civile.

### 5.2 Facturation — typologie
- Facture **abonnement** = montant HT (`total.vat_exclude`) **< 2 000 €**.
- Facture **installation** = montant HT **≥ 2 000 €**.
- MRR = somme des factures d'abonnement du dernier mois civil facturé.

### 5.3 Comparaisons N-1 « à date »
- Toujours comparer **la même fenêtre temporelle**. Si l'exercice en cours est arrêté au 5 juin,
  comparer du 1er oct au 5 juin des deux côtés (pas l'exercice précédent complet).
- Pour une période terminée, comparaison pleine.

### 5.4 Trésorerie
- Solde fin de mois = dernier `balance` connu des relevés Revolut pour ce mois (par compte EUR), reporté si mois sans opération. **Ne pas reconstruire** par cumul de deltas.
- Flux net mensuel = encaissements − décaissements, **hors** échanges crypto (`type=exchange`) et virements internes (toutes les jambes sur des comptes propres).

### 5.5 Liquidités totales
- = comptes EUR + comptes USD (converti, taux affiché) + crypto.
- Valorisation crypto : **cours saisi manuellement** (prioritaire, persisté) > sinon **dernier cours implicite**
  d'un échange Revolut (montant EUR ÷ quantité crypto du dernier trade, daté) > sinon coût d'acquisition net.
- Devises crypto = devises de compte hors fiat (EUR/USD/GBP/CHF/JPY/CAD/AUD).
- **Ne jamais** compter les conversions EUR↔USD comme de la crypto.

### 5.6 Abonnements vs charges fixes (dépenses Revolut)
- Un débit récurrent (≥ 3 mois, présent récemment) est retenu **seulement si son montant mensuel est stable**
  (majorité des mois à ±25 % de la médiane). Les dépenses variables (Amazon, courses, restos) sont exclues
  des récurrences et restent dans les catégories.
- Marque de SaaS connue → abonnement. Sinon : stable + code marchand logiciel/télécom → abonnement ; stable autre → charge fixe.
- Carte « Montant moyen payé / mois » = moyenne des décaissements sur **mois complets uniquement** (exclure le mois en cours), répartie abonnements / charges fixes / autres (somme = total).

### 5.7 Catégorisation des dépenses
- Par libellé (regex) d'abord, puis filet de sécurité par code marchand MCC.
- Catégories : Charges sociales, Impôts & taxes, Rémunération & loyer, Logiciels & cloud, Assurances,
  Déplacements, Repas & réception, Télécom & médias, Alimentation & courses, Fournitures & e-commerce, Frais bancaires.

### 5.8 Avoirs (notes de crédit) — déduction du CA
- Le CA d'une période = factures HT de la période **moins** avoirs HT de la même période.
- Un avoir suit la même typologie (abonnement/installation) et la même affectation client que la facture qu'il corrige.
- Les vues Facturation (CA mensuel, top clients, donut abonnements/installations, % N-1) doivent toutes
  intégrer les avoirs en négatif. Ne jamais afficher un CA « brut factures » sans déduction.

### 5.9 Cohérence HT / TTC (règle stricte)
- **Tout indicateur de CA et toute comparaison N-1 sont en HT** (`total.vat_exclude`), des deux côtés.
- Les montants intrinsèquement TTC — « encaissé » (`paid`), « restant dû » / impayés (`net_to_pay`) —
  sont **étiquetés TTC** explicitement et ne sont jamais comparés directement à un montant HT.
- Ne jamais mettre un « facturé HT » et un « encaissé TTC » dans le même ratio ou la même évolution.
  Si un taux d'encaissement est souhaité, comparer TTC facturé vs TTC encaissé.

---

## 6. Prospection native (remplacement de Trello)

### Modèle de données (Prisma — esquisse)
```
Pipeline   { id, name }
Stage      { id, pipelineId, name, position, kind }      // colonnes : meet/warm/hot/cold/low/won/lost
Prospect   { id, stageId, name, company, contact, phone, email,
             reminderAt (nullable), reminderDone (bool),
             dealValue (nullable), position, createdAt, updatedAt }
Comment    { id, prospectId, authorId, body, createdAt }
Activity   { id, prospectId, authorId, type, payload, createdAt }   // journal d'audit
Label      { id, name, color }  /  ProspectLabel { prospectId, labelId }
```

### Fonctionnalités
- **Kanban** avec glisser-déposer (dnd-kit) : déplacer une carte = changer de `Stage`.
- **Fiche prospect** (panneau latéral) : statut, date de rappel, valeur de deal estimée,
  commentaires (composer + historique horodaté signé), libellés.
- **Créer un prospect** : formulaire (nom/société, contact, statut initial, rappel, note).
- **Cocher une relance « faite »** (`reminderDone`).
- Vues complémentaires : relances en retard / cette semaine / planifiées, activité récente, taux de transformation.
- **Pas de suppression physique** : archivage logique uniquement (`archived = true`) — y compris
  l'action « Archiver » du dirigeant. La donnée reste en base, seulement retirée des listes
  (qui filtrent `archived: false`). Cohérent avec la règle de sécurité (§3).

### Migration
1. Script `scripts/import-trello.ts` : lit le tableau « Pipe et ventes », crée Stages + Prospects + Comments.
2. Vérification manuelle (148 cartes attendues).
3. Une fois validé → l'app est autonome, Trello résiliable.

---

## 7. Les 4 vues (front-end)

Charte : bleu nuit `#0A1733` (barre latérale, en-têtes), cyan `#6FD6F2` (accent), fond clair `#F6F8FB`.
Logo : « LYNOVA » blanc, « Y » cyan. **Responsive obligatoire** : barre latérale en rail d'icônes sur desktop,
repliée en menu hamburger sur mobile ; grilles qui passent de 4 colonnes à 1 selon la largeur ; tableaux scrollables.

1. **Cockpit** : 4 KPIs (trésorerie EUR, liquidités totales, CA exercice + % N-1 à date, MRR),
   courbe de trésorerie de l'exercice, flux net mensuel (vert/rouge), actions prioritaires.
2. **Trésorerie** : 2 cartes héros (montant moyen payé/mois + répartition ; liquidités totales + % N-1),
   évolution du solde (sélecteurs 3/6/12/24 mois + « exercice »), encaissements/décaissements (barres),
   abonnements (donut + table), charges fixes (table), dépenses par catégorie (donut + table, période propre),
   placements crypto (saisie du cours par devise).
3. **Facturation** : sélecteur Tout/Abonnements/Installations + sélecteur de période (incl. exercices),
   KPIs avec % N-1 à date, CA mensuel exercice vs exercice-1 (barres), donut poids abonnements/installations,
   carte Clients scindée (tous par CA HT / par mensualité d'abonnement).
4. **Prospection** : voir §6.

Toutes les préférences (période, type, cours crypto saisis) persistées par utilisateur.

---

## 8. Sécurité — checklist

- [ ] Secrets uniquement en variables d'environnement Vercel (jamais commités).
- [ ] Cloisonnement des rôles vérifié dans chaque API route (pas seulement l'UI).
- [ ] Sessions httpOnly + secure + sameSite=strict.
- [ ] Magic links à usage unique, expirants.
- [ ] Aucune suppression destructive (archivage logique).
- [ ] Journal d'audit des écritures prospection (qui a modifié quoi).
- [ ] Rate limiting sur l'envoi de magic links.
- [ ] HTTPS forcé (par défaut sur Vercel).
- [ ] Pas de donnée sensible dans les URL / query strings.

## 8 bis. Exploitation, fiabilité & conformité

- [ ] **Sauvegardes DB automatiques quotidiennes** + rétention. Critique : après résiliation de Trello,
      la base est la seule copie de la prospection. Une perte = données irrécupérables.
- [ ] **Export manuel** de la prospection (CSV/JSON) depuis l'app — filet supplémentaire.
- [ ] **Monitoring & alertes** : e-mail si le cron de nuit échoue, ou si une auth API (Revolut/Evoliz) casse.
- [ ] **Taux de change USD→EUR** : récupérer un taux du jour (ou saisie manuelle, comme pour la crypto) —
      ne pas figer 0,87 en dur.
- [ ] **Tests unitaires de la logique métier (§5)** : exercice fiscal, seuil abo 2 000 € HT, valorisation
      crypto, N-1 à date, déduction des avoirs, stabilité des récurrences. C'est la zone à plus fort risque de régression.
- [ ] **RGPD** : la prospection stocke des données personnelles de tiers (noms, e-mails, téléphones).
      Définir une durée de conservation, permettre l'export et l'effacement d'un prospect, tenir un mini registre.

---

## 9. Ordre de construction suggéré

1. Ossature Next.js + Tailwind + Prisma + DB, déploiement Vercel « hello world » sécurisé.
2. Auth magic link (NextAuth + Resend) + modèle User + rôles + écran connexion.
3. Gestion des utilisateurs (invitation, rôles, révocation).
4. Prospection native (modèle DB, kanban, fiche éditable) + script d'import Trello.
5. Intégration Evoliz (auth réutilisée, snapshots, vue Facturation).
6. Intégration Revolut (auth réutilisée, snapshots, vue Trésorerie).
7. Vue Cockpit (agrège les snapshots).
8. Cron de rafraîchissement nocturne.
9. Passe responsive + polish + tests de la logique métier (§5).
10. Recette → résiliation Trello.

---

## 10. Variables d'environnement (à préparer)

```
DATABASE_URL=
AUTH_SECRET=
AUTH_RESEND_KEY=
EMAIL_FROM=cockpit@lynova.net
EVOLIZ_PUBLIC_KEY=
EVOLIZ_SECRET_KEY=
EVOLIZ_COMPANY_ID=51987
REVOLUT_CLIENT_ID=
REVOLUT_ISS=
REVOLUT_PRIVATE_KEY=
REVOLUT_REFRESH_TOKEN=
TRELLO_API_KEY=        # import unique seulement
TRELLO_TOKEN=          # import unique seulement
```

---

*Réutiliser le code d'auth API déjà écrit dans les dossiers `*-mcp-server/src/` du prototype.
Toute la logique métier financière (§5) y est aussi implémentée et testée — la transposer fidèlement.*
