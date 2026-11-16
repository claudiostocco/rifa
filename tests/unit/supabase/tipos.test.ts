/**
 * FD-4 · Tipos do banco (SPEC §5.1 — "nunca digite à mão a forma da tabela")
 *
 * Teste 1 (unit): o artefato gerado cobre as 6 tabelas públicas e a RPC
 *                 sortear_rifa — se alguém rodar contra um stack
 *                 desatualizado (ex.: sem migração 0002), falha aqui.
 * Teste 2 (unit): helpers de `lib/supabase/tipos.ts` derivam ESTRITAMENTE
 *                 dos tipos gerados (Equal) e o typecheck strict passa
 *                 usando somente os tipos gerados (FD-4).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import type {
  CompradorRow,
  NumeroRow,
  PerfilRow,
  RifaInsert,
  RifaRow,
  RifaUpdate,
  SortearRifaArgs,
  SorteioRow,
  VendaRow,
} from "@/lib/supabase/tipos";

const TABELAS_PUBLICAS = [
  "compradores",
  "numeros",
  "perfis",
  "rifas",
  "sorteios",
  "vendas",
] as const;

describe("FD-4 · tipos do banco gerados e helpers derivados", () => {
  it("deve cobrir o artefato gerado com as 6 tabelas public e a RPC sortear_rifa", () => {
    const artefato = readFileSync(
      path.resolve(process.cwd(), "lib", "supabase", "database.types.ts"),
      "utf8",
    );

    for (const tabela of TABELAS_PUBLICAS) {
      expect(artefato).toContain(`"${tabela}": {`);
    }

    // Migração 0002: a RPC deve constar com o argumento do contrato (§2.4)
    expect(artefato).toContain('"sortear_rifa"');
    expect(artefato).toContain('Args: { "rifa": string }');
  });

  it("deve derivar helpers estritamente dos tipos gerados e tipar dados com eles", () => {
    // ---- Provas type-level: cada helper É o tipo gerado (identidade, não cópia).
    // Qualquer forma digitada à mão divergente quebra o `pnpm typecheck`.
    type Igual<A, B> =
      (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
    type Esperar<T extends true> = T;

    type Provas = [
      Esperar<Igual<PerfilRow, Database["public"]["Tables"]["perfis"]["Row"]>>,
      Esperar<Igual<RifaRow, Database["public"]["Tables"]["rifas"]["Row"]>>,
      Esperar<Igual<NumeroRow, Database["public"]["Tables"]["numeros"]["Row"]>>,
      Esperar<Igual<CompradorRow, Database["public"]["Tables"]["compradores"]["Row"]>>,
      Esperar<Igual<VendaRow, Database["public"]["Tables"]["vendas"]["Row"]>>,
      Esperar<Igual<SorteioRow, Database["public"]["Tables"]["sorteios"]["Row"]>>,
      Esperar<Igual<RifaInsert, Database["public"]["Tables"]["rifas"]["Insert"]>>,
      Esperar<Igual<RifaUpdate, Database["public"]["Tables"]["rifas"]["Update"]>>,
      Esperar<Igual<SortearRifaArgs, Database["public"]["Functions"]["sortear_rifa"]["Args"]>>,
    ];
    // Provas[number] exige que TODOS os elementos sejam `true` (constraint)
    const provasOk: Esperar<Provas[number]> = true;
    expect(provasOk).toBe(true);

    // ---- Uso real tipado pela forma gerada: se gerador renomear/retipar
    // colunas, este literal quebra no `pnpm typecheck` (verificação FD-4).
    const rifaTipada: RifaRow = {
      id: crypto.randomUUID(),
      perfil_id: crypto.randomUUID(),
      slug: "rifa-da-comenda-fd4",
      titulo: "Rifa da Comenda da FD-4",
      descricao: null,
      premio_descricao: "Forno elétrico",
      premio_rotulo: "estimado",
      premio_valor: 850,
      numero_valor: 10,
      quantidade: 25,
      qtd_minima: 10,
      imagem_url: null,
      data_prevista: null,
      status: "aberta",
      criada_em: new Date("2026-11-10T10:00:00Z").toISOString(),
      atualizada_em: new Date("2026-11-10T10:00:00Z").toISOString(),
      arquivada: false,
      excluida: false,
    };
    expect(rifaTipada.status).toBe("aberta");
    expect(rifaTipada.quantidade).toBe(25);
    expect(rifaTipada.premio_valor).toBe(850);
    expect(rifaTipada.descricao).toBeNull();

    // Assinatura da RPC (FD-3/SR-3): argumento único `rifa`
    const argsSorteio: SortearRifaArgs = { rifa: rifaTipada.id };
    expect(argsSorteio.rifa).toBe(rifaTipada.id);
  });
});
