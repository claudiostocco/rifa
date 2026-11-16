/**
 * VT-5 · Server Action `registrarVenda` (organizador) — SPEC §4.5 · matriz
 * §5.2 RF-05 · VT-5 do PLAN.
 *
 * Teste 1 (int, Postgres real): venda válida → número vira `vendido`, venda
 *   gravada com `origem='organizador'` e comprador registrado.
 * Teste 2 (int): venda em número já vendido → erro "Esse número acabou de
 *   ser vendido" com estado inalterado; venda em rifa encerrada → recusada
 *   com o número permanecendo `disponivel`.
 *
 * Política de Testes (§5.1): banco e sessão do Auth são REAIS (stack local);
 * só as fronteiras do runtime Next (`next/headers` · `next/cache`) são
 * substituídas — padrão FD-10. A conferência extra de RN-03 no banco
 * (índice parcial da migração 004) é exercitada na VT-6 (corrida).
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

describe("VT-5 · Server Action registrarVenda (SPEC §4.5)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `vt5-venda+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaAbertaId = crypto.randomUUID();
  const rifaEncerradaId = crypto.randomUUID();

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
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (VT-5).");
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    // Rifas de teste: aberta e encerrada, cada uma com 100 números (RF-02).
    for (const [rifaId, status] of [
      [rifaAbertaId, "aberta"],
      [rifaEncerradaId, "encerrada"],
    ] as const) {
      const { error: erroRifa } = await clientServico.from("rifas").insert({
        id: rifaId,
        perfil_id: usuarioId,
        slug: `vt5-teste-${rifaId.slice(0, 8)}`,
        titulo: "Rifa da VT-5",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850,
        numero_valor: 10,
        quantidade: 100,
        qtd_minima: 30,
        status,
      });
      expect(erroRifa).toBeNull();

      const numeros = Array.from({ length: 100 }, (_, indice) => ({
        rifa_id: rifaId,
        numero: indice + 1,
      }));
      const { error: erroNumeros } = await clientServico.from("numeros").insert(numeros);
      expect(erroNumeros).toBeNull();
    }
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // rifas.perfil_id não tem ON DELETE CASCADE → rifas antes, conta depois.
    await clientServico.from("rifas").delete().in("id", [rifaAbertaId, rifaEncerradaId]);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  /** id do número `numero` da rifa informada (consulta com service_role). */
  async function idDoNumero(rifaId: string, numero: number): Promise<string> {
    const { data } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaId)
      .eq("numero", numero)
      .single();
    if (!data?.id) throw new Error(`Número ${numero} da rifa ${rifaId} não provisionado.`);
    return data.id;
  }

  async function estadoDoNumero(
    rifaId: string,
    numero: number,
  ): Promise<{ status: string; vendasVigentes: number }> {
    const { data: linha } = await clientServico
      .from("numeros")
      .select("id, status")
      .eq("rifa_id", rifaId)
      .eq("numero", numero)
      .single();
    const { count } = await clientServico
      .from("vendas")
      .select("id", { count: "exact", head: true })
      .eq("numero_id", linha?.id ?? "")
      .is("removida_em", null);
    return { status: linha?.status ?? "", vendasVigentes: count ?? 0 };
  }

  it("deve registrar Maria Silva / (11) 98888-7777 no nº 037 com número vendido, venda de origem organizador e comprador gravado", async () => {
    const numeroId = await idDoNumero(rifaAbertaId, 37);

    const resultado: EstadoVenda = await registrarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.mensagem).toBe("Venda registrada com sucesso.");

    // Número virou `vendido` com EXATAMENTE 1 venda vigente (RN-03).
    const estado = await estadoDoNumero(rifaAbertaId, 37);
    expect(estado.status).toBe("vendido");
    expect(estado.vendasVigentes).toBe(1);

    // Venda com origem prescrita (§2.4) e comprador correto (§4.5).
    const { data: venda } = await clientServico
      .from("vendas")
      .select("origem, removida_em, compradores(nome, telefone)")
      .eq("numero_id", numeroId)
      .is("removida_em", null)
      .single();
    expect(venda?.origem).toBe("organizador");
    expect(venda?.removida_em).toBeNull();
    expect(venda?.compradores?.nome).toBe("Maria Silva");
    expect(venda?.compradores?.telefone).toBe("+5511988887777");
  });

  it("deve recusar venda em número já vendido com 'Esse número acabou de ser vendido' e estado inalterado", async () => {
    const numeroId = await idDoNumero(rifaAbertaId, 37);

    const resultado: EstadoVenda = await registrarVenda({
      numeroId,
      nome: "João Pereira",
      telefone: "+5511977776666",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensagem).toBe("Esse número acabou de ser vendido");

    // Estado inalterado: mesma venda vigente, mesmo comprador (RN-03/§4.5).
    const { data: venda } = await clientServico
      .from("vendas")
      .select("compradores(nome, telefone)")
      .eq("numero_id", numeroId)
      .is("removida_em", null)
      .single();
    expect(venda?.compradores?.nome).toBe("Maria Silva");
    expect(venda?.compradores?.telefone).toBe("+5511988887777");
    expect(await estadoDoNumero(rifaAbertaId, 37)).toEqual({
      status: "vendido",
      vendasVigentes: 1,
    });
  });

  it("deve recusar venda em rifa encerrada mantendo o número disponível", async () => {
    const numeroId = await idDoNumero(rifaEncerradaId, 1);

    const resultado: EstadoVenda = await registrarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensagem).toBe("As vendas desta rifa estão encerradas.");
    expect(await estadoDoNumero(rifaEncerradaId, 1)).toEqual({
      status: "disponivel",
      vendasVigentes: 0,
    });
  });

  it("deve recusar telefone fora do E.164 e sessão expirada sem tocar o banco", async () => {
    const numeroId = await idDoNumero(rifaAbertaId, 42);

    const invalida = await registrarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "(11) 98888-7777",
    });
    expect(invalida.ok).toBe(false);
    expect(invalida.mensagem).toBe("O telefone deve estar no formato E.164 (ex.: +5511988887777)");
    expect(await estadoDoNumero(rifaAbertaId, 42)).toEqual({
      status: "disponivel",
      vendasVigentes: 0,
    });

    // Sessão expirada: limpa os cookies em memória e tenta de novo.
    armazenamentoCookies.clear();
    const semSessao = await registrarVenda({
      numeroId,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(semSessao.ok).toBe(false);
    expect(semSessao.mensagem).toBe("Sua sessão expirou. Entre novamente para continuar.");
    expect(await estadoDoNumero(rifaAbertaId, 42)).toEqual({
      status: "disponivel",
      vendasVigentes: 0,
    });
  });
});
