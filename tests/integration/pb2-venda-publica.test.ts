/**
 * PB-2 · Server Action `registrarVendaPublica` (visitante anon, T4) — SPEC
 * §3.5/§4.5 RF-05a · matriz §5.2 linha "RF-05a `registrarVenda` (público)".
 *
 * Teste 1 (int, caminho feliz): venda pública válida → número vira
 *   `vendido`, venda vigente com `origem='publico'` e comprador gravado.
 * Teste 2 (int, borda/erro): telefone não-E.164 ou nome < 2 caracteres →
 *   rejeitada por Zod com banco inalterado; rifa encerrada e número já
 *   vendido → recusas prescritas sem alterar estado.
 *
 * Política de Testes (§5.1): Postgres real do stack local; a action pública
 * NÃO lê sessão (o visitante é anon) — só `next/cache` é substituído.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { registrarVendaPublica } from "@/actions/vendas";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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

  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY ?? "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = chaveService;
});

describe("PB-2 · Server Action registrarVendaPublica (SPEC §3.5/§4.5)", () => {
  let clientServico: ReturnType<typeof createClient<Database>>;
  let usuarioId = "";
  const rifaAbertaId = crypto.randomUUID();
  const rifaEncerradaId = crypto.randomUUID();
  const rifaArquivadaId = crypto.randomUUID();

  beforeAll(async () => {
    clientServico = createClient<Database>(url, chaveService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // A rifa pública pertence a um perfil real (FK) — o perfil nasce do
    // trigger OCR da migração 001 quando o usuário é criado.
    const { data: usuarioCriado, error: erroUsuario } =
      await clientServico.auth.admin.createUser({
        email: `pb2-publica+${crypto.randomUUID()}@example.test`,
        password: "SenhaForte!2026",
        email_confirm: true,
      });
    expect(erroUsuario).toBeNull();
    if (!usuarioCriado?.user) throw new Error("Usuário de teste não provisionado (PB-2).");
    usuarioId = usuarioCriado.user.id;

    // Rifas: aberta (fluxo feliz + validações), encerrada e arquivada.
    for (const [rifaId, status, arquivada] of [
      [rifaAbertaId, "aberta", false],
      [rifaEncerradaId, "encerrada", false],
      [rifaArquivadaId, "aberta", true],
    ] as const) {
      const { error: erroRifa } = await clientServico.from("rifas").insert({
        id: rifaId,
        perfil_id: usuarioId,
        slug: `pb2-teste-${rifaId.slice(0, 8)}`,
        titulo: "Rifa pública da PB-2",
        premio_descricao: "Forno elétrico",
        premio_rotulo: "estimado",
        premio_valor: 850,
        numero_valor: 10,
        quantidade: 100,
        qtd_minima: 30,
        status,
        ...(arquivada ? { arquivada: true } : {}),
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
    // DELETE em cascata (migração 001) leva numeros/vendas/compradores —
    // a base local volta ao estado íntegro exigido pelo ET-7.
    await clientServico
      .from("rifas")
      .delete()
      .in("id", [rifaAbertaId, rifaEncerradaId, rifaArquivadaId]);
  });

  it("deve aceitar venda pública válida: número vendido, venda vigente com origem 'publico' e comprador registrado", async () => {
    const { data: numero } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaAbertaId)
      .eq("numero", 37)
      .single();
    expect(numero).not.toBeNull();

    const resultado = await registrarVendaPublica({
      numeroId: numero!.id,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(resultado).toEqual({ ok: true, mensagem: "Venda registrada com sucesso." });

    // Número virou `vendido` e a venda vigente tem origem 'publico' (ficada
    // no servidor — nunca no payload).
    const { data: vigente } = await clientServico
      .from("vendas")
      .select("origem, removida_em, compradores(nome, telefone)")
      .eq("numero_id", numero!.id)
      .is("removida_em", null)
      .maybeSingle();
    expect(vigente?.origem).toBe("publico");
    expect(vigente?.removida_em).toBeNull();
    const comprador = Array.isArray(vigente?.compradores)
      ? vigente.compradores[0]
      : vigente?.compradores;
    expect(comprador).toMatchObject({ nome: "Maria Silva", telefone: "+5511988887777" });
  });

  it("deve rejeitar payload inválido (Zod), rifa encerrada, rifa arquivada e número já vendido sem alterar o banco", async () => {
    const [disponivel] = await Promise.all([
      clientServico
        .from("numeros")
        .select("id, status")
        .eq("rifa_id", rifaAbertaId)
        .eq("numero", 38)
        .single(),
    ]);
    expect(disponivel?.data?.status).toBe("disponivel");

    // Matriz RF-05a (linha Int.): telefone não-E.164 e nome curto → recusa
    // Zod pt-BR com o número permanecendo disponível e 0 vendas novas.
    const resultadoTelefone = await registrarVendaPublica({
      numeroId: disponivel!.data!.id,
      nome: "Maria Silva",
      telefone: "11988887777",
    });
    expect(resultadoTelefone).toEqual({
      ok: false,
      mensagem: "O telefone deve estar no formato E.164 (ex.: +5511988887777)",
    });

    const resultadoNome = await registrarVendaPublica({
      numeroId: disponivel!.data!.id,
      nome: "A",
      telefone: "+5511988887777",
    });
    expect(resultadoNome).toEqual({
      ok: false,
      mensagem: "O nome deve ter no mínimo 2 caracteres",
    });

    // Rifa encerrada → recusa prescrita da §4.5 com estado inalterado.
    const { data: numeroEncerrada } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaEncerradaId)
      .eq("numero", 1)
      .single();
    const resultadoEncerrada = await registrarVendaPublica({
      numeroId: numeroEncerrada!.id,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(resultadoEncerrada).toEqual({
      ok: false,
      mensagem: "As vendas desta rifa estão encerradas.",
    });

    // Rifa arquivada não está publicada para o anon → recusa "não encontramos"
    // (mesma frase da página pública), nunca um INSERT por baixo dos panos.
    const { data: numeroArquivada } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaArquivadaId)
      .eq("numero", 1)
      .single();
    const resultadoArquivada = await registrarVendaPublica({
      numeroId: numeroArquivada!.id,
      nome: "Maria Silva",
      telefone: "+5511988887777",
    });
    expect(resultadoArquivada).toEqual({
      ok: false,
      mensagem: "Não encontramos essa rifa. Confira o link com quem a criou.",
    });

    // Número já vendido (histórico da Teste 1) → "Número já vendido." da §3.5
    // e a MESMA venda vigente de Maria (nada mudou).
    const { data: numeroVendido } = await clientServico
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifaAbertaId)
      .eq("numero", 37)
      .single();
    const resultadoVendido = await registrarVendaPublica({
      numeroId: numeroVendido!.id,
      nome: "João Souza",
      telefone: "+5511999998888",
    });
    expect(resultadoVendido).toEqual({ ok: false, mensagem: "Número já vendido." });

    // Estado final: só a venda do caminho feliz existe (origem 'publico') e
    // o número 38 segue disponível.
    const { data: vigentes, error: erroVigentes } = await clientServico
      .from("vendas")
      .select("origem, numeros!inner(rifa_id)")
      .eq("numeros.rifa_id", rifaAbertaId)
      .is("removida_em", null);
    expect(erroVigentes).toBeNull();
    expect(vigentes).toHaveLength(1);
    expect(vigentes?.[0]?.origem).toBe("publico");

    const { data: numero38 } = await clientServico
      .from("numeros")
      .select("status")
      .eq("rifa_id", rifaAbertaId)
      .eq("numero", 38)
      .single();
    expect(numero38?.status).toBe("disponivel");
  });
});
