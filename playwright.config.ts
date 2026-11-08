import { defineConfig, devices } from "@playwright/test";

/**
 * ET-6 · Runner E2E (Playwright): 1 projeto mobile 360px + 1 desktop,
 * baseURL local (SPEC RNF-01 — 360px é a referência mínima de tela).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    locale: "pt-BR",
  },
  projects: [
    {
      name: "celular-360",
      use: { ...devices["Galaxy S10"] },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
