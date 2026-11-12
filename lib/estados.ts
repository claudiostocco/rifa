/**
 * FD-7 · Máquina de estados de rifa e de número (SPEC §2.7).
 *
 * Fonte única das transições permitidas: `aberta → encerrada → sorteada`,
 * com reversões `encerrada → aberta` (reabrir) e `sorteada → encerrada`
 * (desfazer sorteio). Número: `disponivel ⇄ vendido`. As bandeiras
 * `arquivada`/`excluida` são colunas booleanas, não estados — nunca entram
 * nesta máquina. As validações valem SEMPRE no servidor (as Server Actions
 * conferem aqui antes de tocar o banco); a UI nunca é fonte de verdade.
 */
import type { NumeroRow, RifaRow } from "@/lib/supabase/tipos";

export type StatusRifa = RifaRow["status"]; // 'aberta' | 'encerrada' | 'sorteada'
export type StatusNumero = NumeroRow["status"]; // 'disponivel' | 'vendido'

/** Rótulos de exibição por status (T1/T3 — §3.2: 🟢 Aberta · 🔒 Encerrada · 🎉 Sorteada). */
export const ROTULO_STATUS: Record<StatusRifa, { icone: string; texto: string }> = {
  aberta: { icone: "🟢", texto: "Aberta" },
  encerrada: { icone: "🔒", texto: "Encerrada" },
  sorteada: { icone: "🎉", texto: "Sorteada" },
};

/**
 * `status` chega do banco como string (CHECK da migração 001, sem enum no
 * Postgres — regra FD-4 de derivar dos tipos gerados); o Badge espera o
 * literal. Valores fora dos 3 estados conhecidos caem no estilo neutro.
 */
export function tipoDoBadge(status: string): "aberta" | "encerrada" | "sorteada" | "neutro" {
  return status === "aberta" || status === "encerrada" || status === "sorteada" ? status : "neutro";
}

/** Transições de rifa (§2.7). Completa por construção — o `typecheck` exige. */
const TRANSICOES_RIFA: Record<StatusRifa, readonly StatusRifa[]> = {
  aberta: ["encerrada"],
  // reabrir e sortear saem de 'encerrada'; desfazer devolve 'sorteada' a ela.
  encerrada: ["aberta", "sorteada"],
  sorteada: ["encerrada"],
};

const TRANSICOES_NUMERO: Record<StatusNumero, readonly StatusNumero[]> = {
  disponivel: ["vendido"],
  vendido: ["disponivel"], // remoção da venda (RF-06) é a única saída de 'vendido'
};

const TEXTO = (status: string) => `"${status}"`;

/** `transicoesRifa` · destinos autorizados a partir de um status. */
export function transicoesRifa(de: StatusRifa): readonly StatusRifa[] {
  return TRANSICOES_RIFA[de];
}

/** `transicoesNumero` · destinos autorizados a partir de um status. */
export function transicoesNumero(de: StatusNumero): readonly StatusNumero[] {
  return TRANSICOES_NUMERO[de];
}

/** `podeTransicionarRifa` · guarda booleana para desabilitar botões na UI. */
export function podeTransicionarRifa(de: StatusRifa, para: StatusRifa): boolean {
  return TRANSICOES_RIFA[de].includes(para);
}

/** `podeTransicionarNumero` · guarda booleana (grade/modal usam antes de salvar). */
export function podeTransicionarNumero(de: StatusNumero, para: StatusNumero): boolean {
  return TRANSICOES_NUMERO[de].includes(para);
}

/**
 * `transicionarRifa` · executa a transição e devolve o novo status; recusa
 * inválida com erro pt-BR pronto para o Toast. Chamado por `encerrarVendas`,
 * `reabrirVendas`, `sortear` e `desfazerSorteio` — jamais pela UI direto.
 */
export function transicionarRifa(de: StatusRifa, para: StatusRifa): StatusRifa {
  if (!podeTransicionarRifa(de, para)) {
    throw new Error(
      `A rifa ${TEXTO(de)} não pode ir para ${TEXTO(para)}; transições permitidas: ${TRANSICOES_RIFA[de].join(", ") || "nenhuma"}`,
    );
  }
  return para;
}

/** `transicionarNumero` · executa a transição do número e devolve o novo status. */
export function transicionarNumero(de: StatusNumero, para: StatusNumero): StatusNumero {
  if (!podeTransicionarNumero(de, para)) {
    throw new Error(
      `O número ${TEXTO(de)} não pode ir para ${TEXTO(para)}; transições permitidas: ${TRANSICOES_NUMERO[de].join(", ") || "nenhuma"}`,
    );
  }
  return para;
}
