import Link from "next/link";

import { BotoesCiclo } from "@/components/BotoesCiclo";
import type { StatusRifa } from "@/lib/estados";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * SR-1 · Barra de ações do ciclo por etapa (SPEC §3.4.6, item 6) — Server
 * Component assíncrono consumido em `Suspense` pela T3: o painel renderiza na
 * hora e a barra chega em streaming com skeleton estável (padrão FD-12).
 *
 * A contagem de vendidos (RLS `numeros_organizador_proprias`, `head: true` —
 * a mesma consulta do resumo, VT-2) alimenta o aviso de mínimo do
 * encerramento (§4.8/RN-06): o mínimo é AVISO, quem decide é o organizador —
 * a própria ação valida apenas a transição (§2.7). Etapa `sorteada` não tem
 * ações do ciclo (as dela chegam em SR-2/SR-4).
 *
 * Falha de rede/permissão ≠ ausência de ações: estado de erro anunciado com
 * `role=alert` e caminho de recuperação (padrão VT-1/VT-2).
 */

type Props = {
  rifaId: string;
  status: StatusRifa;
  qtdMinima: number;
};

export async function AcoesCicloRifa({ rifaId, status, qtdMinima }: Props) {
  if (status === "sorteada") return null;

  const supabase = await criarClienteServidor();
  const { count: vendidos, error } = await supabase
    .from("numeros")
    .select("id", { count: "exact", head: true })
    .eq("rifa_id", rifaId)
    .eq("status", "vendido");

  if (error) {
    return (
      <section
        role="alert"
        className="mt-6 rounded-card border border-red-200 bg-red-50 px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar as ações da rifa. Verifique sua conexão e tente novamente.
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

  return (
    <section
      aria-label="Ações da rifa"
      className="mt-6 rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <BotoesCiclo rifaId={rifaId} status={status} vendidos={vendidos ?? 0} qtdMinima={qtdMinima} />
    </section>
  );
}

/**
 * Skeleton estável da barra (estrutura idêntica ao estado final — sem pulo de
 * layout, padrão FD-12): um botão de altura fixa, `role=status` anunciando.
 */
export function EsqueletoAcoes() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="mt-6 rounded-card border border-linha bg-white p-4 shadow-sm"
    >
      <span className="sr-only">Carregando as ações da rifa…</span>
      <div
        aria-hidden="true"
        className="h-[44px] w-full animate-pulse rounded-lg bg-papel-escuro"
      />
    </section>
  );
}
