/**
 * PB-3 · Guardas backend da venda pública — SPEC §2.3/§3.3/§4.5 · PLAN PB-3.
 *
 * Teste 1 (int, Postgres real): rajada simultânea acima de 5 tentativas/IP/10s
 *   → no máximo 5 sucessos, restante recusado com mensagem clara; números e
 *   vendas consistentes.
 * Teste 2 (int, Postgres real): anon tenta INSERT direto em compradores/vendas
 *   → negado por RLS; o endpoint RPC de rate limit também não é executável por
 *   anon e a tabela de contadores não é acessível.
 *
 * Política de Testes (§5.1): Postgres e RLS reais; headers/cache do Next são
 * fronteiras substituídas, nunca o banco.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { registrarVendaPublica } from "@/actions/vendas";
import type { Database } from "@/lib/supabase/database.types";

const { ipDaRequisicao } = vi.hoisted(() => ({ ipDaRequisicao: { valor: "pb3-teste" } }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": ipDaRequisicao.valor }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let url = "";
let chaveAnon = "";
let chaveService = "";

beforeAll(() => {
  url = process.env.TEST_SUPABASE_URL ?? "";
  chaveAnon = process.env.TEST_SUPABASE_ANON_KEY ?? "";
  chaveService = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !chaveAnon || !chaveService) {
    throw new Error(
      "Variáveis de teste do Supabase ausentes. Rode `supabase start` antes de `pnpm test:int` (ET-7).",
    );
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = chaveAnon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = chaveService;
});

describe("PB-3 · Guardas backend da venda pública (SPEC §2.3/§4.5)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let clientAnon: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const rifaId = crypto.randomUUID();
  let idsNumeros: string[] = [];
  let idComprador = "";

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientAnon = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    ipDaRequisicao.valor = `pb3-${crypto.randomUUID()}`;

    const { data: usuarioCriado, error: erroUsuario } = await clientServico.auth.admin.createUser({
      email: `pb3-guardas+${crypto.randomUUID()}@example.test`,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroUsuario).toBeNull();
    if (!usuarioCriado?.user) throw new Error("Usuário de teste não provisionado (PB-3).");
    usuarioId = usuarioCriado.user.id;

    const { error: erroRifa } = await clientServico.from("rifas").insert({
      id: rifaId,
      perfil_id: usuarioId,
      slug: `pb3-teste-${rifaId.slice(0, 8)}`,
      titulo: "Rifa pública PB-3",
      premio_descricao: "Forno elétrico",
      premio_rotulo: "estimado",
      premio_valor: 850,
      numero_valor: 10,
      quantidade: 25,
      qtd_minima: 0,
      status: "aberta",
    });
    expect(erroRifa).toBeNull();

    const { data: numeros, error: erroNumeros } = await clientServico
      .from("numeros")
      .insert(
        Array.from({ length: 25 }, (_, indice) => ({
          rifa_id: rifaId,
          numero: indice + 1,
        })),
      )
      .select("id");
    expect(erroNumeros).toBeNull();
    if (!numeros) throw new Error("Números de teste não provisionados (PB-3).");
    idsNumeros = numeros.map((numero) => numero.id);

    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({
        rifa_id: rifaId,
        nome: "Comprador de teste",
        telefone: "+5511988887777",
      })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador) throw new Error("Comprador de teste não provisionado (PB-3).");
    idComprador = comprador.id;
  });

  afterAll(async () => {
    // A remoção do usuário apaga o perfil e a rifa em cascata (migração 001).
    if (usuarioId) await clientServico.auth.admin.deleteUser(usuarioId);
  });

  it("deve limitar rajada simultânea a 5 tentativas por IP/10s sem corromper números e vendas", async () => {
    const resultados = await Promise.all(
      idsNumeros.slice(0, 6).map((numeroId, indice) =>
        registrarVendaPublica({
          numeroId,
          nome: `Comprador ${indice + 1}`,
          telefone: `+55119888877${String(indice).padStart(2, "0")}`,
        }),
      ),
    );

    const sucessos = resultados.filter((resultado) => resultado.ok);
    const recusasLimite = resultados.filter(
      (resultado) =>
        !resultado.ok &&
        resultado.mensagem === "Muitas tentativas de venda. Tente novamente em alguns instantes.",
    );
    expect(sucessos).toHaveLength(5);
    expect(recusasLimite).toHaveLength(1);

    const { data: numeros } = await clientServico
      .from("numeros")
      .select("status")
      .eq("rifa_id", rifaId);
    expect(numeros?.filter((numero) => numero.status === "vendido")).toHaveLength(5);
    expect(numeros?.filter((numero) => numero.status === "disponivel")).toHaveLength(20);

    const { data: vendas, error: erroVendas } = await clientServico
      .from("vendas")
      .select("id, origem, numeros!inner(rifa_id)")
      .eq("numeros.rifa_id", rifaId)
      .is("removida_em", null);
    expect(erroVendas).toBeNull();
    expect(vendas).toHaveLength(5);
    expect(vendas?.every((venda) => venda.origem === "publico")).toBe(true);
  });

  it("deve negar INSERT direto do anon em compradores/vendas e acesso anon à RPC/tabela de limite", async () => {
    const compradorAnon = await clientAnon.from("compradores").insert({
      rifa_id: rifaId,
      nome: "Tentativa anon",
      telefone: "+5511999990000",
    });
    expect(compradorAnon.error?.code).toBe("42501");

    const vendaAnon = await clientAnon.from("vendas").insert({
      numero_id: idsNumeros[10],
      comprador_id: idComprador,
      origem: "publico",
    });
    expect(vendaAnon.error?.code).toBe("42501");

    const tabelaLimite = await clientAnon.from("limites_venda_publica").select("chave_hash");
    expect(tabelaLimite.error?.code).toBe("42501");

    const rpcAnon = await clientAnon.rpc("consumir_limite_venda_publica", {
      p_chave_hash: "a".repeat(64),
    });
    expect(rpcAnon.error?.code).toBe("42501");

    const { data: estado } = await clientServico
      .from("numeros")
      .select("status")
      .eq("id", idsNumeros[10])
      .single();
    expect(estado?.status).toBe("disponivel");
  });
});
