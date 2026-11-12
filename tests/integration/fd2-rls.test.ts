/**
 * FD-2 · Políticas RLS (SPEC §2.3 · matriz §5.2, linha "RLS transversal")
 *
 * Teste 1 (int): `anon` faz SELECT em rifas publicadas e em numeros.
 * Teste 2 (int): `anon` é NEGADO em SELECT de compradores/vendas e em
 *                todo INSERT/UPDATE (cobertura de bypass).
 *
 * Postgres REAL local via Supabase CLI (SPEC §5.1 — mocks proibidos).
 * O anon recebe `ANON_KEY` sem sessão de auth — exatamente como o browser
 * do visitante da T4 fala com o banco. O seed usa `service_role` para criar
 * dados reais por trás do RLS; os alvos são as políticas, não o schema.
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

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

/** PostgREST preserva o código `42501` (violação de RLS) nas escritas negadas. */
const VIOLACAO_RLS = "42501";

describe("FD-2 · políticas RLS (SPEC §2.3)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let clientAnon: ReturnType<typeof createClient<Database>>;

  let usuarioId = "";
  let rifaPublicaId = "";
  let numeroIdVendido = "";
  let compradorId = "";

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientAnon = createClient<Database>(url, chaveAnon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Conta do organizador — o perfil nasce pelo trigger OCR (SPEC §4.17)
    const email = `fd2-rls+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    expect(criado?.user).toBeTruthy();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (FD-2).");
    }
    usuarioId = criado.user.id;

    // Rifa publicada (aberta, sem arquivar/excluir) — must-see do anon
    const { data: rifaPublica, error: erroRifa } = await clientServico
      .from("rifas")
      .insert({
        perfil_id: usuarioId,
        slug: `rifa-fd2-${crypto.randomUUID().slice(0, 8)}`,
        titulo: "Rifa da Comenda da FD-2",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850.0,
        numero_valor: 10.0,
        quantidade: 25,
        qtd_minima: 10,
      })
      .select("id, status, arquivada, excluida")
      .single();
    expect(erroRifa).toBeNull();
    expect(rifaPublica).toBeTruthy();
    if (!rifaPublica) {
      throw new Error("Seed da rifa publicada falhou (FD-2).");
    }
    rifaPublicaId = rifaPublica.id;

    // Numeração 001..025 da rifa publicada (RF-02)
    const linhas = Array.from({ length: 25 }, (_, i) => ({
      rifa_id: rifaPublicaId,
      numero: i + 1,
    }));
    const { error: erroNumeros } = await clientServico.from("numeros").insert(linhas);
    expect(erroNumeros).toBeNull();

    // Comprador + venda reais por trás do RLS — sem estes dados, o SELECT
    // do anon em compradores/vendas estaria vazio "de graça" (bypass sem prova)
    const { data: comprador, error: erroComprador } = await clientServico
      .from("compradores")
      .insert({ rifa_id: rifaPublicaId, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    expect(erroComprador).toBeNull();
    expect(comprador).toBeTruthy();
    if (!comprador) {
      throw new Error("Seed do comprador falhou (FD-2).");
    }
    compradorId = comprador.id;

    const { data: numeroVendido, error: erroNumero } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaPublicaId)
      .eq("numero", 1)
      .single();
    expect(erroNumero).toBeNull();
    expect(numeroVendido).toBeTruthy();
    if (!numeroVendido) {
      throw new Error("Seed do numero vendido falhou (FD-2).");
    }
    numeroIdVendido = numeroVendido.id;

    const { error: erroVenda } = await clientServico.from("vendas").insert({
      numero_id: numeroIdVendido,
      comprador_id: comprador.id,
      origem: "organizador",
    });
    expect(erroVenda).toBeNull();

    // O vínculo venda ↔ numeros.status 'vendido' é garantido pela Server Action
    // registrarVenda (VT-5), não por trigger — o seed reproduz o estado pós-venda
    const { error: erroMarcaVendido } = await clientServico
      .from("numeros")
      .update({ status: "vendido" })
      .eq("id", numeroIdVendido);
    expect(erroMarcaVendido).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;

    // Ordem de limpeza: rifas apaga em cascata numeros/compradores (e vendas)
    // e auth.admin.deleteUser apaga o perfil (trigger OCR)
    if (rifaPublicaId) await clientServico.from("rifas").delete().eq("id", rifaPublicaId);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  it("deve aceitar anon SELECT em rifas publicadas e em numeros", async () => {
    // a) rifa publicada visível ao visitante sem login
    const { data: rifa, error: erroRifa } = await clientAnon
      .from("rifas")
      .select("id, slug, titulo, status")
      .eq("id", rifaPublicaId)
      .single();
    expect(erroRifa).toBeNull();
    expect(rifa?.status).toBe("aberta");
    expect(rifa?.id).toBe(rifaPublicaId);

    // b) os estados da grade pública (numeros 001..025) viram para o anon
    const { data: numeros, error: erroNumeros } = await clientAnon
      .from("numeros")
      .select("id, rifa_id, numero, status")
      .eq("rifa_id", rifaPublicaId)
      .order("numero");
    expect(erroNumeros).toBeNull();
    expect(numeros).toHaveLength(25);
    expect(numeros?.[0]?.status).toBe("vendido"); // nº 1 vendido no seed
    expect(numeros?.[24]?.status).toBe("disponivel");
  });

  it("deve negar anon SELECT de compradores/vendas e todo INSERT/UPDATE (RLS 42501)", async () => {
    // a) SELECT compradores: linha existe (seed) — RLS devolve vazio, sem erro
    const { data: compradores, error: erroCompradores } = await clientAnon
      .from("compradores")
      .select("id, nome, telefone");
    expect(erroCompradores).toBeNull();
    expect(compradores).toHaveLength(0);

    // b) SELECT vendas: telefone/comprador fora do alcance público (RNF-05)
    const { data: vendas, error: erroVendasSelect } = await clientAnon
      .from("vendas")
      .select("id, comprador_id, origem");
    expect(erroVendasSelect).toBeNull();
    expect(vendas).toHaveLength(0);

    // c) INSERT rifas pelo anon: nenhuma política de insert para `anon`
    const { error: erroInsertRifa } = await clientAnon.from("rifas").insert({
      perfil_id: usuarioId,
      slug: `rifa-fd2-anon-${crypto.randomUUID().slice(0, 8)}`,
      titulo: "Rifa ao bypass",
      premio_descricao: "Qualquer",
      premio_valor: 1,
      numero_valor: 1,
      quantidade: 25,
      qtd_minima: 0,
    });
    expect(erroInsertRifa?.code).toBe(VIOLACAO_RLS);

    // d) INSERT numeros pelo anon
    const { error: erroInsertNumero } = await clientAnon.from("numeros").insert({
      rifa_id: rifaPublicaId,
      numero: 25, // nº 25 segue disponivel — a negação nasce do RLS, não do dado
    });
    expect(erroInsertNumero?.code).toBe(VIOLACAO_RLS);

    // e) INSERT compradores pelo anon (o servidor escreve; o anon só lê)
    const { error: erroInsertComprador } = await clientAnon.from("compradores").insert({
      rifa_id: rifaPublicaId,
      nome: "Bypass Anon",
      telefone: "+5511911112222",
    });
    expect(erroInsertComprador?.code).toBe(VIOLACAO_RLS);

    // f) INSERT vendas pelo anon (venda pública passa SEMPRE pela Server Action)
    const { data: numero2, error: erroNumero2 } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaPublicaId)
      .eq("numero", 2)
      .single();
    expect(erroNumero2).toBeNull();
    expect(numero2).toBeTruthy();
    if (!numero2) {
      throw new Error("Leitura do numero 2 para o bypass de vendas falhou (FD-2).");
    }
    // comprador_id válido do seed: a FK passa e a recusa tem de ser do RLS
    const { error: erroInsertVenda } = await clientAnon.from("vendas").insert({
      numero_id: numero2.id,
      comprador_id: compradorId,
      origem: "publico",
    });
    expect(erroInsertVenda?.code).toBe(VIOLACAO_RLS);

    // g) UPDATE rifas pelo anon — UPDATE sem política para `anon` não eleva
    //    42501: o RLS esconde a linha e o UPDATE afeta 0 linhas (semântica
    //    Postgres). A recusa real é o estado intocado (prova em i)
    const { data: atualizadas, error: erroUpdateRifa } = await clientAnon
      .from("rifas")
      .update({ titulo: "Sequestrada pelo anon" })
      .eq("id", rifaPublicaId)
      .select("id");
    expect(erroUpdateRifa).toBeNull();
    expect(atualizadas).toHaveLength(0);

    // h) UPDATE numeros pelo anon — mesmo no-op do RLS
    const { data: numerosAtualizados, error: erroUpdateNumero } = await clientAnon
      .from("numeros")
      .update({ status: "disponivel" })
      .eq("id", numeroIdVendido)
      .select("id");
    expect(erroUpdateNumero).toBeNull();
    expect(numerosAtualizados).toHaveLength(0);

    // i) estado inalterado no banco — o bypass falhou como um todo
    const { data: rifaApos, error: erroLeitura } = await clientServico
      .from("rifas")
      .select("titulo")
      .eq("id", rifaPublicaId)
      .single();
    expect(erroLeitura).toBeNull();
    expect(rifaApos?.titulo).toBe("Rifa da Comenda da FD-2");

    const { data: numeroApos, error: erroLeituraNumero } = await clientServico
      .from("numeros")
      .select("status")
      .eq("id", numeroIdVendido)
      .single();
    expect(erroLeituraNumero).toBeNull();
    expect(numeroApos?.status).toBe("vendido");
  });
});
