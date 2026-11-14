"use server";

/**
 * VT-5 · Server Actions de venda (SPEC §4.5/§4.6 · matriz §5.2 RF-05/RF-06) —
 * porta de escrita em `numeros`, `compradores` e `vendas`.
 *
 * Fluxo prescrito: Zod (`VendaInputSchema`, FD-5) → sessão httpOnly → leitura
 * do número com a rifa embutida (posse conferida pelo `perfil_id` — nunca do
 * payload) → conferência de estado → escrita com `service_role` (§2.2).
 *
 * RN-03 ("um número vende-se uma única vez") é garantida EM DUPLA CAMADA
 * (decisão do usuário, 13/11/2026):
 *   1. UPDATE condicional no número — `WHERE status = 'disponivel'`; quem
 *      perde a corrida recebe 0 linhas e o toast prescrito
 *      "Esse número acabou de ser vendido" (§4.5), sem dado alterado;
 *   2. índice parcial UNIQUE `vendas_vigente_por_numero` (migração 004):
 *      no máximo uma venda vigente por número, no próprio banco.
 *
 * A ordem de gravação (número primeiro, venda depois) exige compensação: se
 * a venda falhar, o número volta a `disponivel` — nunca fica vendido sem
 * dono (mesmo padrão da numeração da `criarRifa`, FD-10). A conferência de
 * comprador existente por (rifa_id, telefone) reusa a linha em vez de
 * duplicar o comprador da mesma pessoa na rifa.
 *
 * Origem da venda (RN-03/§2.4) é SEMPRE definida aqui no servidor
 * ('organizador'); a variante pública chega na PB-2/PB-3.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { VendaInput } from "@/lib/schemas";
import { VendaInputSchema } from "@/lib/schemas";
import { criarClienteAdministrador, usuarioDaSessao } from "@/lib/supabase/server";

/** Estado consumido pelo modal T3a (VT-4) — pt-BR pronto para Toast/inline. */
export type EstadoVenda = { ok: true; mensagem: string } | { ok: false; mensagem: string };

const RECUSA_SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const RECUSA_NAO_ENCONTRADA = "Não encontramos esse número na sua conta.";
const RECUSA_CORRIDA = "Esse número acabou de ser vendido";
const RECUSA_ENCERRADA = "As vendas desta rifa estão encerradas.";
const RECUSA_SORTEADA =
  "O sorteio já foi realizado. Desfaça-o antes de alterar o histórico desta rifa.";
const RECUSA_BANCO_REGISTRO =
  "Não foi possível registrar a venda agora. Tente novamente em instantes.";
const RECUSA_SEM_VIGENTE = "Este número não tem venda vigente para editar.";

/** Número com a rifa embutida — posse e estado conferidos antes de escrever. */
type NumeroProprio = {
  id: string;
  numero: number;
  status: "disponivel" | "vendido";
  rifaId: string;
  statusRifa: "aberta" | "encerrada" | "sorteada";
};

async function buscarNumeroProprio(
  admin: ReturnType<typeof criarClienteAdministrador>,
  numeroId: string,
  perfilId: string,
): Promise<NumeroProprio | null> {
  const { data, error } = await admin
    .from("numeros")
    .select("id, numero, status, rifa_id, rifas!inner(status, perfil_id, excluida)")
    .eq("id", numeroId)
    .maybeSingle();

  if (error || !data || data.rifas.perfil_id !== perfilId || data.rifas.excluida) {
    return null;
  }

  // Status chegam como string do banco (CHECK sem enum — regra FD-4): afunilar
  // com guarda; valor fora do domínio do CHECK é bug de banco → recusa segura.
  const statusNumero: NumeroProprio["status"] =
    data.status === "vendido" ? "vendido" : "disponivel";
  const statusRifa = data.rifas.status;
  if (statusRifa !== "aberta" && statusRifa !== "encerrada" && statusRifa !== "sorteada") {
    return null;
  }

  return {
    id: data.id,
    numero: data.numero,
    status: statusNumero,
    rifaId: data.rifa_id,
    statusRifa,
  };
}

/**
 * RN-03 · UPDATE condicional: só vira `vendido` quem achar `disponivel`.
 * 0 linhas = outro processo venceu a corrida (VT-6) → recusa SEM alteração.
 */
