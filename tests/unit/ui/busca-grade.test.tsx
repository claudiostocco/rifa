/**
 * VT-8 · Testes unitários da busca/filtro integrados à GradeComModal (SPEC
 * §3.4.3 · §4.7 · matriz §5.2 RF-07). Os 2 testes OBRIGATÓRIOS da tarefa são
 * E2E (tests/e2e/busca-filtros-t3.spec.ts); aqui a mesma regra é provada em
 * nível de componente, determinística e sem navegador.
 *
 * Os componentes reais da casa são montados; apenas next/navigation é
 * substituído (mesmo padrão do grade-com-modal.test.tsx da VT-6).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GradeComModal } from "@/components/GradeComModal";

const { roteador } = vi.hoisted(() => ({
  roteador: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => roteador,
}));

// VT-9 · o canal Realtime é transporte externo (websocket) — nos testes
// unitários ele é substituído por um canal morto (sem eventos).
vi.mock("@/lib/supabase/realtime", () => ({
  assinarMudancaNumeros: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

type NumerosProp = React.ComponentProps<typeof GradeComModal>["numeros"];
type VendasProp = React.ComponentProps<typeof GradeComModal>["vendas"];

const NUMEROS: NumerosProp = [
  { id: "n-1", numero: 1, status: "vendido" },
  { id: "n-2", numero: 2, status: "vendido" },
  { id: "n-37", numero: 37, status: "vendido" },
  { id: "n-51", numero: 51, status: "disponivel" },
  { id: "n-38", numero: 38, status: "disponivel" },
];

/** Maria tem 1 e 37 (mesma pessoa, telefones idênticos); João tem 2. */
const VENDAS: VendasProp = [
  { numero: 1, nome: "Maria Silva", telefone: "+5511981112222" },
  { numero: 37, nome: "Maria Silva", telefone: "+5511981112222" },
  { numero: 2, nome: "João Souza", telefone: "+5511973334444" },
];

describe("VT-8 · busca e filtro na grade da T3 (unit)", () => {
  it("deve destacar a pastilha do número exato ('051') e mostrar só ela na grade", async () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    await userEvent.type(screen.getByLabelText("Buscar"), "051");

    const destacada = screen.getByRole("button", { name: "Número 051, disponível" });
    expect(destacada).toBeInTheDocument();
    expect(destacada).toHaveClass("ring-2", "ring-marca");
    // Busca por número EXATO filtra a grade: nada mais é renderizado.
    expect(screen.queryByRole("button", { name: "Número 001, vendido" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 038, disponível" }),
    ).not.toBeInTheDocument();
  });

  it("deve revelar apenas os números da pessoa pelo telefone parcial", async () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    await userEvent.type(screen.getByLabelText("Buscar"), "98111");

    // Só as pastilhas de Maria: os accessible names provam quem ficou.
    expect(screen.queryByRole("button", { name: "Número 001, vendido" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Número 001, vendido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 037, vendido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Número 002, vendido" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 038, disponível" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 051, disponível" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Número/ })).toHaveLength(2);
    // Telefone parcial nunca realça pastilha (destaque é do número exato).
    expect(screen.queryByRole("button", { name: /ring/ })).not.toBeInTheDocument();
  });

  it("deve ocultar as vendidas no filtro 'Disponíveis' e restaurar em 'Todos'", async () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    await userEvent.click(screen.getByRole("button", { name: "Disponíveis" }));

    expect(screen.queryByRole("button", { name: "Número 001, vendido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Número 002, vendido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Número 037, vendido" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 038, disponível" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 051, disponível" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disponíveis" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect(screen.getByRole("button", { name: "Número 001, vendido" })).toBeInTheDocument();
  });

  it("deve apresentar estado vazio claro na busca sem resultado e restaurar a grade ao limpar", async () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    // "600": fora da faixa (1..100) e não está em nenhum telefone da rifa.
    await userEvent.type(screen.getByLabelText("Buscar"), "600");

    const vazio = screen.getByRole("status");
    expect(vazio).toHaveTextContent('Nenhum número encontrado para "600".');
    // A grade sai de cena inteira — nada "meio quebrado" no meio.
    expect(screen.queryByRole("button", { name: /Número/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Limpar busca e filtros" }));

    // Sem quebrar a grade: tudo volta, incluindo os três estados originais.
    expect(screen.getByRole("button", { name: "Número 001, vendido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 002, vendido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 037, vendido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 051, disponível" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 038, disponível" })).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar")).toHaveValue("");
  });

  it("deve filtrar por nome de comprador ('Maria') revelando só os números dela", async () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    await userEvent.type(screen.getByLabelText("Buscar"), "Maria");

    expect(screen.getByRole("button", { name: "Número 001, vendido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 037, vendido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Número 002, vendido" })).not.toBeInTheDocument();
  });
});
