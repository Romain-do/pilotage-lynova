"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviteUser, type ActionState } from "./actions";

const initialState: ActionState | null = null;

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteUser, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Réinitialise les champs après une invitation réussie.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-navy" htmlFor="invite-name">
            Nom
          </label>
          <input
            id="invite-name"
            name="name"
            type="text"
            placeholder="Méganne"
            disabled={pending}
            className="mt-1 w-full rounded-lg border border-navy/15 bg-cloud px-3 py-2.5 text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-60"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-navy" htmlFor="invite-email">
            E-mail <span className="text-red-500">*</span>
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="meganne@lynova.net"
            disabled={pending}
            className="mt-1 w-full rounded-lg border border-navy/15 bg-cloud px-3 py-2.5 text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-60"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-sm font-medium text-navy" htmlFor="invite-role">
            Rôle <span className="text-red-500">*</span>
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="COMMERCIAL"
            disabled={pending}
            className="mt-1 w-full rounded-lg border border-navy/15 bg-cloud px-3 py-2.5 text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-60"
          >
            <option value="COMMERCIAL">Commercial</option>
            <option value="DIRIGEANT">Dirigeant</option>
          </select>
        </div>
      </div>

      {state && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-cyan/15 text-navy" : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-navy px-4 py-2.5 font-medium text-white transition-colors hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Création…" : "Inviter"}
      </button>
    </form>
  );
}
