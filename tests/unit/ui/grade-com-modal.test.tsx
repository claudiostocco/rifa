/**
 * VT-6 · Teste 2 (unit) — UI otimista da grade com rollback (SPEC §6/§3.4.5/
 * §4.5) · matriz §5.2 RF-05 · VT-6 do PLAN.
 *
 * Teste 2: a pastilha muda para "vendido" NA HORA do Salvar e, quando o
 *   servidor recusa (o nº foi vendido 1s antes por outro consultor), volta a
 *   "disponível" com rollback + toast prescrito "Esse número acabou de ser
 *   vendido" — e o alerta inline do modal segue visível (recusa de Server
 *   Action nunca é engolida, VT-4).
 *
 * A corrida é simulada de forma DETERMINÍSTICA: a Server Action é substituída
 * por uma promessa controlada que só resolve DEPOIS da asserção do estado
 * otimista (o "1s antes" do consultor). Os componentes reais da casa são
 * montados (GradeNumeros · ModalVenda · Modal · Input · Toast); apenas as
 * fronteiras de roteamento (next/navigation) e as Server Actions são
 * substituídas — sem mock de banco (Política de Testes §5.1).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EstadoVenda } from "@/actions/vendas";
import { registrarVenda, removerVenda } from "@/actions/vendas";
import { GradeComModal } from "@/components/GradeComModal";

const { roteador } = vi.hoisted(() => ({
  roteador: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
}));

vi.mock("@/actions/vendas", () => ({
  registrarVenda: vi.fn(),
  editarVenda: vi.fn(),
  removerVenda: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => roteador,
}));

/** Promessa controlada: o teste decide quando o servidor responde. */
function adiar<T>(): { promise: Promise<T>; resolver: (valor: T) => void } {
  let resolver!: (valor: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolver };
}

type NumerosProp = React.ComponentProps<typeof GradeComModal>["numeros"];
type VendasProp = React.ComponentProps<typeof GradeComModal>["vendas"];

const NUMEROS: NumerosProp = [
  { id: "n-1", numero: 1, status: "vendido" },
  { id: "n-37", numero: 37, status: "disponivel" },
];
const VENDAS: VendasProp = [{ numero: 1, nome: "Maria Silva", telefone: "+5511988887777" }];

async function abrirModalDoNumero037() {
  await userEvent.click(screen.getByRole("button", { name: "Número 037, disponível" }));
  const modal = screen.getByRole("dialog");
  // Preenchimento em evento único, como o `.fill()` do navegador (a máscara
  // progressiva formata o valor completo: "11977776666" → "(11) 97777-6666").
  fireEvent.change(within(modal).getByLabelText("Nome"), { target: { value: "João Pereira" } });
  fireEvent.change(within(modal).getByLabelText("Telefone"), {
    target: { value: "11977776666" },
  });
  return modal;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VT-6 · Teste 2 (unit) — UI otimista com rollback na corrida do mesmo número", () => {
  it("deve trocar a pastilha na hora ao salvar e reverter com rollback + toast quando o servidor recusa a corrida", async () => {
    const corrida = adiar<EstadoVenda>();
    vi.mocked(registrarVenda).mockReturnValue(corrida.promise);

    render(<GradeComModal quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    const modal = await abrirModalDoNumero037();
    await userEvent.click(within(modal).getByRole("button", { name: "Salvar" }));

    // OTIMISMO: pastilha vira verde com ✓ ANTES da resposta do servidor — a
    // action continua pendente (o consultor vendeu 1s antes; a recusa só
    // chega depois).
    const otimista = screen.getByRole("button", { name: "Número 037, vendido" });
    expect(otimista).toBeInTheDocument();
    expect(within(otimista).getByText("✓")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Número 037, disponível" }),
    ).not.toBeInTheDocument();

    // Pendência preservada: modal aberto em "Salvando…" com o payload correto.
    expect(within(modal).getByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(registrarVenda).toHaveBeenCalledWith({
      numeroId: "n-37",
      nome: "João Pereira",
      telefone: "+5511977776666",
    });

    // Servidor RECUSA (outro consultor venceu a corrida — RN-03): rollback da
    // pastilha + toast prescrito + alerta inline com o modal aberto.
    corrida.resolver({ ok: false, mensagem: "Esse número acabou de ser vendido" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Número 037, disponível" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Número 037, vendido" })).not.toBeInTheDocument();

    // Toast em erro (§4.5) e `role=alert` inline (VT-4 — recusa nunca engolida).
    expect(screen.getByRole("status")).toHaveTextContent("Esse número acabou de ser vendido");
    expect(within(modal).getByRole("alert")).toHaveTextContent("Esse número acabou de ser vendido");
    // O refresh do painel só acontece no sucesso — recusa não revalida.
    expect(roteador.refresh).not.toHaveBeenCalled();
  });

  it("deve manter a pastilha vendida após o sucesso do servidor (otimismo confirmado, sem voltar atrás)", async () => {
    const corrida = adiar<EstadoVenda>();
    vi.mocked(registrarVenda).mockReturnValue(corrida.promise);

    render(<GradeComModal quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    const modal = await abrirModalDoNumero037();
    await userEvent.click(within(modal).getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("button", { name: "Número 037, vendido" })).toBeInTheDocument();

    corrida.resolver({ ok: true, mensagem: "Venda registrada com sucesso." });

    // Sucesso: modal fecha, Toast de sucesso e a pastilha PERMANECE vendida —
    // o override otimista não recua (sem flicker) e o painel revalida.
    await screen.findByText("Venda registrada com sucesso.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Número 037, vendido" })).toBeInTheDocument();
    expect(roteador.refresh).toHaveBeenCalled();
  });

  it("deve antecipar a pastilha disponível na remoção e reverter com rollback + toast quando o servidor recusa", async () => {
    const remocao = adiar<EstadoVenda>();
    vi.mocked(removerVenda).mockReturnValue(remocao.promise);

    render(<GradeComModal quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    await userEvent.click(screen.getByRole("button", { name: "Número 001, vendido" }));
    const modal = screen.getByRole("dialog");
    await userEvent.click(within(modal).getByRole("button", { name: "Remover venda" }));
    await userEvent.click(within(modal).getByRole("button", { name: "Confirmar remoção" }));

    // OTIMISMO: pastilha volta a disponível na hora, com a action em voo.
    expect(screen.getByRole("button", { name: "Número 001, disponível" })).toBeInTheDocument();
    expect(removerVenda).toHaveBeenCalledWith("n-1");

    remocao.resolver({
      ok: false,
      mensagem: "Não foi possível remover a venda agora. Tente novamente em instantes.",
    });

    // ROLLBACK: a pastilha volta a vendida (a venda vigente permanece).
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Número 001, vendido" })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Número 001, disponível" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível remover a venda agora. Tente novamente em instantes.",
    );
    expect(within(modal).getByRole("alert")).toHaveTextContent(
      "Não foi possível remover a venda agora. Tente novamente em instantes.",
    );
    expect(roteador.refresh).not.toHaveBeenCalled();
  });
});
