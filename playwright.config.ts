import { execSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

/**
 * ET-6 · Runner E2E (Playwright): 1 projeto mobile 360px + 1 desktop,
 * baseURL local (SPEC RNF-01 — 360px é a referência mínima de tela).
 *
 * FD-8: o app em teste fala com o POSTGRES real local (SPEC §5.1) — quando
 * o stack Supabase está no ar, TODAS as credenciais do app são injetadas no
 * webServer a partir de `supabase status`: URL + anon (FD-8) e, desde a
 * FD-12, também a `service_role` — sem ela, o `.env.local` (apontado ao
 * cloud) vazava uma chave de outro ambiente para as Server Actions
 * (`criarClienteAdministrador`), que recebiam 401 no Postgres local. Um só
 * ambiente por execução: ou o stack local inteiro, ou o `.env.local` por
 * completo (sem stack). A service_role vive no processo do app de teste —
 * jamais no bundle do browser (teste ET-4 guarda isso).
 */
function variaveisDoStackLocal(): Record<string, string> {
  try {
    const status = JSON.parse(
      execSync("supabase status -o json", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as Record<string, string>;

    if (status.API_URL && status.ANON_KEY) {
      const variaveis: Record<string, string> = {
        NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      };
      if (status.SERVICE_ROLE_KEY) {
        variaveis.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
      }
      return variaveis;
    }
  } catch {
    // Stack local ausente: mantém o `.env.local` e roda o que for possível.
  }
  return {};
}

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
    env: variaveisDoStackLocal(),
  },
});
