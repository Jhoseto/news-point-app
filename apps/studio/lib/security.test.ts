import { describe, expect, it } from "vitest";
import { LOCK_MS, LoginGuard, MAX_FAILURES } from "./login-guard";
import { passwordProblems } from "./password-policy";

describe("passwordProblems", () => {
  it("accepts a password that meets every rule, Cyrillic included", () => {
    expect(passwordProblems("Novini#2026")).toEqual([]);
    expect(passwordProblems("Новини#2026")).toEqual([]);
  });

  it("names each missing rule", () => {
    expect(passwordProblems("short")).toEqual(["Поне 8 знака", "Голяма буква", "Цифра", "Символ (!, @, #, …)"]);
    expect(passwordProblems("ALLUPPER1!")).toEqual(["Малка буква"]);
    expect(passwordProblems("NoSymbol123")).toEqual(["Символ (!, @, #, …)"]);
  });

  it("does not count spaces as a symbol", () => {
    expect(passwordProblems("Abc defg1")).toContain("Символ (!, @, #, …)");
  });
});

describe("LoginGuard", () => {
  it("locks an account after repeated failures and unlocks later", () => {
    const guard = new LoginGuard();
    const start = 1_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i++) guard.recordFailure("Ivan@NewsPoint.bg", start + i);
    expect(guard.lockedFor("ivan@newspoint.bg", start + 10)).toBe(0);
    guard.recordFailure("ivan@newspoint.bg", start + 10);
    expect(guard.lockedFor("ivan@newspoint.bg", start + 11)).toBeGreaterThan(0);
    expect(guard.lockedFor("ivan@newspoint.bg", start + 10 + LOCK_MS)).toBe(0);
  });

  it("forgets failures after a successful sign-in", () => {
    const guard = new LoginGuard();
    for (let i = 0; i < MAX_FAILURES - 1; i++) guard.recordFailure("a@b.bg");
    guard.recordSuccess("a@b.bg");
    guard.recordFailure("a@b.bg");
    expect(guard.lockedFor("a@b.bg")).toBe(0);
  });
});
