#!/usr/bin/env node
/**
 * Assistant d'installation Revolut Business — interactif, en français.
 *
 * Automatise le flux officiel :
 *  1. Génère la clé privée RSA 2048 + le certificat X509 auto-signé (node-forge)
 *  2. Affiche le certificat public à coller dans Revolut Business
 *  3. Demande le ClientID, génère le client assertion JWT
 *  4. Affiche l'URL de consentement, demande le code de retour
 *  5. Échange le code contre access_token + refresh_token
 *  6. Sauvegarde la config dans ~/.revolut-mcp/config.json (hors OneDrive)
 *
 * Relançable sans risque : réutilise la clé existante si présente.
 */

import forge from "node-forge";
import { createInterface } from "node:readline/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { buildClientAssertion, CLIENT_ASSERTION_TYPE, DEFAULT_CONFIG_PATH, PROD_API_BASE, requestToken } from "./auth.js";

const CONFIG_DIR = dirname(DEFAULT_CONFIG_PATH);
const PRIVATE_KEY_PATH = join(CONFIG_DIR, "privatecert.pem");
const PUBLIC_CERT_PATH = join(CONFIG_DIR, "publiccert.cer");
/** Domaine du redirect URI : sans serveur web, une URL quelconque suffit (doc officielle). */
const REDIRECT_DOMAIN = "example.com";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function title(step: string): void {
  console.log(`\n${"=".repeat(60)}\n${step}\n${"=".repeat(60)}`);
}

async function ask(question: string): Promise<string> {
  const answer = await rl.question(`\n> ${question} `);
  return answer.trim();
}

function generateCertificates(): { privateKeyPem: string; publicCertPem: string } {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_CERT_PATH)) {
    console.log("Clé privée et certificat déjà présents — réutilisation (pas besoin de re-uploader dans Revolut si déjà fait).");
    return {
      privateKeyPem: readFileSync(PRIVATE_KEY_PATH, "utf8"),
      publicCertPem: readFileSync(PUBLIC_CERT_PATH, "utf8"),
    };
  }

  console.log("Génération de la clé RSA 2048 bits et du certificat X509 (validité 5 ans)…");
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = String(Date.now());
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

  const attrs = [
    { name: "countryName", value: "FR" },
    { name: "organizationName", value: "Lynova" },
    { name: "commonName", value: REDIRECT_DOMAIN },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const publicCertPem = forge.pki.certificateToPem(cert);

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PRIVATE_KEY_PATH, privateKeyPem, { encoding: "utf8" });
  writeFileSync(PUBLIC_CERT_PATH, publicCertPem, { encoding: "utf8" });
  console.log(`Fichiers créés dans ${CONFIG_DIR}`);

  return { privateKeyPem, publicCertPem };
}

async function main(): Promise<void> {
  console.log("\nAssistant de connexion Revolut Business → Claude (lecture seule)");
  console.log("Durée : ~5 minutes. Garde un onglet ouvert sur https://business.revolut.com\n");

  // Étape 1 : certificats
  title("ÉTAPE 1/4 — Certificat");
  const { privateKeyPem, publicCertPem } = generateCertificates();

  console.log(`
Dans Revolut Business (sur ordinateur) :
  1. Roue dentée (Paramètres) en haut à droite → APIs → Business API
  2. Clique « Add API certificate » (ou « Add new »)
  3. Dans le champ « X509 public key », colle TOUT le bloc ci-dessous :
`);
  console.log(publicCertPem);
  console.log(`  4. Dans « OAuth redirect URI », mets exactement : https://${REDIRECT_DOMAIN}
  5. Donne un titre (ex. « Claude lecture seule ») et valide.`);

  // Étape 2 : ClientID
  title("ÉTAPE 2/4 — ClientID");
  let clientId = "";
  while (!clientId) {
    clientId = await ask("Copie ici le « ClientID » affiché par Revolut :");
    if (!clientId) console.log("Le ClientID ne peut pas être vide.");
  }

  // Étape 3 : consentement
  title("ÉTAPE 3/4 — Autorisation");
  const consentUrl =
    `https://business.revolut.com/app-confirm?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=https://${REDIRECT_DOMAIN}&response_type=code&scope=READ`;
  console.log(`
1. Ouvre cette URL dans ton navigateur (déjà limitée à la LECTURE SEULE via scope=READ) :

${consentUrl}

2. Clique « Authorise » et valide la double authentification.
3. Tu seras redirigé vers une page ${REDIRECT_DOMAIN} — c'est NORMAL qu'elle n'affiche rien d'utile.
   Regarde la BARRE D'ADRESSE : elle contient ?code=oa_prod_XXXX
4. Copie tout ce qui suit « code= » (le code expire en 2 minutes, fais vite).`);

  const assertion = buildClientAssertion({ client_id: clientId, iss: REDIRECT_DOMAIN, private_key_pem: privateKeyPem });

  let refreshToken = "";
  while (!refreshToken) {
    const code = await ask("Colle le code ici :");
    if (!code) continue;
    try {
      console.log("Échange du code contre les jetons d'accès…");
      const result = await requestToken(PROD_API_BASE, {
        grant_type: "authorization_code",
        code,
        client_assertion_type: CLIENT_ASSERTION_TYPE,
        client_assertion: buildClientAssertion({ client_id: clientId, iss: REDIRECT_DOMAIN, private_key_pem: privateKeyPem }),
      });
      if (!result.refresh_token) {
        console.log("Réponse sans refresh_token — réessaie (refais l'autorisation pour obtenir un code frais).");
        continue;
      }
      refreshToken = result.refresh_token;
    } catch (error) {
      console.log(`${error instanceof Error ? error.message : String(error)}`);
      console.log("Si le code a expiré (>2 min), refais l'étape d'autorisation pour en obtenir un nouveau.");
    }
  }
  void assertion;

  // Étape 4 : sauvegarde + test
  title("ÉTAPE 4/4 — Sauvegarde et test");
  const config = { client_id: clientId, iss: REDIRECT_DOMAIN, private_key_pem: privateKeyPem, refresh_token: refreshToken };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(DEFAULT_CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: "utf8" });
  console.log(`Configuration sauvegardée : ${DEFAULT_CONFIG_PATH}`);

  console.log("Test de l'accès aux comptes…");
  try {
    const tokenResult = await requestToken(PROD_API_BASE, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: buildClientAssertion({ client_id: clientId, iss: REDIRECT_DOMAIN, private_key_pem: privateKeyPem }),
    });
    const response = await fetch(`${PROD_API_BASE}/accounts`, {
      headers: { Authorization: `Bearer ${tokenResult.access_token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const accounts = (await response.json()) as { name?: string; balance?: number; currency?: string }[];
    console.log(`\n✔ Connexion réussie ! ${accounts.length} compte(s) visible(s) :`);
    for (const account of accounts) {
      console.log(`   - ${account.name ?? "Compte"} : ${account.balance} ${account.currency}`);
    }
    console.log("\nTout est prêt. Dernière étape : ajouter le serveur dans claude_desktop_config.json (voir INSTALLATION.md).");
  } catch (error) {
    console.log(`Le test a échoué : ${error instanceof Error ? error.message : String(error)}`);
    console.log("La config est sauvegardée ; tu peux relancer ce script pour réessayer.");
  }

  rl.close();
}

main().catch((error) => {
  console.error("Erreur :", error instanceof Error ? error.message : error);
  rl.close();
  process.exit(1);
});
