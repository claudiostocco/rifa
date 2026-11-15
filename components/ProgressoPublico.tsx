/**
 * PB-1 · Progresso público da T4 (SPEC §3.5 · RF-11): frase prescrita
 * "37 de 100 números vendidos" + barra com a marca VISUAL do mínimo
 * (RN-06 · decisão 10). Server Component assíncrono consumido em `Suspense`
 * pela página pública — o cabeçalho renderiza na hora e o progresso chega em
 * streaming com skeleton estável (padrão FD-12/VT-2).
 *
 * Leitura sob RLS pública (`numeros_publico_le_publicadas` — migração 001):
 * o anon lê a CONTAGEM de estados da rifa publicada, nunca dados de
 * comprador (RN-02/RNF-05 — o `head: true` não traz linhas de todo). Falha de
 * rede/leitura vira estado de erro anunciado com `role=alert` e caminho de
 * recuperação, nunca confunde com "zero vendidos" (padrão VT-1/VT-2).
 */
import Link from "next/link";

import { BarraProgresso } from "@/components/BarraProgresso";
import { formatarQuantidade } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";

type Props = {
  rifaId: string;
  quantidade: number;
  /** Mínimo de vendidos da rifa (RN-06): marca o trilho quando > 0. */
  qtdMinima: number;
  /** Endereço da própria página — o "Recarregar" reexecuta o Server Component. */
  hrefRecarga: string;
};

export async function ProgressoPublico({ rifaId, quantidade, qtdMinima, hrefRecarga }: Props) {
  const supabase = await criarClienteServidor();

  // O estado `vendido` da grade é a mesma verdade do progresso (VT-5/VT-7:
  // remoção de venda devolve o número a `disponivel` na mesma escrita).
  const { count: vendidos, error: erroContagem } = await supabase
    .from("numeros")
    .select("id", { count: "exact", head: true })
    .eq("rifa_id", rifaId)
    .eq("status", "vendido");

  if (erroContagem) {
    return (
      <section
        role="alert"
        className="rounded-card border border-red-200 bg-red-50 px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar o progresso da rifa. Verifique sua conexão e tente novamente.
        </p>
        <Link
          href={hrefRecarga}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-marca underline underline-offset-2"
        >
          Recarregar
        </Link>
      </section>
    );
  }

  const comMarca = qtdMinima > 0;

  return (
    <section
      aria-label="Progresso das vendas"
      className="rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-medium text-tinta">
        <span className="font-semibold">{formatarQuantidade(vendidos ?? 0)}</span> de{" "}
        {formatarQuantidade(quantidade)} números vendidos
      </p>
      <div className="mt-2 flex items-center gap-2">
        <BarraProgresso
          vendidos={vendidos ?? 0}
          quantidade={quantidade}
          minima={comMarca ? qtdMinima : undefined}
          rotulo={comMarca ? `Mínimo: ${formatarQuantidade(qtdMinima)}` : undefined}
        />
      </div>
    </section>
  );
}

/**
 * Skeleton estável da região (mesma altura aproximada do estado final — sem
 * pulo de layout, padrão FD-12), com anúncio de carregamento.
 */
export function EsqueletoProgresso() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <span className="sr-only">Carregando o progresso da rifa…</span>
      <div aria-hidden="true" className="space-y-2">
        <div className="h-5 w-48 animate-pulse rounded bg-papel-escuro" />
        <div className="h-1.5 w-full animate-pulse rounded-full bg-papel-escuro" />
      </div>
    </div>
  );
}
