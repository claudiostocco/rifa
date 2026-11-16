/**
 * VT-6 · Concorrência no mesmo número (RN-03, SPEC §4.5/RNF-06) — matriz
 * §5.2 RF-05 (linha organizador) · VT-6 do PLAN.
 *
 * Teste 1 (int, Postgres real): 2 requisições SIMULTÂNEAS de `registrarVenda`
 *   no mesmo número → exatamente 1 sucesso e 1 bloqueio com o toast
 *   prescrito "Esse número acabou de ser vendido"; banco consistente
 *   (número `vendido`, EXATAMENTE 1 venda vigente, comprador do vencedor,
 *   nenhuma linha órfã da corrida).
 * Teste 2 do VT-6 (UI otimista com rollback) é unit — ver
 *   tests/unit/ui/grade-com-modal.test.tsx (o PLAN admite unit/E2E).
 *
 * Extra (int): a camada DECLARATIVA do banco — índice parcial UNIQUE
 *   `vendas_vigente_por_numero` da migração 004 — recusa a 2ª venda vigente
 *   do mesmo número (23505) mesmo num bypass total da Server Action
 *   (service_role): RN-03 vale no banco, não só no código (VT-5 anunciou
 *   esta prova para a VT-6).
 *
 * Política de Testes (§5.1): banco e sessão do Auth são REAIS (stack local);
 * só as fronteiras do runtime Next (`next/headers` · `next/cache`) são
 * substituídas — padrão FD-10/VT-5.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { registrarVenda, type EstadoVenda } from "@/actions/vendas";
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

describe("VT-6 · Concorrência no mesmo número (SPEC §4.5/RNF-06)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `vt6-corrida+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaId = crypto.randomUUID();

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
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (VT-6).");
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    // Rifa aberta com 100 números (RF-02) — a corrida acontece no 037.
    const { error: erroRifa } = await clientServico.from("rifas").insert({
      id: rifaId,
      perfil_id: usuarioId,
      slug: `vt6-teste-${rifaId.slice(0, 8)}`,
      titulo: "Rifa da VT-6",
      premio_descricao: "Forno elétrico",
      premio_rotulo: "estimado",
      premio_valor: 850,
      numero_valor: 10,
      quantidade: 100,
      qtd_minima: 30,
      status: "aberta",
    });
    expect(erroRifa).toBeNull();

    const numeros = Array.from({ length: 100 }, (_, indice) => ({
      rifa_id: rifaId,
      numero: indice + 1,
    }));
    const { error: erroNumeros } = await clientServico.from("numeros").insert(numeros);
    expect(erroNumeros).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // rifas.perfil_id não tem ON DELETE CASCADE → rifas antes, conta depois
    // (o DELETE em cascata leva numeros/compradores/vendas, migração 001).
    await clientServico.from("rifas").delete().eq("id", rifaId);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  /** id do número `numero` da rifa (consulta com service_role). */
  async function idDoNumero(numero: number): Promise<string> {
    const { data } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaId)
      .eq("numero", numero)
      .single();
    if (!data?.id) throw new Error(`Número ${numero} da rifa VT-6 não provisionado.`);
    return data.id;
  }

  /** Converte um `PromiseSettledResult` em valor, falhando o teste se a
   *  Server Action rejeitou (não é o comportamento prescrito — recusa é
   *  `{ ok: false }`, nunca exceção). Também afunila o tipo do TS. */
  function assentar(resultado: PromiseSettledResult<EstadoVenda>): EstadoVenda {
    if (resultado.status !== "fulfilled") {
      throw new Error(
        `Server Action rejeitou em vez de recusar: ${JSON.stringify(resultado.reason)}`,
      );
    }
    return resultado.value;
  }

  /** Estado completo do número + sua venda vigente (RN-03: no máx. 1). */ async function estadoDaCorrida(
    numero: number,
  ) {
    const { data: linha } = await clientServico
      .from("numeros")
      .select("id, status")
      .eq("rifa_id", rifaId)
      .eq("numero", numero)
      .single();
    const numeroId = linha?.id ?? "";
    const { count: totalVendas } = await clientServico
      .from("vendas")
      .select("id", { count: "exact", head: true })
      .eq("numero_id", numeroId);
    const { data: vigente } = await clientServico
      .from("vendas")
      .select("origem, removida_em, compradores(nome, telefone)")
      .eq("numero_id", numeroId)
      .is("removida_em", null)
      .maybeSingle();
    return { status: linha?.status ?? "", totalVendas: totalVendas ?? 0, vigente };
  }

  it("deve aceitar exatamente 1 de 2 vendas simultâneas no mesmo número, bloquear a outra com o toast prescrito e manter o banco consistente", async () => {
    const numeroId = await idDoNumero(37);

    // Duas requisições SIMULTÂNEAS (mesmo número, compradores distintos) —
    // as duas correm a RN-03 ao mesmo tempo, como dois consultores em T4.
    const [resultadoMaria, resultadoJoao] = await Promise.allSettled([
      registrarVenda({ numeroId, nome: "Maria Silva", telefone: "+5511988887777" }),
      registrarVenda({ numeroId, nome: "João Pereira", telefone: "+5511977776666" }),
    ]);

    // Nenhuma das duas pode crashear: a action devolve recusa em pt-BR.
    expect(resultadoMaria.status).toBe("fulfilled");
    expect(resultadoJoao.status).toBe("fulfilled");
    const resultados = [assentar(resultadoMaria), assentar(resultadoJoao)];

    // EXATAMENTE 1 sucesso e 1 bloqueio — independentemente da ordem.
    const vitorias = resultados.filter((r) => r.ok);
    const derrotas = resultados.filter((r) => !r.ok);
    expect(vitorias).toHaveLength(1);
    expect(derrotas).toHaveLength(1);
    expect(vitorias[0]?.mensagem).toBe("Venda registrada com sucesso.");
    expect(derrotas[0]?.mensagem).toBe("Esse número acabou de ser vendido");

    // Banco consistente: vendido, EXATAMENTE 1 venda vigente e nenhuma
    // linha órfã da corrida (compensação/índice 004).
    const estado = await estadoDaCorrida(37);
    expect(estado.status).toBe("vendido");
    expect(estado.totalVendas).toBe(1);
    expect(estado.vigente?.origem).toBe("organizador");
    expect(estado.vigente?.removida_em).toBeNull();

    // O vencedor da corrida é quem ficou com o número (comprador coerente
    // com a requisição vencedora — nunca um mix das duas).
    const vencedoraFoiMaria = estado.vigente?.compradores?.nome === "Maria Silva";
    expect(["Maria Silva", "João Pereira"]).toContain(estado.vigente?.compradores?.nome);
    expect(estado.vigente?.compradores?.telefone).toBe(
      vencedoraFoiMaria ? "+5511988887777" : "+5511977776666",
    );
  });

  it("extra (int) · o índice parcial da migração 004 recusa a 2ª venda vigente no próprio banco (23505) mesmo com bypass da action", async () => {
    const numeroId = await idDoNumero(37); // já vendido pelo Teste 1

    // Bypass TOTAL da Server Action: service_role grava direto no Postgres.
    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaId, nome: "Ana Ribeiro", telefone: "+5511966665555" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();

    const { error } = await clientServico.from("vendas").insert({
      numero_id: numeroId,
      comprador_id: comprador?.id ?? "",
      origem: "organizador",
    });

    // RN-03 declarativa: o banco (não o código) barra a 2ª venda vigente.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");

    // E o estado segue intacto: a venda vigente continua sendo a do vencedor.
    const estado = await estadoDaCorrida(37);
    expect(estado.totalVendas).toBe(1);
    expect(estado.vigente?.compradores?.nome).toMatch(/Maria Silva|João Pereira/);
  });
});
