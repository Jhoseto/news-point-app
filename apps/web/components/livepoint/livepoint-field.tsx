import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/** Same quiet field as the header search: surface-2, hairline, logo ring on focus. */
export const npField =
  "w-full rounded-2xl border border-line bg-surface-2/70 px-3.5 text-[0.9375rem] font-medium text-ink outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted hover:border-accent/30 focus:border-accent/60 focus:bg-surface focus:shadow-[0_0_0_4px_rgb(56_24_214/0.10)] dark:focus:shadow-[0_0_0_4px_rgb(106_60_240/0.22)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs font-medium text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${npField} h-11 ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${npField} min-h-28 py-3 ${props.className ?? ""}`} />;
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
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const on = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              on ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2/70 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SubmitButton({ pending, children, disabled }: { pending: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-full bg-logo px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
    >
      {pending ? "Изпращане…" : children}
    </button>
  );
}
