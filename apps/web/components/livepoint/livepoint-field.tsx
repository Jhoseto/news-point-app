import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { ArrowRightIcon } from "../icons";

export const npField =
  "w-full rounded-xl border border-line bg-surface px-4 text-[0.9375rem] font-medium text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted/80 hover:border-accent/35 focus:border-accent focus:shadow-[0_0_0_4px_rgb(56_24_214/0.10)] dark:focus:shadow-[0_0_0_4px_rgb(106_60_240/0.22)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[0.8125rem] font-bold text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-relaxed font-medium text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${npField} h-12 ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${npField} min-h-32 resize-y py-3 ${props.className ?? ""}`} />;
}

export function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid grid-cols-3 gap-2">
      {options.map((option) => (
        <label key={option.id} className="min-w-0 cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
            className="peer sr-only"
          />
          <span className="np-lp-choice flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-2 py-2 text-center text-xs leading-tight font-bold text-muted transition-[background-color,border-color,color,box-shadow] duration-200 sm:text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export function SubmissionIntro({
  tone,
  icon,
  eyebrow,
  title,
  description,
  points,
  footer,
}: {
  tone: "report" | "story";
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  footer?: ReactNode;
}) {
  return (
    <aside className="np-lp-form-intro relative overflow-hidden rounded-[1.4rem] border border-line p-4 sm:p-6 lg:sticky lg:top-0 lg:flex lg:min-h-[30rem] lg:flex-col" data-tone={tone}>
      <div className="relative z-10 inline-flex size-10 items-center justify-center rounded-2xl border border-white/45 bg-white/75 text-accent shadow-[0_8px_22px_-10px_rgb(56_24_214/0.35)] sm:size-12 dark:border-white/15 dark:bg-white/10 dark:text-link">
        {icon}
      </div>
      <p className="relative z-10 mt-3 text-[0.6875rem] font-extrabold tracking-[0.14em] text-accent uppercase sm:mt-5 dark:text-link">{eyebrow}</p>
      <h3 className="relative z-10 mt-2 max-w-sm text-lg leading-tight font-extrabold tracking-tight text-ink sm:text-2xl">{title}</h3>
      <p className="relative z-10 mt-2 max-w-sm text-xs leading-relaxed text-body sm:mt-3 sm:text-sm">{description}</p>
      <div className="relative z-10 mt-5 hidden space-y-3 border-t border-line/70 pt-5 lg:block">
        {points.map((point, index) => (
          <p key={point} className="flex items-start gap-3 text-xs leading-relaxed font-semibold text-body sm:text-sm">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-surface/80 text-[0.6875rem] font-extrabold text-accent dark:text-link">{index + 1}</span>
            <span>{point}</span>
          </p>
        ))}
      </div>
      {footer ? <div className="relative z-10 mt-4 lg:mt-auto lg:pt-5">{footer}</div> : null}
    </aside>
  );
}

export function ConsentRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-xs leading-relaxed font-medium text-body transition-colors hover:border-accent/35 sm:text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} required className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span>{children}</span>
    </label>
  );
}

export function SubmitButton({ pending, children, disabled }: { pending: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="np-lp-form-submit inline-flex min-h-12 items-center justify-center gap-3 rounded-xl px-5 py-3 text-sm font-extrabold text-white transition-[transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {pending ? "Изпращане…" : children}
      {!pending ? <ArrowRightIcon width={17} height={17} /> : null}
    </button>
  );
}

export function SubmissionSuccess({ title, reference, description }: { title: string; reference: string; description: string }) {
  return (
    <div role="status" className="np-lp-form-success rounded-[1.4rem] border border-line p-6 sm:p-8">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-2xl font-extrabold text-accent dark:text-link" aria-hidden="true">✓</span>
      <p className="mt-5 text-xl font-extrabold tracking-tight text-ink">{title}</p>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-body">{description}</p>
      <div className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-xl border border-accent/20 bg-surface px-4 py-3 text-sm">
        <span className="font-semibold text-muted">Номер на заявката</span>
        <strong className="font-extrabold text-ink tabular-nums">{reference}</strong>
      </div>
    </div>
  );
}
