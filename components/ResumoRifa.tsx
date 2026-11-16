import Link from "next/link";

import { BarraProgresso } from "@/components/BarraProgresso";
import { formatarMoeda, formatarQuantidade } from "@/lib/formato";
import { calcularResumo, type ResumoVendas } from "@/lib/resumo";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * VT-2 · Painel de resumo (exclusivo do T3 — SPEC §3.4.2, RF-04, decisão 8):
 * vendidos/total com percentual, disponíveis, arrecadado e potencial total.
 *
 * Server Component assíncrono em `Suspense`: o cabeçalho da T3 renderiza na
 * hora e o resumo chega em streaming com skeleton estável (sem pulo de layout,
 * padrão FD-12). A contagem de vendidos é feita por RLS
 * (`numeros_organizador_proprias`) com `head: true` — número `vendido` é o
 * estado vigente; `removerVenda` devolve o número a `disponivel`, então a
 * contagem nunca inclui venda removida.
 *
 * RN-02/decisão 8: este componente só é consumido pela rota protegida
 * `/rifas/{id}` — nada daqui alcança as telas públicas.
 */

type Props = {
  rifaId: string;
  quantidade: number;
  numeroValor: number;
};

export async function ResumoRifa({ rifaId, quantidade, numeroValor }: Props) {
  const supabase = await criarClienteServidor();

  const { count: vendidos, error } = await supabase
    .from("numeros")
    .select("id", { count: "exact", head: true })
    .eq("rifa_id", rifaId)
    .eq("status", "vendido");

  // Falha de rede/permissão ≠ "zero vendidos": estado de erro anunciado com
  // `role=alert` e caminho de recuperação (recarregar reexecuta o Server
  // Component) — nunca confunde o organizador (padrão FD-12/VT-1).
  if (error) {
    return (
      <section
        role="alert"
        className="mt-6 rounded-card border border-red-200 bg-red-50 px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar o resumo das vendas. Verifique sua conexão e tente novamente.
        </p>
        <Link
          href={`/rifas/${rifaId}`}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-marca underline underline-offset-2"
        >
          Recarregar
        </Link>
      </section>
    );
  }

  const resumo: ResumoVendas = calcularResumo({
    vendidos: vendidos ?? 0,
    quantidade,
    numeroValor,
  });

  return (
    <section
      aria-label="Resumo das vendas"
      className="mt-6 rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium text-tinta-suave">Vendidos</h2>
          <p className="text-2xl font-bold tabular-nums text-tinta">
            {formatarQuantidade(resumo.vendidos)}{" "}
            <span className="text-sm font-medium text-tinta-suave">
              de {formatarQuantidade(resumo.total)}
            </span>
          </p>
        </div>
        <p
          className="text-xl font-bold tabular-nums text-verde-venda"
          aria-label={`Percentual vendido: ${resumo.percentual}%`}
        >
          {resumo.percentual}%
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <BarraProgresso destacada vendidos={resumo.vendidos} quantidade={resumo.total} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-linha pt-3">
        <div>
          <dt className="text-xs text-tinta-suave">Disponíveis</dt>
          <dd className="text-sm font-semibold tabular-nums text-tinta">
            {formatarQuantidade(resumo.disponiveis)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-suave">Arrecadado</dt>
          <dd className="text-sm font-semibold tabular-nums text-tinta">
            {formatarMoeda(resumo.arrecadado)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-suave">Potencial</dt>
          <dd className="text-sm font-semibold tabular-nums text-tinta">
            {formatarMoeda(resumo.potencial)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Skeleton estável do resumo (estrutura idêntica ao estado final — sem pulo
 * de layout), exibido enquanto a contagem chega do Supabase. `role=status`
 * anuncia o carregamento; `aria-hidden` mantém os blocos fora da leitura.
 */
export function EsqueletoResumo() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <span className="sr-only">Carregando o resumo das vendas…</span>
      <div aria-hidden="true">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-16 animate-pulse rounded bg-papel-escuro" />
            <div className="h-7 w-24 animate-pulse rounded bg-papel-escuro" />
          </div>
          <div className="h-6 w-12 animate-pulse rounded bg-papel-escuro" />
        </div>
        <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-papel-escuro" />
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-linha pt-3">
          {[0, 1, 2].map((indice) => (
            <div key={indice} className="space-y-1.5">
              <div className="h-3 w-14 animate-pulse rounded bg-papel-escuro" />
              <div className="h-4 w-16 animate-pulse rounded bg-papel-escuro" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
