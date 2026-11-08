import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": raiz },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["tests/unit/setup.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          // Integração exige Postgres real (Supabase CLI) — SPEC §5.1 proíbe mock.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
