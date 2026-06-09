import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Déjà connecté (profil valide) → vers l'accueil. Évite aussi toute boucle de redirection.
  if (await getCurrentUser()) {
    redirect("/");
  }

  const { error } = await searchParams;
  const notice =
    error === "auth"
      ? "Lien invalide ou expiré. Demandez un nouveau lien de connexion."
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center bg-navy px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <Logo className="text-2xl text-navy" />
        </div>
        <h1 className="mt-6 text-center text-lg font-semibold text-navy">
          Connexion au cockpit
        </h1>
        <p className="mt-2 text-center text-sm text-navy/60">
          Accès par lien magique, sans mot de passe.
        </p>

        <LoginForm notice={notice} />
      </div>
    </main>
  );
}
