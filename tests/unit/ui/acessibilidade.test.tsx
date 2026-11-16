/**
 * PL-2 · Auditoria automatizada do design system (SPEC RNF-03).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";

afterEach(cleanup);

const tema = readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf8");

function corDoTema(nome: string): string {
  const correspondencia = tema.match(new RegExp(`--color-${nome}:\\s*(#[0-9a-f]{6})`, "iu"));
  if (!correspondencia?.[1]) throw new Error(`Token de cor ausente no tema: ${nome}`);
  return correspondencia[1];
}

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((indice) => Number.parseInt(hex.slice(indice, indice + 2), 16) / 255);
  const linearizados = canais.map((canal) =>
    canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linearizados[0]! + 0.7152 * linearizados[1]! + 0.0722 * linearizados[2]!;
}

function contraste(primeiro: string, segundo: string): number {
  const [claro, escuro] = [luminancia(primeiro), luminancia(segundo)].sort((a, b) => b - a);
  return (claro! + 0.05) / (escuro! + 0.05);
}

describe("PL-2 · auditoria dos componentes de UI", () => {
  it("deve manter áreas interativas do design system com pelo menos 44 px", () => {
    render(
      <>
        <Button>Salvar</Button>
        <Button variante="secundario">Cancelar</Button>
        <Input id="nome" rotulo="Nome" />
        <Modal aberto aoFechar={() => undefined} titulo="Número 001">
          <Button>Confirmar</Button>
        </Modal>
        <Toast mensagem="Salvo." aoEncerrar={() => undefined} duracaoMs={0} />
      </>,
    );

    for (const nome of ["Salvar", "Cancelar", "Confirmar"]) {
      expect(screen.getByRole("button", { name: nome })).toHaveClass("min-h-[44px]");
      expect(screen.getByRole("button", { name: nome })).toHaveClass(
        "focus-visible:outline-2",
        "focus-visible:outline-marca",
      );
    }
    expect(screen.getByLabelText("Nome")).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "Fechar aviso" })).toHaveClass("h-11", "w-11");
  });

  it("deve assegurar contraste mínimo WCAG AA nos pares de texto dos componentes base", () => {
    const branco = "#ffffff";
    const papel = corDoTema("papel");
    const papelEscuro = corDoTema("papel-escuro");
    const tinta = corDoTema("tinta");
    const tintaSuave = corDoTema("tinta-suave");
    const marca = corDoTema("marca");
    const marcaForte = corDoTema("marca-forte");
    const marcaSuave = corDoTema("marca-suave");
    const verde = corDoTema("verde-venda");
    const verdeSuave = corDoTema("verde-venda-suave");
    const ouro = corDoTema("ouro");
    const ouroSuave = corDoTema("ouro-suave");

    render(
      <>
        <Button>Primário</Button>
        <Button variante="secundario">Secundário</Button>
        <Button variante="perigo">Perigo</Button>
        <Button variante="fantasma">Fantasma</Button>
        <Input id="campo" rotulo="Campo" placeholder="Exemplo" dica="Ajuda" erro="Inválido" />
        <Badge tipo="aberta">Aberta</Badge>
        <Badge tipo="encerrada">Encerrada</Badge>
        <Badge tipo="sorteada">Sorteada</Badge>
        <Badge tipo="marca">Marca</Badge>
        <Toast mensagem="Sucesso" tipo="sucesso" duracaoMs={0} />
        <Toast mensagem="Erro" tipo="erro" duracaoMs={0} />
        <Toast mensagem="Neutro" tipo="neutro" duracaoMs={0} />
      </>,
    );

    expect(screen.getByRole("button", { name: "Primário" })).toHaveClass(
      "text-white",
      "bg-marca",
      "hover:bg-marca-forte",
    );
    expect(screen.getByRole("button", { name: "Secundário" })).toHaveClass(
      "text-tinta",
      "bg-white",
      "hover:bg-papel-escuro",
    );
    expect(screen.getByRole("button", { name: "Perigo" })).toHaveClass(
      "text-red-700",
      "bg-white",
      "hover:bg-red-50",
    );
    expect(screen.getByRole("button", { name: "Fantasma" })).toHaveClass("text-tinta-suave");
    expect(screen.getByLabelText("Campo")).toHaveClass("text-tinta", "placeholder:text-tinta-suave");
    expect(screen.getByText("Aberta")).toHaveClass("bg-verde-venda-suave", "text-verde-venda");
    expect(screen.getByText("Encerrada")).toHaveClass("bg-papel-escuro", "text-tinta-suave");
    expect(screen.getByText("Sorteada")).toHaveClass("bg-ouro-suave", "text-ouro");
    expect(screen.getByText("Marca")).toHaveClass("bg-marca-suave", "text-marca-forte");
    expect(screen.getByText("Sucesso").parentElement).toHaveClass("bg-verde-venda", "text-white");
    expect(screen.getByText("Erro").parentElement).toHaveClass("bg-red-700", "text-white");
    expect(screen.getByText("Neutro").parentElement).toHaveClass("bg-tinta", "text-white");

    const pares = [
      [branco, marca],
      [branco, marcaForte],
      [tinta, branco],
      [tinta, papelEscuro],
      ["#b91c1c", branco],
      ["#b91c1c", "#fef2f2"],
      [tintaSuave, papel],
      [tintaSuave, branco],
      ["#b91c1c", branco],
      [verde, verdeSuave],
      [tintaSuave, papelEscuro],
      [ouro, ouroSuave],
      [marcaForte, marcaSuave],
      [branco, verde],
      [branco, "#b91c1c"],
      [branco, tinta],
    ] as const;

    for (const par of pares) {
      expect(contraste(par[0], par[1]), `${par[0]} sobre ${par[1]}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
