"use server";

/**
 * FD-10 · Criação de rifa (SPEC §4.1/§4.2 · matriz §5.2 RF-01) — porta de
 * escrita em `rifas` + `numeros`.
 *
 * Fluxo prescrito: Zod (`CriarRifaInputSchema`, FD-5) → sessão/perfil via
 * client de cookies (RLS) → INSERT com `service_role` (SPEC §2.2: a escrita é
 * sempre da Server Action com service_role; a posse fica garantida porque o
 * `perfil_id` vem da sessão — nunca do payload) → numeração 1..N em lote
 * (RF-02), com compensação (rifa removida) se o lote falhar: uma rifa nunca
 * fica no ar sem os N números. Colisão de slug (UNIQUE) → novo sufixo e nova
 * tentativa (SPEC §2.8). Erros sempre em pt-BR prontos para Toast (§2.2).
 *
 * FD-11 · edição/arquivamento/exclusão (SPEC §4.13 · RN-09 · matriz §5.2
 * RF-14 e RF-01 editar): mesma porta de escrita — Zod
 * (`AtualizarRifaInputSchema`, FD-5) → sessão → conferência de posse (o
 * `perfil_id` da linha tem de bater com o da sessão) → UPDATE com
 * `service_role`. Edição só em rifa `aberta` (§4.1); `quantidade` bloqueada
 * com QUALQUER venda (vigente ou removida — RN-09; bloquear também as
 * removidas preserva o histórico delas, que cairia em cascata se a
 * numeração fosse refeita). Exclusão é soft delete (`excluida`, §2.4): os
 * dados ficam preservados e o RLS já os oculta do público.
 */
import { revalidatePath } from "next/cache";

import { AtualizarRifaInputSchema, CriarRifaInputSchema } from "@/lib/schemas";
import type { AtualizarRifaInput } from "@/lib/schemas";
import { valorDeTextoMoeda } from "@/lib/formato";
import { gerarSlug } from "@/lib/slug";
import { criarClienteAdministrador, criarClienteServidor } from "@/lib/supabase/server";
import type { NumeroInsert, RifaInsert, RifaRow, RifaUpdate } from "@/lib/supabase/tipos";

/** Estado consumido pelo `useActionState` do formulário T2 (FD-13). */
export type EstadoRifa =
  { ok: true; mensagem: string; rifaId: string; slug: string } | { ok: false; mensagem: string };

/** Estado das ações sem rifa retornada (arquivar/excluir). */
export type EstadoAcao = { ok: true; mensagem: string } | { ok: false; mensagem: string };

type RifaCriada = Pick<RifaRow, "id" | "slug">;

/** Tentativas de sufixo de slug antes de desistir (colisão é rara, mas existe). */
const TENTATIVAS_DE_SLUG = 5;

function texto(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim();
  return limpo === "" ? undefined : limpo;
}

/**
 * A UI digita valores em pt-BR (máscara de moeda da T2): "1.234,56" → 1234.56.
 * A conversão vive em `lib/formato.ts` (`valorDeTextoMoeda`, FD-13) para que
 * o cliente valide com exatamente a mesma regra do servidor.
 */
function numeroDe(formData: FormData, campo: string): number | undefined {
  const bruto = texto(formData, campo);
  if (bruto === undefined) return undefined;
  const valor = valorDeTextoMoeda(bruto);
  // NaN não chega ao Zod: o contrato devolve a mensagem pt-BR do campo.
  return Number.isNaN(valor) ? undefined : valor;
}

type ResultadoGravacao = { rifa: RifaCriada | null; colidiuSlug: boolean };

/**
 * Grava a rifa (com reconciliação de slug) e devolve a linha criada.
 * Retorna `rifa: null` quando não consegue gravar; `colidiuSlug` distingue a
 * exaustão de sufixos de uma falha de banco/rede para a mensagem correta.
 */
