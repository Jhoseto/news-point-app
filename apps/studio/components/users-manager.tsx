"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { StaffRole } from "@newspoint/db/schema";
import { callApi } from "@/lib/client-api";
import { assignableRoles, canChangeRole, canDeleteAccount, ROLE_LABELS } from "@/lib/editor/roles";
import { formatWhen } from "@/lib/format";
import { PASSWORD_MAX, PASSWORD_RULES, passwordProblems } from "@/lib/password-policy";
import {
  countUsers,
  filterUsers,
  initialsFrom,
  ROLE_KEYS,
  ROLE_TONE,
  type UserRow,
} from "./users-manager-utils";
import "./users-manager.css";

export type { UserRow };

interface Actor {
  id: string;
  role: StaffRole;
}

const initials = initialsFrom;

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
      className="np-users-dialog"
    >
      <div className="np-users-dialog-accent" aria-hidden="true" />
      <form onSubmit={onSubmit} className="np-users-dialog-form" autoComplete="off">
        <div className="np-users-dialog-head">
          <div>
            <h2 id="create-user-heading">Нов профил</h2>
            <p>Изпратете паролата на човека по сигурен канал.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Затвори" className="np-users-dialog-close">×</button>
        </div>

        <label className="np-users-field">
          <span>Име</span>
          <input name="name" required minLength={2} maxLength={80} className="np-users-input" />
        </label>
        <label className="np-users-field">
          <span>Имейл</span>
          <input name="email" type="email" required maxLength={254} autoCapitalize="none" spellCheck={false} className="np-users-input" />
        </label>
        <label className="np-users-field">
          <span>Роля</span>
          <select name="role" defaultValue="editor" className="np-users-input">
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <div className="np-users-field">
          <div className="np-users-field-row">
            <span>Парола</span>
            <button
              type="button"
              onClick={() => {
                setPassword(generatePassword());
                setShow(true);
              }}
              className="np-users-link"
            >
              Генерирай сигурна
            </button>
          </div>
          <div className="np-users-password-wrap">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              required
              className="np-users-input np-users-mono"
            />
            <button type="button" onClick={() => setShow((value) => !value)} className="np-users-toggle-pw">
              {show ? "Скрий" : "Покажи"}
            </button>
          </div>
          <ul className="np-users-rules">
            {PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li key={rule.id} className={`np-users-rule ${ok ? "is-ok" : ""}`}>
                  <span className="np-users-rule-dot" aria-hidden="true">{ok ? "✓" : ""}</span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </div>

        {error ? (
          <p role="alert" className="np-users-alert np-users-alert--error">
            {error}
          </p>
        ) : null}

        <div className="np-users-dialog-foot">
          <button type="button" onClick={onClose} className="np-users-btn np-users-btn--secondary">Отказ</button>
          <button type="submit" disabled={pending} className="np-users-btn np-users-btn--primary">
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StaffRole>("all");
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const roles = assignableRoles(actor.role);

  const counts = useMemo(() => countUsers(users), [users]);

  const filtered = useMemo(() => filterUsers(users, filter, query), [users, filter, query]);

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
    <div className="np-users">
      <header className="np-users-header">
        <div>
          <h1>Профили</h1>
          <p>
            {users.length} {users.length === 1 ? "профил" : "профила"} ·{" "}
            {canManageAccounts
              ? "създавате и изтривате профили и сменяте роли"
              : "сменяте ролите между редактор и администратор"}
          </p>
        </div>
        {canManageAccounts ? (
          <button type="button" onClick={() => setCreating(true)} className="np-users-btn np-users-btn--primary">
            <span aria-hidden="true">＋</span> Нов профил
          </button>
        ) : null}
      </header>

      <div className="np-users-toolbar">
        <div className="np-users-search">
          <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth={2} />
            <path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Търсене по име, имейл или био…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="np-users-search-input"
            aria-label="Търсене на профили"
          />
        </div>
        <div className="np-users-chips" role="tablist" aria-label="Филтър">
          {([
            ["all", "Всички", counts.all],
            ["editor", ROLE_LABELS.editor, counts.editor ?? 0],
            ["admin", ROLE_LABELS.admin, counts.admin ?? 0],
            ["master_admin", ROLE_LABELS.master_admin, counts.master_admin ?? 0],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className="np-users-chip"
            >
              {label}
              <span className="np-users-chip-count">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`np-users-alert ${notice.tone === "error" ? "np-users-alert--error" : "np-users-alert--success"}`}
        >
          {notice.text}
        </p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="np-users-table-wrap">
          <table className="np-users-table">
            <thead>
              <tr>
                <th>Профил</th>
                <th>Имейл</th>
                <th>Роля</th>
                <th>Активност</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const isSelf = user.id === actor.id;
                const editableRole = roles.some((role) => role !== user.role && canChangeRole(actor, user, role));
                const deletable = canDeleteAccount(actor, user);
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="np-users-profile">
                        {user.profileImageUrl ? (
                          <img src={user.profileImageUrl} alt="" className="np-users-avatar" />
                        ) : (
                          <span className="np-users-avatar np-users-avatar--initials">{initials(user.name)}</span>
                        )}
                        <div className="min-w-0">
                          <p className="np-users-name">
                            {user.name}
                            {isSelf ? <span className="np-users-self">вие</span> : null}
                          </p>
                          {user.profileBio ? <p className="np-users-bio">{user.profileBio}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="np-users-email">{user.email}</td>
                    <td>
                      {editableRole ? (
                        <select
                          aria-label={`Роля на ${user.name}`}
                          value={user.role}
                          disabled={busyId === user.id}
                          onChange={(event) => void changeRole(user, event.target.value as StaffRole)}
                          className="np-users-select"
                        >
                          {user.role === "master_admin" ? (
                            <option value="master_admin">{ROLE_LABELS.master_admin}</option>
                          ) : null}
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`np-users-role np-users-role--${ROLE_TONE[user.role]}`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      )}
                    </td>
                    <td className="np-users-activity">
                      {user.lastActiveAt ? `Активен ${formatWhen(user.lastActiveAt)}` : "Още не е влизал"}
                    </td>
                    <td className="np-users-actions">
                      {canManageAccounts ? (
                        <button
                          type="button"
                          disabled={!deletable || busyId === user.id}
                          onClick={() => void remove(user)}
                          aria-label={`Изтрий ${user.name}`}
                          title={deletable ? "Изтрий профила" : "Не можете да изтриете собствения си профил"}
                          className="np-users-icon-btn"
                        >
                          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                          </svg>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="np-users-empty">
          {query ? (
            <p>Нищо не съвпада с „{query.trim()}".</p>
          ) : (
            <p>{filter === "all" ? "Няма създадени профили." : `Няма профили с роля ${ROLE_LABELS[filter]}.`}</p>
          )}
        </div>
      )}

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