async function virarVendido(
  admin: ReturnType<typeof criarClienteAdministrador>,
  numeroId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("numeros")
    .update({ status: "vendido" })
    .eq("id", numeroId)
    .eq("status", "disponivel")
    .select("id");

  if (error || !data || data.length === 0) return false;
  return true;
}

/** Compensação: número nunca fica `vendido` sem venda gravada (padrão FD-10). */
async function devolverNumero(
  admin: ReturnType<typeof criarClienteAdministrador>,
  numeroId: string,
): Promise<void> {
  await admin
    .from("numeros")
    .update({ status: "disponivel" })
    .eq("id", numeroId)
    .eq("status", "vendido");
}

/**
 * Comprador da rifa para o payload: linha existente com o MESMO telefone é
 * reutilizada em vez de duplicar a pessoa na rifa e, se o nome divergiu, é
 * regravado — mesmo telefone é a mesma pessoa (§4.6, "regrava nome/telefone"),
 * então o nome deve consistir em todas as vendas dela na rifa.
 */
async function compradorDaRifa(
  admin: ReturnType<typeof criarClienteAdministrador>,
  rifaId: string,
  nome: string,
  telefone: string,
): Promise<{ id: string } | null> {
  const { data: existente } = await admin
    .from("compradores")
    .select("id, nome")
    .eq("rifa_id", rifaId)
    .eq("telefone", telefone)
    .maybeSingle();

  if (existente) {
    if (existente.nome !== nome) {
      const { error } = await admin.from("compradores").update({ nome }).eq("id", existente.id);
      if (error) return null;
    }
    return { id: existente.id };
  }

  const { data: criado, error } = await admin
    .from("compradores")
    .insert({ rifa_id: rifaId, nome, telefone })
    .select("id")
    .single();
  if (error || !criado) return null;
  return { id: criado.id };
}

