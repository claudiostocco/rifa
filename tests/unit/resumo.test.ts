/**
 * VT-2 · `calcularResumo` (SPEC §3.4.2, RF-04 · matriz §5.2 linha RF-04)
 *
 * Teste 1 (caminho feliz): 37 vendidos a R$ 10 em rifa de 100 → 37%,
 *   arrecadado R$ 370,00, potencial R$ 1.000,00 e 63 disponíveis.
 * Teste 2 (borda/validação): entradas fora do domínio (vendidos negativo ou
 *   não inteiro, quantidade 0, valor não finito) retornam erro claro em
 *   pt-BR; bordas válidas (0 vendidos → 0%, rifa completa → 100%) não explodem.
 */
import { describe, expect, it } from "vitest";

import { formatarMoeda } from "@/lib/formato";
import { calcularResumo } from "@/lib/resumo";

describe("VT-2 · painel de resumo (SPEC §3.4.2, RF-04)", () => {
  it("deve calcular 37 vendidos a R$ 10 em rifa de 100 como 37%, arrecadado R$ 370,00 e potencial R$ 1.000,00", () => {
    const resumo = calcularResumo({ vendidos: 37, quantidade: 100, numeroValor: 10 });

    expect(resumo).toEqual({
      vendidos: 37,
      total: 100,
      disponiveis: 63,
      percentual: 37,
      arrecadado: 370,
      potencial: 1000,
    });

    // Os valores exibidos saem SEMPRE pelos formatadores do §4.19 — a UI não
    // formata na mão (padrão FD-6). O Intl separa "R$" do valor com espaço
    // inquebrável (\s cobre \u00a0, padrão dos testes E2E do painel).
    expect(formatarMoeda(resumo.arrecadado)).toMatch(/^R\$\s370,00$/u);
    expect(formatarMoeda(resumo.potencial)).toMatch(/^R\$\s1\.000,00$/u);
  });

  it("deve recusar entradas fora do domínio com erro pt-BR e aceitar as bordas 0% e 100%", () => {
    // a) bordas válidas não explodem
    expect(calcularResumo({ vendidos: 0, quantidade: 100, numeroValor: 10 })).toMatchObject({
      percentual: 0,
      arrecadado: 0,
      disponiveis: 100,
    });
    expect(calcularResumo({ vendidos: 100, quantidade: 100, numeroValor: 10 })).toMatchObject({
      percentual: 100,
      arrecadado: 1000,
      disponiveis: 0,
    });

    // b) centavos e arredondamento ao centavo (numeric(10,2), §4.19)
    expect(calcularResumo({ vendidos: 37, quantidade: 100, numeroValor: 10.05 })).toMatchObject({
      arrecadado: 371.85,
      potencial: 1005,
    });

    // c) vendidos negativo
    expect(() => calcularResumo({ vendidos: -1, quantidade: 100, numeroValor: 10 })).toThrow(
      "A contagem de vendidos deve ser um inteiro não negativo (recebida: -1)",
    );

    // d) vendidos não inteiro
    expect(() => calcularResumo({ vendidos: 37.5, quantidade: 100, numeroValor: 10 })).toThrow(
      "A contagem de vendidos deve ser um inteiro não negativo (recebida: 37.5)",
    );

    // e) quantidade 0 (divisão impossível do percentual)
    expect(() => calcularResumo({ vendidos: 0, quantidade: 0, numeroValor: 10 })).toThrow(
      "A quantidade deve ser um inteiro positivo (recebida: 0)",
    );

    // f) valor do número não finito (NaN/Infinity — mesmo domínio da moeda, FD-6)
    expect(() =>
      calcularResumo({ vendidos: 37, quantidade: 100, numeroValor: Number.NaN }),
    ).toThrow("Informe um valor em reais válido (recebido: NaN)");

    // g) valor do número ≤ 0 (CHECK premio/numero_valor > 0)
    expect(() => calcularResumo({ vendidos: 37, quantidade: 100, numeroValor: 0 })).toThrow(
      "Informe um valor em reais válido (recebido: 0)",
    );
  });
});
