"use server";

/**
 * SR-1 · Server Actions do ciclo da rifa (SPEC §4.8/§2.5 · matriz §5.2 RF-08)
 * — porta de escrita do `status` da rifa: encerrar/reabrir vendas.
 *
 * Transições válidas apenas `aberta ↔ encerrada` (§2.7): a conferência usa a
 * máquina de estados (`transicionarRifa`, FD-7) e o UPDATE no banco é
 * CONDICIONAL ao status esperado — 0 linhas = outro processo mudou a rifa no
 * meio-tempo (encerramento concorrente, sorteio em voo) → recusa sem
 * alteração, o mesmo padrão de corrida das vendas (VT-5/VT-6).
 *
 * O mínimo de vendidos (RN-06, decisão 10) é AVISO, não bloqueio: quem decide
 * é o organizador na UI (§4.8) — aqui a ação valida apenas a transição. Erros
 * sempre em pt-BR prontos para Toast (§2.2).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { transicionarRifa, type StatusRifa } from "@/lib/estados";
import { criarClienteAdministrador, usuarioDaSessao } from "@/lib/supabase/server";
import type { RifaRow } from "@/lib/supabase/tipos";

/** Estado das ações do ciclo — pt-BR pronto para Toast (mesmo padrão FD-11). */
export type EstadoCiclo = { ok: true; mensagem: string } | { ok: false; mensagem: string };

const RECUSA_SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const RECUSA_NAO_ENCONTRADA = "Não encontramos essa rifa na sua conta.";
const RECUSA_JA_ENCERRADA = "As vendas desta rifa já estão encerradas.";
const RECUSA_JA_ABERTA = "As vendas desta rifa já estão abertas.";
const RECUSA_SORTEADA_ENCERRAR =
  "O sorteio já foi realizado. Não é possível encerrar as vendas de uma rifa sorteada.";
const RECUSA_SORTEADA_REABRIR =
  "O sorteio já foi realizado. Não é possível reabrir as vendas de uma rifa sorteada.";
const RECUSA_CORRIDA =
  "O status da rifa mudou enquanto a ação era executada. Recarregue a página e tente novamente.";

/** Linha mínima para conferir posse, visibilidade (soft delete) e estado. */
type RifaDoCiclo = Pick<RifaRow, "id" | "status" | "perfil_id" | "excluida">;

async function rifaDoOrganizador(
  admin: ReturnType<typeof criarClienteAdministrador>,
  rifaId: string,
  perfilId: string,
): Promise<RifaDoCiclo | null> {
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
 * UPDATE condicional ao status esperado: quem perder a corrida recebe 0
 * linhas e não altera nada (RN-03 do ciclo — mesmo padrão de `virarVendido`,
 * VT-5).
 */
async function atualizarStatus(
  admin: ReturnType<typeof criarClienteAdministrador>,
  rifaId: string,
  de: StatusRifa,
  para: StatusRifa,
): Promise<boolean> {
  const { data, error } = await admin
    .from("rifas")
    .update({ status: para })
    .eq("id", rifaId)
    .eq("status", de)
    .select("id");

  return !error && (data?.length ?? 0) > 0;
}

/**
 * RF-08 · `encerrarVendas(id)` — `aberta → encerrada` (única saída de
 * 'aberta', §2.7). Revalida a listagem T1 (badge) e o painel T3 no mesmo
 * roundtrip.
 */
export async function encerrarVendas(id: string): Promise<EstadoCiclo> {
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

  if (rifa.status !== "aberta") {
    return {
      ok: false,
      mensagem: rifa.status === "sorteada" ? RECUSA_SORTEADA_ENCERRAR : RECUSA_JA_ENCERRADA,
    };
  }

  // Transição autorizada pela máquina de estados (§2.7/FD-7): qualquer mudança
  // na máquina quebra aqui, antes de tocar o banco.
  const destino = transicionarRifa(rifa.status, "encerrada");
  if (!(await atualizarStatus(admin, id, rifa.status, destino))) {
    return { ok: false, mensagem: RECUSA_CORRIDA };
  }

  revalidatePath("/rifas");
  revalidatePath(`/rifas/${id}`);
  return { ok: true, mensagem: "Vendas encerradas com sucesso." };
}

/**
 * RF-08 · `reabrirVendas(id)` — `encerrada → aberta` (reversão da §2.7).
 * Rifa `sorteada` é recusada: voltar de lá é papel do `desfazerSorteio`
 * (RF-15), que desce a rifa a `encerrada` e então permite reabrir.
 */
export async function reabrirVendas(id: string): Promise<EstadoCiclo> {
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

  if (rifa.status !== "encerrada") {
    return {
      ok: false,
      mensagem: rifa.status === "sorteada" ? RECUSA_SORTEADA_REABRIR : RECUSA_JA_ABERTA,
    };
  }

  const destino = transicionarRifa(rifa.status, "aberta");
  if (!(await atualizarStatus(admin, id, rifa.status, destino))) {
    return { ok: false, mensagem: RECUSA_CORRIDA };
  }

  revalidatePath("/rifas");
  revalidatePath(`/rifas/${id}`);
  return { ok: true, mensagem: "Vendas reabertas com sucesso." };
}
