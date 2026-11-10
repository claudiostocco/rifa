/**
 * FD-6 · Testes unitários de `lib/formato.ts` (SPEC §4.19, matriz §5.2 RF-02 e RF-10).
 * Teste 1 (caminho feliz): formatarNumero (1)→"001", (37)→"037", (1200)→"1200";
 * 850 → "R$ 850,00"; "+5511988887777" ↔ "(11) 98888-7777".
 * Teste 2 (domínio): entradas fora do domínio — 0, 5001, inteiro quebrado,
 * telefone inválido, moeda não finita e datas inexistentes — retornam erro
 * claro em pt-BR.
 */
import { describe, expect, it } from "vitest";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarNumero,
  formatarTelefone,
  formatarTelefoneE164,
  formatarTelefoneOculto,
} from "@/lib/formato";

/** "R$" e o valor vêm separados por espaço inquebrável do Intl. */
const normalizar = (texto: string) => texto.replace(/\u00a0/g, " ");

describe("FD-6 · lib/formato — formatação de exibição", () => {
  it("deve formatar número da rifa com padLeft ≥ 3, moeda BRL e telefone E.164 ↔ máscara", () => {
    expect(formatarNumero(1)).toBe("001");
    expect(formatarNumero(37)).toBe("037");
    expect(formatarNumero(1200)).toBe("1200");
    expect(formatarNumero(100)).toBe("100");
    expect(formatarNumero(5000)).toBe("5000");

    expect(normalizar(formatarMoeda(850))).toBe("R$ 850,00");
    expect(normalizar(formatarMoeda(10.5))).toBe("R$ 10,50");
    expect(normalizar(formatarMoeda(1000))).toBe("R$ 1.000,00");

    expect(formatarTelefone("+5511988887777")).toBe("(11) 98888-7777");
    expect(formatarTelefoneE164("(11) 98888-7777")).toBe("+5511988887777");
    // A ida e a volta fecham o ciclo (formato exibido ↔ formato gravado).
    expect(formatarTelefone(formatarTelefoneE164("(11) 98888-7777"))).toBe("(11) 98888-7777");
    expect(formatarTelefone(formatarTelefoneE164("(11) 3333-4444"))).toBe(
      "(11) 3333-4444",
    );
  });

  it("deve recusar número fora de 1..5000, não inteiro, telefone inválido, moeda não finita e data inexistente com erro pt-BR", () => {
    expect(() => formatarNumero(0)).toThrow(/1 e 5000/);
    expect(() => formatarNumero(5001)).toThrow(/1 e 5000/);
    expect(() => formatarNumero(37.5)).toThrow(/inteiro/);

    expect(() => formatarMoeda(Number.NaN)).toThrow(/reais válido/);
    expect(() => formatarMoeda(Number.POSITIVE_INFINITY)).toThrow(/reais válido/);

    expect(() => formatarTelefone("+12015550123")).toThrow(/E\.164/);
    expect(() => formatarTelefone("(11) 98888-77")).toThrow(/E\.164/);
    expect(() => formatarTelefoneE164("(11) 98888-77")).toThrow(/DDI 55/);

    expect(() => formatarData("2026-02-30")).toThrow(/não existe no calendário/);
    expect(() => formatarData("25/12/2026")).toThrow(/AAAA-MM-DD/);

    expect(() => formatarDataHora("não sou data")).toThrow(/data\/hora válida/);
  });

  it("deve ocultar telefone na T5 preservando DDD e os 2 últimos dígitos (RF-10)", () => {
    // O mesmo telefone do exemplo do §3.6/matriz: …44 nos 2 últimos dígitos.
    expect(formatarTelefoneOculto("+5511988884444")).toBe("(11) 9••••-••44");
    expect(formatarTelefoneOculto("+551133335566")).toBe("(11) 3•••-••66");
    // Ocultar é formato de exibição: nenhum dígito do meio pode vazar.
    const oculto = formatarTelefoneOculto("+5511988884444");
    expect(oculto).not.toContain("8888");
  });

  it("deve formatar data prevista e data/hora de sorteio (DD/MM/AAAA e …HH:MM, §4.19)", () => {
    expect(formatarData("2026-12-25")).toBe("25/12/2026");
    expect(formatarData("2026-01-01")).toBe("01/01/2026");

    // 20:30 UTC = 17:30 no fuso de exibição (America/Sao_Paulo, UTC-3).
    expect(formatarDataHora("2026-11-08T20:30:00.000Z")).toBe("08/11/2026 17:30");
    expect(formatarDataHora(new Date("2026-11-08T20:30:00.000Z"))).toBe("08/11/2026 17:30");
  });
});
