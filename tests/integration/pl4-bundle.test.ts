/**
 * PL-4 · Bundle de produção e fronteira de runtime (SPEC §2.2/§2.3).
 *
 * O teste lê os chunks gerados por `next build`: segredos server-only não
 * podem chegar ao JavaScript servido ao navegador. A segunda prova simula a
 * presença de window e confirma que a fábrica service_role aborta antes de
 * ler a chave.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

function arquivosJavaScript(diretorio: string): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return arquivosJavaScript(caminho);
    return entrada.isFile() && caminho.endsWith(".js") ? [caminho] : [];
  });
}

describe("PL-4 · bundle e runtime sem service_role", () => {
  it("deve excluir service_role, chaves privadas e segredos de teste dos chunks do navegador", () => {
    const diretorioStatic = path.resolve(process.cwd(), ".next/static");
    expect(statSync(diretorioStatic, { throwIfNoEntry: false })).toBeTruthy();

    const chunks = arquivosJavaScript(diretorioStatic);
    expect(chunks.length).toBeGreaterThan(0);
    const bundle = chunks.map((arquivo) => readFileSync(arquivo, "utf8")).join("\n");

    expect(bundle).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(bundle).not.toContain("service_role");
    expect(bundle).not.toContain("chave-service-role-de-teste");
    expect(bundle).not.toContain("TEST_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("deve bloquear a fábrica service_role quando executada em runtime de navegador", async () => {
    vi.stubGlobal("window", {});
    const { criarClienteAdministrador } = await import("@/lib/supabase/server");

    expect(() => criarClienteAdministrador()).toThrow(
      /service_role não pode ser usada no navegador/,
    );
    vi.unstubAllGlobals();
  });
});
