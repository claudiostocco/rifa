/**
 * SR-1 · Server Actions `encerrarVendas` / `reabrirVendas` — SPEC §4.8 ·
 * matriz §5.2 RF-08 · SR-1 do PLAN.
 *
 * Teste 1 (int, Postgres real): encerrar rifa aberta → status `encerrada`
 *   (badge 🔒 na UI); reabrir → `aberta` novamente.
 * Teste 2 (int): `reabrirVendas` em rifa `sorteada` → falha (transição
 *   inválida) com o estado inalterado — recusas de estado idem (`encerrada`
 *   encerrada de novo, `sorteada` encerrada) e sem sessão/posse.
 *
 * Política de Testes (§5.1): banco e sessão do Auth são REAIS (stack local);
 * só as fronteiras do runtime Next (`next/headers` · `next/cache`) são
 * substituídas — padrão FD-10/VT-5.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { encerrarVendas, reabrirVendas, type EstadoCiclo } from "@/actions/ciclo";
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

describe("SR-1 · Server Actions do ciclo (SPEC §4.8)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `sr1-ciclo+${crypto.randomUUID()}@example.test`;
  const senha = "SenhaForte!2026";
  const rifaAbertaId = crypto.randomUUID();
  const rifaEncerradaId = crypto.randomUUID();
  const rifaSorteadaId = crypto.randomUUID();

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
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (SR-1).");
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();

    // Rifas de teste nas três etapas da máquina (§2.7), cada uma com 100
    // números (RF-02). `sorteada` é gravada direto: o que a action confere é
    // o status (a via real até ele — RPC `sortear_rifa` — já é cenário FD-3).
    for (const [rifaId, status] of [
      [rifaAbertaId, "aberta"],
      [rifaEncerradaId, "encerrada"],
      [rifaSorteadaId, "sorteada"],
    ] as const) {
      const { error: erroRifa } = await clientServico.from("rifas").insert({
        id: rifaId,
        perfil_id: usuarioId,
        slug: `sr1-teste-${rifaId.slice(0, 8)}`,
        titulo: "Rifa da SR-1",
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
    await clientServico
      .from("rifas")
      .delete()
      .in("id", [rifaAbertaId, rifaEncerradaId, rifaSorteadaId]);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  async function statusDaRifa(rifaId: string): Promise<string> {
    const { data } = await clientServico.from("rifas").select("status").eq("id", rifaId).single();
    return data?.status ?? "";
  }

  it("deve encerrar as vendas de rifa aberta com status encerrado e reabri-las de volta a aberta", async () => {
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");

    const encerrada: EstadoCiclo = await encerrarVendas(rifaAbertaId);
    expect(encerrada.ok).toBe(true);
    expect(encerrada.mensagem).toBe("Vendas encerradas com sucesso.");
    expect(await statusDaRifa(rifaAbertaId)).toBe("encerrada");

    const reaberta: EstadoCiclo = await reabrirVendas(rifaAbertaId);
    expect(reaberta.ok).toBe(true);
    expect(reaberta.mensagem).toBe("Vendas reabertas com sucesso.");
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");
  });

  it("deve recusar reabrir rifa sorteada (transição inválida) mantendo o status no banco", async () => {
    const resultado: EstadoCiclo = await reabrirVendas(rifaSorteadaId);
    expect(resultado.ok).toBe(false);
    expect(resultado.mensagem).toBe(
      "O sorteio já foi realizado. Não é possível reabrir as vendas de uma rifa sorteada.",
    );
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");
  });

  it("deve recusar encerrar rifa encerrada e rifa sorteada com estado inalterado", async () => {
    const jaEncerrada: EstadoCiclo = await encerrarVendas(rifaEncerradaId);
    expect(jaEncerrada.ok).toBe(false);
    expect(jaEncerrada.mensagem).toBe("As vendas desta rifa já estão encerradas.");
    expect(await statusDaRifa(rifaEncerradaId)).toBe("encerrada");

    const sorteada: EstadoCiclo = await encerrarVendas(rifaSorteadaId);
    expect(sorteada.ok).toBe(false);
    expect(sorteada.mensagem).toBe(
      "O sorteio já foi realizado. Não é possível encerrar as vendas de uma rifa sorteada.",
    );
    expect(await statusDaRifa(rifaSorteadaId)).toBe("sorteada");
  });

  it("deve recusar reabrir rifa aberta, rifa de outro organizador e sessão expirada sem tocar o banco", async () => {
    const jaAberta: EstadoCiclo = await reabrirVendas(rifaAbertaId);
    expect(jaAberta.ok).toBe(false);
    expect(jaAberta.mensagem).toBe("As vendas desta rifa já estão abertas.");
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");

    const alheia: EstadoCiclo = await encerrarVendas(crypto.randomUUID());
    expect(alheia.ok).toBe(false);
    expect(alheia.mensagem).toBe("Não encontramos essa rifa na sua conta.");

    // Sessão expirada: limpa os cookies em memória (última conferência — o
    // restante da suíte já rodou com a sessão real).
    armazenamentoCookies.clear();
    const semSessao: EstadoCiclo = await encerrarVendas(rifaAbertaId);
    expect(semSessao.ok).toBe(false);
    expect(semSessao.mensagem).toBe("Sua sessão expirou. Entre novamente para continuar.");
    expect(await statusDaRifa(rifaAbertaId)).toBe("aberta");
  });
});
