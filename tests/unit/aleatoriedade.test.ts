/**
 * SR-4 · Aleatoriedade e distribuição (RNF-07) — SPEC §4.9/§2.4 (tabela de
 * RNF §5.3: "crypto.randomInt/pgcrypto; revisão de código") · SR-4 do PLAN.
 *
 * Teste 2 (unit): a geração NÃO usa `Math.random` (inspeção de código —
 *   nenhuma ocorrência fora de comentários em lib/, actions/, components/,
 *   app/ e migrações) e a aleatoriedade criptográfica é demonstrável:
 *   pgcrypto `gen_random_bytes` alimenta a RPC `sortear_rifa` (migração 002),
 *   `crypto.getRandomValues` alimenta o sufixo do slug (FD-10) — e, em
 *   runtime, `gerarSufixo` funciona até com `Math.random` sabotado para
 *   lançar (prova de que não há caminho de azar não criptográfico).
 *
 * Teste 1 (int) vive em tests/integration/sr4-aleatoriedade.test.ts
 * (Postgres real — vencedor sempre dentro do conjunto de vendidos).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { gerarSufixo } from "@/lib/slug";

// `pnpm test` roda sempre da raiz do repositório (scripts do package.json).
const raiz = process.cwd();

/** Escopo da inspeção: código da casa (e a SQL do sorteio) — nunca tests/. */
const DIRETORIOS_FONTE = ["lib", "actions", "components", "app", "supabase/migrations"];
const EXTENSOES_FONTE = new Set([".ts", ".tsx", ".mjs", ".sql"]);

function arquivosFonte(diretorio: string): string[] {
  const caminho = path.join(raiz, diretorio);
  const saida: string[] = [];
  for (const entrada of readdirSync(caminho, { withFileTypes: true })) {
    const relativo = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivosFonte(relativo));
    else if (EXTENSOES_FONTE.has(path.extname(entrada.name))) saida.push(relativo);
  }
  return saida;
}

/**
 * Linhas (1-based) onde `Math.random` aparece FORA de comentário — uma
 * ocorrência em comentário (vedação documentada, ex.: `// RNF-07 veda
 * Math.random`) não é uso.
 */
function linhasComMathRandom(conteudo: string, extensao: string): number[] {
  const achados: number[] = [];
  const linhas = conteudo.split(/\r?\n/);
  linhas.forEach((linha, indice) => {
    let posicao = linha.indexOf("Math.random");
    while (posicao !== -1) {
      const antes = linha.slice(0, posicao);
      const emComentario =
        extensao === ".sql"
          ? antes.includes("--")
          : antes.includes("//") ||
            (antes.includes("/*") && !/\*\/\s*$/.test(antes)) ||
            antes.trimStart().startsWith("*");
      if (!emComentario) {
        achados.push(indice + 1);
        break;
      }
      posicao = linha.indexOf("Math.random", posicao + 1);
    }
  });
  return achados;
}

describe("SR-4 · Aleatoriedade criptográfica (RNF-07) — revisão de código", () => {
  it("deve gerar o sorteio e o sufixo do slug sem Math.random (inspeção de código, ocorrências fora de comentários)", () => {
    // Prova de que o detector não é vacuo: sinaliza uso em código e tolera
    // a menção de vedação em comentário (TS e SQL).
    expect(linhasComMathRandom("const k = Math.floor(Math.random() * n);", ".ts")).toEqual([1]);
    expect(linhasComMathRandom(" * exigência do RNF-07: `Math.random` é proibido.", ".ts")).toEqual(
      [],
    );
    expect(linhasComMathRandom("-- RNF-07 veda Math.random; use pgcrypto.", ".sql")).toEqual([]);
    expect(linhasComMathRandom("select 1; select Math.random();", ".sql")).toEqual([1]);

    const violacoes: string[] = [];
    for (const diretorio of DIRETORIOS_FONTE) {
      for (const arquivo of arquivosFonte(diretorio)) {
        const conteudo = readFileSync(path.join(raiz, arquivo), "utf8");
        for (const linha of linhasComMathRandom(conteudo, path.extname(arquivo))) {
          violacoes.push(`${arquivo}:${linha}`);
        }
      }
    }
    expect(violacoes).toEqual([]);
  });

  it("deve demonstrar a fonte criptográfica no código e em runtime (pgcrypto na RPC, Web Crypto no slug — funciona com Math.random sabotado)", () => {
    // RPC do sorteio (migração 002): 8 bytes do pgcrypto alimentam o k.
    const migracaoSorteio = readFileSync(
      path.join(raiz, "supabase/migrations/002_sorteio.sql"),
      "utf8",
    );
    expect(migracaoSorteio).toContain("create extension if not exists pgcrypto");
    expect(migracaoSorteio).toContain("gen_random_bytes(8)");

    // Slug (FD-10): sufixo via Web Crypto do runtime do servidor.
    const fonteSlug = readFileSync(path.join(raiz, "lib/slug.ts"), "utf8");
    expect(fonteSlug).toContain("crypto.getRandomValues");

    // Prova em runtime: com Math.random LANÇANDO, a geração segue íntegra —
    // não existe caminho de azar que dependa dele (RNF-07).
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random proibido no servidor (RNF-07).");
    };
    try {
      const sufixo = gerarSufixo();
      expect(sufixo).toMatch(/^[a-z0-9]{4}$/);
      const repetido = gerarSufixo();
      expect(repetido).toMatch(/^[a-z0-9]{4}$/);
    } finally {
      Math.random = original;
    }
  });
});
