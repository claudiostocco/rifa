import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ListaRifas, type RifaDoCartao } from "./lista-rifas";
import { classesBotaoPrimario } from "@/components/ui/Button";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { RifaRow } from "@/lib/supabase/tipos";

export const metadata: Metadata = {
  title: "Minhas Rifas",
  description: "Acompanhe as vendas de cada rifa e abra o painel para gerir os números.",
};

/**
 * FD-12 · T1 · Minhas Rifas (rota `/` — SPEC §2.8, §3.2, RF-03).
 *
 * Rota protegida: o proxy (FD-8) já exige sessão; a conferência aqui é a
 * barreira real do Server Component. O cabeçalho renderiza na hora e a
 * listagem chega em streaming (`Suspense` + skeleton) — a consulta RLS
 * `rifas_organizador_le_proprias` devolve somente as rifas da sessão, com a
 * contagem de vendidos por embed (`numeros(count)`) em um único roundtrip.
 * Arquivadas e excluídas ficam fora da listagem principal (RF-03, §2.4);
 * os dados delas permanecem preservados (FD-11).
 */

/** Esqueleto do painel (sem pulo de layout): filtro + 3 cards fantasma. */
function EsqueletoLista() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Carregando suas rifas…</span>
      <div aria-hidden="true" className="mb-4 flex gap-2">
        <div className="h-9 w-16 animate-pulse rounded-full bg-papel-escuro" />
        <div className="h-9 w-20 animate-pulse rounded-full bg-papel-escuro" />
        <div className="h-9 w-24 animate-pulse rounded-full bg-papel-escuro" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        {[0, 1, 2].map((indice) => (
          <div key={indice} className="rounded-card border border-linha bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-papel-escuro" />
              <div className="flex-1 space-y-2 pt-0.5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-papel-escuro" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-papel-escuro" />
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-papel-escuro" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Linha bruta da consulta: `numeros(count)` é o embed de contagem do PostgREST. */
type LinhaListagem = Pick<
  RifaRow,
  | "id"
  | "slug"
  | "titulo"
  | "premio_descricao"
  | "premio_valor"
  | "numero_valor"
  | "quantidade"
  | "status"
  | "imagem_url"
> & { numeros: { count: number }[] | null };

/** Vendidos de cada rifa; rifa sem venda vigente chega com contagem 0. */
function vendidosDaLinha(linha: LinhaListagem): number {
  const contagem = linha.numeros?.[0]?.count;
  return typeof contagem === "number" ? contagem : 0;
}

/**
 * Consulta e renderização da lista. Falha de rede/leitura NÃO vira empty
 * state (o organizador não pode confundir "sem dados" com "sem internet"):
 * mostra o estado de erro com caminho de recuperação.
 */
async function PainelRifas({ perfilId }: { perfilId: string }) {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("rifas")
    .select(
      "id, slug, titulo, premio_descricao, premio_valor, numero_valor, quantidade, status, imagem_url, numeros(count)",
    )
    .eq("perfil_id", perfilId)
    .eq("arquivada", false)
    .eq("excluida", false)
    .order("criada_em", { ascending: false })
    // Contagem de vendidos no embed: o filtro é da sub-relação `numeros`,
    // não das rifas (o `quantidade` da coluna dá o total da barra).
    .filter("numeros.status", "eq", "vendido");

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-card border border-red-200 bg-red-50 px-6 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar suas rifas agora. Verifique sua conexão e tente novamente.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-marca underline underline-offset-2"
        >
          Recarregar
        </Link>
      </div>
    );
  }

  const rifas: RifaDoCartao[] = (data ?? []).map((linha) => ({
    id: linha.id,
    slug: linha.slug,
    titulo: linha.titulo,
    premio_descricao: linha.premio_descricao,
    premio_valor: linha.premio_valor,
    numero_valor: linha.numero_valor,
    quantidade: linha.quantidade,
    status: linha.status,
    imagem_url: linha.imagem_url,
    vendidos: vendidosDaLinha(linha),
  }));

  return <ListaRifas rifas={rifas} />;
}

export default async function PaginaMinhasRifas() {
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    redirect("/entrar");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-marca text-base text-white"
          >
            🎫
          </span>
          <span className="text-base font-bold tracking-tight text-tinta">Rifa App</span>
        </div>
        <Link href="/rifas/nova" className={classesBotaoPrimario}>
          + Nova Rifa
        </Link>
      </header>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-tinta">Minhas Rifas</h1>
      <p className="mb-5 text-sm text-tinta-suave">
        Acompanhe as vendas e acesse o painel de cada rifa.
      </p>

      <Suspense fallback={<EsqueletoLista />}>
        <PainelRifas perfilId={sessao.user.id} />
      </Suspense>
    </main>
  );
}
