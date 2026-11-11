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
 */
import { revalidatePath } from "next/cache";

import { CriarRifaInputSchema } from "@/lib/schemas";
import { gerarSlug } from "@/lib/slug";
import { criarClienteAdministrador, criarClienteServidor } from "@/lib/supabase/server";
import type { NumeroInsert, RifaInsert, RifaRow } from "@/lib/supabase/tipos";

/** Estado consumido pelo `useActionState` do formulário T2 (FD-13). */
export type EstadoRifa =
  | { ok: true; mensagem: string; rifaId: string; slug: string }
  | { ok: false; mensagem: string };

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
 * Valores já internacionais ("1234.56") passam ilesos; inválidos viram NaN.
 */
function converterValorNumerico(bruto: string): number {
  const semMoeda = bruto.replace(/^r\$/i, "").replace(/\s/g, "");
  const normalizado = semMoeda.includes(",")
    ? semMoeda.replace(/\./g, "").replace(",", ".")
    : semMoeda;
  return Number(normalizado);
}

function numeroDe(formData: FormData, campo: string): number | undefined {
  const bruto = texto(formData, campo);
  if (bruto === undefined) return undefined;
  const valor = converterValorNumerico(bruto);
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
