/**
 * FD-10 · Server Action `criarRifa` (SPEC §4.1/§4.2 · matriz §5.2 RF-01)
 *
 * Teste 1 (int, Postgres real): payload válido (quantidade 100) → rifa
 *   persistida com slug, status 'aberta' e exatamente 100 números
 *   'disponivel' (001..100), vinculada ao perfil da sessão.
 * Teste 2 (int): payload inválido (cenários do FD-5) → erro Zod pt-BR sem
 *   rifa criada; colisão de slug → slug alternativo gerado (SPEC §2.8).
 *
 * A Política de Testes (SPEC §5.1) proíbe mock de Postgres/RLS — banco e
 * sessão do Auth são reais (stack local). Só as fronteiras do runtime Next
 * (`next/headers` · `next/cache`) são substituídas e o sufixo aleatório do
 * slug é controlado para tornar a colisão determinística.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { criarRifa, type EstadoRifa } from "@/actions/rifas";
import type { Database } from "@/lib/supabase/database.types";

const { armazenamentoCookies, sufixosControlados } = vi.hoisted(() => ({
  armazenamentoCookies: new Map<
    string,
    { name: string; value: string; options?: Record<string, unknown> }
  >(),
  sufixosControlados: { fila: [] as string[] },
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

vi.mock("@/lib/slug", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/slug")>();
  // Fila controlada pelo teste; vazia = sufixo real (aleatório/criptográfico).
  // O compositor real é reaproveitado — só a fonte do sufixo é substituída.
  const gerarSufixo = () => sufixosControlados.fila.shift() ?? real.gerarSufixo();
  return {
    ...real,
    gerarSufixo,
    gerarSlug: (titulo: string) => real.gerarSlug(titulo, gerarSufixo()),
  };
});

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

  // O client de sessão da action lê as variáveis do runtime Next — apontadas
  // para o stack local do teste; o service_role alimenta a própria action.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = chaveAnon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = chaveService;
});

describe("FD-10 · Server Action criarRifa (SPEC §4.1)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  let email = "";
  const senha = "SenhaForte!2026";

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Conta real com perfil criado pelo trigger OCR (migração 001).
    email = `fd10-rifa+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (FD-10).");
    }
    usuarioId = criado.user.id;

    // Sessão real persistida nos cookies em memória — é ela que a action lê.
    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // `rifas.perfil_id` não tem ON DELETE CASCADE para perfis → remove as rifas
    // (numeros caem em cascata) antes de apagar a conta.
    await clientServico.from("rifas").delete().eq("perfil_id", usuarioId);
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  /** Payload válido completo (quantidade 100) — cenário do Teste 1. */
  function formDataRifaValida(titulo: string): FormData {
    const formData = new FormData();
    formData.set("titulo", titulo);
    formData.set("descricao", "Arrecadação para a festa junina da comunidade.");
    formData.set("premio_descricao", "Forno elétrico 5 bocas");
    formData.set("premio_rotulo", "estimado");
    formData.set("premio_valor", "850,50"); // pt-BR, como a máscara da T2 envia
    formData.set("numero_valor", "10,00");
    formData.set("quantidade", "100");
    formData.set("qtd_minima", "30");
    return formData;
  }

  it("deve criar rifa de 100 com slug, status aberta e 100 números disponivel", async () => {
    const resultado = await criarRifa(undefined, formDataRifaValida("Rifa do Forno Elétrico"));

    expect(resultado).toMatchObject({
      ok: true,
      mensagem: "Rifa criada com sucesso.",
    });

    if (!resultado.ok) {
      throw new Error("Caminho feliz do FD-10 devia retornar ok: true.");
    }

    // Slug público no formato da SPEC §2.8: base do título + sufixo de 4.
    expect(resultado.slug).toMatch(/^rifa-do-forno-eletrico-[a-z0-9]{4}$/);

    const { data: rifa, error } = await clientServico
      .from("rifas")
      .select("*")
      .eq("id", resultado.rifaId)
      .single();
    expect(error).toBeNull();
    expect(rifa).toMatchObject({
      perfil_id: usuarioId,
      slug: resultado.slug,
      titulo: "Rifa do Forno Elétrico",
      premio_rotulo: "estimado",
      premio_valor: 850.5,
      numero_valor: 10,
      quantidade: 100,
      qtd_minima: 30,
      status: "aberta",
      arquivada: false,
      excluida: false,
    });

    // RF-02: exatamente 100 números, 001..100, todos 'disponivel', sem duplicidade.
    const { data: numeros, error: erroNumeros } = await clientServico
      .from("numeros")
      .select("numero, status")
      .eq("rifa_id", resultado.rifaId)
      .order("numero");
    expect(erroNumeros).toBeNull();
    expect(numeros).toHaveLength(100);
    expect(numeros?.map((linha) => linha.numero)).toEqual(
      Array.from({ length: 100 }, (_, indice) => indice + 1),
    );
    expect(numeros?.every((linha) => linha.status === "disponivel")).toBe(true);
  });

  it("deve recusar payload inválido com erro Zod pt-BR sem criar rifa", async () => {
    const { data: rifasAntes } = await clientServico
      .from("rifas")
      .select("id")
      .eq("perfil_id", usuarioId);

    // a) qtd_minima > quantidade (cenário transversal do FD-5 · RN-05)
    const formDataMinima = formDataRifaValida("Rifa Abaixo do Mínimo");
    formDataMinima.set("qtd_minima", "200");
    const resultadoMinima = (await criarRifa(undefined, formDataMinima)) as EstadoRifa;
    expect(resultadoMinima.ok).toBe(false);
    if (!resultadoMinima.ok) {
      expect(resultadoMinima.mensagem).toBe(
        "A quantidade mínima de vendidos não pode exceder a quantidade de números",
      );
    }

    // b) quantidade fora da lista pré-definida (333)
    const formDataTamanho = formDataRifaValida("Rifa Tamanho Proibido");
    formDataTamanho.set("quantidade", "333");
    const resultadoTamanho = (await criarRifa(undefined, formDataTamanho)) as EstadoRifa;
    expect(resultadoTamanho.ok).toBe(false);
    if (!resultadoTamanho.ok) {
      expect(resultadoTamanho.mensagem).toMatch(/tamanhos pré-definidos/);
    }

    // Estado do banco inalterado após as recusas.
    const { data: rifasDepois } = await clientServico
      .from("rifas")
      .select("id")
      .eq("perfil_id", usuarioId);
    expect(rifasDepois).toHaveLength(rifasAntes?.length ?? 0);
  });

  it("deve gerar slug alternativo quando a gravação colide com slug existente", async () => {
    // 1ª rifa consome "col1"; a 2ª colide com "col1" e reconcilia com "alt2".
    sufixosControlados.fila.push("col1", "col1", "alt2");

    const primeira = await criarRifa(undefined, formDataRifaValida("Rifa do Bazar"));
    expect(primeira.ok).toBe(true);

    const segunda = await criarRifa(undefined, formDataRifaValida("Rifa do Bazar"));
    expect(segunda.ok).toBe(true);

    if (!primeira.ok || !segunda.ok) {
      throw new Error("Colisão de slug devia ser reconciliada, não recusada (FD-10).");
    }
    expect(primeira.slug).toBe("rifa-do-bazar-col1");
    expect(segunda.slug).toBe("rifa-do-bazar-alt2");

    // Ambas as rifas existem, cada uma com seu slug reconciliado.
    const { data: rifas, error } = await clientServico
      .from("rifas")
      .select("id, slug")
      .in("slug", ["rifa-do-bazar-col1", "rifa-do-bazar-alt2"]);
    expect(error).toBeNull();
    expect(rifas?.map((r) => r.slug).sort()).toEqual(
      ["rifa-do-bazar-alt2", "rifa-do-bazar-col1"].sort(),
    );

    const { data: numerosSegunda, error: erroNumeros } = await clientServico
      .from("numeros")
      .select("numero")
      .eq("rifa_id", segunda.rifaId);
    expect(erroNumeros).toBeNull();
    expect(numerosSegunda).toHaveLength(100);
  });

  it("deve recusar criar rifa sem sessão com mensagem pt-BR", async () => {
    armazenamentoCookies.clear(); // saída de sessão: nenhum cookie httpOnly

    const resultado = await criarRifa(undefined, formDataRifaValida("Rifa Sem Sessão"));

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.mensagem).toMatch(/sessão/i);
    }
  });
});
