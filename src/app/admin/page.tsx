import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireDirigeant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InviteForm } from "./InviteForm";
import { UserRow, type AdminUser } from "./UserRow";

// Écran d'administration — DIRIGEANT seul (garde côté serveur, §3).
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await requireDirigeant();

  const users = (await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { createdAt: "asc" }],
    select: { id: true, email: true, name: true, role: true, active: true },
  })) as AdminUser[];

  return (
    <main className="flex flex-1 flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/">
            <Logo className="text-lg text-white" />
          </Link>
          <Link
            href="/"
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
          >
            ← Retour au cockpit
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-600">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-navy">Gestion des utilisateurs</h1>
        <p className="mt-3 max-w-2xl text-navy/70">
          Invitez des membres, ajustez leur rôle et révoquez l&apos;accès. La connexion se fait
          sans mot de passe (lien magique). La révocation archive le compte sans le supprimer.
        </p>

        {/* Invitation */}
        <div className="mt-8 rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Ajouter un utilisateur</h2>
          <p className="mt-1 text-sm text-navy/60">
            Le compte est créé directement, <strong>sans envoi d&apos;e-mail</strong>. Communiquez
            l&apos;accès vous-même : la personne se connecte ensuite par lien magique depuis
            l&apos;écran de connexion.
          </p>
          <div className="mt-4">
            <InviteForm />
          </div>
        </div>

        {/* Liste */}
        <div className="mt-8 overflow-hidden rounded-xl border border-navy/10 bg-white shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-navy/10 bg-navy/[0.02] text-xs uppercase tracking-wide text-navy/50">
                <th className="px-4 py-3 font-medium">Utilisateur</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {users.map((u) => (
                <UserRow key={u.id} user={u} currentUserId={me.id} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-navy/40">
          {users.filter((u) => u.active).length} actif(s) · {users.length} au total
        </p>
      </section>
    </main>
  );
}
