import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cockpit Lynova",
  description: "Cockpit de pilotage Lynova — finances, facturation, prospection.",
};

// Région d'exécution des fonctions = Dublin (dub1), au plus près de la base Supabase
// (aws-0-eu-west-1) pour réduire la latence DB. Hérité par toutes les pages (le root
// layout par défaut = "auto"/US). Les route handlers la redéclarent (pas d'héritage garanti
// hors arbre React). Plan Vercel Pro → sélection de région autorisée.
export const preferredRegion = "dub1";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning : certaines extensions de navigateur injectent des
          attributs sur <body> (ex. cz-shortcut-listen) → faux positif d'hydratation. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
