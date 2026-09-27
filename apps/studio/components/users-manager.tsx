"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StaffRole } from "@newspoint/db/schema";
import { callApi } from "@/lib/client-api";
import { assignableRoles, canChangeRole, canDeleteAccount, ROLE_LABELS } from "@/lib/editor/roles";
import { formatWhen } from "@/lib/format";
import { PASSWORD_MAX, PASSWORD_RULES, passwordProblems } from "@/lib/password-policy";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  createdAt: string;
  lastActiveAt: string | null;
  profileBio: string;
}

interface Actor {
  id: string;
  role: StaffRole;
}

const ROLE_STYLE: Record<StaffRole, string> = {
  editor: "bg-surface-2 text-body",
  admin: "bg-accent/10 text-accent",
  master_admin: "np-gradient-bg text-white",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Random password that satisfies every rule; shown once to the creator. */
function generatePassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*?-_+="];
  const all = sets.join("");
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0]! % chars.length]!;
  const chars = [...sets.map(pick), ...Array.from({ length: 12 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

function CreateUserDialog({ roles, onClose, onCreated }: { roles: StaffRole[]; onClose: () => void; onCreated: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (passwordProblems(password).length) {
      setError("Паролата не отговаря на правилата.");
      return;
    }
    setPending(true);
    setError(null);
    const name = String(form.get("name") ?? "").trim();
    const result = await callApi<{ id: string }>("POST", "/api/staff/", {
      name,
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? "editor"),
      password,
    });
    setPending(false);
    if (!result.ok) {
      setError(Array.isArray(result.error.details) ? `${result.error.message} ${(result.error.details as string[]).join(" · ")}` : result.error.message);
      return;
    }
    onCreated(name);
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="create-user-heading"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-shell/60 backdrop:backdrop-blur-sm"
    >
      <div className="np-gradient-bg h-1" aria-hidden="true" />
      <form onSubmit={onSubmit} className="space-y-4 p-6" autoComplete="off">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="create-user-heading" className="text-xl font-extrabold text-ink">
              Нов профил
            </h2>
            <p className="mt-1 text-sm text-muted">Изпратете паролата на човека по сигурен канал.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Затвори" className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-surface-2">
            ×
          </button>
        </div>

        <div>
          <label htmlFor="new-name" className="np-label">
            Име
          </label>
          <input id="new-name" name="name" required minLength={2} maxLength={80} className="np-input" />
        </div>
        <div>
          <label htmlFor="new-email" className="np-label">
            Имейл
          </label>
          <input id="new-email" name="email" type="email" required maxLength={254} autoCapitalize="none" spellCheck={false} className="np-input" />
        </div>
        <div>
          <label htmlFor="new-role" className="np-label">
            Роля
          </label>
          <select id="new-role" name="role" defaultValue="editor" className="np-input">
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-end justify-between">
            <label htmlFor="new-password" className="np-label">
              Парола
            </label>
            <button
              type="button"
              onClick={() => {
                setPassword(generatePassword());
                setShow(true);
              }}
              className="mb-1.5 text-xs font-bold text-link hover:underline"
            >
              Генерирай сигурна
            </button>
          </div>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              required
              className="np-input pr-20 font-mono"
            />
            <button type="button" onClick={() => setShow((value) => !value)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-surface-2">
              {show ? "Скрий" : "Покажи"}
            </button>
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-semibold">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? "text-success" : "text-faint"}`}>
                  <span className={`flex size-3.5 items-center justify-center rounded-full text-[0.5rem] ${ok ? "bg-success text-white" : "border border-line"}`} aria-hidden="true">
                    {ok ? "✓" : ""}
                  </span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-danger/5 px-3.5 py-2.5 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="np-btn np-btn-secondary">
            Отказ
          </button>
          <button type="submit" disabled={pending} className="np-btn np-btn-primary px-5">
            {pending ? "Създаване…" : "Създай профил"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function UsersManager({ actor, canManageAccounts, users }: { actor: Actor; canManageAccounts: boolean; users: UserRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const roles = assignableRoles(actor.role);

  async function changeRole(user: UserRow, role: StaffRole) {
    setBusyId(user.id);
    setNotice(null);
    const result = await callApi("PATCH", `/api/staff/${user.id}/`, { role });
    setBusyId(null);
    if (!result.ok) return setNotice({ tone: "error", text: result.error.message });
    setNotice({ tone: "success", text: `${user.name} вече е ${ROLE_LABELS[role].toLowerCase()}.` });
    router.refresh();
  }

  async function remove(user: UserRow) {
    if (!window.confirm(`Да изтрия ли профила на ${user.name} (${user.email})? Статиите му остават.`)) return;
    setBusyId(user.id);
    setNotice(null);
    const result = await callApi("DELETE", `/api/staff/${user.id}/`);
    setBusyId(null);
    if (!result.ok) return setNotice({ tone: "error", text: result.error.message });
    setNotice({ tone: "success", text: `Профилът на ${user.name} е изтрит.` });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Профили</h1>
          <p className="mt-1 text-sm text-muted">
            {users.length} {users.length === 1 ? "профил" : "профила"} ·{" "}
            {canManageAccounts ? "създавате и изтривате профили и сменяте роли" : "сменяте ролите между редактор и администратор"}
          </p>
        </div>
        {canManageAccounts ? (
          <button type="button" onClick={() => setCreating(true)} className="np-btn np-btn-primary">
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>{" "}
            Нов профил
          </button>
        ) : null}
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mb-4 rounded-2xl px-5 py-3 text-sm font-semibold ${notice.tone === "error" ? "border border-danger/20 bg-danger/5 text-danger" : "border border-success/20 bg-success/10 text-success"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="np-card overflow-hidden">
        <ul className="divide-y divide-line">
          {users.map((user) => {
            const isSelf = user.id === actor.id;
            const editableRole = roles.some((role) => role !== user.role && canChangeRole(actor, user, role));
            const deletable = canDeleteAccount(actor, user);
            return (
              <li key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                <span className="np-gradient-bg flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white">{initials(user.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">
                    {user.name}
                    {isSelf ? <span className="ml-2 text-xs font-semibold text-faint">(вие)</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                  {user.profileBio ? <p className="mt-1 line-clamp-2 text-xs text-faint">{user.profileBio}</p> : null}
                </div>
                <p className="hidden w-40 text-xs text-muted md:block">{user.lastActiveAt ? `Активен ${formatWhen(user.lastActiveAt)}` : "Още не е влизал"}</p>
                {editableRole ? (
                  <select
                    aria-label={`Роля на ${user.name}`}
                    value={user.role}
                    disabled={busyId === user.id}
                    onChange={(event) => void changeRole(user, event.target.value as StaffRole)}
                    className="np-input w-44 py-2 text-sm font-bold"
                  >
                    {user.role === "master_admin" ? <option value="master_admin">{ROLE_LABELS.master_admin}</option> : null}
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`inline-flex w-44 justify-center rounded-full px-3 py-1.5 text-xs font-extrabold ${ROLE_STYLE[user.role]}`}>{ROLE_LABELS[user.role]}</span>
                )}
                {canManageAccounts ? (
                  <button
                    type="button"
                    disabled={!deletable || busyId === user.id}
                    onClick={() => void remove(user)}
                    aria-label={`Изтрий ${user.name}`}
                    title={deletable ? "Изтрий профила" : "Не можете да изтриете собствения си профил"}
                    className="flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger disabled:invisible"
                  >
                    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                    </svg>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {creating ? (
        <CreateUserDialog
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            setNotice({ tone: "success", text: `Профилът на ${name} е създаден.` });
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
