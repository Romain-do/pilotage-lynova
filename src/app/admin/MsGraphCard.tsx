import { isMsGraphConfigured } from "@/lib/msgraph/config";
import { getMsGraphConnection } from "@/lib/msgraph/auth";
import { disconnectMsGraph } from "./integrations-actions";

// Carte « Agenda Microsoft 365 » de l'écran d'administration (DIRIGEANT seul).
// Server component : lit le statut côté serveur (jamais le refresh token), affiche le
// bouton « Connecter Outlook » (lance le flux OAuth) ou l'état connecté + déconnexion.
//
// `notice` provient du paramètre ?msgraph= posé par les routes connect/callback.
export async function MsGraphCard({ notice }: { notice?: string }) {
  const configured = isMsGraphConfigured();
  const connection = configured ? await getMsGraphConnection() : null;

  const messages: Record<string, { ok: boolean; text: string }> = {
    connected: { ok: true, text: "Compte Microsoft 365 connecté." },
    error: { ok: false, text: "Échec de la connexion Microsoft. Réessayez." },
    state: { ok: false, text: "Session de connexion expirée ou invalide. Relancez." },
    notconfigured: { ok: false, text: "Variables Microsoft (MS_*) non configurées." },
  };
  const banner = notice ? messages[notice] : undefined;

  return (
    <div className="mt-8 rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-navy">Agenda Microsoft 365</h2>
      <p className="mt-1 text-sm text-navy/60">
        Connectez le calendrier Outlook de l&apos;entreprise pour inviter les prospects à un RDV
        (Teams en visio ou présentiel) directement depuis leur fiche. Les invitations partent
        depuis ce compte.
      </p>

      {banner && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            banner.ok ? "bg-cyan/15 text-navy" : "bg-red-50 text-red-700"
          }`}
        >
          {banner.text}
        </p>
      )}

      {!configured ? (
        <p className="mt-4 rounded-lg bg-navy/[0.03] px-3 py-2 text-sm text-navy/60">
          Renseignez d&apos;abord <code>MS_CLIENT_ID</code>, <code>MS_TENANT_ID</code> et{" "}
          <code>MS_CLIENT_SECRET</code> (.env.local / Vercel), puis déclarez l&apos;URL de
          redirection dans Azure.
        </p>
      ) : connection ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              Connecté
            </span>
            <span className="ml-2 text-navy/60">
              {connection.accountName ?? connection.accountEmail ?? "compte Microsoft"}
              {connection.accountEmail && connection.accountName
                ? ` · ${connection.accountEmail}`
                : ""}
            </span>
          </div>
          <form action={disconnectMsGraph}>
            <button
              type="submit"
              className="rounded-lg border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy/5"
            >
              Déconnecter
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-4">
          <a
            href="/api/integrations/msgraph/connect"
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 font-medium text-white hover:bg-navy-700"
          >
            Connecter Outlook
          </a>
        </div>
      )}
    </div>
  );
}
