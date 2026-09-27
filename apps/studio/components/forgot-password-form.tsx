"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { absoluteStudioUrl } from "@/lib/paths";

const SUCCESS =
  "Ако имейлът е регистриран в Studio, изпратихме връзка за нова парола. Проверете пощата (и папката „Спам“).";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    if (String(form.get("website") ?? "")) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setDone(true);
      return;
    }
    const email = String(form.get("email") ?? "").trim();
    setPending(true);
    setError(null);
    const redirectTo = absoluteStudioUrl("/login/reset");
    const { error: failure } = await authClient.requestPasswordReset({ email, redirectTo });
    setPending(false);
    if (failure?.status === 429) {
      setError("Твърде много опити. Изчакайте минута и опитайте отново.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-8 space-y-5">
        <p role="status" className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-body">
          {SUCCESS}
        </p>
        <Link href="/login/" className="np-btn np-btn-secondary inline-flex w-full justify-center py-3">
          Обратно към входа
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" className="mt-8 space-y-5" noValidate>
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Уебсайт</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="email" className="np-label">
          Имейл
        </label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="np-input py-3" />
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="np-btn np-btn-primary w-full py-3.5 text-[0.9375rem]">
        {pending ? "Изпращане…" : "Изпрати връзка"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login/" className="font-semibold text-link hover:underline">
          Обратно към входа
        </Link>
      </p>
    </form>
  );
}
