"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { passwordProblems } from "@/lib/password-policy";
import { PasswordRulesList } from "./password-rules-list";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const invalid = searchParams.get("error") === "INVALID_TOKEN" || !token;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problems = useMemo(() => passwordProblems(password), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || invalid || !token) return;
    if (problems.length || password !== confirm) {
      setError(problems[0] ?? "Паролите не съвпадат.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: failure } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (failure) {
      setError(failure.status === 429 ? "Твърде много опити. Изчакайте минута." : "Връзката е изтекла или вече е използвана. Заявете нова.");
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace("/login/");
      router.refresh();
    }, 2400);
  }

  if (invalid) {
    return (
      <div className="mt-8 space-y-5">
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
          Връзката за нова парола е невалидна или изтекла.
        </p>
        <Link href="/login/forgot/" className="np-btn np-btn-primary inline-flex w-full justify-center py-3.5">
          Заяви нова връзка
        </Link>
        <p className="text-center text-sm">
          <Link href="/login/" className="font-semibold text-link hover:underline">
            Обратно към входа
          </Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-8 space-y-5">
        <p role="status" className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm font-semibold text-ink">
          Паролата е сменена. Пренасочване към входа…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="password" className="np-label">
          Нова парола
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={onKey}
            onKeyUp={onKey}
            className="np-input py-3 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Скрий паролата" : "Покажи паролата"}
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            {showPassword ? "◐" : "◑"}
          </button>
        </div>
        <PasswordRulesList value={password} />
        {capsLock ? <p className="mt-2 text-xs font-bold text-warning">Caps Lock е включен.</p> : null}
      </div>
      <div>
        <label htmlFor="confirm" className="np-label">
          Повтори паролата
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="np-input py-3"
        />
        {mismatch ? <p className="mt-2 text-xs font-semibold text-danger">Паролите не съвпадат.</p> : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="np-btn np-btn-primary w-full py-3.5 text-[0.9375rem]">
        {pending ? "Запис…" : "Запази новата парола"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login/" className="font-semibold text-link hover:underline">
          Обратно към входа
        </Link>
      </p>
    </form>
  );
}
