/**
 * SR-4 · Aleatoriedade e distribuição (RNF-07) — SPEC §2.4/§4.9 RF-09 ·
 * matriz §5.2 "RF-09 sorteio (RPC)" · SR-4 do PLAN.
 *
 * Teste 1 (int, Postgres real): N sorteios em rifas de amostra criadas para
 *   o teste → o vencedor está sempre dentro do conjunto de números vendidos,
 *   nunca de um disponível.
 *
 * A unidade da aleatoriedade é a RPC `sortear_rifa` (migração 002 —
 * k = uniforme(0..total_vendidos-1) a partir de 8 bytes do pgcrypto
 * `gen_random_bytes`, RNF-07). A via acessada é a mesma da Server Action
 * `sortear` (SR-3 delega à RPC): service_role, precedentes FD-3/SR-3.
 * Cada amostra tem um conjunto de vendidos DIFERENTE e com buracos (não só
 * prefixo 1..k), de modo que um vencedor fora do conjunto seria detectável
 * por construção — inclusive a amostra de candidato único, cujo resultado
 * é determinístico.
 *
 * Teste 2 (unit) vive em tests/unit/aleatoriedade.test.ts (inspeção de
 * código + prova em runtime com `Math.random` sabotado).
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

/** Amostra de rifa: quantidade e o conjunto EXATO de números com venda vigente. */
type Amostra = {
  slug: string;
  quantidade: number;
  vendidos: number[];
};

const AMOSTRAS: Amostra[] = [
  // Candidato único: o vencedor é determinístico — o nº 25 tem de sair.
  { slug: "sr4-vendido-unico", quantidade: 25, vendidos: [25] },
  // Prefixo com buraco: um "offset 0" preguiçoso cairia no 001 — que É vendido,
  // mas o conjunto completo (e o mapa de compradores) delimita a asserção.
  { slug: "sr4-prefixo-com-buraco", quantidade: 25, vendidos: [1, 2, 3, 4, 5, 20] },
  // Esparsa: 5 candidatos muito separados entre 50 números disponíveis.
  { slug: "sr4-esparsa", quantidade: 50, vendidos: [7, 13, 31, 44, 50] },
  // Cheia: 60 primeiros de uma rifa de 100.
  { slug: "sr4-cheia", quantidade: 100, vendidos: Array.from({ length: 60 }, (_, i) => i + 1) },
  // Pares: 20 candidatos intercalados entre ímpares disponíveis.
  {
    slug: "sr4-pares",
    quantidade: 100,
    vendidos: Array.from({ length: 20 }, (_, i) => (i + 1) * 2),
  },
  // Múltiplos de 5: 20 candidatos em uma rifa de 200 (números até 0100).
  {
    slug: "sr4-multiplos",
    quantidade: 200,
    vendidos: Array.from({ length: 20 }, (_, i) => (i + 1) * 5),
  },
];

