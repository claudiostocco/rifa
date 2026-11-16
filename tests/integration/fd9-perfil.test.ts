/**
 * FD-9 · Rota protegida + perfil do organizador (SPEC §4.17 · matriz §5.2
 * linha "4.17 login/perfil")
 *
 * Teste 1 (int, Postgres real): Server Action `salvarPerfil` com sessão
 *   válida grava nome_exibicao + whatsapp em E.164 (UPDATE em `perfis` via
 *   RLS `perfis_atualiza_proprio`).
 * Teste 2 (int + E2E): WhatsApp inválido/nome curto → erro Zod pt-BR com o
 *   banco inalterado; sem sessão → recusa; visita anônima a /perfil →
 *   redirect a /entrar (tests/e2e/perfil.spec.ts).
 *
 * O plano pede "unit" para o Teste 1, mas a Política de Testes (SPEC §5.1)
 * proíbe mock do Postgres/RLS — a prova é contra o banco real local
 * (precedente FD-2/FD-3). Só `next/headers` é substituído (armazenamento de
 * cookies em memória, como a Request real faria); banco, RLS e sessão do
 * Auth são reais.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { salvarPerfil } from "@/actions/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
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

  // O client de sessão da action lê as mesmas variáveis do runtime Next —
  // apontadas para o stack local do teste (somente neste processo).
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = chaveAnon;
});

describe("FD-9 · perfil do organizador (SPEC §4.17)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  let email = "";
  const senha = "SenhaForte!2026";

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Conta real com perfil criado pelo trigger OCR (nome = parte local do
    // e-mail; whatsapp "" — a 1ª configuração é justamente o fluxo da FD-9).
    email = `fd9-perfil+${crypto.randomUUID()}@example.test`;
    const { data: criado, error: erroCriar } = await clientServico.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    expect(erroCriar).toBeNull();
    if (!criado?.user) {
      throw new Error("Provisionamento do usuário em auth.users não retornou linha (FD-9).");
    }
    usuarioId = criado.user.id;

    // Sessão real: o client de sessão persiste os cookies httpOnly no
    // armazenamento — é ele que a action lerá ao gravar o perfil.
    const clientSessao = await criarClienteServidor();
    const { error: erroEntrar } = await clientSessao.auth.signInWithPassword({
      email,
      password: senha,
    });
    expect(erroEntrar).toBeNull();
  });

  afterAll(async () => {
    if (!usuarioId) return;
    // deleteUser apaga o perfil em cascata (trigger OCR · FK on delete cascade)
    await clientServico.auth.admin.deleteUser(usuarioId);
  });

  it("deve gravar nome de exibição e WhatsApp em E.164 no perfil do organizador", async () => {
    const formData = new FormData();
    formData.set("nomeExibicao", "Cláudio Organizador");
    formData.set("whatsapp", "(11) 98888-7777");

    const resultado = await salvarPerfil(undefined, formData);

    expect(resultado).toEqual({ ok: true, mensagem: "Perfil salvo com sucesso." });

    const { data: perfil, error } = await clientServico
      .from("perfis")
      .select("nome_exibicao, whatsapp")
      .eq("id", usuarioId)
      .single();
    expect(error).toBeNull();
    expect(perfil?.nome_exibicao).toBe("Cláudio Organizador");
    expect(perfil?.whatsapp).toBe("+5511988887777");
  });

  it("deve recusar WhatsApp inválido e nome curto com erro Zod pt-BR, sem alterar o perfil", async () => {
    // a) WhatsApp incompleto: nem o conversor E.164 nem o contrato aceitam
    const formData = new FormData();
    formData.set("nomeExibicao", "Cláudio Organizador");
    formData.set("whatsapp", "(11) 123");
    const resultadoTelefone = await salvarPerfil(undefined, formData);
    expect(resultadoTelefone?.ok).toBe(false);
    expect(resultadoTelefone?.mensagem).toMatch(/E\.164/i);

    // b) Nome de exibição abaixo do mínimo do contrato (2 caracteres)
    const formDataNome = new FormData();
    formDataNome.set("nomeExibicao", "A");
    formDataNome.set("whatsapp", "(11) 98888-7777");
    const resultadoNome = await salvarPerfil(undefined, formDataNome);
    expect(resultadoNome?.ok).toBe(false);
    expect(resultadoNome?.mensagem).toMatch(/nome/i);

    // c) Estado do banco inalterado após as recusas
    const { data: perfil, error } = await clientServico
      .from("perfis")
      .select("nome_exibicao, whatsapp")
      .eq("id", usuarioId)
      .single();
    expect(error).toBeNull();
    expect(perfil?.nome_exibicao).toBe("Cláudio Organizador");
    expect(perfil?.whatsapp).toBe("+5511988887777");
  });

  it("deve recusar salvar o perfil sem sessão com mensagem pt-BR", async () => {
    armazenamentoCookies.clear(); // saída de sessão: nenhum cookie httpOnly

    const formData = new FormData();
    formData.set("nomeExibicao", "Sem Sessão");
    formData.set("whatsapp", "(11) 98888-7777");

    const resultado = await salvarPerfil(undefined, formData);

    expect(resultado?.ok).toBe(false);
    expect(resultado?.mensagem).toMatch(/sessão/i);
  });
});
