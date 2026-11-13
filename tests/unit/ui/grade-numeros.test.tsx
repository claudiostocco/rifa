/**
 * VT-3 · Testes unitários da GradeNumeros (matriz §5.2 — RF-02/§3.4.4).
 *
 * Teste 1 (caminho feliz): 100 pastilhas com formatarNumero; rifa de 5.000
 *   pagina em blocos de 100 com navegação anterior/próxima e salto por bloco.
 * Teste 2 (borda/erro): pastilha vendida tem estilo e rótulo acessível (aria)
 *   distintos da disponível; número fora da faixa não é renderizado.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EsqueletoGrade, GradeNumeros } from "@/components/GradeNumeros";
import type { StatusNumero } from "@/lib/estados";

const pastilhas = (quantidade: number, status: StatusNumero = "disponivel") =>
  Array.from({ length: quantidade }, (_, indice) => ({ numero: indice + 1, status }));

describe("GradeNumeros · Teste 1 (unit) — caminho feliz (§3.4.4)", () => {
  it("deve renderizar as 100 pastilhas de uma rifa de 100 com formatarNumero e sem navegação", () => {
    render(<GradeNumeros numeros={pastilhas(100)} quantidade={100} aoTocarNumero={vi.fn()} />);

    // Exatamente 100 pastilhas — os botões de navegação não existem nesta rifa.
    expect(screen.getAllByRole("button", { name: /Número/ })).toHaveLength(100);
    expect(screen.getByRole("button", { name: "Número 001, disponível" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 037, disponível" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 100, disponível" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Anterior/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Próxima/ })).not.toBeInTheDocument();
  });

  it("deve paginar rifa de 5.000 em blocos de 100 com navegação anterior/próxima e salto por bloco", async () => {
    const aoTocarNumero = vi.fn();
    render(
      <GradeNumeros numeros={pastilhas(5000)} quantidade={5000} aoTocarNumero={aoTocarNumero} />,
    );

    // Bloco 1: só 001–100 no DOM (RNF-04 — a grade nunca renderiza 5.000 células).
    expect(screen.getAllByRole("button", { name: /Número/ })).toHaveLength(100);
    expect(screen.getByRole("button", { name: "Número 001, disponível" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 101, disponível" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled();

    // Navegação próxima revela o bloco 101–200 e abandona o primeiro.
    await userEvent.click(screen.getByRole("button", { name: /Próxima/ }));
    expect(screen.getByRole("button", { name: "Número 101, disponível" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 001, disponível" }),
    ).not.toBeInTheDocument();

    // Salto por bloco (rifas ≥ 1.000): o select leva ao último bloco 4901–5000.
    await userEvent.selectOptions(screen.getByLabelText("Ir para o bloco de números"), "49");
    expect(screen.getByRole("button", { name: "Número 5000, disponível" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 4900, disponível" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Próxima/ })).toBeDisabled();

    // Anterior volta ao penúltimo bloco (4801–4900); o toque dispara a ação
    // com o número tocado.
    await userEvent.click(screen.getByRole("button", { name: /Anterior/ }));
    expect(screen.getByRole("button", { name: "Número 4801, disponível" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Número 4801, disponível" }));
    expect(aoTocarNumero).toHaveBeenCalledTimes(1);
    expect(aoTocarNumero).toHaveBeenCalledWith(4801);
  });
});

describe("GradeNumeros · Teste 2 (unit) — borda/erro (§3.4.4)", () => {
  it("deve distinguir pastilha vendida da disponível em estilo e rótulo acessível (aria)", () => {
    // A ocorrência repetida do 37 (disponível antes, vendido depois) é
    // conservada como a última — mesma semântica do estado vigente do banco.
    const dados = [...pastilhas(100), { numero: 37, status: "vendido" as StatusNumero }];
    render(<GradeNumeros numeros={dados} quantidade={100} aoTocarNumero={vi.fn()} />);

    const vendida = screen.getByRole("button", { name: "Número 037, vendido" });
    const disponivel = screen.getByRole("button", { name: "Número 042, disponível" });

    // Rótulos (aria) distintos por estado — a leitura em tela conta o estado.
    expect(vendida).toHaveAccessibleName("Número 037, vendido");
    expect(disponivel).toHaveAccessibleName("Número 042, disponível");

    // Estilos distintos: verde de venda na vendida; fundo claro na disponível.
    expect(vendida).toHaveClass("bg-verde-venda-suave", "text-verde-venda");
    expect(disponivel).toHaveClass("bg-white", "text-tinta");
    expect(vendida).not.toHaveClass("bg-white");

    // Marcador visual ✓ presente só na vendida (§3.4.4).
    expect(within(vendida).getByText("✓")).toBeInTheDocument();
    expect(within(disponivel).queryByText("✓")).not.toBeInTheDocument();
  });

  it("não deve renderizar número fora da faixa 1..quantidade nem crashar na formatação", () => {
    // 0 e 101 estão fora da faixa da rifa de 100 (101 inclusive carregaria
    // "vendido" — estado irrelevante fora da numeração da rifa).
    const dados = [
      ...pastilhas(100),
      { numero: 0, status: "vendido" as StatusNumero },
      { numero: 101, status: "vendido" as StatusNumero },
    ];
    render(<GradeNumeros numeros={dados} quantidade={100} aoTocarNumero={vi.fn()} />);

    // Apenas as 100 pastilhas legítimas; 000 e 101 nunca aparecem — e o
    // formatarNumero(0), que lançaria erro, jamais é chamado.
    expect(screen.getAllByRole("button", { name: /Número/ })).toHaveLength(100);
    expect(screen.queryByRole("button", { name: /Número 101/ })).not.toBeInTheDocument();
    expect(screen.queryByText("000")).not.toBeInTheDocument();
  });
});

describe("GradeNumeros · extras (borda)", () => {
  it("deve exibir o estado de exibição 'sorteado' (§2.7) sobre o status da tabela com destaque dourado", () => {
    render(
      <GradeNumeros
        numeros={pastilhas(50)}
        quantidade={50}
        numeroSorteado={23}
        aoTocarNumero={vi.fn()}
      />,
    );

    const premiada = screen.getByRole("button", { name: "Número 023, sorteado" });
    expect(premiada).toHaveClass("bg-ouro-suave", "text-ouro");
    expect(within(premiada).getByText("🏆")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 024, disponível" })).toBeInTheDocument();
  });

  it("deve renderizar o skeleton estável com 100 células e anúncio de carregamento", () => {
    render(<EsqueletoGrade />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando os números…");
    expect(document.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(100);
  });
});
