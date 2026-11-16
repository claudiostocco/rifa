/**
 * PL-4 · RLS transversal (SPEC §2.3/RNF-05).
 *
 * Usa Postgres/Supabase real: o anon deve ler somente o que a T4/T5
 * publicam, nunca compradores/vendas, resultados anulados ou RPCs de escrita.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

let url = "";
let chaveAnon = "";
let chaveService = "";

const VIOLACAO_RLS = "42501";

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

describe("PL-4 · RLS pública do resultado vigente", () => {
  const clienteServico = () =>
    createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const clienteAnon = () =>
    createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  let usuarioId = "";
  let rifaId = "";
  let numeroId = "";
  let compradorId = "";
  let sorteioVigenteId = "";
  let sorteioAnuladoId = "";

  beforeAll(async () => {
    const admin = clienteServico();
    const email = `pl4-rls+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroUsuario } = await admin.auth.admin.createUser({
      email,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroUsuario).toBeNull();
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (PL-4).");
    usuarioId = criado.user.id;

    const { data: rifa, error: erroRifa } = await admin
      .from("rifas")
      .insert({
        perfil_id: usuarioId,
        slug: `rifa-pl4-${crypto.randomUUID().slice(0, 8)}`,
        titulo: "Rifa pública de segurança",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850,
        numero_valor: 10,
        quantidade: 25,
        qtd_minima: 1,
        status: "sorteada",
      })
      .select("id")
      .single();
    expect(erroRifa).toBeNull();
    if (!rifa) throw new Error("Rifa pública não provisionada (PL-4).");
    rifaId = rifa.id;

    const { data: numero, error: erroNumero } = await admin
      .from("numeros")
      .insert({ rifa_id: rifaId, numero: 1, status: "vendido" })
      .select("id")
      .single();
    expect(erroNumero).toBeNull();
    if (!numero) throw new Error("Número de teste não provisionado (PL-4).");
    numeroId = numero.id;

    const { data: comprador, error: erroComprador } = await admin
      .from("compradores")
      .insert({ rifa_id: rifaId, nome: "Comprador privado", telefone: "+5511999999999" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    if (!comprador) throw new Error("Comprador de teste não provisionado (PL-4).");
    compradorId = comprador.id;

    const { error: erroVenda } = await admin.from("vendas").insert({
      numero_id: numeroId,
      comprador_id: compradorId,
      origem: "organizador",
    });
    expect(erroVenda).toBeNull();

    const { data: vigente, error: erroVigente } = await admin
      .from("sorteios")
      .insert({
        rifa_id: rifaId,
        numero_id: numeroId,
        comprador_id: compradorId,
        total_vendidos: 1,
      })
      .select("id")
      .single();
    expect(erroVigente).toBeNull();
    if (!vigente) throw new Error("Sorteio vigente não provisionado (PL-4).");
    sorteioVigenteId = vigente.id;

    const { data: anulado, error: erroAnulado } = await admin
      .from("sorteios")
      .insert({
        rifa_id: rifaId,
        numero_id: numeroId,
        comprador_id: compradorId,
        total_vendidos: 1,
        anulado_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(erroAnulado).toBeNull();
    if (!anulado) throw new Error("Sorteio anulado não provisionado (PL-4).");
    sorteioAnuladoId = anulado.id;
  });

  afterAll(async () => {
    const admin = clienteServico();
    if (rifaId) await admin.from("rifas").delete().eq("id", rifaId);
    if (usuarioId) await admin.auth.admin.deleteUser(usuarioId);
  });

  it("deve permitir anon ler a rifa publicada, números e somente o resultado vigente", async () => {
    const anon = clienteAnon();
    const { data: rifa, error: erroRifa } = await anon
      .from("rifas")
      .select("id, slug, status")
      .eq("id", rifaId)
      .single();
    expect(erroRifa).toBeNull();
    expect(rifa?.id).toBe(rifaId);

    const { data: numeros, error: erroNumeros } = await anon
      .from("numeros")
      .select("numero, status")
      .eq("rifa_id", rifaId);
    expect(erroNumeros).toBeNull();
    expect(numeros).toEqual([{ numero: 1, status: "vendido" }]);

    const { data: sorteios, error: erroSorteios } = await anon
      .from("sorteios")
      .select("id, rifa_id, numero_id, total_vendidos, anulado_em")
      .eq("rifa_id", rifaId);
    expect(erroSorteios).toBeNull();
    expect(sorteios).toEqual([
      {
        id: sorteioVigenteId,
        rifa_id: rifaId,
        numero_id: numeroId,
        total_vendidos: 1,
        anulado_em: null,
      },
    ]);
  });

  it("deve negar ao anon dados privados, escrita direta, resultado anulado e RPC de sorteio", async () => {
    const anon = clienteAnon();
    const { data: compradores, error: erroCompradores } = await anon
      .from("compradores")
      .select("nome, telefone");
    expect(erroCompradores).toBeNull();
    expect(compradores).toEqual([]);

    const { data: vendas, error: erroVendas } = await anon.from("vendas").select("id");
    expect(erroVendas).toBeNull();
    expect(vendas).toEqual([]);

    const { error: erroUpdate } = await anon
      .from("numeros")
      .update({ status: "disponivel" })
      .eq("id", numeroId);
    expect(erroUpdate).toBeNull();

    const { error: erroRpc } = await anon.rpc("sortear_rifa", { rifa: rifaId });
    expect(erroRpc?.code).toBe(VIOLACAO_RLS);

    const admin = clienteServico();
    const { data: sorteioAnulado, error: erroAnulado } = await admin
      .from("sorteios")
      .select("id")
      .eq("id", sorteioAnuladoId)
      .single();
    expect(erroAnulado).toBeNull();
    expect(sorteioAnulado?.id).toBe(sorteioAnuladoId);
  });
});
