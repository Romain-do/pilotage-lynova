// Moteur de catégorisation des dépenses perso (compte COURANT joint) — Lot 2.
// Même esprit que src/lib/tresorerie.ts (règles ordonnées, 1re qui matche gagne, libellé+bénéficiaire
// normalisés) mais avec des catégories PERSO. Fonction pure : aucune I/O — la table des corrections
// mémorisées (MerchantCategory) est injectée via `mapping` par la couche données (data.ts).
//
// Priorité de catégorisation (categorizeExpense) :
//   (a) correction mémorisée MerchantCategory  (mapping : merchantKey → catégorie)
//   (b) règles marchand génériques (enseignes FR ci-dessous)
//   (c) « Autres »

export const EXPENSE_CATEGORIES = [
  "Alimentation",
  "Restaurants & bars",
  "Transport & carburant",
  "Logement & charges",
  "Maison & bricolage",
  "Santé & pharmacie",
  "Beauté / Coiffure",
  "Animaux",
  "Loisirs & sorties",
  "Shopping & vêtements",
  "Amazon",
  "Jouets / Cadeaux",
  "Cigarette électronique",
  "Abonnements",
  "Impôts / URSSAF",
  "Virements Romain",
  "Virements Meg",
  "Virements divers",
  "Retraits",
  "Autres",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(EXPENSE_CATEGORIES);

/** True si `c` est une catégorie de dépense valide (garde des entrées serveur). */
export function isExpenseCategory(c: string): c is ExpenseCategory {
  return CATEGORY_SET.has(c);
}

/** Normalisation partagée : minuscules, accents retirés, espaces compactés. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clé marchand d'une transaction = description normalisée (cf. cahier des charges).
 * Sert de `merchantKey` unique dans MerchantCategory et de jointure pour recatégoriser
 * toutes les transactions d'un même marchand.
 */
export function merchantKeyOf(description: string): string {
  return norm(description);
}

/**
 * Détecte un virement interne vers le compte épargne (« …Compte d'épargne »). Ces mouvements
 * ne sont PAS des dépenses : ils sont exclus du périmètre « dépenses du compte courant ».
 */
export function isSavingsTransfer(description: string): boolean {
  return norm(description).includes("epargne");
}

/** Montant convertible en nombre : littéral ou objet Decimal (Prisma) via toString/valueOf. */
type Numeric = number | string | { toString(): string };

/**
 * True si la ligne COURANT est une VRAIE dépense : débit (montant < 0) qui n'est NI un transfert
 * interne vers l'épargne, NI un virement au foyer (Romain/Meg). Ces virements nominatifs sont
 * hors périmètre « dépenses » (au même titre que les transferts d'épargne) → exclus du total, du
 * donut, du Top 10 et de la distinction consommation. (Le filtre account = COURANT est fait en amont.)
 */
export function isExpenseRow(row: { amount: Numeric; description: string }): boolean {
  return (
    Number(row.amount) < 0 &&
    !isSavingsTransfer(row.description) &&
    !mentionsHouseholdMember(row.description)
  );
}

// Patronymes du foyer (Romain / Meganne), très distinctifs — servent AUX DEUX directions :
// catégorisation des virements SORTANTS (règles ci-dessous) ET détection des remboursements
// ENTRANTS (crédits « Virement de : … »). `\bromain\b` évite « romaine » (salade) ; le patronyme
// « quignard » est plus sûr que le prénom seul et n'attrape pas un tiers au nom simplement proche.
const ROMAIN_RE = /(\bioli\b|\bromain\b)/;
const MEG_RE = /(\bmeganne\b|quignard)/;

/** True si le libellé mentionne Romain ou Meg (quelle que soit la direction du virement). */
export function mentionsHouseholdMember(description: string): boolean {
  const h = norm(description);
  return ROMAIN_RE.test(h) || MEG_RE.test(h);
}

/**
 * True si un CRÉDIT entrant est un remboursement plausible d'une avance : virement (par le type)
 * mentionnant Romain/Meg, MAIS PAS un transfert interne depuis l'épargne. La garde
 * `!isSavingsTransfer` est un filet de sécurité : même si le libellé d'un mouvement d'épargne
 * évoluait, il ne pourra jamais neutraliser une dépense.
 */
export function isHouseholdRefundCredit(type: string, description: string): boolean {
  if (!/virement/i.test(type)) return false;
  if (isSavingsTransfer(description)) return false; // « À partir de EUR Compte d'épargne » exclu
  return mentionsHouseholdMember(description);
}

// Règles marchand génériques (enseignes FR). Ordre = priorité : la 1re qui matche gagne.
// Le « foin » testé = `type + description` normalisé (certains libellés carte sont peu parlants,
// et le type porte l'info pour les retraits/frais). Facile à enrichir : ajouter au bon rang.
const RULES: { cat: ExpenseCategory; re: RegExp }[] = [
  // Retraits d'espèces — détectés d'abord (le libellé peut ressembler à un marchand).
  { cat: "Retraits", re: /(retrait|distributeur|\batm\b|cash ?withdrawal|espece)/ },

  // Impôts & cotisations sociales (Trésor Public / DGFiP-DDFiP, URSSAF, taxes, amendes).
  // `\btaxe\b` (pas « tax ») pour ne pas capturer « taxi » (→ Transport).
  {
    cat: "Impôts / URSSAF",
    re: /(dgfip|ddfip|dgifp|tresor ?public|finances ?publiques|\bimpot|\btaxe\b|\burssaf\b|\bamende\b)/,
  },

  // Virements nominatifs entre nous — patronymes très distinctifs, testés tôt (haute confiance).
  // Regexes partagées avec la détection de remboursement (cf. mentionsHouseholdMember).
  { cat: "Virements Romain", re: ROMAIN_RE },
  { cat: "Virements Meg", re: MEG_RE },

  // Abonnements (streaming, cloud, logiciels, télécoms récurrents, presse…).
  {
    cat: "Abonnements",
    re: /(netflix|spotify|deezer|disney|\bocs\b|canal\+?|canalplus|prime ?video|amazon ?prime|youtube ?premium|apple\.com\/bill|apple ?music|itunes|icloud|\bhbo\b|molotov|\bdazn\b|audible|paramount|crunchyroll|dropbox|google ?(one|storage|drive)|microsoft ?365|office ?365|adobe|openai|chatgpt|anthropic|claude\.ai|notion|canva|github|linkedin ?premium|patreon|\bmedium\b|xbox|playstation ?plus|\bpsn\b|nintendo|\bsteam\b|\bmubi\b)/,
  },

  // Amazon (marketplace) — catégorie dédiée. « Amazon Prime » est capté au-dessus (Abonnements) :
  // cette règle ne prend donc que les achats. Couvre les libellés « Amazon.fr », « AMZN Mktp ».
  { cat: "Amazon", re: /(amazon|\bamzn\b)/ },

  // Transport & carburant (VTC, train, stations-service, péages, parking, location…).
  {
    cat: "Transport & carburant",
    re: /(uber(?! ?eats)|\bbolt\b|heetch|\bg7\b|taxi|\bvtc\b|\bsncf\b|ouigo|oui\.sncf|trainline|\btgv\b|\bter\b|\bratp\b|navigo|\bidfm\b|blablacar|flixbus|isilines|totalenergies|\btotal ?acces\b|\besso\b|\bshell\b|\bavia\b|\bagip\b|\bbp\b|station|carburant|essence|\bgpl\b|autoroute|\bvinci\b|\bsanef\b|\baprr\b|\basf\b|cofiroute|peage|parking|indigo|\bpaybyphone\b|\bflowbird\b|velib|\blime\b|\bdott\b|\btier\b|sixt|hertz|europcar|\bavis\b|rentacar|\bsncf ?connect\b)/,
  },

  // Restaurants & bars & livraison de repas.
  {
    cat: "Restaurants & bars",
    re: /(restaurant|\bresto\b|mcdonald|mc ?do|burger ?king|\bkfc\b|\bquick\b|subway|\bkebab\b|\btacos\b|o ?tacos|pizza|domino|sushi|\bwok\b|brasserie|bistro|\bbar\b|\bpub\b|\bcafe\b|starbucks|\bpaul\b|brioche ?doree|columbus|\bpmu\b(?! ?fdj)|deliveroo|uber ?eats|just ?eat|frichti|\bglovo\b|nestor)/,
  },

  // Alimentation (supermarchés, épiceries, commerces de bouche).
  {
    cat: "Alimentation",
    re: /(carrefour|\bleclerc\b|e\.?leclerc|auchan|\blidl\b|\baldi\b|intermarche|\bitm\b|super ?u|hyper ?u|\bu express\b|monoprix|\bmonop\b|franprix|casino|\bvival\b|\bspar\b|\bcora\b|\bmatch\b|colruyt|\bnetto\b|leader ?price|\bg20\b|naturalia|biocoop|\bbio ?c\b|grand ?frais|\bpicard\b|thiriet|boucherie|boulangerie|patisserie|fromagerie|primeur|\bmarche\b|\bepicerie\b)/,
  },

  // Maison & bricolage (GSB, ameublement, jardinerie, déco).
  {
    cat: "Maison & bricolage",
    re: /(bricomarche|bricorama|brico ?depot|leroy ?merlin|castorama|weldom|mr ?bricolage|monsieur ?bricolage|manomano|\bikea\b|\bbut\b|conforama|maisons? ?du ?monde|\balinea\b|\bgifi\b|centrakor|\baction\b|\bzodio\b|\bhema\b|truffaut|jardiland|gamm ?vert|\bbotanic\b|\bvillaverde\b|\bmr ?jardinage\b)/,
  },

  // Animaux (véto, animaleries, alimentation animale) — AVANT Santé : « clinique vétérinaire »
  // doit tomber dans Animaux, pas dans Santé (« clinique »).
  {
    cat: "Animaux",
    re: /(veterinaire|\bveto\b|animalerie|maxi ?zoo|\bzooplus\b|croquette|toilettage|\bspa\b|\bmedor\b|\bwoof\b|\bwanimo\b)/,
  },

  // Santé & pharmacie.
  {
    cat: "Santé & pharmacie",
    re: /(pharmacie|\bpharma\b|parapharmacie|doctolib|\bmedecin\b|docteur|\bdr\.? \b|dentiste|orthodont|laboratoire|\blabo\b|\bbiogroup\b|\bcerballiance\b|opticien|\boptic\b|\bkrys\b|afflelou|generale ?d ?optique|\baudika\b|hopital|clinique|infirmier|\bkine\b|osteo|\bcpam\b|\bmgen\b|mutuelle|\bharmonie\b)/,
  },

  // Logement & charges (loyer, énergie, eau, télécom fixe, assurances, gestion).
  {
    cat: "Logement & charges",
    re: /(\bloyer\b|\bedf\b|\bengie\b|eni ?gas|ekwateur|mint ?energie|\bvattenfall\b|\bveolia\b|\bsuez\b|\bsaur\b|\borange\b|\bsfr\b|bouygues ?telecom|\bfree\b|red ?by ?sfr|\bsosh\b|\bla ?poste ?mobile\b|assurance|\bmaif\b|\bmacif\b|\bmatmut\b|\bmaaf\b|\baxa\b|allianz|groupama|\bgmf\b|direct ?assurance|\blovys\b|\blemonade\b|\bluko\b|syndic|\bfoncia\b|\bnexity\b|citya|\bseloger\b)/,
  },

  // Loisirs & sorties (cinéma, sport, culture, jeux, événements).
  {
    cat: "Loisirs & sorties",
    re: /(cinema|\bugc\b|\bpathe\b|gaumont|\bmk2\b|theatre|\bopera\b|concert|festival|\bfnac\b|cultura|\bgibert\b|micromania|\bmusee\b|expo|piscine|\bgym\b|\bfitness\b|basic ?fit|neoness|fitness ?park|\bkeepcool\b|on ?air|decathlon|\bgo ?sport\b|intersport|\btwinner\b|accrobranche|bowling|laser ?game|escape ?game|karting|\bpaintball\b|\bzoo\b|aquarium|parc ?asterix|disneyland|billet|ticketmaster|\bweezevent\b|fnac ?spectacles|\bfdj\b)/,
  },

  // Cigarette électronique / vape. Peu de marchands standard → surtout complété par corrections
  // manuelles. `\bvape\b` (pas « vape » libre) pour éviter « vapeur » (cuisine).
  {
    cat: "Cigarette électronique",
    re: /(\bvape\b|vapostore|vapoteur|vapote|clopinette|e-?cig|cigarette ?electronique|\bpuff\b)/,
  },

  // Beauté / Coiffure — AVANT Shopping (sinon Sephora/Marionnaud tomberaient en Shopping).
  // ⚠️ Pas de « spa » ici (réservé à Animaux). « institut »/« salon » = beauté (pas de collision Santé).
  {
    cat: "Beauté / Coiffure",
    re: /(coiffeur|coiffure|barbier|\bsalon\b|institut|esthetique|manucure|\bongle|\bnail|\bsephora\b|marionnaud|nocibe|\byves ?rocher\b|\bkiko\b|\bnyx\b|dessange|franck ?provost|jean ?louis ?david|saint ?algue|\btchip\b)/,
  },

  // Jouets / Cadeaux (enseignes de jouets + « cadeau »).
  {
    cat: "Jouets / Cadeaux",
    re: /(joueclub|joue ?club|king ?jouet|grande ?recre|oxybul|nature ?& ?decouvertes|picwic|maxi ?toys|la ?grande ?recre|\bjouet|\bcadeau)/,
  },

  // Shopping & vêtements (mode, chaussures, généralistes e-commerce, high-tech). La beauté est
  // traitée AVANT (règle « Beauté / Coiffure ») → retirée d'ici pour éviter les doublons.
  {
    cat: "Shopping & vêtements",
    re: /(zalando|\bvinted\b|zara|\bh&?m\b|uniqlo|\bkiabi\b|\bgemo\b|\bcelio\b|jules|jennyfer|pull&?bear|bershka|stradivarius|mango|\bc&a\b|primark|\bgap\b|levi'?s|\bnike\b|adidas|\bpuma\b|new ?balance|\bveja\b|courir|foot ?locker|\bjd ?sports\b|spartoo|sarenza|\bandre\b|\bminelli\b|\beram\b|\bgeox\b|\bcdiscount\b|\bveepee\b|\basos\b|shein|\baliexpress\b|\btemu\b|\bfnac\.com\b|electro ?depot|\bboulanger\b|\bdarty\b|\bldlc\b|\bmateriel\.net\b|apple ?store|\bnormal\b)/,
  },

  // Virements sortants restants (personne-à-personne / divers), NON captés par une règle plus
  // spécifique (Virements Romain/Meg, Impôts, ou un marchand comme Allianz/Bouygues). Testé EN
  // DERNIER = plus faible priorité. Le type « Virement » (dans le foin) suffit à les regrouper.
  { cat: "Virements divers", re: /\bvirement\b/ },
];

/**
 * Catégorie issue des RÈGLES génériques uniquement (b). Renvoie null si aucune règle ne matche
 * (le résidu « Autres » est décidé par categorizeExpense). Utile au read-time comme repli.
 */
export function ruleCategory(type: string, description: string): ExpenseCategory | null {
  const hay = norm(`${type} ${description}`);
  for (const r of RULES) if (r.re.test(hay)) return r.cat;
  return null;
}

/**
 * Catégorise une dépense selon la priorité (a) mapping mémorisé → (b) règles → (c) « Autres ».
 * `mapping` : merchantKey (description normalisée) → catégorie corrigée manuellement.
 */
export function categorizeExpense(
  type: string,
  description: string,
  mapping?: Map<string, string>,
): ExpenseCategory {
  const key = merchantKeyOf(description);
  const memorized = mapping?.get(key);
  if (memorized && isExpenseCategory(memorized)) return memorized;
  return ruleCategory(type, description) ?? "Autres";
}
