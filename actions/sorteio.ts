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
 *
 * SR-8 · RF-15: `desfazerSorteio(id)` anula o resultado vigente (RN-08) pela
 * RPC transacional `desfazer_sorteio` (migração 006) — mesma via da RPC do
 * sorteio, pois a marcação de `anulado_em` + a volta a `encerrada` precisam
 * de transação única (§2.4).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { podeTransicionarRifa, type StatusRifa } from "@/lib/estados";
import { formatarTelefone } from "@/lib/formato";
import { ResultadoSorteioSchema, type ResultadoSorteio } from "@/lib/schemas";
import { criarClienteAdministrador, usuarioDaSessao } from "@/lib/supabase/server";
import type { RifaRow } from "@/lib/supabase/tipos";

/** Estado da ação do sorteio — pt-BR pronto para Toast (mesmo padrão SR-1). */
export type EstadoSorteio =
  { ok: true; mensagem: string; resultado: ResultadoSorteio } | { ok: false; mensagem: string };

/**
 * SR-8 · Estado da ação de anulação (RF-15) — pt-BR pronto para Toast.
 */
export type EstadoAnulacao = { ok: true; mensagem: string } | { ok: false; mensagem: string };

/**
 * SR-7 · Estado da ação de revelação (RF-10): sucesso devolve o telefone JÁ
 * formatado ("(11) 98888-7777") — o E.164 nunca cruza para o cliente, nem
 * antes nem depois da revelação; a UI só exibe.
 */
export type EstadoRevelacao = { ok: true; telefone: string } | { ok: false; mensagem: string };

const RECUSA_SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const RECUSA_NAO_ENCONTRADA = "Não encontramos essa rifa na sua conta.";
const RECUSA_ABERTA =
  "As vendas desta rifa ainda estão abertas. Encerre-as antes de realizar o sorteio.";
// Texto PRESCRITO da §4.9 para o bloqueio de rifa encerrada sem vendidos.
const RECUSA_SEM_VENDIDOS = "A rifa não tem números vendidos; o sorteio não pode ser realizado.";
const RECUSA_JA_SORTEADA =
  "O sorteio já foi realizado. Anule o resultado atual antes de sortear novamente.";
const RECUSA_INESPERADA = "Não foi possível realizar o sorteio. Tente novamente.";
const MENSAGEM_SUCESSO = "Sorteio realizado com sucesso.";

/**
 * SR-8 · recusas da anulação (RF-15/§4.14) — `aberta` e `encerrada` não têm
 * resultado a anular (§2.7: só `sorteada` pode voltar a `encerrada`).
 */
const RECUSA_NAO_SORTEADA = "Esta rifa não está sorteada. Não há resultado de sorteio para anular.";
const RECUSA_SEM_SORTEIO_ANULACAO = "Não há sorteio vigente nesta rifa para anular.";
const RECUSA_INESPERADA_ANULACAO = "Não foi possível anular o sorteio. Tente novamente.";
const MENSAGEM_SUCESSO_ANULACAO = "Sorteio anulado com sucesso.";

/** SR-7 · recusas da revelação (RF-10) — rifa sem sorteio vigente (RN-08). */
const RECUSA_SEM_SORTEIO = "Não há sorteio vigente nesta rifa para revelar o telefone do ganhador.";

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
 * SR-8 · Códigos de ABORT da RPC `desfazer_sorteio` (migração 006) → mensagem
 * pt-BR do mapa. O token vem no início da mensagem do PostgREST.
 */
