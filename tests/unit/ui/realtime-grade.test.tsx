/**
 * VT-9 · Testes unitários da resposta ao vivo na T3 (SPEC §4.16 RF-18 ·
 * matriz §5.2 RF-18 — a linha E2E está em tests/e2e/realtime-t3.spec.ts e a
 * de payload anon em tests/integration/vt9-realtime.test.ts).
 *
 * Aqui o canal Realtime é substituído por um FAKE CONTROLADO: o teste guarda
 * o callback registrado por `assinarMudancaNumeros` e o dispara na hora,
 * provando o comportamento da UI sem websocket. Componentes reais da casa
 * montados; apenas o transporte, o roteador e as Server Actions são
 * substituídos (padrão VT-6).
 *
 * Cenários:
 *   1. evento "vendido" para número livre → pastilha vira verde ✓ na hora
 *      + `router.refresh()` (grade/resumo re-renderizam no servidor);
 *   2. modal aberto no número vendido ao vivo → alerta prescrito
 *      "Esse número acabou de ser vendido" (§4.5) inline + toast;
 *   3. evento que CONFIRMA ação nossa em voo não a sobrepõe (sem alerta
 *      espúrio nem flicker); evento que a SUPEROU descarta o override —
 *      a verdade chega pelo refresh (nunca mascara o banco);
 *   4. a própria gravação do organizador NÃO dispara o alerta do modal
 *      (o evento que chega é a venda dele chegando ao banco).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EstadoVenda } from "@/actions/vendas";
import { GradeComModal } from "@/components/GradeComModal";
import { assinarMudancaNumeros, type MudancaStatusNumeros } from "@/lib/supabase/realtime";

const { roteador } = vi.hoisted(() => ({
  roteador: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => roteador,
}));

vi.mock("@/actions/vendas", () => ({
  registrarVenda: vi.fn(),
  editarVenda: vi.fn(),
  removerVenda: vi.fn(),
}));

type Mudanca = MudancaStatusNumeros;

/** Fake controlado: captura o callback de assinatura para o teste disparar. */
let aoMudar: ((mudanca: Mudanca) => void) | null = null;

vi.mock("@/lib/supabase/realtime", async (importarOriginal) => {
  const real = await importarOriginal<typeof import("@/lib/supabase/realtime")>();
  return {
    ...real,
    assinarMudancaNumeros: vi.fn(
      (_rifaId: string, callback: (mudanca: Mudanca) => void) => {
        aoMudar = callback;
        return { unsubscribe: vi.fn() };
      },
    ),
  };
});

function evento(status: "disponivel" | "vendido", numero = 37): Mudanca {
  return {
    type: "UPDATE",
    resposta: { id: `n-${numero}`, rifa_id: "r-1", numero, status },
  };
}

type NumerosProp = React.ComponentProps<typeof GradeComModal>["numeros"];
type VendasProp = React.ComponentProps<typeof GradeComModal>["vendas"];

const NUMEROS: NumerosProp = [
  { id: "n-1", numero: 1, status: "vendido" },
  { id: "n-37", numero: 37, status: "disponivel" },
];
const VENDAS: VendasProp = [{ numero: 1, nome: "Maria Silva", telefone: "+5511981112222" }];

/** Dispara o evento ao vivo dentro de `act` — o DOM reage sincronamente. */
function mudancaAoVivo(status: "disponivel" | "vendido", numero = 37): void {
  act(() => {
    aoMudar?.(evento(status, numero));
  });
}

