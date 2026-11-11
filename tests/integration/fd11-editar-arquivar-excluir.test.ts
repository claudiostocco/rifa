/**
 * FD-11 · Server Actions `editarRifa` / `arquivarRifa` / `excluirRifa`
 * (SPEC §4.13 · RN-09 · matriz §5.2, linhas "RF-01 editar" e "RF-14")
 *
 * Teste 1 (int): editar título/preço de rifa aberta persiste; arquivar oculta
 *                a rifa da listagem pública (RLS `rifas_publico_le_publicadas`
 *                — o filtro da T1 é a mesma cláusula `arquivada`) preservando
 *                os dados.
 * Teste 2 (int): editar `quantidade` com ≥ 1 venda → recusado (RN-09, banco
 *                inalterado); excluir rifa com vendas → "Esta rifa tem
 *                compras registradas. Você pode arquivá-la para preservar o
 *                histórico."
 *
 * Postgres REAL local via Supabase CLI (SPEC §5.1 — mocks de banco/RLS
 * proibidos). Só as fronteiras do runtime Next (`next/headers` ·
 * `next/cache`) são substituídas; sessão de Auth real do stack local.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  arquivarRifa,
  editarRifa,
  excluirRifa,
} from "@/actions/rifas";
import type { Database } from "@/lib/supabase/database.types";

const { armazenamentoCookies } = vi.hoisted(() => ({
  armazenamentoCookies: new Map<
    string,
    { name: string; value: string; options?: Record<string, unknown> }
  >(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...armazenamentoCookies.values()],
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      armazenamentoCookies.set(name, { name, value, options });
    },
  }),
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

describe("FD-11 · editarRifa / arquivarRifa / excluirRifa (SPEC §4.13 · RN-09)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let clientAnon: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  let rifaAbertaId = "";
  let rifaComVendaId = "";
  let rifaEncerradaId = "";

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientAnon = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Organizador real (conta + perfil via trigger OCR) e sessão httpOnly nos
    // cookies em memória — é ela que as actions leem via `next/headers`.
    const email = `fd11-gestao+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (FD-11).");
    }
    usuarioId = criado.user.id;

    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: "SenhaForte!2026",
    });
    expect(erroEntrar).toBeNull();

    const seedRifa = async (config: { slug: string; status: "aberta" | "encerrada" }) => {
      const { data: rifa, error: erroRifa } = await clientServico
        .from("rifas")
        .insert({
          perfil_id: usuarioId,
          slug: config.slug,
          titulo: "Rifa do Bazar da Paróquia",
          premio_descricao: "Cesta natalina",
          premio_rotulo: "estimado",
          premio_valor: 500.0,
          numero_valor: 10.0,
          quantidade: 25,
          qtd_minima: 10,
          status: config.status,
        })
        .select("id")
        .single();
      expect(erroRifa).toBeNull();
      if (!rifa) {
        throw new Error(`Seed da rifa ${config.slug} falhou (FD-11).`);
      }
      const { error: erroNumeros } = await clientServico
        .from("numeros")
        .insert(
          Array.from({ length: 25 }, (_, indice) => ({ rifa_id: rifa.id, numero: indice + 1 })),
        );
      expect(erroNumeros).toBeNull();
      return rifa.id;
    };

    rifaAbertaId = await seedRifa({
      slug: `rifa-fd11-aberta-${crypto.randomUUID().slice(0, 8)}`,
      status: "aberta",
    });
    rifaComVendaId = await seedRifa({
      slug: `rifa-fd11-com-venda-${crypto.randomUUID().slice(0, 8)}`,
      status: "aberta",
    });
    rifaEncerradaId = await seedRifa({
      slug: `rifa-fd11-encerrada-${crypto.randomUUID().slice(0, 8)}`,
      status: "encerrada",
    });

    // Venda vigente (estado pós registrarVenda) no nº 001 da rifa com venda —
    // o comprador preciso para a FK; a venda é o que dispara o RN-09.
    const { data: numero, error: erroNumero } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaComVendaId)
      .eq("numero", 1)
      .single();
    expect(erroNumero).toBeNull();
    if (!numero) {
      throw new Error("Seed do numero 001 (rifa com venda) falhou (FD-11).");
    }
    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaComVendaId, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador) {
      throw new Error("Seed do comprador (FD-11) falhou.");
    }
    const { error: erroVenda } = await clientServico.from("vendas").insert({
      numero_id: numero.id,
      comprador_id: comprador.id,
      origem: "organizador",
    });
    expect(erroVenda).toBeNull();
    const { error: erroMarca } = await clientServico
      .from("numeros")
      .update({ status: "vendido" })
      .eq("id", numero.id);
    expect(erroMarca).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // `rifas.perfil_id` não tem ON DELETE CASCADE para perfis → rifas primeiro
    // (numeros/vendas caem em cascata; compradores cascata pela rifa).
    await clientServico.from("rifas").delete().eq("perfil_id", usuarioId);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  it("deve editar título/preço/data de rifa aberta persistindo e arquivar ocultando da listagem pública preservando os dados", async () => {
    // a) edição persiste (RF-01 editar — Cenário A da matriz §5.2)
    const edicao = await editarRifa(rifaAbertaId, {
      titulo: "Rifa da Feira da Comunidade",
      premio_valor: 900,
      numero_valor: 12.5,
      data_prevista: "2026-12-20",
    });
    expect(edicao).toMatchObject({
      ok: true,
      mensagem: "Rifa atualizada com sucesso.",
      rifaId: rifaAbertaId,
    });
    if (!edicao.ok) {
      throw new Error("Caminho feliz do FD-11 devia retornar ok: true.");
    }

    const { data: rifaEditada, error } = await clientServico
      .from("rifas")
      .select("*")
      .eq("id", rifaAbertaId)
      .single();
    expect(error).toBeNull();
    expect(rifaEditada).toMatchObject({
      titulo: "Rifa da Feira da Comunidade",
      premio_valor: 900,
      numero_valor: 12.5,
      data_prevista: "2026-12-20",
      // campos não enviados permanecem
      quantidade: 25,
      qtd_minima: 10,
      status: "aberta",
      arquivada: false,
      excluida: false,
    });

    // b) arquivar: bandeira ativa, dados preservados (RF-14 — Cenário A)
    const arquivamento = await arquivarRifa(rifaAbertaId);
    expect(arquivamento).toMatchObject({ ok: true, mensagem: "Rifa arquivada com sucesso." });

    const { data: rifaArquivada } = await clientServico
      .from("rifas")
      .select("*")
      .eq("id", rifaAbertaId)
      .single();
    expect(rifaArquivada).toMatchObject({
      arquivada: true,
      excluida: false,
      titulo: "Rifa da Feira da Comunidade",
      premio_valor: 900,
    });

    // c) "oculta da listagem": a T1 pública usa a mesma cláusula do RLS anon —
    // a rifa arquivada desaparece (e seus números também) sem ser removida.
    const { data: visiveisAnon } = await clientAnon
      .from("rifas")
      .select("id")
      .eq("id", rifaAbertaId);
    expect(visiveisAnon).toHaveLength(0);

    const { data: numerosAnon } = await clientAnon
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaAbertaId);
    expect(numerosAnon).toHaveLength(0);

    // Os 25 números continuam no banco (dados preservados — nada removido).
    const { data: numerosPreservados } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaAbertaId);
    expect(numerosPreservados).toHaveLength(25);
  });

  it("deve recusar editar quantidade com vendas (RN-09) e excluir rifa com vendas com aviso de arquivar", async () => {
    // a) editar `quantidade` com ≥ 1 venda → recusado (RF-01 editar — Cenário B)
    const edicaoQuantidade = await editarRifa(rifaComVendaId, { quantidade: 50 });
    expect(edicaoQuantidade.ok).toBe(false);
    if (!edicaoQuantidade.ok) {
      expect(edicaoQuantidade.mensagem).toBe(
        "A quantidade de números não pode ser alterada porque a rifa já tem vendas registradas.",
      );
    }

    // Banco inalterado: rifa e numeração ficam como estavam.
    const { data: rifaInalterada } = await clientServico
      .from("rifas")
      .select("quantidade, status")
      .eq("id", rifaComVendaId)
      .single();
    expect(rifaInalterada).toMatchObject({ quantidade: 25, status: "aberta" });
    const { data: numerosInalterados } = await clientServico
      .from("numeros")
      .select("numero")
      .eq("rifa_id", rifaComVendaId);
    expect(numerosInalterados).toHaveLength(25);

    // b) excluir rifa com vendas → texto prescrito da SPEC §4.13 (RF-14 — Cenário B)
    const exclusaoNegada = await excluirRifa(rifaComVendaId);
    expect(exclusaoNegada.ok).toBe(false);
    if (!exclusaoNegada.ok) {
      expect(exclusaoNegada.mensagem).toBe(
        "Esta rifa tem compras registradas. Você pode arquivá-la para preservar o histórico.",
      );
    }
    const { data: rifaNaoExcluida } = await clientServico
      .from("rifas")
      .select("excluida")
      .eq("id", rifaComVendaId)
      .single();
    expect(rifaNaoExcluida?.excluida).toBe(false);

    // c) §4.1: campos editáveis "se rifa aberta" — encerrada recusa a edição.
    const edicaoEncerrada = await editarRifa(rifaEncerradaId, { titulo: "Rifa Reeditada" });
    expect(edicaoEncerrada.ok).toBe(false);
    if (!edicaoEncerrada.ok) {
      expect(edicaoEncerrada.mensagem).toBe("Somente rifas abertas podem ser editadas.");
    }
  });

  it("deve excluir (soft delete) rifa sem vendas ocultando-a do público preservando os dados", async () => {
    const exclusao = await excluirRifa(rifaEncerradaId);
    expect(exclusao).toMatchObject({ ok: true, mensagem: "Rifa excluída com sucesso." });

    // Soft delete: a linha existe com a bandeira `excluida` (§2.4).
    const { data: rifaExcluida } = await clientServico
      .from("rifas")
      .select("*")
      .eq("id", rifaEncerradaId)
      .single();
    expect(rifaExcluida).toMatchObject({ excluida: true, arquivada: false });
    const { data: numerosPreservados } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaEncerradaId);
    expect(numerosPreservados).toHaveLength(25);

    // O RLS anon deixa de publicar a rifa excluída (migração 001).
    const { data: visiveisAnon } = await clientAnon
      .from("rifas")
      .select("id")
      .eq("id", rifaEncerradaId);
    expect(visiveisAnon).toHaveLength(0);
  });

  it("deve recusar arquivar sem sessão com mensagem pt-BR", async () => {
    armazenamentoCookies.clear(); // saída de sessão: nenhum cookie httpOnly

    const resultado = await arquivarRifa(rifaComVendaId);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensagem).toMatch(/sessão expirou/i);
    }

    // Sem sessão, nada é gravado.
    const { data: rifaInalterada } = await clientServico
      .from("rifas")
      .select("arquivada")
      .eq("id", rifaComVendaId)
      .single();
    expect(rifaInalterada?.arquivada).toBe(false);
  });
});
