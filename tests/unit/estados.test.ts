/**
 * FD-7 · Testes unitários da máquina de estados (SPEC §2.7, matriz §5.2 RF-08/RF-15).
 * Teste 1 (caminho feliz): transições válidas autorizadas —
 * aberta→encerrada→sorteada; encerrada→aberta; sorteada→encerrada (desfazer).
 * Teste 2 (recusa): transições inválidas — aberta→sorteada direto; reabrir
 * rifa sorteada; número estático (disponivel→disponivel / vendido→vendido).
 */
import { describe, expect, it } from "vitest";
import {
  podeTransicionarNumero,
  podeTransicionarRifa,
  transicionarNumero,
  transicionarRifa,
  transicoesNumero,
  transicoesRifa,
} from "@/lib/estados";

describe("FD-7 · lib/estados — máquina de estados (SPEC §2.7)", () => {
  it("deve autorizar as transições válidas de rifa (aberta→encerrada→sorteada, reabrir e desfazer) e de número (disponivel⇄vendido)", () => {
    // Ciclo completo F4: encerrar → sortear.
    expect(transicionarRifa("aberta", "encerrada")).toBe("encerrada");
    expect(transicionarRifa("encerrada", "sorteada")).toBe("sorteada");
    // Reabrir e desfazer (RF-08/RF-15).
    expect(transicionarRifa("encerrada", "aberta")).toBe("aberta");
    expect(transicionarRifa("sorteada", "encerrada")).toBe("encerrada");

    // Número: venda e remoção da venda.
    expect(transicionarNumero("disponivel", "vendido")).toBe("vendido");
    expect(transicionarNumero("vendido", "disponivel")).toBe("disponivel");

    expect(podeTransicionarRifa("aberta", "encerrada")).toBe(true);
    expect(podeTransicionarRifa("sorteada", "encerrada")).toBe(true);
    expect(podeTransicionarNumero("disponivel", "vendido")).toBe(true);

    expect(transicoesRifa("encerrada")).toEqual(["aberta", "sorteada"]);
    expect(transicoesNumero("disponivel")).toEqual(["vendido"]);
  });

  it("deve recusar transições inválidas de rifa e de número com erro em pt-BR", () => {
    // Sortear sem encerrar (§2.7: nunca aberta→sorteada direto).
    expect(() => transicionarRifa("aberta", "sorteada")).toThrow(
      /"aberta" não pode ir para "sorteada"/,
    );
    // Reabrir rifa sorteada — precisa desfazer antes.
    expect(() => transicionarRifa("sorteada", "aberta")).toThrow(
      /"sorteada" não pode ir para "aberta"/,
    );
    // Sem estado estático: a única saída de 'aberta' é encerrar.
    expect(() => transicionarRifa("aberta", "aberta")).toThrow(/transições permitidas/);

    expect(() => transicionarNumero("disponivel", "disponivel")).toThrow(
      /"disponivel" não pode ir para "disponivel"/,
    );
    expect(() => transicionarNumero("vendido", "vendido")).toThrow(
      /"vendido" não pode ir para "vendido"/,
    );

    expect(podeTransicionarRifa("aberta", "sorteada")).toBe(false);
    expect(podeTransicionarRifa("sorteada", "aberta")).toBe(false);
    expect(podeTransicionarNumero("vendido", "vendido")).toBe(false);
  });
});
