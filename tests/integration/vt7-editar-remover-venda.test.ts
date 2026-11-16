/**
 * VT-7 · Server Actions `editarVenda` / `removerVenda` (organizador) — SPEC
 * §4.6 (RF-06) · matriz §5.2 RF-06 · VT-7 do PLAN.
 *
 * Teste 1 (int, Postgres real): editar a venda transfere nome/telefone —
 *   decisão do usuário (14/11/2026): venda NOVA vigente aponta para o
 *   comprador do payload e a antiga ganha `removida_em` (histórico
 *   preservado, número permanece `vendido`); remover marca `removida_em` e o
 *   número volta a `disponivel` sem apagar nenhuma linha.
 * Teste 2 (int): `anon` tentando editar/remover venda PELO BANCO → negado
 *   (RLS: UPDATE em no-op com 0 linhas); organizador só opera em rifas
 *   próprias — via action (sessão de outro organizador) e via banco
 *   (UPDATE autenticado em rifa alheia também é no-op).
 *
 * Política de Testes (§5.1): banco e sessão do Auth REAIS (stack local); só
 * as fronteias do runtime Next (`next/headers` · `next/cache`) são
 * substituídas — padrão FD-10/VT-5.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { editarVenda, registrarVenda, removerVenda, type EstadoVenda } from "@/actions/vendas";
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

describe("VT-7 · editarVenda / removerVenda (SPEC §4.6)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let clientAnon: ReturnType<typeof createClient<Database>>;
  let clientOutroOrganizador: ReturnType<typeof createClient<Database>>;
  let entrarComSessao: (email: string, senha: string) => Promise<void>;
  let usuarioId = "";
  let outroUsuarioId = "";
  const email = `vt7-edita+${crypto.randomUUID()}@example.test`;
  const emailOutro = `vt7-outro+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaId = crypto.randomUUID();
  const NUMERO_TRANSFERIDO = 21;
  const NUMERO_CONTROLE = 42;

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientAnon = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientOutroOrganizador = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Organizador dono da rifa (perfil criado pelo trigger OCR — migração 001).
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (VT-7).");
    usuarioId = criado.user.id;

    // Segundo organizador: sessão PRÓPRIA para provar o limite de posse.
    const { data: criadoOutro, error: erroCriarOutro } = await clientServico.auth.admin.createUser({
      email: emailOutro,
      password: senha,
      email_confirm: true,
    });
    expect(erroCriarOutro).toBeNull();
    if (!criadoOutro?.user) throw new Error("2º organizador não provisionado (VT-7).");
    outroUsuarioId = criadoOutro.user.id;

    // Sessão do dono persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    entrarComSessao = async (entEmail: string, entSenha: string) => {
      const { criarClienteServidor: importarClient } = await import("@/lib/supabase/server");
      const client = await importarClient();
      const { error } = await client.auth.signInWithPassword({
        email: entEmail,
        password: entSenha,
      });
      expect(error).toBeNull();
    };

    // Rifa de teste do DONO: aberta, 100 números (RF-02).
    const { error: erroRifa } = await clientServico.from("rifas").insert({
      id: rifaId,
      perfil_id: usuarioId,
      slug: `vt7-teste-${rifaId.slice(0, 8)}`,
      titulo: "Rifa da VT-7",
      premio_descricao: "Cesta de natal",
      premio_rotulo: "estimado",
      premio_valor: 300,
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
    // rifas.perfil_id não tem ON DELETE CASCADE → rifas antes, contas depois.
    await clientServico.from("rifas").delete().eq("id", rifaId);
    await clientServico.auth.admin.deleteUser(usuarioId);
    await clientServico.auth.admin.deleteUser(outroUsuarioId);
  });

  /** id do número `numero` da rifa (consulta com service_role). */
  async function idDoNumero(numero: number): Promise<string> {
    const { data } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaId)
      .eq("numero", numero)
      .single();
    if (!data?.id) throw new Error(`Número ${numero} da rifa ${rifaId} não provisionado.`);
    return data.id;
  }

  async function estadoDoNumero(numero: number): Promise<{
    status: string;
    vigentes: number;
    total: number;
  }> {
    const { data: linha } = await clientServico
      .from("numeros")
      .select("id, status")
      .eq("rifa_id", rifaId)
      .eq("numero", numero)
      .single();
    const numeroId = linha?.id ?? "";
    const { count: vigentes } = await clientServico
      .from("vendas")
      .select("id", { count: "exact", head: true })
      .eq("numero_id", numeroId)
      .is("removida_em", null);
    const { count: total } = await clientServico
      .from("vendas")
      .select("id", { count: "exact", head: true })
      .eq("numero_id", numeroId);
    return { status: linha?.status ?? "", vigentes: vigentes ?? 0, total: total ?? 0 };
  }

  it("deve registrar Maria Silva / (11) 98888-7777 no nº 021 preparando a edição (via RF-05)", async () => {
    const resultado = await registrarVenda({
      numeroId: await idDoNumero(NUMERO_TRANSFERIDO),
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(resultado.ok).toBe(true);
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "vendido",
      vigentes: 1,
      total: 1,
    });
  });

  it("deve editar a venda transferindo para João Pereira com venda nova vigente, número permanecendo vendido e histórico de Maria preservado", async () => {
    const numeroId = await idDoNumero(NUMERO_TRANSFERIDO);

    const resultado: EstadoVenda = await editarVenda({
      numeroId,
      nome: "João Pereira",
      telefone: "+5511977776666",
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.mensagem).toBe("Venda atualizada com sucesso.");

    // Número PERMANECE vendido com EXATAMENTE 1 venda vigente (RN-03).
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "vendido",
      vigentes: 1,
      total: 2,
    });

    const { data: vendas } = await clientServico
      .from("vendas")
      .select("removida_em, origem, compradores(nome, telefone)")
      .eq("numero_id", numeroId)
      .order("criada_em");
    expect(vendas).toHaveLength(2);

    // Venda NOVA vigente: comprador do payload, origem organizador.
    const vigente = vendas?.find((v) => v.removida_em === null);
    expect(vigente?.compradores?.nome).toBe("João Pereira");
    expect(vigente?.compradores?.telefone).toBe("+5511977776666");
    expect(vigente?.origem).toBe("organizador");

    // Histórico preservado: a venda antiga de Maria segue no banco
    // (removida_em ≠ NULL, RN-07) — a linha dela não foi renomeada nem apagada.
    const removida = vendas?.find((v) => v.removida_em !== null);
    expect(removida?.compradores?.nome).toBe("Maria Silva");
    expect(removida?.compradores?.telefone).toBe("+5511988887777");
  });

  it("deve regravar o nome do comprador quando o telefone é mantido (mesma pessoa — §4.6)", async () => {
    const numeroId = await idDoNumero(NUMERO_TRANSFERIDO);

    const resultado = await editarVenda({
      numeroId,
      nome: "João Pereira Júnior",
      telefone: "+5511977776666",
    });
    expect(resultado.ok).toBe(true);

    // Mesma pessoa (mesmo telefone): a linha do comprador é reutilizada com o
    // nome regravado — EXATAMENTE 1 comprador de João na rifa.
    const { data: joaos } = await clientServico
      .from("compradores")
      .select("nome")
      .eq("rifa_id", rifaId)
      .eq("telefone", "+5511977776666");
    expect(joaos).toHaveLength(1);
    expect(joaos?.[0]?.nome).toBe("João Pereira Júnior");

    const { data: venda } = await clientServico
      .from("vendas")
      .select("compradores(nome, telefone)")
      .eq("numero_id", numeroId)
      .is("removida_em", null)
      .single();
    expect(venda?.compradores?.nome).toBe("João Pereira Júnior");
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "vendido",
      vigentes: 1,
      total: 3,
    });
  });

  it("deve remover a venda marcando removida_em e devolvendo o número a disponivel sem apagar o histórico", async () => {
    const numeroId = await idDoNumero(NUMERO_TRANSFERIDO);

    const resultado = await removerVenda(numeroId);
    expect(resultado.ok).toBe(true);
    expect(resultado.mensagem).toBe("Venda removida com sucesso.");

    // Número volta a `disponivel` (RF-06) e NENHUMA venda vigente sobra.
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "disponivel",
      vigentes: 0,
      total: 3,
    });

    // Histórico preservado: TODAS as vendas do número têm removida_em ≠ NULL.
    const { data: vendas } = await clientServico
      .from("vendas")
      .select("removida_em")
      .eq("numero_id", numeroId);
    expect(vendas).toHaveLength(3);
    for (const venda of vendas ?? []) {
      expect(venda.removida_em).not.toBeNull();
    }
  });

  it("deve recusar remoção e edição repetidas quando não há venda vigente, com estado inalterado", async () => {
    const numeroId = await idDoNumero(NUMERO_TRANSFERIDO);

    const segundaRemocao = await removerVenda(numeroId);
    expect(segundaRemocao.ok).toBe(false);
    expect(segundaRemocao.mensagem).toBe("Este número não tem venda vigente para remover.");

    const edicaoSemVenda = await editarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(edicaoSemVenda.ok).toBe(false);
    expect(edicaoSemVenda.mensagem).toBe("Este número não tem venda vigente para editar.");

    // Nº de controle (disponivel desde a criação) segue intocado.
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "disponivel",
      vigentes: 0,
      total: 3,
    });
    expect(await estadoDoNumero(NUMERO_CONTROLE)).toEqual({
      status: "disponivel",
      vigentes: 0,
      total: 0,
    });
  });

  it("deve NEGAR ao anon editar/remover venda pelo banco (RLS em no-op) mantendo os dados intactos", async () => {
    const numeroId = await idDoNumero(NUMERO_TRANSFERIDO);

    // Re-empurra a rifa a um estado com venda vigente para o teste ter alvo.
    const preparo = await registrarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(preparo.ok).toBe(true);
    const { data: alvo } = await clientServico
      .from("vendas")
      .select("id, comprador_id")
      .eq("numero_id", numeroId)
      .is("removida_em", null)
      .single();
    if (!alvo?.id || !alvo.comprador_id) throw new Error("Venda alvo não provisionada (VT-7).");

    // anon: UPDATE de vendas e compradores → no-op (0 linhas; RLS anon oculta
    // a linha — semântica Postgres já provada na FD-2).
    const { data: vendasAnon, error: erroVendasAnon } = await clientAnon
      .from("vendas")
      .update({ removida_em: new Date().toISOString() })
      .eq("id", alvo.id)
      .select("id");
    expect(erroVendasAnon).toBeNull();
    expect(vendasAnon).toHaveLength(0);

    const { data: compradoresAnon, error: erroCompradoresAnon } = await clientAnon
      .from("compradores")
      .update({ nome: "Intruso" })
      .eq("id", alvo.comprador_id)
      .select("id");
    expect(erroCompradoresAnon).toBeNull();
    expect(compradoresAnon).toHaveLength(0);

    // Nada mudou: venda vigente intacta com o comprador original (RF-06).
    const { data: vendaDepois } = await clientServico
      .from("vendas")
      .select("removida_em, compradores(nome)")
      .eq("id", alvo.id)
      .single();
    expect(vendaDepois?.removida_em).toBeNull();
    expect(vendaDepois?.compradores?.nome).toBe("Maria Silva");
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "vendido",
      vigentes: 1,
      total: 4,
    });
  });

  it("deve limitar o organizador às rifas PRÓPRIAS: action recusa rifa alheia e UPDATE autenticado em venda alheia é no-op", async () => {
    // Action com sessão do 2º organizador: o nº 21 é de OUTRA conta → recusa
    // de posse antes de qualquer escrita (§2.5).
    armazenamentoCookies.clear();
    await entrarComSessao(emailOutro, senha);

    const numeroId = await idDoNumero(NUMERO_TRANSFERIDO);
    const editarAlheia = await editarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(editarAlheia.ok).toBe(false);
    expect(editarAlheia.mensagem).toBe("Não encontramos esse número na sua conta.");

    const removerAlheia = await removerVenda(numeroId);
    expect(removerAlheia.ok).toBe(false);
    expect(removerAlheia.mensagem).toBe("Não encontramos esse número na sua conta.");

    // Pelo banco (cliente autenticado do 2º organizador): UPDATE na venda
    // alheia também é no-op — a RLS de vendas/compradores é por posse.
    const { error: erroSessaoOutro } = await clientOutroOrganizador.auth.signInWithPassword({
      email: emailOutro,
      password: senha,
    });
    expect(erroSessaoOutro).toBeNull();

    const { data: vendaAlheia } = await clientServico
      .from("vendas")
      .select("id")
      .eq("numero_id", numeroId)
      .is("removida_em", null)
      .single();
    if (!vendaAlheia?.id) throw new Error("Venda alheia não provisionada (VT-7).");

    const { data: removidasAlheias, error: erroRemocaoAlheia } = await clientOutroOrganizador
      .from("vendas")
      .update({ removida_em: new Date().toISOString() })
      .eq("id", vendaAlheia.id)
      .select("id");
    expect(erroRemocaoAlheia).toBeNull();
    expect(removidasAlheias).toHaveLength(0);

    // Restaura a sessão do DONO para os testes seguintes, se houver.
    armazenamentoCookies.clear();
    await entrarComSessao(email, senha);
    expect(await estadoDoNumero(NUMERO_TRANSFERIDO)).toEqual({
      status: "vendido",
      vigentes: 1,
      total: 4,
    });
  });
});
