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
  formatarFrasePremio,
  formatarMoeda,
  formatarNumero,
  formatarQuantidade,
  formatarTelefone,
  formatarTelefoneE164,
  formatarTelefoneOculto,
  formatarValorDigitacao,
  mascaraMoedaDigitacao,
  mascaraTelefoneDigitacao,
  valorDeTextoMoeda,
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
    expect(formatarTelefone(formatarTelefoneE164("(11) 3333-4444"))).toBe("(11) 3333-4444");
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

  it("deve aplicar a máscara progressivamente enquanto o organizador digita o WhatsApp", () => {
    // Digitação dígito a dígito (celular, 11 dígitos — grupos 5-4)
    expect(mascaraTelefoneDigitacao("")).toBe("");
    expect(mascaraTelefoneDigitacao("1")).toBe("(1");
    expect(mascaraTelefoneDigitacao("11")).toBe("(11");
    expect(mascaraTelefoneDigitacao("119")).toBe("(11) 9");
    expect(mascaraTelefoneDigitacao("1198")).toBe("(11) 98");
    expect(mascaraTelefoneDigitacao("1198888")).toBe("(11) 98888");
    expect(mascaraTelefoneDigitacao("11988887")).toBe("(11) 98888-7");
    expect(mascaraTelefoneDigitacao("11988887777")).toBe("(11) 98888-7777");

    // Máscara fixa do celular (grupos 5-4 do §4.19): com o fixo de 8 dígitos,
    // o 9º dígito fica pendente até ser digitado — sem reformatação no meio
    expect(mascaraTelefoneDigitacao("1133334444")).toBe("(11) 33334-444");
    expect(mascaraTelefoneDigitacao("(11) 98888-7777")).toBe("(11) 98888-7777");
  });

  it("deve ignorar caracteres não numéricos e limitar a 11 dígitos na máscara de digitação", () => {
    expect(mascaraTelefoneDigitacao("11) 98888-7777x")).toBe("(11) 98888-7777");
    expect(mascaraTelefoneDigitacao("119888877779999")).toBe("(11) 98888-7777");
    expect(mascaraTelefoneDigitacao("abc")).toBe("");
    // Nenhum dígito do meio é perdido pela máscara (composição com E164)
    expect(formatarTelefoneE164(mascaraTelefoneDigitacao("11988887777"))).toBe("+5511988887777");
  });
});

describe("FD-13 · lib/formato — digitação da T2 (moeda, quantidade e frase do prêmio)", () => {
  it("deve aplicar a máscara progressiva de centavos, o prefill da edição, a quantidade agrupada e a frase do prêmio (§3.4.1/§3.5)", () => {
    // Digitação dígito a dígito (cada novo dígito entra como centavo)
    expect(mascaraMoedaDigitacao("")).toBe("");
    expect(mascaraMoedaDigitacao("8")).toBe("0,08");
    expect(mascaraMoedaDigitacao("850")).toBe("8,50");
    expect(mascaraMoedaDigitacao("85050")).toBe("850,50");
    // Re-mascarar o texto já exibido fecha o ciclo de edição
    expect(mascaraMoedaDigitacao("R$ 1.000,00")).toBe("1.000,00");
    expect(mascaraMoedaDigitacao("99999999999999")).toBe("99.999.999,99"); // limite do numeric(10,2)

    // Prefill do modo edição: mesmo formato que a máscara produz
    expect(formatarValorDigitacao(850)).toBe("850,00");
    expect(formatarValorDigitacao(10.5)).toBe("10,50");
    // Ida e volta: banco → prefill → máscara → gravação
    expect(formatarValorDigitacao(valorDeTextoMoeda(mascaraMoedaDigitacao("85050")))).toBe(
      "850,50",
    );

    expect(formatarQuantidade(100)).toBe("100");
    expect(formatarQuantidade(1000)).toBe("1.000");
    expect(formatarQuantidade(5000)).toBe("5.000");

    // Frase do prêmio por rótulo (o organizador vê o que o comprador verá);
    // o Intl separa "R$" do valor com espaço inquebrável — normalizado igual
    // ao restante da suíte.
    expect(normalizar(formatarFrasePremio("estimado", "Forno elétrico", 850))).toBe(
      "Forno elétrico — valor estimado R$ 850,00",
    );
    expect(normalizar(formatarFrasePremio("mais_de", "Forno elétrico", 500))).toBe(
      "Mais de R$ 500,00 — Forno elétrico",
    );
    expect(normalizar(formatarFrasePremio("ate", "Cesta natalina", 250))).toBe(
      "Até R$ 250,00 — Cesta natalina",
    );
  });

  it("deve recusar valor não finito, quantidade não inteira/negativa e máscara vazia com erro em pt-BR", () => {
    expect(() => formatarValorDigitacao(Number.NaN)).toThrow(/reais válido/);
    expect(() => formatarValorDigitacao(Number.POSITIVE_INFINITY)).toThrow(/reais válido/);
    // Mesmo domínio da moeda dentro da frase do prêmio
    expect(() => formatarFrasePremio("estimado", "Forno", Number.NaN)).toThrow(/reais válido/);

    expect(() => formatarQuantidade(25.5)).toThrow(/inteiro/);
    expect(() => formatarQuantidade(-1)).toThrow(/não negativo/);

    // Texto sem dígitos válidos vira NaN (contrato Zod recusa depois)
    expect(Number.isNaN(valorDeTextoMoeda("sem número"))).toBe(true);
  });
});
