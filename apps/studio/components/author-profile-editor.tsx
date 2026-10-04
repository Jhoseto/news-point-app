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
import "./author-profile-editor.css";

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
    <div className="np-profile">
      <header className="np-profile-header">
        <span className="np-profile-eyebrow">Лична зона</span>
        <h1>Моят профил</h1>
        <p>Информацията е достъпна само в Studio за вас и администраторите.</p>
      </header>

      <div className="np-profile-grid">
        <form onSubmit={saveProfile} className="np-profile-card">
          <div className="np-profile-card-head">
            {hasPhoto ? <img src={`${withBase("/api/profile/photo/")}?v=${photoVersion}`} alt="Профилна снимка" className="np-profile-avatar np-profile-avatar--image" /> : <span className="np-profile-avatar np-profile-avatar--initials">{initials}</span>}
            <div className="np-profile-id">
              <p className="np-profile-name">{profile.name}</p>
              <p className="np-profile-email">{staff.email}</p>
              <span className="np-profile-role">{ROLE_LABELS[staff.role]}</span>
            </div>
            <div className="np-profile-photo-actions">
              <label className="np-profile-btn np-profile-btn--secondary">
                {photoPending ? "Обработка…" : hasPhoto ? "Смени снимката" : "Качи снимка"}
                <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={photoPending} onChange={(event) => { selectPhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} className="sr-only" />
              </label>
              {hasPhoto ? (
                <button type="button" disabled={photoPending} onClick={() => void removePhoto()} className="np-profile-text-danger">
                  Премахни
                </button>
              ) : null}
            </div>
          </div>

          <div className="np-profile-body">
            <div className="np-profile-fields">
              <label className="np-profile-field">
                <span>Име</span>
                <input
                  id="profile-name"
                  value={profile.name}
                  onChange={(event) => setProfile((value) => ({ ...value, name: event.target.value }))}
                  minLength={2}
                  maxLength={80}
                  required
                  autoComplete="name"
                  className="np-profile-input"
                />
              </label>
              <div className="np-profile-field">
                <span>Имейл</span>
                <div className="np-profile-readonly">{staff.email}</div>
              </div>
            </div>
            <p className="np-profile-hint">Можете да сменяте името си. Имейлът и ролята се управляват от администратор.</p>
            <label className="np-profile-field">
              <div className="np-profile-field-head">
                <span>Вътрешна информация</span>
                <span className="np-profile-counter">{profile.bio.length}/1500</span>
              </div>
              <textarea
                id="profile-bio"
                rows={5}
                maxLength={1500}
                value={profile.bio}
                onChange={(event) => setProfile((value) => ({ ...value, bio: event.target.value }))}
                placeholder="Кратка служебна информация, ресори и бележки."
                className="np-profile-textarea"
              />
            </label>
            {notice ? (
              <p role={notice.tone === "error" ? "alert" : "status"} className={`np-profile-alert np-profile-alert--${notice.tone}`}>
                {notice.text}
              </p>
            ) : null}
            <div className="np-profile-foot">
              <span className="np-profile-save-state">
                <span className={`np-profile-save-dot ${dirty ? "is-dirty" : ""}`} />
                {dirty ? "Незаписани промени" : "Всички промени са запазени"}
              </span>
              <div className="np-profile-foot-actions">
                <button type="button" disabled={pending || !dirty} onClick={() => setProfile(saved)} className="np-profile-btn np-profile-btn--secondary">Отмени</button>
                <button type="submit" disabled={pending || !dirty} className="np-profile-btn np-profile-btn--primary">
                  {pending ? "Записване…" : "Запиши профила"}
                </button>
              </div>
            </div>
          </div>
        </form>

        <form onSubmit={changePassword} className="np-profile-card np-profile-card--security" autoComplete="off">
          <div className="np-profile-card-head np-profile-card-head--title">
            <h2 className="np-profile-card-heading">Сигурност</h2>
          </div>
          <div className="np-profile-body">
            <p className="np-profile-hint">След промяната другите активни сесии ще бъдат прекратени.</p>
            <label className="np-profile-toggle">
              <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
              <span>Покажи паролите</span>
            </label>
            <div className="np-profile-password-fields">
              <label className="np-profile-field">
                <span>Текуща парола</span>
                <input id="current-password" type={showPasswords ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} maxLength={PASSWORD_MAX} required className="np-profile-input" />
              </label>
              <div className="np-profile-password-new">
                <label className="np-profile-field">
                  <span>Нова парола</span>
                  <input id="new-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} maxLength={PASSWORD_MAX} required className="np-profile-input" />
                </label>
                <label className="np-profile-field">
                  <span>Потвърди паролата</span>
                  <input id="confirm-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} maxLength={PASSWORD_MAX} required className="np-profile-input" />
                </label>
              </div>
            </div>
            <ul className="np-profile-rules">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(newPassword);
                return (
                  <li key={rule.id} className={`np-profile-rule ${ok ? "is-ok" : ""}`}>
                    <span className="np-profile-rule-dot" aria-hidden="true">{ok ? "✓" : ""}</span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
            {passwordNotice ? (
              <p role={passwordNotice.tone === "error" ? "alert" : "status"} className={`np-profile-alert np-profile-alert--${passwordNotice.tone}`}>
                {passwordNotice.text}
              </p>
            ) : null}
            <div className="np-profile-foot">
              <span />
              <button type="submit" disabled={passwordPending} className="np-profile-btn np-profile-btn--primary">
                {passwordPending ? "Смяна…" : "Смени паролата"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
    {cropFile ? <ProfilePhotoCropper file={cropFile} busy={photoPending} onCancel={() => setCropFile(null)} onSave={async (file) => { await uploadPhoto(file); }} /> : null}
    </>
  );
}