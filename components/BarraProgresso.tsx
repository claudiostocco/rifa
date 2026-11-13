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
};

export function BarraProgresso({ vendidos, quantidade, destacada = false }: Props) {
  const percentual = quantidade > 0 ? Math.min(100, Math.round((vendidos / quantidade) * 100)) : 0;

  return (
    <>
      <div
        role="progressbar"
        aria-label={`Progresso de vendas: ${vendidos} de ${quantidade} números vendidos`}
        aria-valuemin={0}
        aria-valuemax={quantidade}
        aria-valuenow={vendidos}
        className={[
          "flex-1 overflow-hidden rounded-full bg-papel-escuro",
          destacada ? "h-2" : "h-1.5",
        ].join(" ")}
      >
        <div
          className="h-full rounded-full bg-verde-venda transition-[width] duration-300"
          style={{ width: `${percentual}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium text-tinta-suave">
        {vendidos}/{quantidade}
      </span>
    </>
  );
}
