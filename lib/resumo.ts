/**
 * VT-2 · Cálculo do painel de resumo (exclusivo do T3 — SPEC §3.4.2, RF-04).
 *
 * Função pura de `lib/`: nenhum valor financeiro é calculado na mão nas telas.
 * Os insumos vêm do banco (`numeros` com status 'vendido' = vendidos vigentes,
 * pois `removerVenda` devolve o número a `disponivel`) e a exibição usa os
 * formatadores de `lib/formato.ts`.
 *
 * RN-02/decisão 8: o resumo só existe no painel do organizador — telas
 * públicas nunca recebem estes valores.
 */
export type EntradaResumo = {
  /** Números com status 'vendido' (contagem via RLS no servidor). */
  vendidos: number;
  /** Quantidade total da rifa (25..5.000 — CHECK da migração 001). */
  quantidade: number;
  /** Preço de cada número em reais (numeric(10,2) > 0). */
  numeroValor: number;
};

export type ResumoVendas = {
  vendidos: number;
  total: number;
  disponiveis: number;
  /** 0..100, arredondado como a barra da T1 (FD-12). */
  percentual: number;
  /** R$ dos vendidos vigentes, arredondado ao centavo (numeric(10,2)). */
  arrecadado: number;
  /** R$ se todos os números fossem vendidos, arredondado ao centavo. */
  potencial: number;
};

/** Arredonda ao centavo: numeric(10,2) não admite mais casas (§4.19). */
function aoCentavo(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * `calcularResumo` · 37 vendidos a R$ 10 em rifa de 100 → 37%, arrecadado
 * R$ 370,00, potencial R$ 1.000,00, 63 disponíveis (matriz §5.2, RF-04).
 */
export function calcularResumo({ vendidos, quantidade, numeroValor }: EntradaResumo): ResumoVendas {
  if (!Number.isInteger(vendidos) || vendidos < 0) {
    throw new Error(
      `A contagem de vendidos deve ser um inteiro não negativo (recebida: ${String(vendidos)})`,
    );
  }
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error(`A quantidade deve ser um inteiro positivo (recebida: ${String(quantidade)})`);
  }
  if (!Number.isFinite(numeroValor) || numeroValor <= 0) {
    throw new Error(`Informe um valor em reais válido (recebido: ${String(numeroValor)})`);
  }

  return {
    vendidos,
    total: quantidade,
    disponiveis: quantidade - vendidos,
    percentual: Math.min(100, Math.round((vendidos / quantidade) * 100)),
    arrecadado: aoCentavo(vendidos * numeroValor),
    potencial: aoCentavo(quantidade * numeroValor),
  };
}