async function gravarRifa(
  payload: Omit<RifaInsert, "slug">,
  titulo: string,
): Promise<ResultadoGravacao> {
  const admin = criarClienteAdministrador();

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_SLUG; tentativa += 1) {
    const slug = gerarSlug(titulo);
    const { data, error } = await admin
      .from("rifas")
      .insert({ ...payload, slug })
      .select("id, slug")
      .single();

    if (!error) {
      return { rifa: data, colidiuSlug: false };
    }
    if (error.code !== "23505") {
      // Falha de rede/permissão/FK — não é colisão de slug; nada a reconciliar.
      return { rifa: null, colidiuSlug: false };
    }
  }
  return { rifa: null, colidiuSlug: true };
}

export async function criarRifa(
  _estadoAnterior: EstadoRifa | undefined,
  formData: FormData,
): Promise<EstadoRifa> {
  const dados = CriarRifaInputSchema.safeParse({
    titulo: texto(formData, "titulo"),
    descricao: texto(formData, "descricao"),
    premio_descricao: texto(formData, "premio_descricao"),
    premio_rotulo: texto(formData, "premio_rotulo"),
    premio_valor: numeroDe(formData, "premio_valor"),
    numero_valor: numeroDe(formData, "numero_valor"),
    quantidade: numeroDe(formData, "quantidade"),
    qtd_minima: numeroDe(formData, "qtd_minima"),
    imagem_url: texto(formData, "imagem_url"),
    data_prevista: texto(formData, "data_prevista"),
  });

  if (!dados.success) {
    const problema = dados.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os campos do formulário." };
  }

  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    return {
      ok: false,
      mensagem: "Sua sessão expirou. Entre novamente para criar a rifa.",
    };
  }

  // Trigger OCR (migração 001) cria o perfil na criação da conta; sem ele a
  // FK de `rifas.perfil_id` falharia — mensagem amigável em vez de erro cru.
  const { data: perfil } = await supabase
    .from("perfis")
    .select("id")
    .eq("id", sessao.user.id)
    .maybeSingle();
  if (!perfil) {
    return {
      ok: false,
      mensagem: "Não encontramos o seu perfil. Entre novamente para recriá-lo.",
    };
  }

  const resultado = await gravarRifa(
    {
      perfil_id: sessao.user.id,
      titulo: dados.data.titulo,
      descricao: dados.data.descricao ?? null,
      premio_descricao: dados.data.premio_descricao,
      premio_rotulo: dados.data.premio_rotulo,
      premio_valor: dados.data.premio_valor,
      numero_valor: dados.data.numero_valor,
      quantidade: dados.data.quantidade,
      qtd_minima: dados.data.qtd_minima,
      imagem_url: dados.data.imagem_url ?? null,
      data_prevista: dados.data.data_prevista ?? null,
    },
    dados.data.titulo,
  );

  if (!resultado.rifa) {
    return {
      ok: false,
      mensagem: resultado.colidiuSlug
        ? "Não foi possível gerar o link público da rifa. Tente novamente em instantes."
        : "Não foi possível criar a rifa agora. Tente novamente em instantes.",
    };
  }

  const { id: rifaId, slug } = resultado.rifa;

  // RF-02 · numeração 1..N em lote único; `status` vem do DEFAULT 'disponivel'.
  const numeros: NumeroInsert[] = Array.from({ length: dados.data.quantidade }, (_, indice) => ({
    rifa_id: rifaId,
    numero: indice + 1,
  }));

  const admin = criarClienteAdministrador();
  const { error: erroNumeros } = await admin.from("numeros").insert(numeros);

  if (erroNumeros) {
    // Compensação: a rifa sem a numeração completa nunca pode ficar no ar.
    // O DELETE em cascata remove qualquer resíduo de `numeros`.
    await admin.from("rifas").delete().eq("id", rifaId);
    return {
      ok: false,
      mensagem: "Não foi possível criar os números da rifa. Tente novamente em instantes.",
    };
  }

  // A T1 (FD-12) lista as rifas do organizador — revalida no mesmo roundtrip.
  revalidatePath("/rifas");

  return { ok: true, mensagem: "Rifa criada com sucesso.", rifaId, slug };
}

/* ---------------------------------------------------------------------- */
/* FD-11 · editarRifa / arquivarRifa / excluirRifa (SPEC §4.13 · RN-09)    */
/* ---------------------------------------------------------------------- */

