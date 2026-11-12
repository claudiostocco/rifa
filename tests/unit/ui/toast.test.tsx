/**
 * ET-9 · Teste 2 (unit): Toast exibe mensagem em pt-BR e desaparece
 * após o timeout (timer testado com relógio fake) ou encerra por ação.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "@/components/ui/Toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("componente Toast (ET-9)", () => {
  it("deve exibir mensagem pt-BR acessível (role=status) e autoencerrar após 4 segundos", () => {
    vi.useFakeTimers();
    const aoEncerrar = vi.fn();

    act(() => {
      render(
        <Toast mensagem="Esse número acabou de ser vendido" tipo="erro" aoEncerrar={aoEncerrar} />,
      );
    });

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Esse número acabou de ser vendido");
    expect(aoEncerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    expect(aoEncerrar).toHaveBeenCalledTimes(1);
  });

  it("deve respeitar fechamento manual pelo botão (sem esperar o timeout)", async () => {
    const aoEncerrar = vi.fn();

    render(
      <Toast mensagem="Venda registrada com sucesso" tipo="sucesso" aoEncerrar={aoEncerrar} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(aoEncerrar).toHaveBeenCalledTimes(1);
  });
});
