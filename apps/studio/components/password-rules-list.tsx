"use client";

import { PASSWORD_RULES, passwordProblems } from "@/lib/password-policy";

export function PasswordRulesList({ value }: { value: string }) {
  const problems = passwordProblems(value);
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const ok = !problems.includes(rule.label);
        return (
          <li key={rule.id} className={ok ? "text-success" : undefined}>
            {ok ? "✓" : "○"} {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