type ClienteAdmin = ReturnType<typeof criarClienteAdministrador>;

/** Campos lidos antes de qualquer gravação — posse e guardas de estado. */
type RifaPropria = Pick<
  RifaRow,
  "id" | "slug" | "perfil_id" | "status" | "quantidade" | "qtd_minima" | "arquivada" | "excluida"
>;

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RECUSA_SESSAO = "Sua sessão expirou. Entre novamente para continuar.";
const RECUSA_NAO_ENCONTRADA = "Não encontramos essa rifa na sua conta.";
const RECUSA_BANCO = "Não foi possível salvar a alteração agora. Tente novamente em instantes.";
const RECUSA_VENDAS_QUANTIDADE =
  "A quantidade de números não pode ser alterada porque a rifa já tem vendas registradas.";
const RECUSA_VENDAS_EXCLUSAO =
  "Esta rifa tem compras registradas. Você pode arquivá-la para preservar o histórico.";

/** id do usuário da sessão httpOnly (ou null, quando expirou). */
async function usuarioDaSessao(): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  return sessao?.user?.id ?? null;
}

/**
 * Lê a rifa conferindo posse (perfil_id da sessão) e visibilidade:
 * `excluida` fica invisível para o próprio organizador em todas as ações.
 */
async function buscarRifaPropria(
  admin: ClienteAdmin,
  rifaId: string,
  perfilId: string,
): Promise<RifaPropria | null> {
  const { data, error } = await admin
    .from("rifas")
    .select("id, slug, perfil_id, status, quantidade, qtd_minima, arquivada, excluida")
    .eq("id", rifaId)
    .maybeSingle();
  if (error || !data || data.perfil_id !== perfilId || data.excluida) {
    return null;
  }
  return data;
}

/**
 * RN-09 conta "qualquer venda" — vigentes E removidas (`removida_em` não
 * filtra): refez a numeração apagaria em cascata o histórico de vendas
 * removidas (RN-07). Retorna null quando a conferência falha no banco.
 */
async function contarVendasDaRifa(admin: ClienteAdmin, rifaId: string): Promise<number | null> {
  const { data: numeros, error: erroNumeros } = await admin
    .from("numeros")
    .select("id")
    .eq("rifa_id", rifaId);
  if (erroNumeros) return null;

  const ids = (numeros ?? []).map((numero) => numero.id);
  if (ids.length === 0) return 0;

  const { count, error } = await admin
    .from("vendas")
    .select("id", { count: "exact", head: true })
    .in("numero_id", ids);
  if (error) return null;
  return count ?? 0;
}

/**
 * Ajusta a numeração (RF-02) quando a quantidade muda — sempre em rifa sem
 * vendas (guarda acima), então todas as pastilhas são `disponivel`:
 * aumentar acrescenta o intervalo novo; diminuir remove o excedente.
 */
async function ajustarNumeracao(
  admin: ClienteAdmin,
  rifaId: string,
  quantidadeAnterior: number,
  quantidadeNova: number,
): Promise<string | null> {
  let erro: string | null = null;

  if (quantidadeNova > quantidadeAnterior) {
    const acrescentados: NumeroInsert[] = Array.from(
      { length: quantidadeNova - quantidadeAnterior },
      (_, indice) => ({
        rifa_id: rifaId,
        numero: quantidadeAnterior + 1 + indice,
      }),
    );
    const { error: erroInsercao } = await admin.from("numeros").insert(acrescentados);
    if (erroInsercao) erro = RECUSA_BANCO;
  } else {
    const { error: erroRemocao } = await admin
      .from("numeros")
      .delete()
      .eq("rifa_id", rifaId)
      .gt("numero", quantidadeNova);
    if (erroRemocao) erro = RECUSA_BANCO;
  }

  return erro;
}

/**
 * RF-01/RN-09 · edição. Contrato da SPEC §2.5: `editarRifa(id, dados)` —
 * `dados` chega do client e é revalidado por Zod (nunca confiado). Só rifa
 * `aberta` é editável (§4.1); `quantidade` nova exige rifa sem vendas.
 */
