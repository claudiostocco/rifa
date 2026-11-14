import Link from "next/link";

import { BotoesCiclo } from "@/components/BotoesCiclo";
import type { ParticipanteRoleta } from "@/components/RoletaSorteio";
import type { StatusRifa } from "@/lib/estados";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * SR-1/SR-5 · Barra de ações do ciclo por etapa (SPEC §3.4.6, item 6) —
 * Server Component assíncrono consumido em `Suspense` pela T3: o painel
 * renderiza na hora e a barra chega em streaming com skeleton estável
 * (padrão FD-12).
 *
 * A contagem de vendidos (RLS `numeros_organizador_proprias`, `head: true` —
 * a mesma consulta do resumo, VT-2) alimenta o aviso de mínimo do
 * encerramento (§4.8/RN-06) e a contagem exata da confirmação do sorteio
 * (§4.9/SR-2): o mínimo é AVISO, quem decide é o organizador — a própria ação
 * valida apenas a transição (§2.7).
 *
 * SR-5 · RF-09a: as vendas VIGENTES da rifa (nome + número) alimentam o
 * cenário da roleta. `BotoesCiclo` é renderizado na MESMA posição em ambas
 * as etapas (inclusive `sorteada`) para que a roleta aberta sobreviva ao
 * `router.refresh()` que traz o novo status — por isso o card por etapa é
 * interno ao cliente (padrão de posição estável na árvore).
 *
 * Falha de rede/permissão ≠ ausência de ações: estado de erro anunciado com
 * `role=alert` e caminho de recuperação (padrão VT-1/VT-2).
 */

/** Teto do cenário do giro (RNF-04): o payload da página não cresce com
 *  rifas de 5.000 — o ponto final do giro é sempre o snapshot servido
 *  (§4.9), nunca a lista. */
const LIMITE_PARTICIPANTES = 120;

type Props = {
  rifaId: string;
  status: StatusRifa;
  qtdMinima: number;
};

type ResultadoParticipantes = { participantes: ParticipanteRoleta[]; error: boolean };

/** Vendas VIGENTES (nome + número) — a mesma consulta da VT-4, enxuta. */
async function consultarParticipantes(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  rifaId: string,
): Promise<ResultadoParticipantes> {
  const { data, error } = await supabase
    .from("vendas")
    .select("numeros!inner(numero), compradores(nome)")
    .is("removida_em", null)
    .eq("numeros.rifa_id", rifaId)
    .limit(LIMITE_PARTICIPANTES);

  if (error) {
    return { participantes: [], error: true };
  }

  const participantes: ParticipanteRoleta[] = (data ?? []).flatMap((venda) => {
    // PostgREST embute 1:1 (objeto) — a defesa `Array.isArray` é o padrão da
    // casa (`actions/sorteio.ts`): dado inesperado não derruba a tela.
    const numero = Array.isArray(venda.numeros) ? venda.numeros[0]?.numero : venda.numeros?.numero;
    const nome = Array.isArray(venda.compradores)
      ? venda.compradores[0]?.nome
      : venda.compradores?.nome;
    return typeof nome === "string" && typeof numero === "number" ? [{ nome, numero }] : [];
  });

  return { participantes, error: false };
}

function CardErro({ rifaId }: { rifaId: string }) {
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

export async function AcoesCicloRifa({ rifaId, status, qtdMinima }: Props) {
  const supabase = await criarClienteServidor();

  // SR-5 · etapa sorteada: sem ações do ciclo (§3.4.6), mas o cliente segue
  // montado (mesma posição) para a roleta aberta sobreviver ao refresh —
  // com os participantes do giro recarregados.
  if (status === "sorteada") {
    const participantesResultado = await consultarParticipantes(supabase, rifaId);
    if (participantesResultado.error) {
      return <CardErro rifaId={rifaId} />;
    }
    return (
      <BotoesCiclo
        rifaId={rifaId}
        status={status}
        vendidos={0}
        qtdMinima={qtdMinima}
        participantes={participantesResultado.participantes}
      />
    );
  }

  const [contadorResultado, participantesResultado] = await Promise.all([
    supabase
      .from("numeros")
      .select("id", { count: "exact", head: true })
      .eq("rifa_id", rifaId)
      .eq("status", "vendido"),
    consultarParticipantes(supabase, rifaId),
  ]);

  if (contadorResultado.error || participantesResultado.error) {
    return <CardErro rifaId={rifaId} />;
  }

  return (
    <BotoesCiclo
      rifaId={rifaId}
      status={status}
      vendidos={contadorResultado.count ?? 0}
      qtdMinima={qtdMinima}
      participantes={participantesResultado.participantes}
    />
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
