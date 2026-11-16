/**
 * SR-6 · Testes unitários do texto de compartilhamento (RF-13 · §3.6).
 *
 * A matriz §5.2 (linha RF-13) pede o texto com campos ausentes SEM "undefined"
 * — aqui os dois cenários: caminho feliz completo (com data prevista) e rifa
 * sem data prevista (linha ausente, nunca "undefined").
 */
import { describe, expect, it } from "vitest";

import { formatarTextoResultado } from "@/lib/resultado";

const ENTRADA_COMPLETA = {
  titulo: "Rifa do Forno Elétrico",
  numero: 47,
  nome: "Maria Silva",
  telefoneOculto: "(11) 9••••-••44",
  frasePremio: "Mais de R$ 500,00 — Forno elétrico",
  sorteadoEm: "2026-11-14T20:30:00+00:00",
  dataPrevista: "2026-12-25",
} as const;

describe("formatarTextoResultado", () => {
  it("deve montar o texto completo com número, ganhador, telefone oculto, prêmio com rótulo e datas formatadas", () => {
    expect(formatarTextoResultado(ENTRADA_COMPLETA)).toBe(
      [
        "🎉 Resultado do sorteio — Rifa do Forno Elétrico",
        "Número sorteado: 047",
        "Ganhador: Maria Silva · (11) 9••••-••44",
        "Prêmio: Mais de R$ 500,00 — Forno elétrico",
        "Data prevista: 25/12/2026",
        "Sorteado em: 14/11/2026 17:30",
      ].join("\n"),
    );
  });

  it("deve omitir a linha da data prevista ausente sem incluir 'undefined' em campo nenhum", () => {
    const texto = formatarTextoResultado({
      ...ENTRADA_COMPLETA,
      dataPrevista: undefined,
    });

    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("Data prevista");
    expect(texto).toBe(
      [
        "🎉 Resultado do sorteio — Rifa do Forno Elétrico",
        "Número sorteado: 047",
        "Ganhador: Maria Silva · (11) 9••••-••44",
        "Prêmio: Mais de R$ 500,00 — Forno elétrico",
        "Sorteado em: 14/11/2026 17:30",
      ].join("\n"),
    );
  });
});