export async function editarRifa(id: string, dados: AtualizarRifaInput): Promise<EstadoRifa> {
  const parse = AtualizarRifaInputSchema.safeParse(dados);
  if (!parse.success) {
    const problema = parse.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os campos do formulário." };
  }
  return executarEdicaoRifa(id, parse.data);
}

/**
 * Núcleo da edição, pós-Zod (`parse.data` já validado). Separado da borda
 * pública para que o adaptador do formulário T2 (`salvarEdicaoRifa`, FD-13)
 * valide o FormData UMA vez e chegue aqui já com os literais afunilados.
 */
async function executarEdicaoRifa(id: string, dados: AtualizarRifaInput): Promise<EstadoRifa> {
  if (!PADRAO_UUID.test(id)) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const rifa = await buscarRifaPropria(admin, id, perfilId);
  if (!rifa) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  if (rifa.status !== "aberta") {
    return { ok: false, mensagem: "Somente rifas abertas podem ser editadas." };
  }

  const quantidadeNova = dados.quantidade;
  const quantidadeMudou = quantidadeNova !== undefined && quantidadeNova !== rifa.quantidade;

  if (quantidadeMudou) {
    const vendas = await contarVendasDaRifa(admin, id);
    if (vendas === null) {
      return { ok: false, mensagem: RECUSA_BANCO };
    }
    if (vendas > 0) {
      return { ok: false, mensagem: RECUSA_VENDAS_QUANTIDADE };
    }

    // RN-05: a mínima (nova ou vigente) tem de caber na quantidade nova.
    const minimaVigente = dados.qtd_minima ?? rifa.qtd_minima;
    if (minimaVigente > quantidadeNova) {
      return {
        ok: false,
        mensagem: "A quantidade mínima de vendidos não pode exceder a quantidade de números",
      };
    }
  }

  const atualizacao: RifaUpdate = {};
  if (dados.titulo !== undefined) atualizacao.titulo = dados.titulo;
  if (dados.descricao !== undefined) atualizacao.descricao = dados.descricao;
  if (dados.premio_descricao !== undefined) {
    atualizacao.premio_descricao = dados.premio_descricao;
  }
  if (dados.premio_rotulo !== undefined) atualizacao.premio_rotulo = dados.premio_rotulo;
  if (dados.premio_valor !== undefined) atualizacao.premio_valor = dados.premio_valor;
  if (dados.numero_valor !== undefined) atualizacao.numero_valor = dados.numero_valor;
  if (dados.quantidade !== undefined) atualizacao.quantidade = dados.quantidade;
  if (dados.qtd_minima !== undefined) atualizacao.qtd_minima = dados.qtd_minima;
  if (dados.imagem_url !== undefined) atualizacao.imagem_url = dados.imagem_url;
  if (dados.data_prevista !== undefined) atualizacao.data_prevista = dados.data_prevista;

  // UPDATE primeiro: a numeração só é refeita com a rifa já consistente; se
  // ela falhar, a compensação devolve a linha ao estado anterior.
  const { error } = await admin.from("rifas").update(atualizacao).eq("id", id);
  if (error) {
    return { ok: false, mensagem: RECUSA_BANCO };
  }

  if (quantidadeMudou && quantidadeNova !== undefined) {
    const erroNumeracao = await ajustarNumeracao(admin, id, rifa.quantidade, quantidadeNova);
    if (erroNumeracao) {
      await admin
        .from("rifas")
        .update({ quantidade: rifa.quantidade, qtd_minima: rifa.qtd_minima })
        .eq("id", id);
      return { ok: false, mensagem: erroNumeracao };
    }
  }

  revalidatePath("/rifas");
  return { ok: true, mensagem: "Rifa atualizada com sucesso.", rifaId: id, slug: rifa.slug };
}

/**
 * RF-14 · arquivamento (sempre permitido): sai da listagem T1, dados
 * preservados — só a bandeira `arquivada` muda (§2.7: bandeira, não estado).
 */
