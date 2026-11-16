/**
 * VT-2 · Painel de resumo (SPEC §3.4.2, RF-04 · matriz §5.2 linha RF-04)
 *
 * Teste 1 (int, Postgres real): organizador com sessão real consulta a
 *   contagem de vendidos com o MESMO formato da query do componente
 *   (`numeros`, head count, RLS `numeros_organizador_proprias`) e
 *   `calcularResumo` devolve 37%, arrecadado R$ 370,00 e potencial
 *   R$ 1.000,00 em rifa de 100 a R$ 10.
 * Teste 2 (int): consulta `anon` NUNCA retorna esses valores/nomes (RNF-05 e
 *   RN-02/decisão 8): vendas/compradores chegam vazios apesar de dados reais
 *   por trás do RLS e a linha de rifa visível ao anon não tem nenhum agregado
 *   de arrecadação — o resumo só existe na rota protegida.
 *
 * Postgres REAL local via Supabase CLI (SPEC §5.1 proíbe mock de banco/RLS —
 * precedentes FD-2/FD-10). Só `next/headers` é substituído por cookies em
 * memória, como a Request real (padrão FD-10).
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";
import { calcularResumo } from "@/lib/resumo";

const armazenamentoCookies = vi.hoisted(
  () => new Map<string, { name: string; value: string; options?: Record<string, unknown> }>(),
);

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...armazenamentoCookies.values()],
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      armazenamentoCookies.set(name, { name, value, options });
    },
  }),
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

  // O client de sessão (componente) lê as variáveis do runtime Next — apontadas
  // para o stack local do teste (padrão FD-10).
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = chaveAnon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = chaveService;
});

describe("VT-2 · painel de resumo (SPEC §3.4.2, RF-04)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let clientAnon: ReturnType<typeof createClient<Database>>;

  let usuarioId = "";
  let rifaId = "";
  let numeroIdUm = "";
  let email = "";
  const senha = "SenhaForte!2026";

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientAnon = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Organizador real com perfil pelo trigger OCR (migração 001).
    email = `vt2-resumo+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (VT-2).");
    }
    usuarioId = criado.user.id;

    // Rifa de 100 números a R$ 10, com 37 vendidos — o cenário da matriz §5.2.
    const { data: rifa, error: erroRifa } = await clientServico
      .from("rifas")
      .insert({
        perfil_id: usuarioId,
        slug: `rifa-vt2-${crypto.randomUUID().slice(0, 8)}`,
        titulo: "Rifa do Resumo VT-2",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850.0,
        numero_valor: 10.0,
        quantidade: 100,
        qtd_minima: 30,
      })
      .select("id")
      .single();
    expect(erroRifa).toBeNull();
    if (!rifa) {
      throw new Error("Seed da rifa de teste falhou (VT-2).");
    }
    rifaId = rifa.id;

    const { error: erroNumeros } = await clientServico
      .from("numeros")
      .insert(
        Array.from({ length: 100 }, (_, indice) => ({ rifa_id: rifaId, numero: indice + 1 })),
      );
    expect(erroNumeros).toBeNull();

    const { error: erroVendidos } = await clientServico
      .from("numeros")
      .update({ status: "vendido" })
      .eq("rifa_id", rifaId)
      .lte("numero", 37);
    expect(erroVendidos).toBeNull();

    // Dados REAIS por trás do RLS para o Teste 2: comprador + venda vigente.
    const { data: numero, error: erroNumero } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaId)
      .eq("numero", 1)
      .single();
    expect(erroNumero).toBeNull();
    if (!numero) {
      throw new Error("Seed do numero 1 falhou (VT-2).");
    }
    numeroIdUm = numero.id;

    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaId, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador) {
      throw new Error("Seed do comprador falhou (VT-2).");
    }

    const { error: erroVenda } = await clientServico.from("vendas").insert({
      numero_id: numero.id,
      comprador_id: comprador.id,
      origem: "organizador",
    });
    expect(erroVenda).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // `rifas.perfil_id` não tem ON DELETE CASCADE para perfis → rifas primeiro
    // (numeros/compradores/vendas caem em cascata, migração 001).
    await clientServico.from("rifas").delete().eq("perfil_id", usuarioId);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  it("deve calcular 37 vendidos a R$ 10 em rifa de 100 como 37%, arrecadado R$ 370,00 e potencial R$ 1.000,00", async () => {
    // Sessão REAL do organizador nos cookies em memória — é ela que a consulta
    // do componente ResumoRifa usa (RLS `numeros_organizador_proprias`).
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    // Contagem com o MESMO formato da query do componente (head: true).
    const { count: vendidos, error: erroContagem } = await clientSessao
      .from("numeros")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", rifaId)
      .eq("status", "vendido");
    expect(erroContagem).toBeNull();
    expect(vendidos).toBe(37);

    const resumo = calcularResumo({ vendidos: vendidos ?? 0, quantidade: 100, numeroValor: 10 });

    expect(resumo).toEqual({
      vendidos: 37,
      total: 100,
      disponiveis: 63,
      percentual: 37,
      arrecadado: 370,
      potencial: 1000,
    });
  });

  it("deve negar ao anon os valores de arrecadação e os nomes de compradores (RNF-05/RN-02)", async () => {
    // a) vendas: linha real existe por trás do RLS — o anon recebe vazio
    const { data: vendasAnon, error: erroVendas } = await clientAnon
      .from("vendas")
      .select("id, comprador_id, origem");
    expect(erroVendas).toBeNull();
    expect(vendasAnon).toHaveLength(0);

    // b) compradores: nome/telefone jamais alcançam o anon (RNF-05)
    const { data: compradoresAnon, error: erroCompradores } = await clientAnon
      .from("compradores")
      .select("id, nome, telefone");
    expect(erroCompradores).toBeNull();
    expect(compradoresAnon).toHaveLength(0);

    // Prova de que o vazio acima é RLS, não ausência de dados (bypass sem
    // prova é "de graça" — padrão FD-2). Escopado à rifa desta suíte: o stack
    // local acumula linhas de outras suítes.
    const { data: vendasReais } = await clientServico
      .from("vendas")
      .select("id")
      .eq("numero_id", numeroIdUm);
    expect(vendasReais).toHaveLength(1);
    const { data: compradorReal } = await clientServico
      .from("compradores")
      .select("nome, telefone")
      .eq("rifa_id", rifaId)
      .single();
    expect(compradorReal?.nome).toBe("Maria Silva");
    expect(compradorReal?.telefone).toBe("+5511988887777");

    // c) a linha de rifa visível ao anon (T4 é construída sobre ela) não tem
    //    NENHUM agregado de arrecadação — arrecadado/potencial só existem na
    //    rota protegida (RN-02, decisão 8). `numero_valor`/`quantidade` são
    //    públicos por design (o preço e a contagem aparecem na T4).
    const { data: rifaAnon, error: erroRifaAnon } = await clientAnon
      .from("rifas")
      .select("*")
      .eq("id", rifaId)
      .single();
    expect(erroRifaAnon).toBeNull();
    expect(Object.keys(rifaAnon ?? {}).some((coluna) => /arrecad|potencial/i.test(coluna))).toBe(
      false,
    );

    // d) a contagem de estados da grade é pública por design (§2.3): o anon
    //    vê "37 de 100 vendidos" na T4, mas nunca o valor em R$ do resumo.
    const { count: vendidosAnon, error: erroContagemAnon } = await clientAnon
      .from("numeros")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", rifaId)
      .eq("status", "vendido");
    expect(erroContagemAnon).toBeNull();
    expect(vendidosAnon).toBe(37);
  });
});
