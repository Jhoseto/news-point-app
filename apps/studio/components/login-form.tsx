"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { authClient } from "@/lib/auth-client";

function messageFor(status: number, message: string | undefined): string {
  if (status === 429 && message?.startsWith("locked:")) {
    const minutes = Number(message.slice("locked:".length)) || 15;
    return `Профилът е временно заключен след няколко грешни опита. Опитайте отново след ${minutes} мин.`;
  }
  if (status === 429) return "Твърде много опити от това устройство. Изчакайте минута.";
  if (status === 403) return "Заявката беше блокирана. Отворете входа отново.";
  return "Грешен имейл или парола.";
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    // Hidden field that people never fill; automated form fillers usually do.
    if (String(form.get("website") ?? "")) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setPending(false);
      setError(messageFor(401, undefined));
      return;
    }
    const { error: failure } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (failure) {
      setPending(false);
      setError(messageFor(failure.status, failure.message));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  return (
    // POST so that a submit before hydration never puts the password in the URL.
    <form onSubmit={onSubmit} method="post" className="mt-8 space-y-5" noValidate>
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Уебсайт</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="email" className="np-label">
          Имейл
        </label>
        <div className="relative">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="np-input py-3 pl-11" />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="np-label">
          Парола
        </label>
        <div className="relative">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
            onKeyDown={onKey}
            onKeyUp={onKey}
            className="np-input py-3 pr-12 pl-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Скрий паролата" : "Покажи паролата"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword ? null : <path d="m3 3 18 18" />}
            </svg>
          </button>
        </div>
        {capsLock ? <p className="mt-2 text-xs font-bold text-warning">Caps Lock е включен.</p> : null}
        <p className="mt-2 text-right text-sm">
          <Link href="/login/forgot/" className="font-semibold text-link hover:underline">
            Забравена парола?
          </Link>
        </p>
      </div>

      {error ? (
        <p role="alert" className="flex gap-2.5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} className="mt-px shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="np-btn np-btn-primary w-full py-3.5 text-[0.9375rem]">
        {pending ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            Проверка…
          </>
        ) : (
          "Вход в Studio"
        )}
      </button>
    </form>
  );
}
