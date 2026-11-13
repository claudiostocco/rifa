"use client";

/**
 * VT-3 · Grade de números (SPEC §3.4.4, RNF-03/RNF-04): pastilhas 001..N em
 * blocos de 100 com navegação "‹ anterior / próxima ›" e salto por bloco
 * (rifas ≥ 1.000). Componente client (paginação e toque), porém puramente
 * apresentacional: os dados chegam prontos do Server Component consumidor e
 * cada toque delega ao callback de quem consome (modal T3a na VT-4; variante
 * pública na PB-2). Nada de consulta nem escrita aqui — a grade nunca é
 * fonte de verdade (o servidor confere estado, §2.7).
 */
import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/Button";
import type { StatusNumero } from "@/lib/estados";
import { formatarNumero } from "@/lib/formato";

export type PastilhaNumero = { numero: number; status: StatusNumero };

const BLOCO_TAMANHO = 100;
/** Salto por bloco (select) a partir de 10 blocos = rifas de 1.000+ (§3.4.4). */
const BLOCOS_PARA_SALTO = 10;

/**
 * "Sorteado" é estado de EXIBIÇÃO (§2.7): vem do resultado vigente da rifa,
 * nunca da tabela numeros — por isso entra nesta união e não no banco.
 */
type EstadoPastilha = StatusNumero | "sorteado";

type EstiloPastilha = {
  celula: string;
  marcador: string;
  rotulo: (numeroExibido: string) => string;
};

const ESTILOS: Record<EstadoPastilha, EstiloPastilha> = {
  disponivel: {
    celula: "border-linha bg-white text-tinta hover:bg-papel-escuro",
    marcador: "",
    rotulo: (numeroExibido) => `Número ${numeroExibido}, disponível`,
  },
  vendido: {
    celula: "border-verde-venda/25 bg-verde-venda-suave text-verde-venda",
    marcador: "✓",
    rotulo: (numeroExibido) => `Número ${numeroExibido}, vendido`,
  },
  sorteado: {
    celula: "border-ouro/40 bg-ouro-suave text-ouro",
    marcador: "🏆",
    rotulo: (numeroExibido) => `Número ${numeroExibido}, sorteado`,
  },
};

type Props = {
  /** Números como vêm do banco (1..N esperado); o que estiver fora da faixa não renderiza. */
  numeros: PastilhaNumero[];
  /** Total da rifa (coluna `quantidade`) — define a faixa exibida e os blocos. */
  quantidade: number;
  /** Vencedor vigente (§2.7): destaque dourado 🏆 por cima do status da tabela. */
  numeroSorteado?: number;
  /** Ação do toque em qualquer pastilha (abrir modal — VT-4/PB-2). */
  aoTocarNumero: (numero: number) => void;
};