export async function arquivarRifa(id: string): Promise<EstadoAcao> {
  if (!PADRAO_UUID.test(id)) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const rifa = await buscarRifaPropria(admin, id, perfilId);
  if (!rifa) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  if (rifa.arquivada) {
    return { ok: true, mensagem: "A rifa já está arquivada." };
  }

  const { error } = await admin.from("rifas").update({ arquivada: true }).eq("id", id);
  if (error) {
    return {
      ok: false,
      mensagem: "Não foi possível arquivar a rifa. Tente novamente em instantes.",
    };
  }

  revalidatePath("/rifas");
  return { ok: true, mensagem: "Rifa arquivada com sucesso." };
}

/**
 * RF-14/RN-09 · exclusão só sem vendas; com vendas, o organizador é guiado
 * ao arquivamento (texto prescrito da SPEC §4.13). Exclusão é soft delete
 * (`excluida = true`, §2.4): a linha e o histórico permanecem no banco e o
 * RLS deixa de publicá-los (anon — migração 001).
 */
export async function excluirRifa(id: string): Promise<EstadoAcao> {
  if (!PADRAO_UUID.test(id)) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const perfilId = await usuarioDaSessao();
  if (!perfilId) {
    return { ok: false, mensagem: RECUSA_SESSAO };
  }

  const admin = criarClienteAdministrador();
  const rifa = await buscarRifaPropria(admin, id, perfilId);
  if (!rifa) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  const vendas = await contarVendasDaRifa(admin, id);
  if (vendas === null) {
    return { ok: false, mensagem: RECUSA_BANCO };
  }
  if (vendas > 0) {
    return { ok: false, mensagem: RECUSA_VENDAS_EXCLUSAO };
  }

  const { error } = await admin.from("rifas").update({ excluida: true }).eq("id", id);
  if (error) {
    return {
      ok: false,
      mensagem: "Não foi possível excluir a rifa. Tente novamente em instantes.",
    };
  }

  revalidatePath("/rifas");
  return { ok: true, mensagem: "Rifa excluída com sucesso." };
}

/* ---------------------------------------------------------------------- */
/* FD-13 · adaptador de formulário da edição (T2 · useActionState)         */
/* ---------------------------------------------------------------------- */

/**
 * Ponte entre o formulário T2 em modo edição e o contrato da SPEC §2.5
 * (`editarRifa(id, dados)`): lê o `FormData` do `useActionState`, monta o
 * `AtualizarRifaInput` e delega — a conferência de posse, estado (§4.1) e
 * RN-09 continua toda na `editarRifa`, única porta de escrita.
 *
 * `descricao` sempre viaja quando o campo existe (o T2 envia mesmo vazio):
 * "" limpa a coluna e a ausência (payload adulterado) não altera nada — o
 * contrato parcial não distingue "não alterado" de "limpar". `data_prevista`
 * e `imagem_url` só viajam preenchidos; limpar a data exigiria `null` no
 * contrato (§4.4: mudança de contrato exige SPEC primeiro). O select de
 * quantidade desabilitado (RN-09) nem chega ao FormData: sem o campo, o
 * `editarRifa` trata como não alterado.
 */
export async function salvarEdicaoRifa(
  _estadoAnterior: EstadoRifa | undefined,
  formData: FormData,
): Promise<EstadoRifa> {
  const id = texto(formData, "id");
  if (id === undefined) {
    return { ok: false, mensagem: RECUSA_NAO_ENCONTRADA };
  }

  // Mesmo padrão da `criarRifa`: FormData → Zod UMA vez, com os campos vazios
  // virando `undefined` para o contrato devolver a mensagem certa do campo.
  const parse = AtualizarRifaInputSchema.safeParse({
    titulo: texto(formData, "titulo"),
    premio_descricao: texto(formData, "premio_descricao"),
    premio_rotulo: texto(formData, "premio_rotulo"),
    premio_valor: numeroDe(formData, "premio_valor"),
    numero_valor: numeroDe(formData, "numero_valor"),
    quantidade: numeroDe(formData, "quantidade"),
    qtd_minima: numeroDe(formData, "qtd_minima"),
    data_prevista: texto(formData, "data_prevista"),
    ...(formData.has("descricao") ? { descricao: texto(formData, "descricao") ?? "" } : {}),
  });
  if (!parse.success) {
    const problema = parse.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os campos do formulário." };
  }

  return executarEdicaoRifa(id, parse.data);
}
