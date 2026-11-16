import { formatarQuantidade } from "@/lib/formato";

/**
 * Barra vendidos/total (§3.2 e §3.4.2): proporção com rótulo "0/100" e aria.
 * Presentacional — o percentual é derivado em render, sem estado; a variante
 * `destacada` (resumo do T3, VT-2) tem trilho mais alto para a escala maior.
 */
type Props = {
  vendidos: number;
  quantidade: number;
  /** `true` no painel de resumo do T3: trilho h-2 (o número grande fica ao lado). */
  destacada?: boolean;
  /**
   * PB-1 · T4 (§3.5): marca VISUAL do mínimo de vendidos (RN-06 · decisão 10)
   * — traço vertical no trilho na posição proporcional. `0` ou ausente = sem
   * marca (sem mínimo não há o que sinalizar).
   */
  minima?: number;
  /** Substitui o contador padrão "37/100" (a T4 usa "Mínimo: 30" ao lado). */
  rotulo?: string;
};

export function BarraProgresso({
  vendidos,
  quantidade,
  destacada = false,
  minima,
  rotulo,
}: Props) {
  const percentual = quantidade > 0 ? Math.min(100, Math.round((vendidos / quantidade) * 100)) : 0;

  // O mínimo é um inteiro positivo gravado pelo CHECK do banco; fora desse
  // domínio não há marca (e `formatarQuantidade` nunca é chamado com ele).
  const marcaMinimo =
    minima !== undefined && Number.isInteger(minima) && minima > 0 && quantidade > 0
      ? Math.min(100, Math.round((minima / quantidade) * 100))
      : null;

  return (
    <>
      <div
        role="progressbar"
        aria-label={`Progresso de vendas: ${vendidos} de ${quantidade} números vendidos${
          marcaMinimo !== null && minima !== undefined ? ` (mínimo ${formatarQuantidade(minima)})` : ""
        }`}
        aria-valuemin={0}
        aria-valuemax={quantidade}
        aria-valuenow={vendidos}
        className={[
          "relative flex-1 overflow-hidden rounded-full bg-papel-escuro",
          destacada ? "h-2" : "h-1.5",
        ].join(" ")}
      >
        <div
          className="h-full rounded-full bg-verde-venda transition-[width] duration-300"
          style={{ width: `${percentual}%` }}
        />
        {marcaMinimo !== null ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 rounded bg-tinta"
            style={{ left: `calc(${marcaMinimo}% - 1px)` }}
          />
        ) : null}
      </div>
      <span className="shrink-0 text-xs font-medium text-tinta-suave">
        {rotulo ?? `${vendidos}/${quantidade}`}
      </span>
    </>
  );
}
