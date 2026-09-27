"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StaffRole } from "@newspoint/db/schema";
import type { AuthorProfileInput } from "@/lib/author-profile";
import { authClient } from "@/lib/auth-client";
import { callApi } from "@/lib/client-api";
import { ROLE_LABELS } from "@/lib/editor/roles";
import { PASSWORD_MAX, PASSWORD_RULES, passwordProblems } from "@/lib/password-policy";
import { withBase } from "@/lib/paths";
import { ProfilePhotoCropper } from "./profile-photo-cropper";

export function AuthorProfileEditor({ staff, initial }: { staff: { email: string; role: StaffRole }; initial: AuthorProfileInput & { hasPhoto: boolean } }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthorProfileInput>({ name: initial.name, bio: initial.bio });
  const [saved, setSaved] = useState(profile);
  const [hasPhoto, setHasPhoto] = useState(initial.hasPhoto);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoPending, setPhotoPending] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved);
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || cropFile) event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, cropFile]);

  function selectPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.size || file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice({ tone: "error", text: "Изберете JPEG, PNG или WebP снимка до 10 MB." });
      return;
    }
    setCropFile(file);
  }

  async function removePhoto() {
    if (!window.confirm("Да премахна ли профилната снимка?")) return;
    setPhotoPending(true);
    try {
      const result = await callApi("DELETE", "/api/profile/photo/");
      if (!result.ok) setNotice({ tone: "error", text: result.error.message });
      else { setHasPhoto(false); setNotice({ tone: "success", text: "Снимката е премахната." }); router.refresh(); }
    } finally { setPhotoPending(false); }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice({ tone: "error", text: "Изберете JPEG, PNG или WebP снимка до 10 MB." });
      return;
    }
    setPhotoPending(true);
    setNotice(null);
    const body = new FormData();
    body.set("photo", file);
    try {
      const response = await fetch(withBase("/api/profile/photo/"), { method: "POST", body, cache: "no-store" });
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) setNotice({ tone: "error", text: result.error?.message ?? "Качването не беше успешно." });
      else {
        setHasPhoto(true);
        setCropFile(null);
        setPhotoVersion(Date.now());
        setNotice({ tone: "success", text: "Снимката е оптимизирана и качена." });
        router.refresh();
      }
    } catch {
      setNotice({ tone: "error", text: "Няма връзка със сървъра." });
    } finally {
      setPhotoPending(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    const result = await callApi<AuthorProfileInput>("PATCH", "/api/profile/", profile);
    setPending(false);
    if (!result.ok) return setNotice({ tone: "error", text: result.error.message });
    setProfile(result.data);
    setSaved(result.data);
    setNotice({ tone: "success", text: "Профилът е обновен." });
    router.refresh();
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordNotice(null);
    const problems = passwordProblems(newPassword);
    if (!currentPassword) return setPasswordNotice({ tone: "error", text: "Въведете текущата си парола." });
    if (problems.length) return setPasswordNotice({ tone: "error", text: `Новата парола не отговаря на правилата: ${problems.join(", ")}.` });
    if (newPassword !== confirmPassword) return setPasswordNotice({ tone: "error", text: "Двете нови пароли не съвпадат." });
    if (newPassword === currentPassword) return setPasswordNotice({ tone: "error", text: "Новата парола трябва да е различна от текущата." });
    setPasswordPending(true);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setPasswordPending(false);
    if (result.error) return setPasswordNotice({ tone: "error", text: result.error.message || "Текущата парола е грешна или промяната не беше приета." });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordNotice({ tone: "success", text: "Паролата е сменена. Другите активни сесии са прекратени." });
  }

  return (
    <>
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <p className="text-xs font-extrabold tracking-wider text-accent uppercase">Лична зона</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Моят профил</h1>
        <p className="mt-1 text-sm text-muted">Информацията е достъпна само в Studio за вас и администраторите.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.78fr)]">
        <form onSubmit={saveProfile} className="np-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center">
            {hasPhoto ? <img src={`${withBase("/api/profile/photo/")}?v=${photoVersion}`} alt="Профилна снимка" className="size-20 rounded-full object-cover shadow-card" /> : <span className="np-gradient-bg flex size-20 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white shadow-card">{initials}</span>}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold text-ink">{profile.name}</p>
              <p className="truncate text-sm text-muted">{staff.email}</p>
              <span className="mt-1.5 inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">{ROLE_LABELS[staff.role]}</span>
            </div>
            <label className="np-btn np-btn-secondary cursor-pointer px-3 py-1.5 text-xs">
              {photoPending ? "Обработка…" : hasPhoto ? "Смени снимката" : "Качи снимка"}
              <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={photoPending} onChange={(event) => { selectPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} className="sr-only" />
            </label>
            {hasPhoto ? <button type="button" disabled={photoPending} onClick={() => void removePhoto()} className="text-xs font-bold text-muted hover:text-danger">Премахни</button> : null}
          </div>
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="profile-name" className="np-label">Име</label><input id="profile-name" value={profile.name} onChange={(event) => setProfile((value) => ({ ...value, name: event.target.value }))} minLength={2} maxLength={80} required autoComplete="name" className="np-input" /></div>
              <div><span className="np-label">Имейл</span><div className="np-input truncate bg-surface-2 text-muted">{staff.email}</div></div>
            </div>
            <p className="text-xs text-faint">Можете да сменяте името си. Имейлът и ролята се управляват от администратор.</p>
            <div>
              <div className="flex items-end justify-between gap-3"><label htmlFor="profile-bio" className="np-label">Вътрешна информация</label><span className="mb-1.5 text-xs text-faint tabular-nums">{profile.bio.length}/1500</span></div>
              <textarea id="profile-bio" rows={5} maxLength={1500} value={profile.bio} onChange={(event) => setProfile((value) => ({ ...value, bio: event.target.value }))} placeholder="Кратка служебна информация, ресори и бележки." className="np-input resize-y" />
            </div>
            {notice ? <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold ${notice.tone === "error" ? "bg-danger/5 text-danger" : "bg-success/10 text-success"}`}>{notice.text}</p> : null}
            <div className="flex items-center justify-end gap-3 border-t border-line pt-4"><span role="status" className="mr-auto text-xs text-muted">{dirty ? "Незаписани промени" : "Всички промени са записани"}</span><button type="button" disabled={pending || !dirty} onClick={() => setProfile(saved)} className="np-btn np-btn-secondary px-3 py-2 text-xs">Отмени</button><button type="submit" disabled={pending || !dirty} className="np-btn np-btn-primary px-4 py-2 text-sm">{pending ? "Записване…" : "Запиши профила"}</button></div>
          </div>
        </form>

        <form onSubmit={changePassword} className="np-card p-5" autoComplete="off">
          <h2 className="text-lg font-extrabold text-ink">Сигурност</h2>
          <label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />Покажи паролите</label>
          <p className="mt-1 text-sm text-muted">След промяната другите активни сесии ще бъдат прекратени.</p>
          <div className="mt-4 space-y-3">
            <div><label htmlFor="current-password" className="np-label">Текуща парола</label><input id="current-password" type={showPasswords ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} maxLength={PASSWORD_MAX} required className="np-input" /></div>
            <div><label htmlFor="new-password" className="np-label">Нова парола</label><input id="new-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} maxLength={PASSWORD_MAX} required className="np-input" /></div>
            <div><label htmlFor="confirm-password" className="np-label">Повторете новата парола</label><input id="confirm-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} maxLength={PASSWORD_MAX} required className="np-input" /></div>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-semibold">
            {PASSWORD_RULES.map((rule) => { const ok = rule.test(newPassword); return <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? "text-success" : "text-faint"}`}><span className={`flex size-3.5 items-center justify-center rounded-full text-[0.5rem] ${ok ? "bg-success text-white" : "border border-line"}`} aria-hidden="true">{ok ? "✓" : ""}</span>{rule.label}</li>; })}
          </ul>
          {passwordNotice ? <p role={passwordNotice.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm font-semibold ${passwordNotice.tone === "error" ? "bg-danger/5 text-danger" : "bg-success/10 text-success"}`}>{passwordNotice.text}</p> : null}
          <div className="mt-4 flex justify-end border-t border-line pt-4"><button type="submit" disabled={passwordPending} className="np-btn np-btn-primary px-4 py-2 text-sm">{passwordPending ? "Смяна…" : "Смени паролата"}</button></div>
        </form>
      </div>
    </div>
    {cropFile ? <ProfilePhotoCropper file={cropFile} busy={photoPending} onCancel={() => setCropFile(null)} onSave={async (file) => { await uploadPhoto(file); }} /> : null}
    </>
  );
}

