// Locks an account after repeated wrong passwords, on top of the per-IP rate
// limit, so a distributed guess against one account is also slowed down.
// In memory: one Studio process for now; a shared store comes with production.

export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

interface Entry {
  failures: number[];
  lockedUntil: number;
}

export class LoginGuard {
  private readonly entries = new Map<string, Entry>();

  private key(email: string) {
    return email.trim().toLowerCase();
  }

  /** Milliseconds until the account unlocks; 0 when sign-in may proceed. */
  lockedFor(email: string, now = Date.now()): number {
    const entry = this.entries.get(this.key(email));
    return entry && entry.lockedUntil > now ? entry.lockedUntil - now : 0;
  }

  recordFailure(email: string, now = Date.now()) {
    const key = this.key(email);
    const entry = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = [...entry.failures.filter((at) => now - at < FAILURE_WINDOW_MS), now];
    if (entry.failures.length >= MAX_FAILURES) {
      entry.lockedUntil = now + LOCK_MS;
      entry.failures = [];
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > MAX_TRACKED) this.entries.delete(this.entries.keys().next().value!);
  }

  recordSuccess(email: string) {
    this.entries.delete(this.key(email));
  }
}
