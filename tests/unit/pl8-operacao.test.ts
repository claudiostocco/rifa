import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const raiz = resolve(import.meta.dirname, "../..");
const ler = (arquivo: string) => readFileSync(resolve(raiz, arquivo), "utf8");

describe("PL-8 · operação e seed", () => {
  it("deve documentar o fluxo zero-to-one sem cadastro público", () => {
    const readme = ler("README.md");

    expect(readme).toContain("Authentication → Users → Add user");
    expect(readme).toContain("`enable_signup = false`");
    expect(readme).toContain("`/perfil`");
    expect(readme).toContain("`/r/{slug}`");
  });

  it("deve manter o seed opt-in e protegido contra execução sem ambiente local", () => {
    const config = ler("supabase/config.toml");
    const seed = ler("supabase/seed.sql");

    expect(config).toMatch(/\[db\.seed\][\s\S]*?enabled = false/);
    expect(seed).toContain("current_setting('rifa.seed_environment', true)");
    expect(seed).toContain("<> 'local'");
    expect(seed).toContain("rifa-demo-local");
    expect(ler("README.md")).toContain(
      "nunca deve ser executado contra a URL do projeto hospedado",
    );
  });
});
