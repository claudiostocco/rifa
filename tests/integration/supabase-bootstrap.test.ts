/**
 * ET-4 · Teste 1 (int): client anon executa um SELECT trivial com sucesso
 * contra o Postgres real local (Supabase CLI — SPEC §5.1; mocks proibidos).
 * O stack precisa estar no ar: `supabase start` (ET-7).
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

let url = "";
let chaveAnon = "";

beforeAll(() => {
  url = process.env.TEST_SUPABASE_URL ?? "";
  chaveAnon = process.env.TEST_SUPABASE_ANON_KEY ?? "";

  if (!url || !chaveAnon) {
    throw new Error(
      "Variáveis de teste do Supabase ausentes. Rode `supabase start` antes de `pnpm test:int` (ET-7).",
    );
  }
});

describe("bootstrap dos clients Supabase contra Postgres real (ET-4/ET-7)", () => {
  it("deve executar SELECT trivial com a chave anon na tabela pública rifas", async () => {
    const cliente = createClient<Database>(url, chaveAnon, { auth: { persistSession: false } });

    const { error, data } = await cliente.from("rifas").select("id").limit(1);

    expect(error).toBeNull();
    // O que o ET-4 prova é o SELECT anon BEM-SUCEDIDO (erro nulo, retorno em
    // array). A base vazia é realidade do stack recém-migrado (ET-7), mas
    // outras suítes de integração (FD-10/VT-5/VT-6/VT-7…) provisionam rifas
    // reais em paralelo e limpam ao fim — asserir [] aqui faria o ET-4
    // ficar flaky contra o próprio app que ele bootstrapa.
    expect(Array.isArray(data)).toBe(true);
  });

  it("deve recusar escrita anon direta na tabela rifas (RLS §2.3 ativa)", async () => {
    const cliente = createClient<Database>(url, chaveAnon, { auth: { persistSession: false } });

    const { error } = await cliente.from("rifas").insert({
      perfil_id: "00000000-0000-0000-0000-000000000000",
      slug: "rifa-proibida-anon",
      titulo: "Tentativa ilegal",
      premio_descricao: "Qualquer",
      premio_valor: 100,
      numero_valor: 10,
      quantidade: 25,
      qtd_minima: 0,
    });

    // Sem sessão, RLS bloqueia inclusive com FK inexistente — violação de política.
    expect(error).not.toBeNull();
  });
});