/** Id da venda vigente do número (RF-06: editar/remover opera a vigente). */
async function vendaVigenteId(
  admin: ReturnType<typeof criarClienteAdministrador>,
  numeroId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("vendas")
    .select("id")
    .eq("numero_id", numeroId)
    .is("removida_em", null)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * RF-05 · `registrarVenda` (organizador, T3a). Conferências na ordem da
 * §4.5: dados válidos (Zod) → sessão → rifa `aberta` → número `disponivel`;
 * a corrida é decidida pelo UPDATE condicional (RN-03).
 */
export async function registrarVenda(payload: VendaInput): Promise<EstadoVenda> {
  const parse = VendaInputSchema.safeParse(payload);
  if (!parse.success) {
    const problema = parse.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os dados do comprador." };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const numero = await buscarNumeroProprio(admin, parse.data.numeroId, perfilId);
  if (!numero) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }
  if (numero.statusRifa !== "aberta") {
    return { ok: false, mensagem: RECUSA_ENCERRADA };
  }

  const { numeroId, nome, telefone } = parse.data;
  const ganhouCorrida = await virarVendido(admin, numeroId);
  if (!ganhouCorrida) {
    return { ok: false, mensagem: RECUSA_CORRIDA };
  }

  const comprador = await compradorDaRifa(admin, numero.rifaId, nome, telefone);
  if (!comprador) {
    await devolverNumero(admin, numeroId);
    return { ok: false, mensagem: RECUSA_BANCO_REGISTRO };
  }

  const { error: erroVenda } = await admin
    .from("vendas")
    .insert({ numero_id: numeroId, comprador_id: comprador.id, origem: "organizador" });

  if (erroVenda) {
    await devolverNumero(admin, numeroId);
    return { ok: false, mensagem: RECUSA_BANCO_REGISTRO };
  }

  // Grade, resumo e histórico da T3 re-renderizam no mesmo roundtrip.
  revalidatePath(`/rifas/${numero.rifaId}`);
  return { ok: true, mensagem: "Venda registrada com sucesso." };
}

/**
 * RF-06 · `editarVenda` — transfere o comprador da venda VIGENTE do número.
 *
 * Decisão do usuário (VT-7, 14/11/2026): a transferência PRESERVA o histórico
 * (matriz §5.2 RF-06 — "venda nova vigente"): a venda antiga ganha
 * `removida_em` e uma venda NOVA aponta para o comprador do payload
 * (reutilizado por (rifa_id, telefone)); o número PERMANECE `vendido`.
 *
 * A rifa `sorteada` é recusada: o resultado do sorteio é auditável; desfazer
 * (RF-15) é o caminho prescrito para alterar o histórico depois do sorteio
 * (§2.7/RN-08). Falha na venda nova restitui a venda antiga (compensação —
 * nunca fica removida sem sucessora).
 */
export async function editarVenda(payload: VendaInput): Promise<EstadoVenda> {
  const parse = VendaInputSchema.safeParse(payload);
  if (!parse.success) {
    const problema = parse.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os dados do comprador." };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const numero = await buscarNumeroProprio(admin, parse.data.numeroId, perfilId);
  if (!numero) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }
  if (numero.statusRifa === "sorteada") {
    return { ok: false, mensagem: RECUSA_SORTEADA };
  }
  if (numero.status !== "vendido") {
    return { ok: false, mensagem: RECUSA_SEM_VIGENTE };
  }

  const vendaId = await vendaVigenteId(admin, parse.data.numeroId);
  if (!vendaId) {
    return { ok: false, mensagem: RECUSA_SEM_VIGENTE };
  }

  const comprador = await compradorDaRifa(
    admin,
    numero.rifaId,
    parse.data.nome,
    parse.data.telefone,
  );
  if (!comprador) {
    return { ok: false, mensagem: RECUSA_BANCO_REGISTRO };
  }

  // Venda antiga sai de vigência. UPDATE condicional: 0 linhas = a venda
  // vigente sumiu nesse meio-tempo (ex.: remoção concorrente) → recusa
  // sem alteração, coerente com a conferência de corrida da VT-6.
  const { data: removidas, error: erroRemover } = await admin
    .from("vendas")
    .update({ removida_em: new Date().toISOString() })
    .eq("id", vendaId)
    .is("removida_em", null)
    .select("id");
  if (erroRemover) {
    return { ok: false, mensagem: RECUSA_BANCO_REGISTRO };
  }
  if (!removidas || removidas.length === 0) {
    return { ok: false, mensagem: RECUSA_SEM_VIGENTE };
  }

  const { error: erroNova } = await admin.from("vendas").insert({
    numero_id: parse.data.numeroId,
    comprador_id: comprador.id,
    origem: "organizador",
  });
  if (erroNova) {
    // Compensação: restitui a venda antiga — nunca fica removida sem sucessora.
    await admin.from("vendas").update({ removida_em: null }).eq("id", vendaId);
    return { ok: false, mensagem: RECUSA_BANCO_REGISTRO };
  }

  revalidatePath(`/rifas/${numero.rifaId}`);
  return { ok: true, mensagem: "Venda atualizada com sucesso." };
}

/**
 * RF-06 · `removerVenda` — marca `removida_em` na venda vigente (histórico
 * preservado, RN-07) e devolve o número a `disponivel`. Passos separados são
 * idempotentes: se a virada do número falhar após a marcação, reexecutar
 * completa a operação (o UPDATE de vendas vira no-op, o do número segue).
 */
export async function removerVenda(numeroId: string): Promise<EstadoVenda> {
  if (!z.uuid().safeParse(numeroId).success) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const numero = await buscarNumeroProprio(admin, numeroId, perfilId);
  if (!numero) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }
  if (numero.statusRifa === "sorteada") {
    return { ok: false, mensagem: RECUSA_SORTEADA };
  }

  const { data: removidas, error: erroVenda } = await admin
    .from("vendas")
    .update({ removida_em: new Date().toISOString() })
    .eq("numero_id", numeroId)
    .is("removida_em", null)
    .select("id");
  if (erroVenda) {
    return {
      ok: false,
      mensagem: "Não foi possível remover a venda agora. Tente novamente em instantes.",
    };
  }

  const haVendaVigente = (removidas?.length ?? 0) > 0;
  if (!haVendaVigente && numero.status !== "vendido") {
    return { ok: false, mensagem: "Este número não tem venda vigente para remover." };
  }

  // Número volta a `disponivel` (transição vendido→disponivel, §2.7/RF-06).
  const { error: erroNumero } = await admin
    .from("numeros")
    .update({ status: "disponivel" })
    .eq("id", numeroId)
    .eq("status", "vendido");
  if (erroNumero) {
    return {
      ok: false,
      mensagem: "Não foi possível remover a venda agora. Tente novamente em instantes.",
    };
  }

  revalidatePath(`/rifas/${numero.rifaId}`);
  return { ok: true, mensagem: "Venda removida com sucesso." };
}
