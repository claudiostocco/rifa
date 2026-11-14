"use server";

/**
 * SR-3 · Server Action do sorteio (SPEC §4.9 RF-09 · matriz §5.2 "RF-09
 * sorteio (RPC)") — `sortear(id)` é a ÚNICA via autenticada à RPC
 * transacional `sortear_rifa` (FD-3, migração 002).
 *
 * Ordem das conferências: uuid (Zod) → sessão httpOnly → rifa própria com
 * `service_role` conferindo posse (`perfil_id` da sessão, nunca do payload)
 * e `excluida` invisível → guarda da máquina de estados (FD-7 — só
 * `encerrada → sorteada`; `aberta` e `sorteada` recusadas com mensagem
 * própria) → delegação à RPC, que reconfere o estado sob FOR UPDATE e executa
 * tudo em COMMIT único (RNF-06/RNF-07). Códigos de ABORT da RPC viram toasts
 * pt-BR pelo mapa abaixo — recusa nunca engolida (padrão VT-4/SR-1).
 *
 * Sucesso devolve o snapshot do resultado no contrato `ResultadoSorteio`
 * (FD-5) — a roleta (SR-5) e a T5 desaceleram/exibem o que JÁ foi gravado no
 * servidor (§4.9 RF-09a: a animação é presentacional).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { podeTransicionarRifa, type StatusRifa } from "@/lib/estados";
import { ResultadoSorteioSchema, type ResultadoSorteio } from "@/lib/schemas";
import { criarClienteAdministrador, usuarioDaSessao } from "@/lib/supabase/server";
import type { RifaRow } from "@/lib/supabase/tipos";

/** Estado da ação do sorteio — pt-BR pronto para Toast (mesmo padrão SR-1). */
export type EstadoSorteio =
  | { ok: true; mensagem: string; resultado: ResultadoSorteio }
  | { ok: false; mensagem: string };

const RECUSA_SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const RECUSA_NAO_ENCONTRADA = "Não encontramos essa rifa na sua conta.";
const RECUSA_ABERTA =
  "As vendas desta rifa ainda estão abertas. Encerre-as antes de realizar o sorteio.";
// Texto PRESCRITO da §4.9 para o bloqueio de rifa encerrada sem vendidos.
const RECUSA_SEM_VENDIDOS =
  "A rifa não tem números vendidos; o sorteio não pode ser realizado.";
const RECUSA_JA_SORTEADA =
  "O sorteio já foi realizado. Anule o resultado atual antes de sortear novamente.";
const RECUSA_INESPERADA = "Não foi possível realizar o sorteio. Tente novamente.";
const MENSAGEM_SUCESSO = "Sorteio realizado com sucesso.";

/** Linha mínima para conferir posse, visibilidade (soft delete) e estado. */
type RifaDoSorteio = Pick<RifaRow, "id" | "status" | "perfil_id" | "excluida">;

async function rifaDoOrganizador(
  admin: ReturnType<typeof criarClienteAdministrador>,
  rifaId: string,
  perfilId: string,
): Promise<RifaDoSorteio | null> {
  const { data } = await admin
    .from("rifas")
    .select("id, status, perfil_id, excluida")
    .eq("id", rifaId)
    .maybeSingle();

  if (!data || data.perfil_id !== perfilId || data.excluida) {
    return null;
  }

  // Status chega como string do banco (CHECK sem enum — regra FD-4): afunilar
  // com o domínio da máquina de estados; valor fora dele é bug de banco →
  // recusa segura, como linha ausente.
  const status: StatusRifa | null =
    data.status === "aberta" || data.status === "encerrada" || data.status === "sorteada"
      ? data.status
      : null;
  if (!status) return null;

  return { id: data.id, status, perfil_id: data.perfil_id, excluida: data.excluida };
}

/**
 * Códigos de ABORT da RPC (migração 002, provados na FD-3) → mensagem pt-BR
 * do mapa. O token vem no início da mensagem do PostgREST (`Codigo: texto`).
 */
function mensagemDoCodigo(mensagemErro: string): string {
  if (mensagemErro.startsWith("RIFA_ABERTA")) return RECUSA_ABERTA;
  if (mensagemErro.startsWith("RIFA_SEM_VENDIDOS")) return RECUSA_SEM_VENDIDOS;
  if (mensagemErro.startsWith("RIFA_JA_SORTEADA")) return RECUSA_JA_SORTEADA;
  if (mensagemErro.startsWith("RIFA_INEXISTENTE")) return RECUSA_NAO_ENCONTRADA;
  return RECUSA_INESPERADA;
}

/**
 * RF-09 · `sortear(id)` — `encerrada → sorteada` pela RPC atômica. A guarda
 * da máquina rejeita cedo os estados impossíveis; a RPC continua sendo a
 * porta de verdade sob corrida (2º sorteio sem anular → RIFA_JA_SORTEADA,
 * RNF-06 — mapeada no mesmo texto). Revalida a listagem T1 e o painel T3.
 */
export async function sortear(id: string): Promise<EstadoSorteio> {
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const rifa = await rifaDoOrganizador(admin, id, perfilId);
  if (!rifa) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  // Guarda da máquina (§2.7/FD-7): qualquer mudança nas transições quebra
  // aqui, antes de tocar o banco. A RPC reconfere sob FOR UPDATE.
  if (!podeTransicionarRifa(rifa.status, "sorteada")) {
    return {
      ok: false,
      mensagem: rifa.status === "aberta" ? RECUSA_ABERTA : RECUSA_JA_SORTEADA,
    };
  }

  const { data: sorteioId, error: erroRpc } = await admin.rpc("sortear_rifa", { rifa: id });
  if (erroRpc || typeof sorteioId !== "string") {
    return { ok: false, mensagem: mensagemDoCodigo(erroRpc?.message ?? "") };
  }

  // Snapshot do resultado JÁ gravado (§4.9): número, comprador, snapshot de
  // total_vendidos e data/hora — validado pelo contrato do FD-5.
  const { data: sorteio, error: erroLeitura } = await admin
    .from("sorteios")
    .select(
      "total_vendidos, sorteado_em, anulado_em, numero:numero_id (numero), comprador:comprador_id (nome, telefone)",
    )
    .eq("id", sorteioId)
    .single();

  if (erroLeitura || !sorteio) {
    // O sorteio foi gravado (transação única) — a recusa aqui é de leitura do
    // snapshot: a UI mostra o erro genérico sem nunca fingir fracasso da
    // gravação (o refresh do painel mostra o estado real do banco).
    return { ok: false, mensagem: RECUSA_INESPERADA };
  }

  const numeroSorteado = Array.isArray(sorteio.numero) ? sorteio.numero[0] : sorteio.numero;
  const compradorSorteado = Array.isArray(sorteio.comprador)
    ? sorteio.comprador[0]
    : sorteio.comprador;

  if (!numeroSorteado || !compradorSorteado) {
    return { ok: false, mensagem: RECUSA_INESPERADA };
  }

  const verificacao = ResultadoSorteioSchema.safeParse({
    rifaId: id,
    numero: numeroSorteado.numero,
    nomeVencedor: compradorSorteado.nome,
    telefoneVencedor: compradorSorteado.telefone,
    totalVendidos: sorteio.total_vendidos,
    sorteadoEm: sorteio.sorteado_em,
    anuladoEm: sorteio.anulado_em,
  });
  if (!verificacao.success) {
    return { ok: false, mensagem: RECUSA_INESPERADA };
  }

  revalidatePath("/rifas");
  revalidatePath(`/rifas/${id}`);
  return { ok: true, mensagem: MENSAGEM_SUCESSO, resultado: verificacao.data };
}
