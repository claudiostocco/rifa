import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { EsqueletoGrade } from "@/components/GradeNumeros";
import { GradePublica } from "@/components/GradePublica";
import { EsqueletoProgresso, ProgressoPublico } from "@/components/ProgressoPublico";
import { Badge } from "@/components/ui/Badge";
import { classesBotaoPrimario } from "@/components/ui/Button";
import { ROTULO_STATUS, tipoDoBadge } from "@/lib/estados";
import { formatarData, formatarFrasePremio, formatarMoeda } from "@/lib/formato";
import { eRotuloPremio } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Rifa",
  description: "Veja os números disponíveis e garanta o seu na rifa.",
};

type Props = { params: Promise<{ slug: string }> };

/** Recusa amigável em pt-BR — nunca o 404 default em inglês (padrão T3/T5). */
function Recusa({
  mensagem,
  alerta = false,
  href,
  acao,
}: {
  mensagem: string;
  /** `true` em falha de rede/leitura: anunciada como `role=alert`. */
  alerta?: boolean;
  href?: string;
  acao?: string;
}) {
  return (
    <div
      role={alerta ? "alert" : undefined}
      className="rounded-card border border-linha bg-white px-6 py-10 text-center shadow-sm"
    >
      <p className="text-sm font-medium text-tinta">{mensagem}</p>
      {href && acao ? (
        <Link
          href={href}
          className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-marca underline underline-offset-2"
        >
          {acao}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * PB-1 · T4 · Rifa pública (rota `/r/{slug}` — SPEC §2.8/§3.5, RF-11 · matriz
 * §5.2): Server Component acessível SEM login — a leitura vai sob as políticas
 * públicas da migração 001 (`rifas_publico_le_publicadas`, que escondem
 * arquivada/excluida; slug inexistente chega vazio igual). O anon lê estados
 * (progresso/grade) e NUNCA arrecadação, nomes ou telefones de compradores
 * (RN-02/RNF-05 — nada daqui consulta `compradores`/`vendas`).
 *
 * Estados da §3.5: carregando (skeleton do segmento) | pronta | sorteada
 * (destaque do vencedor 🏆 na grade + link "Ver resultado"). Busca rápida,
 * rodapé do organizador, foto e offline seguem nas PB-4..PB-9.
 */
export default async function PaginaRifaPublica({ params }: Props) {
  const { slug } = await params;
  const supabase = await criarClienteServidor();

  // Rifa pelo slug (§2.8: o slug é a chave das URLs públicas). Colunas
  // explícitas — a linha nunca cruza para o client como prop de componente.
  const { data: rifa, error: erroLeitura } = await supabase
    .from("rifas")
    .select(
      "id, slug, titulo, descricao, premio_descricao, premio_rotulo, premio_valor, numero_valor, quantidade, qtd_minima, data_prevista, imagem_url, status",
    )
    .eq("slug", slug)
    .maybeSingle();

  // Falha de rede/permissão ≠ rifa inexistente (padrão VT-1/VT-2).
  if (erroLeitura) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa
          alerta
          mensagem="Não foi possível carregar a rifa. Verifique sua conexão e tente novamente."
          href={`/r/${slug}`}
          acao="Recarregar"
        />
      </main>
    );
  }
  if (!rifa) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa mensagem="Não encontramos essa rifa. Confira o link com quem a criou." />
      </main>
    );
  }

  const status = ROTULO_STATUS[rifa.status];
  const frasePremio = eRotuloPremio(rifa.premio_rotulo)
    ? formatarFrasePremio(rifa.premio_rotulo, rifa.premio_descricao, rifa.premio_valor)
    : `${rifa.premio_descricao} — ${formatarMoeda(rifa.premio_valor)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <header className="space-y-3">
        {rifa.imagem_url ? (
          <Image
            src={rifa.imagem_url}
            alt=""
            width={768}
            height={576}
            sizes="(max-width: 448px) 100vw, 448px"
            className="h-40 w-full rounded-card border border-linha object-cover"
          />
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">{rifa.titulo}</h1>
          <Badge tipo={tipoDoBadge(rifa.status)}>
            <span aria-hidden="true">{status?.icone}</span> {status?.texto}
          </Badge>
        </div>

        {rifa.descricao ? <p className="text-sm text-tinta-suave">{rifa.descricao}</p> : null}

        {/* §3.5: prêmio com rótulo e valor ("Mais de R$ 500 — Forno elétrico"). */}
        <p className="text-base font-medium text-tinta">{frasePremio}</p>

        <p className="text-sm text-tinta-suave">Número: {formatarMoeda(rifa.numero_valor)}</p>

        {/* Campo omitido quando não informado — nunca "undefined" (§3.5). */}
        {rifa.data_prevista ? (
          <p className="text-sm text-tinta-suave">
            Data prevista: {formatarData(rifa.data_prevista)}
          </p>
        ) : null}
      </header>

      {/* Estado sorteada da §3.5: destaque do vencedor na grade + o link para
          a T5 (F6 — "link direto ou botão na T4"). */}
      {rifa.status === "sorteada" ? (
        <Link href={`/r/${rifa.slug}/resultado`} className={`${classesBotaoPrimario} mt-6`}>
          <span aria-hidden="true">🎉</span> Ver resultado
        </Link>
      ) : null}

      {/* Progresso público (§3.5): frase prescrita + barra com a marca do
          mínimo (RN-06), em streaming com skeleton estável. */}
      <div className="mt-6">
        <Suspense fallback={<EsqueletoProgresso />}>
          <ProgressoPublico
            rifaId={rifa.id}
            quantidade={rifa.quantidade}
            qtdMinima={rifa.qtd_minima}
            hrefRecarga={`/r/${rifa.slug}`}
          />
        </Suspense>
      </div>

      {/* Grade de números (§3.5): em streaming com skeleton estável; leitura
          sob RLS pública — disponível/vendido/sorteado, sem dados de comprador.
          PB-2: o toque abre o modal enxuto (só a etapa `aberta` vende). */}
      <div className="mt-4">
        <Suspense fallback={<EsqueletoGrade />}>
          <GradePublica
            rifaId={rifa.id}
            quantidade={rifa.quantidade}
            vendasAbertas={rifa.status === "aberta"}
            hrefRecarga={`/r/${rifa.slug}`}
          />
        </Suspense>
      </div>
    </main>
  );
}