describe("SR-4 · Aleatoriedade e distribuição da RPC sortear_rifa (RNF-07)", () => {
  let client: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";

  /** Estado esperado de cada amostra, montado no provisionamento. */
  const estado = new Map<
    string,
    {
      rifaId: string;
      idsVendidos: Set<string>;
      idsDisponiveis: Set<string>;
      compradorPorNumeroId: Map<string, string>;
      totalVendidos: number;
    }
  >();

  beforeAll(async () => {
    client = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Organizador + perfil (trigger OCR, SPEC §4.17) — precedentes FD-3/SR-3.
    const email = `sr4-aleatoriedade+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await client.auth.admin.createUser({
      email,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (SR-4).");
    usuarioId = criado.user.id;

    for (const amostra of AMOSTRAS) {
      const { data: rifa, error: erroRifa } = await client
        .from("rifas")
        .insert({
          perfil_id: usuarioId,
          slug: `${amostra.slug}-${crypto.randomUUID().slice(0, 8)}`,
          titulo: `Rifa da SR-4 (${amostra.slug})`,
          premio_descricao: "Forno elétrico",
          premio_rotulo: "estimado",
          premio_valor: 850.0,
          numero_valor: 10.0,
          quantidade: amostra.quantidade,
          qtd_minima: 10,
          status: "encerrada",
        })
        .select("id")
        .single();
      expect(erroRifa).toBeNull();
      if (!rifa) throw new Error(`Seed da rifa ${amostra.slug} falhou (SR-4).`);

      const linhas = Array.from({ length: amostra.quantidade }, (_, i) => ({
        rifa_id: rifa.id,
        numero: i + 1,
      }));
      const { data: numeros, error: erroNumeros } = await client
        .from("numeros")
        .insert(linhas)
        .select("id, numero");
      expect(erroNumeros).toBeNull();
      if (!numeros) throw new Error(`Seed dos números de ${amostra.slug} falhou (SR-4).`);

      // Compradores Maria/João alternados por posição de venda (como o
      // provisionamento da SR-2) — cada número vigente tem exatamente 1 dono.
      const { data: compradores, error: erroCompradores } = await client
        .from("compradores")
        .insert([
          { rifa_id: rifa.id, nome: "Maria Silva", telefone: "+5511988887777" },
          { rifa_id: rifa.id, nome: "João Pereira", telefone: "+5511999996666" },
        ])
        .select("id, nome");
      expect(erroCompradores).toBeNull();
      if (!compradores || compradores.length !== 2) {
        throw new Error(`Seed dos compradores de ${amostra.slug} falhou (SR-4).`);
      }

      const idPorNumero = new Map(numeros.map((n) => [n.numero, n.id]));
      const idsVendidos: string[] = [];
      const vendas: Array<{
        numero_id: string;
        comprador_id: string;
        origem: "organizador";
      }> = [];
      const compradorPorNumeroId = new Map<string, string>();

      amostra.vendidos.forEach((numero, indice) => {
        const numeroId = idPorNumero.get(numero);
        if (!numeroId) throw new Error(`Número ${numero} ausente em ${amostra.slug} (SR-4).`);
        const comprador = compradores[indice % 2];
        if (!comprador) throw new Error("Comprador de teste ausente (SR-4).");
        idsVendidos.push(numeroId);
        compradorPorNumeroId.set(numeroId, comprador.id);
        vendas.push({ numero_id: numeroId, comprador_id: comprador.id, origem: "organizador" });
      });

      const { error: erroVendas } = await client.from("vendas").insert(vendas);
      expect(erroVendas).toBeNull();

      const { error: erroMarca } = await client
        .from("numeros")
        .update({ status: "vendido" })
        .in("id", idsVendidos);
      expect(erroMarca).toBeNull();

      const idsVendidosSet = new Set(idsVendidos);
      estado.set(amostra.slug, {
        rifaId: rifa.id,
        idsVendidos: idsVendidosSet,
        idsDisponiveis: new Set(numeros.map((n) => n.id).filter((id) => !idsVendidosSet.has(id))),
        compradorPorNumeroId,
        totalVendidos: amostra.vendidos.length,
      });
    }
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // Cascata resolve numeros/vendas/compradores; o usuário remove o perfil
    // (trigger OCR) — padrão FD-3.
    await client
      .from("rifas")
      .delete()
      .in(
        "id",
        [...estado.values()].map((amostra) => amostra.rifaId),
      );
    await client.auth.admin.deleteUser(usuarioId);
  });

  it("deve sortear N rifas de amostra com o vencedor sempre dentro do conjunto de vendidos, nunca de um disponível", async () => {
    expect(estado.size).toBe(AMOSTRAS.length);

    for (const amostra of AMOSTRAS) {
      const alvo = estado.get(amostra.slug);
      if (!alvo) throw new Error(`Estado de ${amostra.slug} ausente (SR-4).`);

      const { data: sorteioId, error: erroRpc } = await client.rpc("sortear_rifa", {
        rifa: alvo.rifaId,
      });
      expect(erroRpc).toBeNull();
      if (typeof sorteioId !== "string") {
        throw new Error(`RPC não retornou o id do sorteio de ${amostra.slug} (SR-4).`);
      }

      const { data: sorteio, error: erroSorteio } = await client
        .from("sorteios")
        .select("id, numero_id, anulado_em")
        .eq("id", sorteioId)
        .single();
      expect(erroSorteio).toBeNull();
      expect(sorteio?.anulado_em).toBeNull();

      // O PISO do RNF-07: o k-ésimo vendido — jamais um número disponível.
      const numeroId = sorteio?.numero_id ?? "";
      expect(alvo.idsVendidos.has(numeroId)).toBe(true);
      expect(alvo.idsDisponiveis.has(numeroId)).toBe(false);

      const { data: numeroVencedor, error: erroVencedor } = await client
        .from("numeros")
        .select("numero, status")
        .eq("id", numeroId)
        .single();
      expect(erroVencedor).toBeNull();
      expect(numeroVencedor?.status).toBe("vendido");

      // Candidato único: resultado determinístico — o único vendido tem de ser
      // o vencedor (distribuição uniforme trivial).
      if (amostra.vendidos.length === 1) {
        expect(numeroVencedor?.numero).toBe(amostra.vendidos[0]);
      }
    }
  });

  it("deve gravar em todas as N amostras o snapshot coerente (total de vendidos, comprador da venda vigente e rifa sorteada)", async () => {
    const { data: registros, error: erroRegistros } = await client
      .from("sorteios")
      .select("id, rifa_id, numero_id, comprador_id, total_vendidos, sorteado_em, anulado_em")
      .in(
        "rifa_id",
        [...estado.values()].map((amostra) => amostra.rifaId),
      );
    expect(erroRegistros).toBeNull();
    expect(registros).toHaveLength(AMOSTRAS.length);

    for (const registro of registros ?? []) {
      const alvo = [...estado.values()].find((amostra) => amostra.rifaId === registro.rifa_id);
      if (!alvo) throw new Error(`Sorteio fora das amostras (rifa ${registro.rifa_id}) (SR-4).`);

      expect(registro.anulado_em).toBeNull();
      expect(registro.sorteado_em).toBeTruthy();
      // Snapshot do conjunto (§4.9): a contagem do sorteio é a da amostra.
      expect(registro.total_vendidos).toBe(alvo.totalVendidos);
      // O comprador gravado é o da venda vigente daquele número.
      expect(registro.comprador_id).toBe(alvo.compradorPorNumeroId.get(registro.numero_id));

      const { data: rifa, error: erroRifa } = await client
        .from("rifas")
        .select("status")
        .eq("id", registro.rifa_id)
        .single();
      expect(erroRifa).toBeNull();
      expect(rifa?.status).toBe("sorteada");
    }
  });
});
