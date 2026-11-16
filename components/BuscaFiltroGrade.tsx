"use client";

/**
 * VT-8 · Busca e filtros da grade da T3 (SPEC §3.4.3 · §4.7): uma caixa única
 * (número exato, nome ou telefone do comprador) + chips Todos/Disponíveis/
 * Vendidos com `aria-pressed` (mesmo padrão dos chips da T1, FD-12).
 * Apresentacional: o estado vive no consumidor (GradeComModal) e a regra de
 * correspondência é a função pura `filtrarGrade` (lib/busca.ts).
 */
import { Input } from "@/components/ui/Input";
import type { FiltroEstado } from "@/lib/busca";

const FILTROS: readonly { valor: FiltroEstado; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "disponiveis", rotulo: "Disponíveis" },
  { valor: "vendidos", rotulo: "Vendidos" },
];

type Props = {
  busca: string;
  filtro: FiltroEstado;
  aoDigitar: (valor: string) => void;
  aoFiltrar: (valor: FiltroEstado) => void;
};

export function BuscaFiltroGrade({ busca, filtro, aoDigitar, aoFiltrar }: Props) {
  return (
    <section
      aria-label="Busca e filtros da grade"
      className="rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <Input
        id="busca-grade"
        rotulo="Buscar"
        type="search"
        placeholder="Número, nome ou telefone"
        autoComplete="off"
        value={busca}
        onChange={(evento) => aoDigitar(evento.target.value)}
      />

      <nav
        aria-label="Filtro por estado dos números"
        className="mt-3 flex gap-2 overflow-x-auto pb-1"
      >
        {FILTROS.map(({ valor, rotulo }) => (
          <button
            key={valor}
            type="button"
            aria-pressed={filtro === valor}
            onClick={() => aoFiltrar(valor)}
            className={[
              "min-h-[36px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
              filtro === valor
                ? "border-marca bg-marca text-white"
                : "border-linha bg-white text-tinta-suave hover:border-marca/40 hover:text-tinta",
            ].join(" ")}
          >
            {rotulo}
          </button>
        ))}
      </nav>
    </section>
  );
}