function mensagemDoCodigoAnulacao(mensagemErro: string): string {
  if (mensagemErro.startsWith("RIFA_NAO_SORTEADA")) return RECUSA_NAO_SORTEADA;
  if (mensagemErro.startsWith("RIFA_SEM_SORTEIO")) return RECUSA_SEM_SORTEIO_ANULACAO;
  if (mensagemErro.startsWith("RIFA_INEXISTENTE")) return RECUSA_NAO_ENCONTRADA;
  return RECUSA_INESPERADA_ANULACAO;
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

/**
 * SR-7 · RF-10 · `revelarTelefoneVencedor(id)` — a revelação do telefone
 * completo do ganhador é autorizada AQUI, no servidor (§3.4.6 item 7:
 * "permissão auditada no servidor"): sessão httpOnly → posse da rifa
 * (`perfil_id` da sessão, nunca do payload; `excluida` invisível) → sorteio
 * VIGENTE (RN-08: `anulado_em IS NULL`). Chamada sem sessão (anon) é recusada
 * com o padrão da casa; o E.164 NUNCA sai do servidor — a action devolve o
 * telefone já formatado por `formatarTelefone` (que também garante que um
 * valor malformado de gravação direta nunca atravesse para a tela).
 *
 * Sem tabela de auditoria no schema da SPEC §2.4 (decisão do usuário,
 * 14/11/2026): a autorização executada nesta action É a conferência do
 * servidor — a negação é provada pelo Teste 2 (int) da SR-7.
 *
 * Leitura pura: não altera estado, logo não revalida caminhos.
 */
export async function revelarTelefoneVencedor(id: string): Promise<EstadoRevelacao> {
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const { data: rifa } = await admin
    .from("rifas")
    .select("id, perfil_id, excluida")
    .eq("id", id)
    .maybeSingle();
  if (!rifa || rifa.perfil_id !== perfilId || rifa.excluida) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  // Sorteio VIGENTE (RN-08): resultado anulado ou inexistente → sem revelação.
  const { data: sorteio, error: erroLeitura } = await admin
    .from("sorteios")
    .select("comprador:comprador_id (telefone)")
    .eq("rifa_id", id)
    .is("anulado_em", null)
    .maybeSingle();
  if (erroLeitura) {
    return { ok: false, mensagem: RECUSA_INESPERADA };
  }
  if (!sorteio) {
    return { ok: false, mensagem: RECUSA_SEM_SORTEIO };
  }

  // PostgREST embute 1:1 (objeto) — defesa padrão da casa (padrão `sortear`).
  const comprador = Array.isArray(sorteio.comprador) ? sorteio.comprador[0] : sorteio.comprador;
  if (!comprador) {
    return { ok: false, mensagem: RECUSA_INESPERADA };
  }

  try {
    return { ok: true, telefone: formatarTelefone(comprador.telefone) };
  } catch {
    // Telefone malformado (impossível pela via da casa, possível por gravação
    // direta): recusa honesta em vez de exibir valor inventado.
    return { ok: false, mensagem: RECUSA_INESPERADA };
  }
}

/**
 * SR-8 · RF-15 · `desfazerSorteio(id)` — anula o resultado VIGENTE (RN-08:
 * `anulado_em IS NULL`) e devolve a rifa a `encerrada`, EM TRANSAÇÃO ÚNICA
 * (§2.4): a via é a RPC `desfazer_sorteio` (migração 006), que trava a rifa
 * com FOR UPDATE e aborta sem alterar nada se o estado mudar no meio-tempo
 * (desfazer concorrente com sortear/reabrir — padrão FD-3/SR-1). O histórico
 * anulado fica preservado em `sorteios` (auditoria, RF-15) e NUNCA é apagado
 * nem exibido em tela; o re-sorteio volta a ser permitido (a RPC da 002 só
 * bloqueia com vigente, RNF-06).
 *
 * Guarda da máquina (§2.7/FD-7): só `sorteada → encerrada` — `aberta` e
 * `encerrada` são recusadas antes de tocar o banco. Revalida a listagem T1
 * e o painel T3 no mesmo roundtrip (badge 🎉 → 🔒, cartão do resultado sai
 * de cena e a barra da etapa `encerrada` volta).
 */
export async function desfazerSorteio(id: string): Promise<EstadoAnulacao> {
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

  // §4.14: "Só com status = 'sorteada'". A máquina de estados garante que a
  // única reversão válida para `encerrada` parte de `sorteada` (§2.7/FD-7) —
  // qualquer mudança nela quebra aqui, antes da RPC.
  if (!podeTransicionarRifa(rifa.status, "encerrada") || rifa.status !== "sorteada") {
    return { ok: false, mensagem: RECUSA_NAO_SORTEADA };
  }

  const { data: anuladoEm, error: erroRpc } = await admin.rpc("desfazer_sorteio", { rifa: id });
  if (erroRpc || typeof anuladoEm !== "string") {
    return { ok: false, mensagem: mensagemDoCodigoAnulacao(erroRpc?.message ?? "") };
  }

  revalidatePath("/rifas");
  revalidatePath(`/rifas/${id}`);
  return { ok: true, mensagem: MENSAGEM_SUCESSO_ANULACAO };
}
