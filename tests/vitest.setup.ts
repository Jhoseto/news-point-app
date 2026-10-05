/**
 * Vitest setup file. Runs before each test file in this workspace.
 *
 * The `server-only` package throws when imported from a non-server context
 * (it is a marker package for Next.js Server Components). Vitest is a
 * server runtime, but the package's `default` export throws unconditionally
 * — only the `react-server` conditional export returns an empty module.
 *
 * We mock the package globally so any module under test can still resolve
 * `import "server-only"` without crashing the test runner.
 */
import { vi } from "vitest";

vi.mock("server-only", () => ({ default: {}, __esModule: true }));