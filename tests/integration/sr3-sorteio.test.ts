/**
 * SR-3 · Server Action `sortear(id)` — SPEC §4.9 RF-09 · matriz §5.2 "RF-09
 * sorteio (RPC)" · SR-3 do PLAN.
 *
 * Teste 1 (int, Postgres real): rifa encerrada com vendas → grava sorteio
 *   (número, comprador, snapshot `total_vendidos`, `sorteado_em`) e a rifa
 *   vira `sorteada`; a action devolve o resultado no contrato
 *   `ResultadoSorteio` (FD-5).
 * Teste 2 (int): códigos da RPC viram toasts legíveis — rifa aberta recusada
 *   (máquina FD-7), 0 vendidos → mensagem PRESCRITA da §4.9 (RIFA_SEM_VENDIDOS
 *   mapeada), 2º sorteio consecutivo sem desfazer → falha (RNF-06) — e
 *   sessão expirada/rifa inexistente recusadas sem tocar o banco.
 *
 * Política de Testes (§5.1): banco e sessão do Auth são REAIS (stack local);
 * só as fronteiras do runtime Next (`next/headers` · `next/cache`) são
 * substituídas — padrão FD-10/VT-5/SR-1. Os códigos da RPC em si já são
 * provados na FD-3; aqui o mapa de códigos → pt-BR da action é o alvo.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { sortear, type EstadoSorteio } from "@/actions/sorteio";
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

describe("SR-3 · Server Action sortear (SPEC §4.9)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `sr3-sorteio+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaEncerradaId = crypto.randomUUID();
  const rifaSemVendasId = crypto.randomUUID();
  const rifaAbertaId = crypto.randomUUID();
  const rifaSorteadaId = crypto.randomUUID();

  let compradorId = "";
  let idsVendidos: string[] = [];

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
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (SR-3).");
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    const criarRifa = async (rifaId: string, status: Database["public"]["Tables"]["rifas"]["Insert"]["status"]) => {
      const { error: erroRifa } = await clientServico.from("rifas").insert({
        id: rifaId,
        perfil_id: usuarioId,
        slug: `sr3-teste-${rifaId.slice(0, 8)}`,
        titulo: "Rifa da SR-3",
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

    await criarRifa(rifaEncerradaId, "encerrada");
    await criarRifa(rifaSemVendasId, "encerrada");
    await criarRifa(rifaAbertaId, "aberta");
    // Gravada direto: a via real até 'sorteada' é a própria action em teste
    // (o estado de partida dela é 'encerrada').
    await criarRifa(rifaSorteadaId, "sorteada");

    // Vendas VIGENTES nos números 1..3 da rifa encerrada (a RPC conta apenas
    // vendas com removida_em IS NULL — FD-3): comprador único Maria Silva.
    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaEncerradaId, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador) throw new Error("Comprador de teste não provisionado (SR-3).");
    compradorId = comprador.id;

    for (const numero of [1, 2, 3]) {
      const { data: numeroAlvo, error: erroAlvo } = await clientServico
        .from("numeros")
        .select("id")
        .eq("rifa_id", rifaEncerradaId)
        .eq("numero", numero)
        .single();
      expect(erroAlvo).toBeNull();
      if (!numeroAlvo) throw new Error(`Número ${numero} de teste não provisionado (SR-3).`);

      const { error: erroVenda } = await clientServico.from("vendas").insert({
        numero_id: numeroAlvo.id,
        comprador_id: compradorId,
        origem: "organizador",
      });
      expect(erroVenda).toBeNull();

      const { error: erroMarca } = await clientServico
        .from("numeros")
        .update({ status: "vendido" })
        .eq("id", numeroAlvo.id);
      expect(erroMarca).toBeNull();
    }

    const { data: vendidos } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaEncerradaId)
      .eq("status", "vendido");
    idsVendidos = (vendidos ?? []).map((venda) => venda.id);
    expect(idsVendidos).toHaveLength(3);
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // rifas.perfil_id não tem ON DELETE CASCADE → rifas antes, conta depois
    // (o comprador vive na cascata da rifa dele — padrão FD-3).
    await clientServico
      .from("rifas")
      .delete()
      .in("id", [rifaEncerradaId, rifaSemVendasId, rifaAbertaId, rifaSorteadaId]);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  async function statusDaRifa(rifaId: string): Promise<string> {
    const { data } = await clientServico.from("rifas").select("status").eq("id", rifaId).single();
    return data?.status ?? "";
  }

  async function sorteiosVigentes(rifaId: string): Promise<number> {
    const { data } = await clientServico
      .from("sorteios")
      .select("id, anulado_em")
      .eq("rifa_id", rifaId)
      .is("anulado_em", null);
    return data?.length ?? 0;
  }

  it("deve sortear rifa encerrada com vendas gravando o sorteio e o resultado do contrato, e virar a rifa a sorteada", async () => {
    expect(await statusDaRifa(rifaEncerradaId)).toBe("encerrada");

    const resultado: EstadoSorteio = await sortear(rifaEncerradaId);
    if (!resultado.ok) {
      throw new Error(`sortear recusou o caminho feliz: ${resultado.mensagem}`);
    }

    expect(resultado.mensagem).toBe("Sorteio realizado com sucesso.");

    // Contrato ResultadoSorteio (FD-5) — o que a roleta (SR-5) e a T5 vão
    // exibir é exatamente o que JÁ foi gravado no servidor.
    expect(resultado.resultado.rifaId).toBe(rifaEncerradaId);
    expect(idsVendidos.length).toBeGreaterThanOrEqual(1);
    expect(resultado.resultado.nomeVencedor).toBe("Maria Silva");
    expect(resultado.resultado.telefoneVencedor).toBe("+5511988887777");
    expect(resultado.resultado.totalVendidos).toBe(3);
    expect(resultado.resultado.anuladoEm ?? null).toBeNull();
    expect(resultado.resultado.sorteadoEm).toBeTruthy();

    // Número sorteado ∈ conjunto de vendidos (piso do SR-4).
    const { data: numeroSorteado } = await clientServico
      .from("numeros")
      .select("id, numero, status")
      .eq("rifa_id", rifaEncerradaId)
      .eq("numero", resultado.resultado.numero)
      .single();
    expect(numeroSorteado).toBeTruthy();
    expect(idsVendidos).toContain(numeroSorteado?.id);
    expect(numeroSorteado?.status).toBe("vendido");

    // 1 registro de sorteio vigente com snapshot e timestamp (§2.4/§4.9).
    const { data: sorteios } = await clientServico
      .from("sorteios")
      .select("id, numero_id, comprador_id, total_vendidos, sorteado_em, anulado_em")
      .eq("rifa_id", rifaEncerradaId);
    expect(sorteios).toHaveLength(1);
    expect(sorteios?.[0]?.anulado_em).toBeNull();
    expect(sorteios?.[0]?.numero_id).toBe(numeroSorteado?.id);
    expect(sorteios?.[0]?.comprador_id).toBe(compradorId);
    expect(sorteios?.[0]?.total_vendidos).toBe(3);
    expect(sorteios?.[0]?.sorteado_em).toBeTruthy();

    // Virada de estado (§2.7): encerrada → sorteada.
    expect(await statusDaRifa(rifaEncerradaId)).toBe("sorteada");
  });

  it("deve recusar 2º sorteio sem desfazer (RNF-06), rifa aberta, rifa sem vendidos (mensagem prescrita), sessão expirada e rifa inexistente com estado inalterado", async () => {
    // a) 2º sorteio consecutivo na MESMA rifa (agora sorteada) → falha.
    const repetido: EstadoSorteio = await sortear(rifaEncerradaId);
    expect(repetido.ok).toBe(false);
    expect(repetido.mensagem).toBe(
      "O sorteio já foi realizado. Anule o resultado atual antes de sortear novamente.",
    );
    expect(await statusDaRifa(rifaEncerradaId)).toBe("sorteada");
    expect(await sorteiosVigentes(rifaEncerradaId)).toBe(1);

    // b) rifa aberta → recusada pela guarda da máquina (FD-7), estado intacto.
    const aberta: EstadoSorteio = await sortear(rifaAbertaId);
    expect(aberta.ok).toBe(false);
    expect(aberta.mensagem).toBe(
      "As vendas desta rifa ainda estão abertas. Encerre-as antes de realizar o sorteio.",
    );
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");
    expect(await sorteiosVigentes(rifaAbertaId)).toBe(0);

    // c) encerrada com 0 vendidos → RIFA_SEM_VENDIDOS da RPC mapeada no
    //    texto PRESCRITO da §4.9; a rifa permanece encerrada (F7).
    const semVendidos: EstadoSorteio = await sortear(rifaSemVendasId);
    expect(semVendidos.ok).toBe(false);
    expect(semVendidos.mensagem).toBe(
      "A rifa não tem números vendidos; o sorteio não pode ser realizado.",
    );
    expect(await statusDaRifa(rifaSemVendasId)).toBe("encerrada");
    expect(await sorteiosVigentes(rifaSemVendasId)).toBe(0);

    // d) rifa sorteada gravada direto → mesma recusa do RNF-06.
    const sorteada: EstadoSorteio = await sortear(rifaSorteadaId);
    expect(sorteada.ok).toBe(false);
    expect(sorteada.mensagem).toBe(
      "O sorteio já foi realizado. Anule o resultado atual antes de sortear novamente.",
    );
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(0);

    // e) rifa inexistente / de outro organizador.
    const alheia: EstadoSorteio = await sortear(crypto.randomUUID());
    expect(alheia.ok).toBe(false);
    expect(alheia.mensagem).toBe("Não encontramos essa rifa na sua conta.");

    // f) Sessão expirada: limpa os cookies em memória (última conferência —
    //    o restante da suíte já rodou com a sessão real).
    armazenamentoCookies.clear();
    const semSessao: EstadoSorteio = await sortear(rifaSemVendasId);
    expect(semSessao.ok).toBe(false);
    expect(semSessao.mensagem).toBe("Sua sessão expirou. Entre novamente para continuar.");
    expect(await statusDaRifa(rifaSemVendasId)).toBe("encerrada");
    expect(await sorteiosVigentes(rifaSemVendasId)).toBe(0);
  });
});
