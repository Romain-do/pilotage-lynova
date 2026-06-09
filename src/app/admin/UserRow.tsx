"use client";

import { useActionState } from "react";
import {
  updateUserRole,
  setUserActive,
  type ActionState,
} from "./actions";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "DIRIGEANT" | "COMMERCIAL";
  active: boolean;
}

const init: ActionState | null = null;

export function UserRow({ user, currentUserId }: { user: AdminUser; currentUserId: string }) {
  const [roleState, roleAction, rolePending] = useActionState(updateUserRole, init);
  const [statusState, statusAction, statusPending] = useActionState(setUserActive, init);

  const isSelf = user.id === currentUserId;
  const message = roleState ?? statusState;

  return (
    <tr className={user.active ? "" : "bg-navy/[0.03] text-navy/50"}>
      <td className="px-4 py-3">
        <div className="font-medium text-navy">{user.name ?? "—"}</div>
        <div className="text-sm text-navy/60">{user.email}</div>
        {message && (
          <div
            className={`mt-1 text-xs ${message.ok ? "text-cyan-600" : "text-red-600"}`}
          >
            {message.message}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <form action={roleAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            disabled={rolePending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="rounded-md border border-navy/15 bg-white px-2 py-1.5 text-sm text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-60"
          >
            <option value="COMMERCIAL">Commercial</option>
            <option value="DIRIGEANT">Dirigeant</option>
          </select>
          {rolePending && <span className="text-xs text-navy/40">…</span>}
        </form>
      </td>

      <td className="px-4 py-3">
        {user.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Actif
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/10 px-2.5 py-1 text-xs font-medium text-navy/60">
            <span className="h-1.5 w-1.5 rounded-full bg-navy/40" /> Archivé
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-right">
        {user.active ? (
          <form
            action={statusAction}
            className="inline"
            onSubmit={(e) => {
              if (!confirm(`Révoquer l'accès de ${user.email} ?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="active" value="false" />
            <button
              type="submit"
              disabled={statusPending || isSelf}
              title={isSelf ? "Vous ne pouvez pas révoquer votre propre compte." : undefined}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {statusPending ? "…" : "Révoquer"}
            </button>
          </form>
        ) : (
          <form action={statusAction} className="inline">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="active" value="true" />
            <button
              type="submit"
              disabled={statusPending}
              className="rounded-md border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy/5 disabled:opacity-40"
            >
              {statusPending ? "…" : "Réactiver"}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