export function GradeNumeros({ numeros, quantidade, numeroSorteado, aoTocarNumero }: Props) {
  const [blocoIndice, setBlocoIndice] = useState(0);

  // Fora da faixa 1..quantidade nunca renderiza (§3.4.4) e o formato pt-BR
  // (formatarNumero) só é pedido para o que está nela — dado malformado do
  // banco não derruba a tela. Map deduplica (UNIQUE (rifa_id, numero)) e
  // conserva a última ocorrência.
  const emFaixa = new Map<number, PastilhaNumero>();
  for (const pastilha of numeros) {
    if (
      Number.isInteger(pastilha.numero) &&
      pastilha.numero >= 1 &&
      pastilha.numero <= quantidade
    ) {
      emFaixa.set(pastilha.numero, pastilha);
    }
  }
  const ordenadas = [...emFaixa.values()].sort((a, b) => a.numero - b.numero);

  // Paginação por faixa de número (001–100, 101–200…), não por posição do
  // array: buracos de dados deslocam blocos, a numeração não.
  const totalBlocos = Math.max(1, Math.ceil(quantidade / BLOCO_TAMANHO));
  // Derivado em render (sem effect): dados encolhendo nunca deixam o bloco
  // atual fora da faixa de blocos existentes.
  const bloco = Math.min(blocoIndice, totalBlocos - 1);
  const inicio = bloco * BLOCO_TAMANHO + 1;
  const fim = Math.min((bloco + 1) * BLOCO_TAMANHO, quantidade);
  const visiveis = ordenadas.filter(
    (pastilha) => pastilha.numero >= inicio && pastilha.numero <= fim,
  );

  const trocarBloco = (evento: ChangeEvent<HTMLSelectElement>) => {
    setBlocoIndice(Number(evento.target.value));
  };

  return (
    <section
      aria-label="Grade de números da rifa"
      className="rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      {ordenadas.length === 0 ? (
        <p className="py-8 text-center text-sm text-tinta-suave">Nenhum número para exibir.</p>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            {visiveis.map((pastilha) => {
              const estado: EstadoPastilha =
                pastilha.numero === numeroSorteado ? "sorteado" : pastilha.status;
              const estilo = ESTILOS[estado];
              const numeroExibido = formatarNumero(pastilha.numero);
              return (
                <button
                  key={pastilha.numero}
                  type="button"
                  aria-label={estilo.rotulo(numeroExibido)}
                  onClick={() => aoTocarNumero(pastilha.numero)}
                  className={[
                    "relative flex aspect-square items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                    estilo.celula,
                  ].join(" ")}
                >
                  {numeroExibido}
                  {estilo.marcador ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-1 top-1 text-[10px] leading-none"
                    >
                      {estilo.marcador}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {totalBlocos > 1 ? (
            <nav
              aria-label="Navegação entre blocos de números"
              className="mt-3 flex items-center justify-between gap-2"
            >
              <Button
                variante="secundario"
                disabled={bloco === 0}
                onClick={() => setBlocoIndice(bloco - 1)}
                className="px-3"
              >
                <span aria-hidden="true">‹</span> Anterior
              </Button>

              {totalBlocos >= BLOCOS_PARA_SALTO ? (
                <select
                  value={bloco}
                  onChange={trocarBloco}
                  aria-label="Ir para o bloco de números"
                  className="min-h-[44px] rounded-lg border border-linha bg-white px-2 text-sm text-tinta"
                >
                  {Array.from({ length: totalBlocos }, (_, indice) => {
                    const inicioOpcao = indice * BLOCO_TAMANHO + 1;
                    const fimOpcao = Math.min((indice + 1) * BLOCO_TAMANHO, quantidade);
                    return (
                      <option key={indice} value={indice}>
                        {formatarNumero(inicioOpcao)}–{formatarNumero(fimOpcao)}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <p aria-live="polite" className="text-xs text-tinta-suave">
                  Bloco {bloco + 1} de {totalBlocos} ({formatarNumero(inicio)}–{formatarNumero(fim)}
                  )
                </p>
              )}

              <Button
                variante="secundario"
                disabled={bloco === totalBlocos - 1}
                onClick={() => setBlocoIndice(bloco + 1)}
                className="px-3"
              >
                Próxima <span aria-hidden="true">›</span>
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}

const INDICES_ESQUELETO = Array.from({ length: 100 }, (_, indice) => indice);

/**
 * Skeleton estável da grade (mesma malha e proporção do estado final — sem
 * pulo de layout, padrão FD-12), exibido enquanto os números chegam do
 * servidor. `role=status` anuncia o carregamento; `aria-hidden` mantém os
 * blocos fora da leitura.
 */
export function EsqueletoGrade() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <span className="sr-only">Carregando os números…</span>
      <div aria-hidden="true" className="grid grid-cols-5 gap-1.5">
        {INDICES_ESQUELETO.map((indice) => (
          <div key={indice} className="aspect-square animate-pulse rounded-lg bg-papel-escuro" />
        ))}
      </div>
    </div>
  );
}
