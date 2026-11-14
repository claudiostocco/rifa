/**
 * VT-9 · Teste 2 (int) — payload do Realtime para `anon` (SPEC §4.16 RF-18 ·
 * matriz §5.2 RF-18): "Realtime não entrega linhas de `compradores`/`vendas`
 * para `anon` (payload só de `numeros`)". Política de Testes §5.1: stack
 * REAL local (API + Realtime do Supabase CLI) — nada de simulador.
 *
 * O `anon` (navegador é sempre anônimo — FD-8) assina UM canal POR TABELA,
 * espelhando o uso real: a T3 assina apenas `numeros` (migração 005).
 * Gotcha comprovado localmente (Realtime do CLI v3.0.0): assinar
 * `compradores`/`vendas` NO MESMO canal de `numeros` envenena o canal —
 * nenhuma configuração postgres_changes é atendida, nem a de `numeros`.
 * Com canais separados:
 *   - o canal de `numeros` entrega INSERT/UPDATE e o registro carrega só
 *     colunas de `numeros` (nunca nome/telefone de comprador);
 *   - os canais de `compradores`/`vendas` NÃO entregam evento nenhum, mesmo
 *     com inserções reais no banco: o anon não tem política nenhuma nelas
 *     (migração 001) e elas não entram na publicação (migração 005) — dados
 *     de comprador nunca alcançam o browser (RN-02/RNF-05).
 */
import { createClient, type RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

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
});

type EventoRecebido = {
  tabela: string;
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>;
};

describe("VT-9 · Realtime — payload do anon contém só eventos de numeros (§4.16)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const email = `vt9-realtime+${crypto.randomUUID()}@example.test`;
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
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (VT-9).");
    usuarioId = criado.user.id;

    // Rifa aberta (publicada ao anon) com 25 números (RF-02).
    const { error: erroRifa } = await clientServico.from("rifas").insert({
      id: rifaId,
      perfil_id: usuarioId,
      slug: `vt9-teste-${rifaId.slice(0, 8)}`,
      titulo: "Rifa da VT-9",
      premio_descricao: "Cafeteira",
      premio_rotulo: "estimado",
      premio_valor: 200,
      numero_valor: 10,
      quantidade: 25,
      qtd_minima: 10,
      status: "aberta",
    });
    expect(erroRifa).toBeNull();

    const numeros = Array.from({ length: 25 }, (_, indice) => ({
      rifa_id: rifaId,
      numero: indice + 1,
    }));
    const { error: erroNumeros } = await clientServico.from("numeros").insert(numeros);
    expect(erroNumeros).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    await clientServico.from("rifas").delete().eq("id", rifaId);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  it("deve entregar ao anon o evento UPDATE de numeros (só colunas de estado) e NENHUM evento de compradores/vendas", async () => {
    const clientAnon = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const eventos: EventoRecebido[] = [];
    const coletar =
      (tabela: string) => (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        eventos.push({ tabela, payload });
      };

    // Canais separados (uso real da T3): só `numeros` é assinado pela grade.
    // `compradores`/`vendas` ficam aqui apenas para PROVAR que nada vaza.
    const canais = [
      {
        nome: "numeros",
        config: { event: "*" as const, schema: "public", table: "numeros", filter: `rifa_id=eq.${rifaId}` },
      },
      { nome: "compradores", config: { event: "*" as const, schema: "public", table: "compradores" } },
      { nome: "vendas", config: { event: "*" as const, schema: "public", table: "vendas" } },
    ].map(({ nome, config }) =>
      clientAnon
        .channel(`vt9-anon-${nome}-${rifaId.slice(0, 8)}`)
        .on("postgres_changes", config, coletar(nome)),
    );

    const todosSubscritos = Promise.all(
      canais.map(
        (canal) =>
          new Promise<void>((resolver, recusar) => {
            canal.subscribe((status) => {
              if (status === "SUBSCRIBED") resolver();
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                recusar(new Error(`Canal Realtime falhou: ${status}`));
              }
            });
          }),
      ),
    );
    // testTimeout do projeto já é 30s (vitest.config.mts) — suficiente para
    // a negociação dos websockets com o Realtime do stack local.
    await todosSubscritos;

    // Mudança real no banco: venda completa (número + comprador + venda).
    const { data: numero } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaId)
      .eq("numero", 7)
      .single();
    if (!numero?.id) throw new Error("Número 7 não provisionado (VT-9).");

    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaId, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador?.id) throw new Error("Comprador não provisionado (VT-9).");

    await clientServico.from("numeros").update({ status: "vendido" }).eq("id", numero.id);
    const { error: erroVenda } = await clientServico.from("vendas").insert({
      numero_id: numero.id,
      comprador_id: comprador.id,
      origem: "organizador",
    });
    expect(erroVenda).toBeNull();

    // Espera QUALQUER evento de numeros chegar (com teto) e ainda uma janela
    // extra para QUALQUER evento de compradores/vendas — a ausência é a prova.
    await vi.waitFor(
      () => {
        const deNumeros = eventos.filter((evento) => evento.tabela === "numeros");
        if (deNumeros.length === 0) throw new Error("Evento de numeros não chegou.");
        return deNumeros;
      },
      { timeout: 15_000, interval: 250 },
    );

    // Janela de tolerância: compradores/vendas, se vazassem, chegariam aqui.
    await new Promise((resolver) => setTimeout(resolver, 3_000));

    // SÓ numeros: nenhum evento das tabelas de comprador (RN-02/RNF-05).
    const tabelas = new Set(eventos.map((evento) => evento.tabela));
    expect(tabelas.has("compradores")).toBe(false);
    expect(tabelas.has("vendas")).toBe(false);

    // O evento de UPDATE do número 7 chegou com o estado correto — filtrado
    // DEPOIS da janela de tolerância (o waitFor devolvia um snapshot tomado
    // no primeiro evento; o UPDATE podia chegar meio segundo depois).
    const atualizacoes = eventos.filter(
      (evento) =>
        evento.tabela === "numeros" &&
        evento.payload.eventType === "UPDATE" &&
        (evento.payload.new as { numero: number; status: string } | null)?.numero === 7,
    );
    expect(atualizacoes.length).toBeGreaterThan(0);
    const registro = atualizacoes[0]?.payload.new as Record<string, unknown>;
    expect(registro?.status).toBe("vendido");

    // Payload de numeros NUNCA carrega dado de comprador (RN-02/RNF-05).
    for (const chave of Object.keys(registro)) {
      expect(["id", "rifa_id", "numero", "status"]).toContain(chave);
    }

    for (const canal of canais) await clientAnon.removeChannel(canal);
  });
});
