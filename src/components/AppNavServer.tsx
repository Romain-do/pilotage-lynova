import { getCurrentUser, isEpargneEmail } from "@/lib/auth";
import { AppNav } from "./AppNav";

// Wrapper SERVEUR de la barre de navigation : dérive `role` + accès « Notre épargne »
// (liste blanche, isEpargneEmail) depuis la session, en un SEUL endroit. Toutes les pages
// serveur le rendent sans argument → impossible d'oublier le flag epargne page par page,
// et le rôle n'est plus codé en dur (cf. ancien `role="DIRIGEANT"`).
//
// Cas particulier : Cockpit est un Client Component et ne peut pas rendre ce composant async ;
// il reçoit `epargne` en prop, calculé côté serveur dans src/app/page.tsx (comme `role`).
export async function AppNavServer() {
  const user = await getCurrentUser();
  if (!user) return null; // pages déjà gardées en amont ; garde défensive
  return <AppNav role={user.role} epargne={isEpargneEmail(user.email)} />;
}