describe("VT-9 · resposta ao vivo na T3 (unit, canal controlado)", () => {
  it("deve pintar a pastilha de verde na hora do evento 'vendido' e revalidar o painel sem F5", () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);
    expect(vi.mocked(assinarMudancaNumeros)).toHaveBeenCalledWith(
      "r-1",
      expect.any(Function),
    );

    const refreshAntes = roteador.refresh.mock.calls.length;
    mudancaAoVivo("vendido");

    // Pastilha vira verde ✓ NA HORA (override ao vivo, mecanismo da VT-6)…
    const vendida = screen.getByRole("button", { name: "Número 037, vendido" });
    expect(vendida).toBeInTheDocument();
    expect(within(vendida).getByText("✓")).toBeInTheDocument();
    // …e o painel re-renderiza no servidor (RF-18: resumo responde ao vivo).
    expect(roteador.refresh.mock.calls.length).toBeGreaterThan(refreshAntes);
  });

  it("deve avisar o modal aberto com o texto prescrito quando o número é vendido por outra tela", async () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    await userEvent.click(screen.getByRole("button", { name: "Número 037, disponível" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).queryByRole("alert")).not.toBeInTheDocument();

    mudancaAoVivo("vendido");

    // Alerta inline com o modal aberto (recusa nunca engolida — padrão VT-4)
    // e toast pt-BR com o mesmo texto prescrito (§4.5).
    expect(within(modal).getByRole("alert")).toHaveTextContent(
      "Esse número acabou de ser vendido",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Esse número acabou de ser vendido");
  });

  it("deve descartar o otimismo da ação em voo quando um evento a SUPERAR (nunca mascara o banco)", async () => {
    const { registrarVenda } = await import("@/actions/vendas");
    let resolverVenda!: (resultado: EstadoVenda) => void;
    vi.mocked(registrarVenda).mockReturnValue(
      new Promise<EstadoVenda>((resolve) => {
        resolverVenda = resolve;
      }),
    );

    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    // Ação em voo: otimismo da VT-6 { de: disponivel, para: vendido }.
    await userEvent.click(screen.getByRole("button", { name: "Número 037, disponível" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Nome"), { target: { value: "João Pereira" } });
    fireEvent.change(within(modal).getByLabelText("Telefone"), {
      target: { value: "11977776666" },
    });
    await userEvent.click(within(modal).getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("button", { name: "Número 037, vendido" })).toBeInTheDocument();

    // O mundo passou por cima: enquanto a ação nossa estava em voo, o número
    // foi vendido E REMOVIDO por outra tela (estado final disponivel). Sem
    // alerta espúrio no modal — o primeiro evento é da nossa própria escrita.
    mudancaAoVivo("vendido");
    expect(within(modal).queryByRole("alert")).not.toBeInTheDocument();
    mudancaAoVivo("disponivel");

    // O override da ação em voo foi descartado: a pastilha mostra o estado
    // que o evento trouxe — nunca o otimismo dela por cima do banco.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Número 037, disponível" })).toBeInTheDocument();
    });

    resolverVenda({ ok: false, mensagem: "Esse número acabou de ser vendido" });
    await waitFor(() => {
      expect(within(modal).getByRole("alert")).toHaveTextContent(
        "Esse número acabou de ser vendido",
      );
    });
  });

  it("deve manter o otimismo da ação em voo quando o evento a CONFIRMA (sem flicker)", async () => {
    const { removerVenda } = await import("@/actions/vendas");
    let resolverRemocao!: (resultado: EstadoVenda) => void;
    vi.mocked(removerVenda).mockReturnValue(
      new Promise<EstadoVenda>((resolve) => {
        resolverRemocao = resolve;
      }),
    );

    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    // Remoção em voo: otimismo { de: vendido, para: disponivel }.
    await userEvent.click(screen.getByRole("button", { name: "Número 001, vendido" }));
    const modal = screen.getByRole("dialog");
    await userEvent.click(within(modal).getByRole("button", { name: "Remover venda" }));
    await userEvent.click(within(modal).getByRole("button", { name: "Confirmar remoção" }));
    expect(screen.getByRole("button", { name: "Número 001, disponível" })).toBeInTheDocument();

    // O evento do banco confirma a remoção: o override permanece válido
    // (display estável, sem voltar ao vendido) e o refresh é chamado.
    const refreshAntes = roteador.refresh.mock.calls.length;
    mudancaAoVivo("disponivel", 1);
    expect(screen.getByRole("button", { name: "Número 001, disponível" })).toBeInTheDocument();
    expect(roteador.refresh.mock.calls.length).toBeGreaterThan(refreshAntes);

    resolverRemocao({ ok: true, mensagem: "Venda removida com sucesso." });
    await screen.findByText("Venda removida com sucesso.");
  });

  it("deve ignorar evento para número fora da grade e status fora do domínio (defensiva)", () => {
    render(<GradeComModal rifaId="r-1" quantidade={100} numeros={NUMEROS} vendas={VENDAS} />);

    // Número 500 não existe na rifa de 100 — ignorado, sem crash.
    mudancaAoVivo("vendido", 500);
    expect(screen.getByRole("button", { name: "Número 037, disponível" })).toBeInTheDocument();
    // Status fora do domínio do CHECK não muda nada.
    act(() => {
      aoMudar?.({
        type: "UPDATE",
        resposta: { id: "n-37", rifa_id: "r-1", numero: 37, status: "arquivada" },
      });
    });
    expect(screen.getByRole("button", { name: "Número 037, disponível" })).toBeInTheDocument();
  });
});
