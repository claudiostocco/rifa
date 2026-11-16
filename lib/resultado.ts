/**
 * SR-6 · Texto de compartilhamento do resultado (T5, RF-13 · §3.6).
 *
 * Função pura de `lib/`: a UI e o botão copiar nunca montam o texto na mão.
 * Gotcha de privacidade (RF-10): a função recebe o telefone JÁ mascarado
 * (`formatarTelefoneOculto`) — o E.164 completo JAMAIS entra aqui, pois o
 * texto vai para o clipboard da tela pública.
 *
 * Campos ausentes (ex.: `data_prevista` não informada) geram a linha AUSENTE,
 * nunca "undefined" (matriz §5.2 RF-13, cenário unit).
 */
import { formatarData, formatarDataHora, formatarNumero } from "@/lib/formato";

/** Entrada do texto — telefone já oculto e frase do prêmio já formatada. */
export type EntradaTextoResultado = {
  titulo: string;
  numero: number;
  nome: string;
  telefoneOculto: string;
  /** Frase do prêmio com rótulo, já formatada por `formatarFrasePremio`. */
  frasePremio: string;
  sorteadoEm: string | Date;
  /** Opcional: linha omitida quando a rifa não tem data prevista. */
  dataPrevista?: string;
};

/** Texto formatado pronto para colar no WhatsApp (§3.6 · RF-13). */
export function formatarTextoResultado(entrada: EntradaTextoResultado): string {
  const linhas = [
    `🎉 Resultado do sorteio — ${entrada.titulo}`,
    `Número sorteado: ${formatarNumero(entrada.numero)}`,
    `Ganhador: ${entrada.nome} · ${entrada.telefoneOculto}`,
    `Prêmio: ${entrada.frasePremio}`,
    ...(entrada.dataPrevista ? [`Data prevista: ${formatarData(entrada.dataPrevista)}`] : []),
    `Sorteado em: ${formatarDataHora(entrada.sorteadoEm)}`,
  ];
  return linhas.join("\n");
}
