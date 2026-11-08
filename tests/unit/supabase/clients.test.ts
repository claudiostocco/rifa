/**
 * ET-4 · Teste 2 (unit): a chave `service_role` jamais acessível no browser.
 * Cenário A — em ambiente de navegador (jsdom), a fábrica do client
 * administrador aborta com mensagem pt-BR antes de qualquer leitura de chave.
 * Cenário B — o módulo do client do navegador (`client.ts`) não contém
 * nenhuma referência à variável da service_role (auditoria de código).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  // Provê valores plausíveis para provar que a guarda dispara ANTES do env.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-anon-de-teste";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-service-role-de-teste";
});

describe("bootstrap dos clients Supabase (ET-4)", () => {
  it("deve recusar client service_role no navegador com mensagem em pt-BR", async () => {
    const { criarClienteAdministrador } = await import("@/lib/supabase/server");

    // jsdom define `window` — o bundle de browser não pode chegar à chave.
    expect(typeof window).toBe("object");

    expect(() => criarClienteAdministrador()).toThrow(
      /service_role não pode ser usada no navegador/
    );
  });

  it("deve conter apenas variáveis NEXT_PUBLIC_* no client do navegador", async () => {
    const arquivo = path.resolve(__dirname, "../../../lib/supabase/client.ts");
    const fonte = readFileSync(arquivo, "utf8");

    // A única chave de leitura permitida no browser é a anon pública.
    expect(fonte).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(fonte).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
