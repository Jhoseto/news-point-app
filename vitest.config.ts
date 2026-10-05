import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Absolute path to `server-only/empty.js` so we can alias `server-only` to
 * it. The package's `default` export throws unconditionally, and only the
 * `react-server` conditional export is empty; without this alias, importing
 * any module that pulls in `server-only` from a test outside
 * `apps/studio/lib/` crashes the runner.
 */
const serverOnlyEmpty = resolve(
  import.meta.dirname,
  "node_modules/.pnpm/server-only@0.0.1/node_modules/server-only/empty.js",
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: serverOnlyEmpty },
    ],
  },
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    setupFiles: ["tests/vitest.setup.ts"],
  },
});
