/**
 * FD-1 · Migração 0001 (tabelas, índices e CHECKs — SPEC §2.4)
 *
 * Teste 1 (int): migração aplicada e INSERT válido em cada tabela
 *                (rifa com quantidade 25) funciona.
 * Teste 2 (int): CHECKs bloqueiam dados inválidos (quantidade 333,
 *                premio_valor ≤ 0, numero 5001, duplicidade em
 *                UNIQUE (rifa_id, numero)).
 *
 * Postgres REAL local via Supabase CLI (SPEC §5.1 — mocks proibidos).
 * A escrita usa `service_role` porque RLS (FD-2) pertence a outra tarefa;
 * aqui o alvo são as restrições do schema, não as políticas.
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

let url = "";
let chaveService = "";

beforeAll(() => {
  url = process.env.TEST_SUPABASE_URL ?? "";
  chaveService = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !chaveService) {
    throw new Error(
      "Variáveis de teste do Supabase ausentes. Rode `supabase start` antes de `pnpm test:int` (ET-7)."
    );
  }
});

/** Códigos Postgres usados nas asserções de Falha (SPEC §5.2 FD-1 Teste 2). */
const VIOLACAO_CHECK = "23514";
const VIOLACAO_UNICA = "23505";

describe("FD-1 · migração 0001 aplicada (schema do modelo §2.4)", () => {
  let client: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  let rifaId = "";
  let numeroId = "";
  let compradorId = "";

  beforeAll(() => {
    client = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!usuarioId) return;

    // Ordem de limpeza: rifas apaga em cascata numeros/compradores (e vendas
    // via numero_id FK); auth.admin.deleteUser apaga o perfil (trigger OCR).
    if (rifaId) await client.from("rifas").delete().eq("id", rifaId);
    await client.auth.admin.deleteUser(usuarioId);
  });

  it("deve aceitar INSERT válido em cada tabela com rifa de quantidade 25", async () => {
    // 1) perfis — criado pelo trigger OCR ao provisionar a conta (SPEC §4.17)
    const email = `fd1-schema+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await client.auth.admin.createUser({
      email,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    expect(criado?.user).toBeTruthy();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (FD-1).");
    }
    usuarioId = criado.user.id;

    const { data: perfil, error: erroPerfil } = await client
      .from("perfis")
      .select("id, nome_exibicao")
      .eq("id", usuarioId)
      .single();

    expect(erroPerfil).toBeNull();
    expect(perfil?.nome_exibicao).toBe(email.split("@")[0]);

    // 2) rifas — caminho feliz da matriz §5.2: rifa de 100 números
    const { data: rifa, error: erroRifa } = await client
      .from("rifas")
      .insert({
        perfil_id: usuarioId,
        slug: `rifa-fd1-${crypto.randomUUID().slice(0, 8)}`,
        titulo: "Rifa da Comenda da FD-1",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850.0,
        numero_valor: 10.0,
        quantidade: 25,
        qtd_minima: 10,
      })
      .select("id, status, criada_em")
      .single();

    expect(erroRifa).toBeNull();
    expect(rifa).toBeTruthy();
    if (!rifa) {
      throw new Error("INSERT válido em rifas não retornou a linha criada (FD-1).");
    }
    expect(rifa.status).toBe("aberta");
    expect(rifa.criada_em).toBeTruthy();
    rifaId = rifa.id;

    // 3) numeros — numeração 1..N gerada ao criar (RF-02), 25 linhas 001..025
    const linhas = Array.from({ length: 25 }, (_, i) => ({
      rifa_id: rifaId,
      numero: i + 1,
    }));
    const { error: erroNumeros } = await client.from("numeros").insert(linhas);
    expect(erroNumeros).toBeNull();

    const { data: numero, error: erroNumero } = await client
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaId)
      .limit(1)
      .single();
    expect(erroNumero).toBeNull();
    expect(numero).toBeTruthy();
    if (!numero) {
      throw new Error("Numeração 1..N não gravou linhas em numeros (FD-1).");
    }
    numeroId = numero.id;

    // 4) compradores — nome 2..120 e telefone E.164
    const { data: comprador, error: erroComprador } = await client
      .from("compradores")
      .insert({
        rifa_id: rifaId,
        nome: "Maria Silva",
        telefone: "+5511988887777",
      })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    expect(comprador).toBeTruthy();
    if (!comprador) {
      throw new Error("INSERT válido em compradores não retornou a linha criada (FD-1).");
    }
    compradorId = comprador.id;

    // 5) vendas — vínculo número ↔ comprador com origem (RN-03)
    const { error: erroVenda } = await client.from("vendas").insert({
      numero_id: numeroId,
      comprador_id: compradorId,
      origem: "organizador",
    });
    expect(erroVenda).toBeNull();

    // 6) sorteios — resultado vigente (anulado_em NULL padrão no INSERT)
    const { data: sorteio, error: erroSorteio } = await client
      .from("sorteios")
      .insert({
        rifa_id: rifaId,
        numero_id: numeroId,
        comprador_id: compradorId,
        total_vendidos: 1,
      })
      .select("id, sorteado_em, anulado_em")
      .single();
    expect(erroSorteio).toBeNull();
    expect(sorteio?.anulado_em).toBeNull();
    expect(sorteio?.sorteado_em).toBeTruthy();  });

  it("deve bloquear dados inválidos nos CHECKs e na UNIQUE (rifa_id, numero)", async () => {
    const base = {
      perfil_id: usuarioId,
      slug: `rifa-fd1-invalida-${crypto.randomUUID().slice(0, 8)}`,
      titulo: "Rifa inválida proposital",
      premio_descricao: "Qualquer",
      premio_valor: 100,
      numero_valor: 10,
      qtd_minima: 0,
    };

    // a) quantidade 333 fora da lista pré-definida (decisão 3)
    const { error: erroQuantidade } = await client
      .from("rifas")
      .insert({ ...base, quantidade: 333 });
    expect(erroQuantidade?.code).toBe(VIOLACAO_CHECK);

    // b) premio_valor ≤ 0 (moeda BRL sempre > 0)
    const { error: erroPreco } = await client
      .from("rifas")
      .insert({ ...base, quantidade: 25, premio_valor: 0 });
    expect(erroPreco?.code).toBe(VIOLACAO_CHECK);

    // c) numero 5001 fora do domínio operacional 1..5000
    const { error: erroNumero } = await client
      .from("numeros")
      .insert({ rifa_id: rifaId, numero: 5001 });
    expect(erroNumero?.code).toBe(VIOLACAO_CHECK);

    // d) duplicidade de número na mesma rifa — UNIQUE (rifa_id, numero)
    //    o número 1 da rifa de 25 já existe do Teste 1
    const { error: erroDuplicidade } = await client
      .from("numeros")
      .insert({ rifa_id: rifaId, numero: 1 });
    expect(erroDuplicidade?.code).toBe(VIOLACAO_UNICA);
  });
});
