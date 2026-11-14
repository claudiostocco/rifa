/**
 * SR-5 · RoletaSorteio (RF-09a) — matriz §5.2 "RF-09a roleta" + Teste 2 do
 * PLAN.
 *
 * Teste 2 (borda): roleta sem participantes renderiza NEUTRA (sem giro, sem
 *   nomes do ciclo), NUNCA bloqueia o fluxo (fechar → toast prescrito +
 *   painel revalidado — a gravação já aconteceu, SR-3) e honra
 *   `prefers-reduced-motion` (revela direto, sem animação).
 * Extra (Cenário A da matriz em nível de componente, determinístico): com
 *   fake timers o giro desacelera e para EXATAMENTE no snapshot servido pelo
 *   servidor — nunca em uma entrada qualquer do ciclo (§4.9).
 *
 * Os componentes reais da casa são montados (RoletaSorteio · Modal ·
 * Button · Toast); apenas as fronteiras de roteamento (next/navigation) e as
 * Server Actions são substituídas — sem mock de banco (Política de Testes
 * §5.1).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sortear, type EstadoSorteio } from "@/actions/sorteio";
import { BotoesCiclo } from "@/components/BotoesCiclo";
import {
  RoletaSorteio,
  cronogramaGiro,
  type ParticipanteRoleta,
} from "@/components/RoletaSorteio";
import type { ResultadoSorteio } from "@/lib/schemas";

const { roteador } = vi.hoisted(() => ({
  roteador: { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => roteador,
}));

vi.mock("@/actions/sorteio", () => ({
  sortear: vi.fn(),
}));

vi.mock("@/actions/ciclo", () => ({
  encerrarVendas: vi.fn(),
  reabrirVendas: vi.fn(),
}));

const PARTICIPANTES: ParticipanteRoleta[] = [
  { nome: "Maria Silva", numero: 23 },
  { nome: "João Souza", numero: 47 },
  { nome: "Ana Lima", numero: 5 },
];

const BASE_RESULTADO = {
  rifaId: "11111111-1111-1111-1111-111111111111",
  telefoneVencedor: "+5511988887777",
  totalVendidos: 12,
  sorteadoEm: "2026-11-14T18:00:00Z",
  anuladoEm: null,
} satisfies Pick<
  ResultadoSorteio,
  "rifaId" | "telefoneVencedor" | "totalVendidos" | "sorteadoEm" | "anuladoEm"
>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SR-5 · Teste 2 (unit) — borda: roleta sem participantes (§4.9 RF-09a)", () => {
  it("deve renderizar neutra (sem giro e sem nomes do ciclo), revelar o resultado servido e nunca bloquear o fluxo", async () => {
    const resultado: ResultadoSorteio = { ...BASE_RESULTADO, numero: 47, nomeVencedor: "Maria Silva" };
    const sucesso: EstadoSorteio = {
      ok: true,
      mensagem: "Sorteio realizado com sucesso.",
      resultado,
    };
    vi.mocked(sortear).mockResolvedValue(sucesso);

    // Fluxo real da T3: etapa encerrada, confirmação → Server Action → roleta.
    render(
      <BotoesCiclo
        rifaId="r-1"
        status="encerrada"
        vendidos={0}
        qtdMinima={30}
        participantes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Realizar Sorteio" }));
    const confirmacao = screen.getByRole("dialog");
    expect(
      within(confirmacao).getByText("O sorteio será feito entre 0 números vendidos."),
    ).toBeVisible();
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Confirmar" }));

    // NEUTRA: sem giro — o resultado servido aparece na hora (timers reais,
    // sem nenhum avanço artificial).
    await waitFor(() => {
      expect(screen.getByText("Número sorteado:")).toBeVisible();
    });
    expect(screen.getByText("047")).toBeVisible();
    expect(screen.getByText("Maria Silva")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Resultado do sorteio" })).toBeVisible();

    // 0 nomes de participante no giro (matriz: "0 exibidos quando sem
    // participantes") — o único nome visível é o do snapshot servido.
    expect(screen.queryByText(/^(Maria|João|Ana)$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sorteando o vencedor…" })).not.toBeInTheDocument();

    // NUNCA bloqueia o fluxo: fechar volta ao painel, com o toast prescrito
    // da gravação e a revalidação do estado real do banco (badge 🎉, grade 🏆).
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao painel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Sorteio realizado com sucesso.");
    expect(roteador.refresh).toHaveBeenCalled();
    expect(sortear).toHaveBeenCalledWith("r-1");
  });
});

describe("SR-5 · roleta honra prefers-reduced-motion (RNF-03/PL-2)", () => {
  it("deve revelar o resultado direto, sem giro e sem nomes do ciclo, quando o usuário pede menos movimento", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(((consulta: string) => ({
      matches: consulta === "(prefers-reduced-motion: reduce)",
      media: consulta,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia);

    const aoEncerrar = vi.fn();
    const resultado: ResultadoSorteio = { ...BASE_RESULTADO, numero: 5, nomeVencedor: "Ana Lima" };
    render(
      <RoletaSorteio
        participantes={PARTICIPANTES}
        resultado={resultado}
        aoEncerrar={aoEncerrar}
      />,
    );

    // Sem animação: revelação imediata do snapshot servido…
    expect(screen.getByText("Número sorteado:")).toBeVisible();
    expect(screen.getByText("005")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Resultado do sorteio" })).toBeVisible();
    // …e NENHUM nome de participante girando (a lista nunca chega à tela).
    expect(screen.queryByText(/^(Maria|João|Ana)$/)).not.toBeInTheDocument();

    // O fechamento segue disponível (nunca bloqueia).
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao painel" }));
    expect(aoEncerrar).toHaveBeenCalledTimes(1);
  });
});

describe("SR-5 · Cenário A (matriz §5.2, nível de componente) — desacelera no resultado servido", () => {
  it("deve girar pelos primeiros nomes dos participantes e parar exatamente no snapshot gravado pelo servidor", () => {
    vi.useFakeTimers();

    const aoEncerrar = vi.fn();
    // O ponto final NÃO pertence ao ciclo (número 99 e vencedor fora da
    // lista): se a roleta parar nele, é porque exibiu o PAYLOAD do servidor —
    // nunca uma entrada qualquer do giro (§4.9 "emoção é presentacional").
    const resultado: ResultadoSorteio = {
      ...BASE_RESULTADO,
      numero: 99,
      nomeVencedor: "Beatriz Costa",
    };
    render(
      <RoletaSorteio
        participantes={PARTICIPANTES}
        resultado={resultado}
        aoEncerrar={aoEncerrar}
      />,
    );

    // Janela prescrita de 3–5 s (§4.9): o cronograma do giro fica dentro dela
    // com folga para a pausa final de revelação.
    const atrasos = cronogramaGiro();
    const totalGiro = atrasos.reduce((total, atraso) => total + atraso, 0);
    expect(totalGiro).toBeGreaterThanOrEqual(3000);
    expect(totalGiro).toBeLessThanOrEqual(4500);

    // GIRO: primeiros nomes dos participantes (§4.9), sem revelação.
    expect(screen.getByRole("heading", { name: "Sorteando o vencedor…" })).toBeVisible();
    expect(screen.getByText(/^(Maria|João|Ana)$/)).toBeVisible();
    expect(screen.queryByText("Número sorteado:")).not.toBeInTheDocument();
    expect(screen.queryByText("099")).not.toBeInTheDocument();

    // Avança o cronograma exportado (puro) passo a passo — determinístico.
    for (const atraso of atrasos) {
      act(() => {
        vi.advanceTimersByTime(atraso);
      });
    }
    // Ainda girando (a pausa final de revelação não foi atingida).
    expect(screen.queryByText("Número sorteado:")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // PAROU no resultado SERVIDO (único e auditável, RNF-06): número e nome
    // do payload — que não existem no ciclo.
    expect(screen.getByText("Número sorteado:")).toBeVisible();
    expect(screen.getByText("099")).toBeVisible();
    expect(screen.getByText("Beatriz Costa")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Resultado do sorteio" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Voltar ao painel" }));
    expect(aoEncerrar).toHaveBeenCalledTimes(1);
  });
});
