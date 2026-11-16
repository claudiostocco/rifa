/**
 * FD-3 · Migração 0002 — RPC transacional `sortear_rifa`
 * (SPEC §2.4 §4.9 RF-09 · matriz §5.2, linha "RF-09 sorteio (RPC)")
 *
 * Teste 1 (int): RPC em rifa encerrada com vendas → 1 registro em sorteios
 *                + status sorteada.
 * Teste 2 (int): RPC em rifa aberta → erro RIFA_ABERTA; com 0 vendidos →
 *                RIFA_SEM_VENDIDOS; 2ª chamada sem anular falha (RNF-06).
 *
 * Postgres REAL local via Supabase CLI (SPEC §5.1 — mocks proibidos).
 * Via acessada: service_role — é a porta da Server Action `sortear`
 * (SPEC §2.5: `sortear(id)` delega à RPC; a RPC é security invoker).
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

let url = "";
let chaveService = "";

beforeAll(() => {
  url = process.env.TEST_SUPABASE_URL ?? "";
  chaveService = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !chaveService) {
    throw new Error(
      "Variáveis de teste do Supabase ausentes. Rode `supabase start` antes de `pnpm test:int` (ET-7).",
    );
  }
});

/** Token do contrato da RPC — PostgREST devolve a mensagem de ABORT inteira. */
const CODIGO = {
  rifaAberta: "RIFA_ABERTA",
  rifaSemVendidos: "RIFA_SEM_VENDIDOS",
  rifaJaSorteada: "RIFA_JA_SORTEADA",
} as const;

