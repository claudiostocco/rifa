/**
 * SR-7 · Server Action `revelarTelefoneVencedor(id)` — RF-10 (§3.4.6 item 7)
 * · matriz §5.2 "RF-10 privacidade do telefone" (coluna Int/E2E).
 *
 * Teste 2 (int, Postgres real): chamada da ação de revelação por `anon` (sem
 *   sessão) → NEGADA com mensagem pt-BR e banco inalterado; rifa alheia e
 *   rifa sem sorteio vigente também recusadas.
 *   ("Evento registrado na auditoria do servidor quando aplicável": por
 *   decisão do usuário de 14/11/2026 NÃO há tabela de auditoria no schema da
 *   SPEC §2.4 — a autorização executada dentro da action É a conferência do
 *   servidor; o registro em log não se aplica.)
 *
 * Teste extra (caminho feliz da action em nível int, pois o E2E o prova pela
 *   UI): sessão do próprio organizador + sorteio VIGENTE (RN-08) → telefone
 *   devolvido já FORMATADO ("(11) 98888-7777") — o E.164 nunca cruza para o
 *   cliente — e nada é mutado (leitura pura).
 *
 * Política de Testes (§5.1): banco e sessão do Auth REAIS (stack local); só
 * `next/headers`/`next/cache` são substituídos — padrão FD-10/SR-3.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { revelarTelefoneVencedor, type EstadoRevelacao } from "@/actions/sorteio";
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

describe("SR-7 · Server Action revelarTelefoneVencedor (RF-10)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `sr7-revelacao+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaSorteadaId = crypto.randomUUID();
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
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (SR-7).");
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    // Rifa SORTEADA (gravação direta, padrão SR-3) com resultado VIGENTE de
    // Maria Silva — e uma rifa encerrada SEM sorteio para a recusa de RN-08.
    const criarRifa = async (
      rifaId: string,
      status: Database["public"]["Tables"]["rifas"]["Insert"]["status"],
    ) => {
      const { error: erroRifa } = await clientServico.from("rifas").insert({
        id: rifaId,
        perfil_id: usuarioId,
        slug: `sr7-teste-${rifaId.slice(0, 8)}`,
        titulo: "Rifa da SR-7",
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

    await criarRifa(rifaSorteadaId, "sorteada");
    await criarRifa(rifaSemSorteioId, "encerrada");

    // Venda VIGENTE do número 7 com a Maria Silva (o telefone que a action
    // revelará, no formato E.164 da coluna).
    const { data: numero, error: erroNumero } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaSorteadaId)
      .eq("numero", 7)
      .single();
    expect(erroNumero).toBeNull();
    if (!numero) throw new Error("Número 7 de teste não provisionado (SR-7).");

    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaSorteadaId, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador) throw new Error("Comprador de teste não provisionado (SR-7).");

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

    // Sorteio VIGENTE no formato da RPC (FD-3): snapshot do total e timestamp.
    const { error: erroSorteio } = await clientServico.from("sorteios").insert({
      rifa_id: rifaSorteadaId,
      numero_id: numero.id,
      comprador_id: comprador.id,
      total_vendidos: 1,
      sorteado_em: new Date().toISOString(),
    });
    expect(erroSorteio).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // rifas.perfil_id não tem ON DELETE CASCADE → rifas antes, conta depois
    // (o comprador vive na cascata da rifa dele — padrão FD-3).
    await clientServico
      .from("rifas")
      .delete()
      .in("id", [rifaSorteadaId, rifaSemSorteioId]);
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

  it("deve revelar o telefone formatado ao organizador com sorteio vigente, sem alterar nada", async () => {
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(1);

    const revelado: EstadoRevelacao = await revelarTelefoneVencedor(rifaSorteadaId);
    expect(revelado).toEqual({ ok: true, telefone: "(11) 98888-7777" });

    // Leitura pura: o E.164 permanece intacto no banco e o estado não muda.
    const { data: compradores } = await clientServico
      .from("compradores")
      .select("telefone")
      .eq("rifa_id", rifaSorteadaId);
    expect(compradores?.map((linha) => linha.telefone)).toEqual(["+5511988887777"]);
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(1);
  });

  it("deve NEGAR a revelação ao anon (sem sessão) e recusar rifa alheia/sem sorteio vigente com banco inalterado", async () => {
    // a) rifa sem sorteio vigente (encerrada) → recusa de RN-08.
    const semSorteio: EstadoRevelacao = await revelarTelefoneVencedor(rifaSemSorteioId);
    expect(semSorteio).toEqual({
      ok: false,
      mensagem: "Não há sorteio vigente nesta rifa para revelar o telefone do ganhador.",
    });
    expect(await sorteiosVigentes(rifaSemSorteioId)).toBe(0);

    // b) rifa inexistente / de outro organizador.
    const alheia: EstadoRevelacao = await revelarTelefoneVencedor(crypto.randomUUID());
    expect(alheia).toEqual({ ok: false, mensagem: "Não encontramos essa rifa na sua conta." });

    // c) identificador malformado → mesma recusa segura.
    const malformado: EstadoRevelacao = await revelarTelefoneVencedor("nao-e-um-uuid");
    expect(malformado).toEqual({ ok: false, mensagem: "Não encontramos essa rifa na sua conta." });

    // d) ANON (sem sessão): a autorização executada no servidor nega a
    //    revelação — o valor NUNCA sai para quem não é o dono da rifa.
    //    (Auditoria em log: não aplicável — sem tabela no schema da SPEC,
    //    decisão do usuário de 14/11/2026.)
    armazenamentoCookies.clear();
    const anon: EstadoRevelacao = await revelarTelefoneVencedor(rifaSorteadaId);
    expect(anon).toEqual({
      ok: false,
      mensagem: "Sua sessão expirou. Entre novamente para continuar.",
    });

    // Banco inalterado pela tentativa: 1 sorteio vigente, rifa sorteada e o
    // telefone da Maria em E.164 intacto.
    expect(await sorteiosVigentes(rifaSorteadaId)).toBe(1);
    const { data: rifa } = await clientServico
      .from("rifas")
      .select("status")
      .eq("id", rifaSorteadaId)
      .single();
    expect(rifa?.status).toBe("sorteada");
    const { data: compradores } = await clientServico
      .from("compradores")
      .select("telefone")
      .eq("rifa_id", rifaSorteadaId);
    expect(compradores?.map((linha) => linha.telefone)).toEqual(["+5511988887777"]);
  });
});
