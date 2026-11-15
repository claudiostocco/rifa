/**
 * PB-5 · Upload de foto — SPEC §4.12/RF-17 · matriz §5.2.
 *
 * Teste 1 (int, Storage real): JPG válido de 3 MB → upload autenticado no
 *   bucket público `premios` e URL retornada acessível como objeto gravado.
 * Teste 2 (int): PDF renomeado para .jpg e arquivo > 5 MB → recusados com
 *   mensagens pt-BR, sem gravar objeto.
 *
 * Auth, Storage e Supabase são reais; só a fronteira de cookies do Next é
 * substituída para injetar uma sessão real do stack local.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { enviarFoto } from "@/actions/fotos";
import type { Database } from "@/lib/supabase/database.types";

const { cookiesMemoria } = vi.hoisted(() => ({
  cookiesMemoria: new Map<string, { name: string; value: string; options?: Record<string, unknown> }>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...cookiesMemoria.values()],
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookiesMemoria.set(name, { name, value, options });
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

  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = chaveAnon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = chaveService;
});

describe("PB-5 · Upload autenticado da foto do prêmio (RF-17)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  let urlFoto = "";

  beforeAll(async () => {
    cookiesMemoria.clear();
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: criado, error: erroUsuario } = await clientServico.auth.admin.createUser({
      email: `pb5-foto+${crypto.randomUUID()}@example.test`,
      password: "SenhaForte!2026",
      email_confirm: true,
    });
    expect(erroUsuario).toBeNull();
    if (!criado?.user) throw new Error("Usuário de teste não provisionado (PB-5).");
    usuarioId = criado.user.id;

    const { criarClienteServidor } = await import("@/lib/supabase/server");
    const sessao = await criarClienteServidor();
    const { error } = await sessao.auth.signInWithPassword({
      email: criado.user.email ?? "",
      password: "SenhaForte!2026",
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (usuarioId && clientServico) {
      const storage = clientServico.storage.from("premios");
      const { data: objetos } = await storage.list(usuarioId);
      if (objetos?.length) {
        await storage.remove(objetos.map((objeto) => `${usuarioId}/${objeto.name}`));
      }
      await clientServico.auth.admin.deleteUser(usuarioId);
    }
  });

  function jpgDeTresMb(): File {
    const conteudo = new Uint8Array(3 * 1024 * 1024);
    conteudo.set([0xff, 0xd8, 0xff]);
    conteudo.set([0xff, 0xd9], conteudo.length - 2);
    return new File([conteudo], "premio.jpg", { type: "image/jpeg" });
  }

  function formDataCom(arquivo: File): FormData {
    const dados = new FormData();
    dados.set("arquivo", arquivo);
    return dados;
  }

  it("deve gravar JPG de 3 MB no bucket premios e retornar sua URL pública", async () => {
    const resultado = await enviarFoto(formDataCom(jpgDeTresMb()));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error("O upload válido do PB-5 deveria concluir.");
    urlFoto = resultado.imagemUrl;
    expect(urlFoto).toContain("/storage/v1/object/public/premios/");

    const caminho = urlFoto.split("/storage/v1/object/public/premios/")[1];
    expect(caminho?.startsWith(`${usuarioId}/`)).toBe(true);
    const { data: objeto, error } = await clientServico.storage.from("premios").download(caminho ?? "");
    expect(error).toBeNull();
    expect(objeto?.size).toBe(3 * 1024 * 1024);
  });

  it("deve recusar PDF renomeado para JPG e arquivo acima de 5 MB sem gravar", async () => {
    const pdfRenomeado = new File(
      [new TextEncoder().encode("%PDF-1.7\narquivo inválido como foto")],
      "premio.jpg",
      { type: "image/jpeg" },
    );
    const resultadoPdf = await enviarFoto(formDataCom(pdfRenomeado));
    expect(resultadoPdf).toEqual({
      ok: false,
      mensagem: "O arquivo não parece ser uma foto JPG, PNG ou WEBP válida.",
    });

    const excesso = new Uint8Array(5 * 1024 * 1024 + 1);
    excesso.set([0xff, 0xd8, 0xff]);
    const resultadoGrande = await enviarFoto(
      formDataCom(new File([excesso], "grande.jpg", { type: "image/jpeg" })),
    );
    expect(resultadoGrande).toEqual({
      ok: false,
      mensagem: "A foto deve ter no máximo 5 MB.",
    });

    const { data: objetos } = await clientServico.storage.from("premios").list(usuarioId);
    expect(objetos?.map((objeto) => objeto.name)).toEqual(
      urlFoto ? [urlFoto.split("/").at(-1)] : [],
    );
  });
});