describe("FD-3 · RPC sortear_rifa (transacional §2.4/§4.9)", () => {
  let client: ReturnType<typeof createClient<Database>>;

  let usuarioId = "";
  let compradorId = "";
  let rifaEncerradaId = "";
  let rifaAbertaId = "";
  let rifaSemVendasId = "";

  /** Números vendidos (nº 1..3) da rifa encerrada — candidatos ao sorteio. */
  let idsVendidos: string[] = [];

  beforeAll(async () => {
    client = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Organizador + perfil (trigger OCR, SPEC §4.17)
    const email = `fd3-sorteio+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await client.auth.admin.createUser({
      email,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    expect(criado?.user).toBeTruthy();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (FD-3).");
    }
    usuarioId = criado.user.id;

    // Comprador único reproduzido nas duas rifas com vendas (§5.2/RF-09)
    const criarRifa = async (config: {
      slug: string;
      status: "aberta" | "encerrada";
      vendidos: number;
    }) => {
      const { data: rifa, error: erroRifa } = await client
        .from("rifas")
        .insert({
          perfil_id: usuarioId,
          slug: config.slug,
          titulo: `Rifa da Comenda da FD-3 (${config.slug})`,
          premio_descricao: "Forno elétrico",
          premio_rotulo: "estimado",
          premio_valor: 850.0,
          numero_valor: 10.0,
          quantidade: 25,
          qtd_minima: 10,
          status: config.status,
        })
        .select("id")
        .single();
      expect(erroRifa).toBeNull();
      expect(rifa).toBeTruthy();
      if (!rifa) {
        throw new Error(`Seed da rifa ${config.slug} falhou (FD-3).`);
      }

      const linhas = Array.from({ length: 25 }, (_, i) => ({
        rifa_id: rifa.id,
        numero: i + 1,
      }));
      const { error: erroNumeros } = await client.from("numeros").insert(linhas);
      expect(erroNumeros).toBeNull();

      if (config.vendidos > 0) {
        // nº 1..vendidos marcados com venda vigente (estado pós registrarVenda)
        const { data: numero, error: erroNumero } = await client
          .from("numeros")
          .select("id")
          .eq("rifa_id", rifa.id)
          .eq("numero", 1)
          .single();
        expect(erroNumero).toBeNull();
        expect(numero).toBeTruthy();
        if (!numero) {
          throw new Error(`Seed do numero vendido (${config.slug}) falhou (FD-3).`);
        }

        if (!compradorId) {
          const { data: comprador, error: erroComprador } = await client
            .from("compradores")
            .insert({ rifa_id: rifa.id, nome: "Maria Silva", telefone: "+5511988887777" })
            .select("id")
            .single();
          expect(erroComprador).toBeNull();
          expect(comprador).toBeTruthy();
          if (!comprador) {
            throw new Error("Seed do comprador de FD-3 falhou.");
          }
          compradorId = comprador.id;
        }

        // Vendas ≠ comprador entre rifas: o seed compreendeu 1 venda de
        // exemplo por número marcado; comprador único mantém o vínculo FK válido
        for (const n of [1, 2, 3].slice(0, config.vendidos)) {
          const { data: numeroAlvo, error: erroAlvo } = await client
            .from("numeros")
            .select("id")
            .eq("rifa_id", rifa.id)
            .eq("numero", n)
            .single();
          expect(erroAlvo).toBeNull();
          expect(numeroAlvo).toBeTruthy();
          if (!numeroAlvo) {
            throw new Error(`Seed do numero ${n} (${config.slug}) falhou (FD-3).`);
          }
          const { error: erroVenda } = await client.from("vendas").insert({
            numero_id: numeroAlvo.id,
            comprador_id: compradorId,
            origem: "organizador",
          });
          expect(erroVenda).toBeNull();
          const { error: erroMarca } = await client
            .from("numeros")
            .update({ status: "vendido" })
            .eq("id", numeroAlvo.id);
          expect(erroMarca).toBeNull();
        }
      }
      return rifa.id;
    };

    rifaEncerradaId = await criarRifa({
      slug: `rifa-fd3-encerrada-${crypto.randomUUID().slice(0, 8)}`,
      status: "encerrada",
      vendidos: 3,
    });
    rifaAbertaId = await criarRifa({
      slug: `rifa-fd3-aberta-${crypto.randomUUID().slice(0, 8)}`,
      status: "aberta",
      vendidos: 1,
    });
    rifaSemVendasId = await criarRifa({
      slug: `rifa-fd3-sem-vendas-${crypto.randomUUID().slice(0, 8)}`,
      status: "encerrada",
      vendidos: 0,
    });

    const { data: vendidos } = await client
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaEncerradaId)
      .eq("status", "vendido");
    idsVendidos = (vendidos ?? []).map((v) => v.id);
    expect(idsVendidos).toHaveLength(3);
  });

  afterAll(async () => {
    if (!usuarioId) return;

    // Ordem importa: o comprador vive na cascata da rifa encerrada — apagar
    // as rifas de apoio primeiro evita FK violada em vendas.comprador_id.
    // deleteUser no fim remove o perfil (trigger OCR)
    for (const id of [rifaAbertaId, rifaSemVendasId, rifaEncerradaId]) {
      if (id) await client.from("rifas").delete().eq("id", id);
    }
    await client.auth.admin.deleteUser(usuarioId);
  });

  it("deve executar RPC em rifa encerrada com vendas gravando 1 sorteio e status sorteada", async () => {
    const { data: sorteioId, error: erroRpc } = await client.rpc("sortear_rifa", {
      rifa: rifaEncerradaId,
    });
    expect(erroRpc).toBeNull();
    expect(typeof sorteioId).toBe("string");
    if (typeof sorteioId !== "string") {
      throw new Error("RPC sortear_rifa não retornou o id do sorteio (FD-3).");
    }

    // Exatamente 1 registro de sorteio vigente (anulado_em NULL)
    const { data: sorteios, error: erroSorteios } = await client
      .from("sorteios")
      .select("id, numero_id, comprador_id, total_vendidos, sorteado_em, anulado_em")
      .eq("rifa_id", rifaEncerradaId);
    expect(erroSorteios).toBeNull();
    expect(sorteios).toHaveLength(1);
    const sorteio = sorteios?.[0];
    expect(sorteio?.id).toBe(sorteioId);
    expect(sorteio?.anulado_em).toBeNull();
    expect(sorteio?.sorteado_em).toBeTruthy();
    expect(sorteio?.comprador_id).toBe(compradorId);
    expect(sorteio?.total_vendidos).toBe(3);

    // Vencedor ∈ conjunto de números vendidos, nunca um disponível (SR-4 piso)
    expect(idsVendidos).toContain(sorteio?.numero_id);

    const { data: nApos, error: erroN } = await client
      .from("numeros")
      .select("status")
      .eq("id", sorteio?.numero_id ?? "")
      .single();
    expect(erroN).toBeNull();
    expect(nApos?.status).toBe("vendido");

    // Virada de estado: encerrada → sorteada (§2.7)
    const { data: rifaApos, error: erroRifa } = await client
      .from("rifas")
      .select("status")
      .eq("id", rifaEncerradaId)
      .single();
    expect(erroRifa).toBeNull();
    expect(rifaApos?.status).toBe("sorteada");
  });

  it("deve abortar RPC em rifa aberta (RIFA_ABERTA), sem vendas (RIFA_SEM_VENDIDOS) e na 2ª chamada sem anular (RNF-06)", async () => {
    // a) rifa aberta (já com venda vigente — o abort nasce do estado, não do vazio)
    const { data: sorteioAberta, error: erroAberta } = await client.rpc("sortear_rifa", {
      rifa: rifaAbertaId,
    });
    expect(sorteioAberta).toBeNull();
    expect(erroAberta?.message).toContain(CODIGO.rifaAberta);

    const { data: sorteiosAberta } = await client
      .from("sorteios")
      .select("id")
      .eq("rifa_id", rifaAbertaId);
    expect(sorteiosAberta).toHaveLength(0);
    const { data: rifaAbertaApos } = await client
      .from("rifas")
      .select("status")
      .eq("id", rifaAbertaId)
      .single();
    expect(rifaAbertaApos?.status).toBe("aberta"); // transação inteira desfeita

    // b) rifa encerrada com 0 vendidos → RIFA_SEM_VENDIDOS (rifa permanece encerrada)
    const { data: sorteioVazio, error: erroVazio } = await client.rpc("sortear_rifa", {
      rifa: rifaSemVendasId,
    });
    expect(sorteioVazio).toBeNull();
    expect(erroVazio?.message).toContain(CODIGO.rifaSemVendidos);

    const { data: sorteiosVazio } = await client
      .from("sorteios")
      .select("id")
      .eq("rifa_id", rifaSemVendasId);
    expect(sorteiosVazio).toHaveLength(0);
    const { data: rifaVazioApos } = await client
      .from("rifas")
      .select("status")
      .eq("id", rifaSemVendasId)
      .single();
    expect(rifaVazioApos?.status).toBe("encerrada");

    // c) 2ª chamada sem anular o resultado vigente → falha (RNF-06)
    const { data: reSorteio, error: erroReSorteio } = await client.rpc("sortear_rifa", {
      rifa: rifaEncerradaId,
    });
    expect(reSorteio).toBeNull();
    expect(erroReSorteio?.message).toContain(CODIGO.rifaJaSorteada);

    // nada mudou: continua 1 sorteio vigente e status sorteada
    const { data: sorteiosApos } = await client
      .from("sorteios")
      .select("id, anulado_em")
      .eq("rifa_id", rifaEncerradaId);
    expect(sorteiosApos).toHaveLength(1);
    expect(sorteiosApos?.[0]?.anulado_em).toBeNull();
    const { data: rifaFinal } = await client
      .from("rifas")
      .select("status")
      .eq("id", rifaEncerradaId)
      .single();
    expect(rifaFinal?.status).toBe("sorteada");
  });
});
