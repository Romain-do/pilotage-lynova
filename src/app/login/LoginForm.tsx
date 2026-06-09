"use client";

import { useActionState } from "react";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState | null = null;

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(requestMagicLink, initialState);

  if (state?.ok) {
    return (
      <div className="mt-6 rounded-lg bg-cyan/15 px-4 py-4 text-center text-sm text-navy">
        <p className="font-medium">Lien envoyé</p>
        <p className="mt-1 text-navy/70">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-3">
      {notice && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
          {notice}
        </p>
      )}
      {state && !state.ok && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
          {state.message}
        </p>
      )}
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="vous@lynova.net"
        disabled={pending}
        className="w-full rounded-lg border border-navy/15 bg-cloud px-3 py-2.5 text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-3 py-2.5 font-medium text-white transition-colors hover:bg-navy-700 disabled:opacity-60"
      >
        {pending ? "Envoi…" : "Recevoir le lien de connexion"}
      </button>
    </form>
  );
}
