/**
 * ET-9 · Teste 1 (unit): Button/Input renderizam estados básicos
 * (habilitado, desabilitado, foco) e propagam interação.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

describe("componente Button (ET-9)", () => {
  it("deve renderizar habilitado com rótulo e disparar clique", async () => {
    const aoClicar = vi.fn();
    render(<Button onClick={aoClicar}>Registrar venda</Button>);

    const botao = screen.getByRole("button", { name: "Registrar venda" });
    expect(botao).toBeEnabled();

    await userEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("deve ficar desabilitado e sem resposta quando disabled é true", async () => {
    const aoClicar = vi.fn();
    render(
      <Button disabled onClick={aoClicar}>
        Encerrar vendas
      </Button>
    );

    const botao = screen.getByRole("button", { name: "Encerrar vendas" });
    expect(botao).toBeDisabled();

    await userEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
  });
});

describe("componente Input (ET-9)", () => {
  it("deve renderizar focável com rótulo vinculado por id (a11y)", async () => {
    render(<Input id="telefone" rotulo="Telefone" placeholder="(11) 90000-0000" />);

    const campo = screen.getByLabelText("Telefone");
    expect(campo).toHaveAttribute("id", "telefone");

    await userEvent.click(campo);
    expect(campo).toHaveFocus();
  });

  it("deve exibir estado de erro com mensagem pt-BR vinculada por aria", () => {
    render(
      <Input id="nome" rotulo="Nome" erro="Informe um nome com pelo menos 2 letras" />
    );

    const campo = screen.getByLabelText("Nome");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("erro")
    );

    const mensagem = screen.getByText("Informe um nome com pelo menos 2 letras");
    expect(mensagem.id).toBe(campo.getAttribute("aria-describedby"));
  });
});
