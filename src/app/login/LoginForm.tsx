"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { requestOtp, verifyOtp, type RequestState, type VerifyState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-navy/15 bg-cloud px-3 py-2.5 text-navy placeholder:text-navy/40 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-60";
const btnCls =
  "w-full rounded-lg bg-navy px-3 py-2.5 font-medium text-white transition-colors hover:bg-navy-700 disabled:opacity-60";

export function LoginForm({ notice }: { notice?: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  const [reqState, reqAction, reqPending] = useActionState<RequestState | null, FormData>(
    requestOtp,
    null
  );
  const [verState, verAction, verPending] = useActionState<VerifyState | null, FormData>(
    verifyOtp,
    null
  );

  // Étape 1 réussie → passe à l'étape « code » et mémorise l'e-mail.
  useEffect(() => {
    if (reqState?.ok) {
      setStep("code");
      if (reqState.email) setEmail(reqState.email);
    }
  }, [reqState]);

  // Focus auto du champ code quand on arrive à l'étape 2.
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  // ───────────────────────── Étape 2 : saisie du code ─────────────────────────
  if (step === "code") {
    return (
      <div className="mt-6 space-y-3">
        <p className="rounded-lg bg-cyan/15 px-3 py-2.5 text-center text-sm text-navy">
          {reqState?.message ?? "Un code à 8 chiffres vous a été envoyé."}
          <br />
          <span className="text-navy/60">{email}</span>
        </p>

        <form action={verAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />

          {verState && !verState.ok && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700"
            >
              {verState.message}
            </p>
          )}

          <div>
            <label htmlFor="otp-code" className="block text-sm font-medium text-navy">
              Code de connexion
            </label>
            <input
              ref={codeRef}
              id="otp-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{8}"
              maxLength={8}
              required
              disabled={verPending}
              placeholder="12345678"
              aria-describedby="otp-help"
              className={`${inputCls} mt-1 text-center text-base tracking-[0.3em] sm:text-lg sm:tracking-[0.45em]`}
            />
            <p id="otp-help" className="mt-1 text-center text-xs text-navy/50">
              Saisissez les 8 chiffres reçus par e-mail.
            </p>
          </div>

          <button type="submit" disabled={verPending} className={btnCls}>
            {verPending ? "Vérification…" : "Se connecter"}
          </button>
        </form>

        {/* Actions secondaires : renvoyer un code / modifier l'email */}
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setStep("email")}
            disabled={reqPending || verPending}
            className="text-navy/60 hover:text-navy hover:underline disabled:opacity-60"
          >
            ← Modifier l&apos;e-mail
          </button>
          <form action={reqAction}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={reqPending || verPending}
              className="font-medium text-cyan-600 hover:underline disabled:opacity-60"
            >
              {reqPending ? "Envoi…" : "Renvoyer un code"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ───────────────────────── Étape 1 : saisie de l'e-mail ─────────────────────────
  return (
    <form action={reqAction} className="mt-6 space-y-3">
      {notice && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
          {notice}
        </p>
      )}
      {reqState && !reqState.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
          {reqState.message}
        </p>
      )}

      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-navy">
          Adresse e-mail
        </label>
        <input
          id="login-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          defaultValue={email}
          placeholder="vous@lynova.net"
          disabled={reqPending}
          className={`${inputCls} mt-1`}
        />
      </div>

      <button type="submit" disabled={reqPending} className={btnCls}>
        {reqPending ? "Envoi…" : "Recevoir un code"}
      </button>
    </form>
  );
}
