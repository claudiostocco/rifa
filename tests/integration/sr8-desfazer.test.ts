/**
 * SR-8 · Server Action `desfazerSorteio(id)` — RF-15/RN-08 (§4.14 · matriz
 * §5.2 "RF-15 desfazer sorteio").
 *
 * Teste 1 (caminho feliz): desfazer → `anulado_em` marcado no sorteio
 *   VIGENTE, rifa volta a `encerrada`, re-sorteio é PERMITIDO e gera um novo
 *   registro (o anterior permanece anulado — histórico preservado, RF-15).
 *
 * Teste 2 (borda/erro): desfazer em rifa `aberta` / `encerrada` sem sorteio
 *   vigente → FALHA com banco inalterado; sorteio vigente já anulado por
 *   gravação direta → falha (RIFA_SEM_SORTEIO da migração 006); id
 *   malformado e sessão expirada → recusas do padrão da casa. A exibição da
 *   badge de anulação na T5 ("Sorteio anulado em DD/MM/AAAA HH:MM", §3.6) é
 *   cobertura E2E — `tests/e2e/desfazer-sorteio.spec.ts`.
 *
 * Política de Testes (§5.1): banco e sessão do Auth REAIS (stack local); só
 * `next/headers`/`next/cache` são substituídos — padrão FD-10/SR-3/SR-7.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { desfazerSorteio, sortear, type EstadoAnulacao } from "@/actions/sorteio";
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

describe("SR-8 · Server Action desfazerSorteio (RF-15/RN-08)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `sr8-desfazer+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaSorteadaId = crypto.randomUUID();
  const rifaAbertaId = crypto.randomUUID();
  const rifaSemSorteioId = crypto.randomUUID();

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Conta real com perfil criado pelo trigger OCR (migração 001).
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (SR-8).");
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    // Rifa principal ENCERRADA com 3 vendidos COM venda vigente (a RPC do
    // sorteio conta apenas vendas vigentes — padrão SR-3), e as rifas de
    // recusa: `aberta` e `encerrada` sem sorteio (cenário do Teste 2).
    const criarRifa = async (
      rifaId: string,
      status: Database["public"]["Tables"]["rifas"]["Insert"]["status"],
    ) => {
      const { error: erroRifa } = await clientServico.from("rifas").insert({
        id: rifaId,
        perfil_id: usuarioId,
        slug: `sr8-teste-${rifaId.slice(0, 8)}`,
        titulo: "Rifa da SR-8",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850,
        numero_valor: 10,
        quantidade: 25,
        qtd_minima: 10,
        status,
      });
      expect(erroRifa).toBeNull();

      const numeros = Array.from({ length: 25 }, (_, indice) => ({
        rifa_id: rifaId,
        numero: indice + 1,
      }));
      const { error: erroNumeros } = await clientServico.from("numeros").insert(numeros);
      expect(erroNumeros).toBeNull();
    };

    await criarRifa(rifaSorteadaId, "encerrada");
    await criarRifa(rifaAbertaId, "aberta");
    await criarRifa(rifaSemSorteioId, "encerrada");

    // Vendas VIGENTES nos números 1, 2 e 7 (compradores deduplicados por
    // telefone, como a `registrarVenda` grava).
    const { data: alvos, error: erroAlvos } = await clientServico
      .from("numeros")
      .select("id, numero")
      .eq("rifa_id", rifaSorteadaId)
      .in("numero", [1, 2, 7]);
    expect(erroAlvos).toBeNull();

    const { data: compradores, error: erroCompradores } = await clientServico
      .from("compradores")
      .insert([
        { rifa_id: rifaSorteadaId, nome: "Maria Silva", telefone: "+5511988887777" },
        { rifa_id: rifaSorteadaId, nome: "João Souza", telefone: "+5511999998888" },
      ])
      .select("id");
    expect(erroCompradores).toBeNull();
    if (!alvos || !compradores) throw new Error("Números/compradores de teste ausentes (SR-8).");

    const { error: erroMarcado } = await clientServico
      .from("numeros")
      .update({ status: "vendido" })
      .in(
        "id",
        alvos.map((alvo) => alvo.id),
      );
    expect(erroMarcado).toBeNull();

    const { error: erroVendas } = await clientServico.from("vendas").insert(
      alvos.map((alvo, indice) => ({
        numero_id: alvo.id,
        comprador_id: compradores[indice % compradores.length].id,
        origem: "organizador" as const,
      })),
    );
    expect(erroVendas).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // rifas.perfil_id não tem ON DELETE CASCADE → rifas antes, conta depois
    // (o comprador vive na cascata da rifa dele — padrão FD-3).
    await clientServico
      .from("rifas")
      .delete()
      .in("id", [rifaSorteadaId, rifaAbertaId, rifaSemSorteioId]);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  async function sorteiosVigentes(rifaId: string): Promise<number> {
    const { count } = await clientServico
      .from("sorteios")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", rifaId)
      .is("anulado_em", null);
    return count ?? 0;
  }

  async function totalSorteios(rifaId: string): Promise<number> {
    const { count } = await clientServico
      .from("sorteios")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", rifaId);
    return count ?? 0;
  }

  async function statusDaRifa(rifaId: string): Promise<string> {
    const { data } = await clientServico.from("rifas").select("status").eq("id", rifaId).single();
    return data?.status ?? "";
  }

  it("deve anular o sorteio vigente, devolver a rifa a encerrada e permitir re-sorteio com novo registro (o anterior permanece anulado)", async () => {
    // Pré-condição: rifa encerrada com vendidos → sorteio pela via da casa.
    const primeiro = await sortear(rifaSorteadaId);
    expect(primeiro.ok).toBe(true);
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(1);
    expect(await totalSorteios(rifaSorteadaId)).toBe(1);

    // RF-15: anulação do resultado vigente.
    const anulacao: EstadoAnulacao = await desfazerSorteio(rifaSorteadaId);
    expect(anulacao).toEqual({ ok: true, mensagem: "Sorteio anulado com sucesso." });

    // Rifa devolvida a `encerrada` (§2.7) e sorteio VIGENTE anulado (RN-08) —
    // o histórico fica preservado em `sorteios` (nada é apagado, RF-15).
    expect(await statusDaRifa(rifaSorteadaId)).toBe("encerrada");
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(0);
    expect(await totalSorteios(rifaSorteadaId)).toBe(1);
    const { data: registroAnulado } = await clientServico
      .from("sorteios")
      .select("id, anulado_em, sorteado_em, total_vendidos")
      .eq("rifa_id", rifaSorteadaId)
      .single();
    expect(registroAnulado?.anulado_em).not.toBeNull();
    expect(registroAnulado?.total_vendidos).toBe(3);

    // Re-sorteio é PERMITIDO (RNF-06 só bloqueia com vigente) e gera um NOVO
    // registro — o anterior permanece anulado, nunca reutilizado.
    const segundo = await sortear(rifaSorteadaId);
    expect(segundo.ok).toBe(true);
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(1);
    expect(await totalSorteios(rifaSorteadaId)).toBe(2);

    const { data: registros } = await clientServico
      .from("sorteios")
      .select("id, anulado_em, total_vendidos, sorteado_em")
      .eq("rifa_id", rifaSorteadaId)
      .order("sorteado_em", { ascending: true });
    expect(registros).toHaveLength(2);
    const anteriores = registros?.filter((registro) => registro.id === registroAnulado?.id) ?? [];
    const novos = registros?.filter((registro) => registro.id !== registroAnulado?.id) ?? [];
    expect(anteriores).toHaveLength(1);
    expect(anteriores[0]?.anulado_em).not.toBeNull();
    expect(novos).toHaveLength(1);
    expect(novos[0]?.anulado_em).toBeNull();
    expect(novos[0]?.total_vendidos).toBe(3);
    expect(novos[0]?.id).not.toBe(registroAnulado?.id);
  });

  it("deve RECUSAR desfazer em rifa aberta/encerrada (sem sorteio vigente), com vigente já anulado, id malformado e sem sessão — banco inalterado", async () => {
    // a) rifa `aberta` (§2.7 — sorteio só parte de encerrada; anulação só de
    //    sorteada): recusa sem tocar o banco.
    const aberta: EstadoAnulacao = await desfazerSorteio(rifaAbertaId);
    expect(aberta).toEqual({
      ok: false,
      mensagem: "Esta rifa não está sorteada. Não há resultado de sorteio para anular.",
    });
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");
    expect(await totalSorteios(rifaAbertaId)).toBe(0);

    // b) rifa `encerrada` SEM sorteio vigente: idem recusa, estado intacto.
    const semSorteio: EstadoAnulacao = await desfazerSorteio(rifaSemSorteioId);
    expect(semSorteio).toEqual({
      ok: false,
      mensagem: "Esta rifa não está sorteada. Não há resultado de sorteio para anular.",
    });
    expect(await statusDaRifa(rifaSemSorteioId)).toBe("encerrada");
    expect(await totalSorteios(rifaSemSorteioId)).toBe(0);

    // c) rifa marcada `sorteada` cujo vigente JÁ foi anulado por gravação
    //    direta (inconsistência impossível pela via da casa): a RPC aborta
    //    com RIFA_SEM_SORTEIO e a transação inteira é desfeita — a rifa
    //    permanece `sorteada` em vez de descer a `encerrada` sem resultado.
    const { data: vigente } = await clientServico
      .from("sorteios")
      .select("id")
      .eq("rifa_id", rifaSorteadaId)
      .is("anulado_em", null)
      .single();
    expect(vigente).not.toBeNull();
    const { error: erroAnular } = await clientServico
      .from("sorteios")
      .update({ anulado_em: new Date().toISOString() })
      .eq("id", vigente?.id ?? "");
    expect(erroAnular).toBeNull();

    const inconsistente: EstadoAnulacao = await desfazerSorteio(rifaSorteadaId);
    expect(inconsistente).toEqual({
      ok: false,
      mensagem: "Não há sorteio vigente nesta rifa para anular.",
    });
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");

    // d) identificador malformado → recusa segura do padrão da casa.
    const malformado: EstadoAnulacao = await desfazerSorteio("nao-e-um-uuid");
    expect(malformado).toEqual({ ok: false, mensagem: "Não encontramos essa rifa na sua conta." });

    // e) ANON (sem sessão): a autorização executada na action nega a
    //    anulação — nada é mutado.
    armazenamentoCookies.clear();
    const anon: EstadoAnulacao = await desfazerSorteio(rifaSorteadaId);
    expect(anon).toEqual({
      ok: false,
      mensagem: "Sua sessão expirou. Entre novamente para continuar.",
    });
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");
  });
});
