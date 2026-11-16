/**
 * VT-8 · Testes unitários da regra de busca/filtro da grade (SPEC §3.4.3 ·
 * §4.7 · matriz §5.2 RF-07) — função pura de lib/busca.ts.
 *
 * Teste 1 (caminho feliz): "051" casa com o número exato 51 (destaque);
 *   dígitos parciais de telefone revelam apenas os números daquela pessoa;
 *   texto livre casa com o nome, ignorando acentos/maiúsculas.
 * Teste 2 (borda/validação): busca sem resultado devolve lista vazia e
 *   destaque nulo; filtro "Disponíveis" oculta as vendidas; dígitos de
 *   telefone NUNCA realçam pastilha (destaque só para número exato); filtro
 *   e busca se combinam.
 */
import { describe, expect, it } from "vitest";

import { filtrarGrade } from "@/lib/busca";

const pastilhas = (quantidade: number) =>
  Array.from({ length: quantidade }, (_, indice) => ({
    numero: indice + 1,
    status: "disponivel" as const,
  }));

/** Maria tem 1 e 37; João tem 2. Os 97 demais ficam disponíveis. */
const VENDAS = new Map([
  [1, { nome: "Maria Silva", telefone: "+5511981112222" }],
  [2, { nome: "João Souza", telefone: "+5511973334444" }],
  [37, { nome: "Maria Silva", telefone: "+5511981112222" }],
]);

function comVendidas() {
  return pastilhas(100).map((pastilha) =>
    VENDAS.has(pastilha.numero) ? { ...pastilha, status: "vendido" as const } : pastilha,
  );
}

describe("filtrarGrade · Teste 1 (unit) — caminho feliz (§4.7)", () => {
  it("deve casar número exato com zeros à esquerda ('051' → 51) e destacar a pastilha", () => {
    const resultado = filtrarGrade(comVendidas(), VENDAS, "051", "todos");

    expect(resultado.visiveis).toEqual([{ numero: 51, status: "disponivel" }]);
    expect(resultado.destaque).toBe(51);
  });

  it("deve revelar APENAS os números da pessoa pelo telefone parcial ('98111' → Maria)", () => {
    const resultado = filtrarGrade(comVendidas(), VENDAS, "98111", "todos");

    expect(resultado.visiveis.map((pastilha) => pastilha.numero)).toEqual([1, 37]);
    // Telefone parcial nunca realça pastilha — destaque é só para número exato.
    expect(resultado.destaque).toBeNull();
  });

  it("deve casar nome do comprador ignorando acentos e maiúsculas ('joao souza')", () => {
    const resultado = filtrarGrade(comVendidas(), VENDAS, "JOÃO Souza", "todos");

    expect(resultado.visiveis.map((pastilha) => pastilha.numero)).toEqual([2]);
    expect(resultado.destaque).toBeNull();
  });
});

describe("filtrarGrade · Teste 2 (unit) — borda/validação (§4.7)", () => {
  it("deve devolver lista vazia e destaque nulo quando nada casa (busca 600 fora da faixa)", () => {
    const resultado = filtrarGrade(comVendidas(), VENDAS, "600", "todos");

    expect(resultado.visiveis).toEqual([]);
    expect(resultado.destaque).toBeNull();
  });

  it("deve ocultar as vendidas no filtro 'Disponíveis' e mostrar só vendidas em 'Vendidos'", () => {
    const disponiveis = filtrarGrade(comVendidas(), VENDAS, "", "disponiveis");
    expect(disponiveis.visiveis.some((pastilha) => pastilha.numero === 1)).toBe(false);
    expect(disponiveis.visiveis.some((pastilha) => pastilha.numero === 38)).toBe(true);
    expect(disponiveis.visiveis).toHaveLength(97);

    const vendidas = filtrarGrade(comVendidas(), VENDAS, "", "vendidos");
    expect(vendidas.visiveis.map((pastilha) => pastilha.numero)).toEqual([1, 2, 37]);
  });

  it("deve combinar busca e filtro (E): '98111' + Disponíveis fica vazio com Maria toda vendida", () => {
    // Maria tem 1 e 37; marcando-os vendidos, telefone dela + Disponíveis
    // não revela nada — os demais números não são dela.
    const resultado = filtrarGrade(comVendidas(), VENDAS, "98111", "disponiveis");

    expect(resultado.visiveis).toEqual([]);
    expect(resultado.destaque).toBeNull();
  });

  it("deve devolver tudo intacto com busca vazia e filtro 'Todos' (a busca nunca reordena)", () => {
    const resultado = filtrarGrade(comVendidas(), VENDAS, "", "todos");

    expect(resultado.visiveis).toHaveLength(100);
    expect(resultado.visiveis[0]?.numero).toBe(1);
    expect(resultado.visiveis[99]?.numero).toBe(100);
    expect(resultado.destaque).toBeNull();
  });
});
