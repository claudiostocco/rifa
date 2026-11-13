import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BotaoCopiarLink } from "@/components/BotaoCopiarLink";
import { EsqueletoGrade } from "@/components/GradeNumeros";
import { NumerosDaRifa } from "@/components/NumerosDaRifa";
import { EsqueletoResumo, ResumoRifa } from "@/components/ResumoRifa";
import { Badge } from "@/components/ui/Badge";
import { ROTULO_STATUS, tipoDoBadge } from "@/lib/estados";
import {
  formatarData,
  formatarFrasePremio,
  formatarMoeda,
  formatarQuantidade,
} from "@/lib/formato";
import { eRotuloPremio } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { RifaRow } from "@/lib/supabase/tipos";

export const metadata: Metadata = {
  title: "Painel da rifa",
  description: "Acompanhe as vendas da rifa e compartilhe o link público.",
};

type Props = { params: Promise<{ id: string }> };

type AcaoRecusa = { texto: string; href: string };

/** Recusa amigável em pt-BR — nunca o 404 default em inglês. */
function Recusa({
  mensagem,
  alerta = false,
  acao = { texto: "Voltar às rifas", href: "/" },
}: {
  mensagem: string;
  /** `true` em falha de rede/leitura: anunciada como `role=alert` (padrão FD-12). */
  alerta?: boolean;
  acao?: AcaoRecusa;
}) {
  return (
    <div
      role={alerta ? "alert" : undefined}
      className="rounded-card border border-linha bg-white px-6 py-10 text-center shadow-sm"
    >
      <p className="text-sm font-medium text-tinta">{mensagem}</p>
      <Link
        href={acao.href}
        className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-marca underline underline-offset-2"
      >
        {acao.texto}
      </Link>
    </div>
  );
}

/**
 * FD-13 · cabeçalho mínimo da T3 · Painel da rifa (rota `/rifas/{id}` — SPEC
 * §2.8, §3.4.1). Entregue junto com a T2 (FD-13) por decisão do usuário:
 * o fluxo pós-criação prescrito em §4.1 é "redirect à T3 com o link público
 * e botão copiar", e sem esta rota o organizador cairia em 404. O restante do
 * painel (grade, ações por etapa) seguem na Fase 2 (VT-3..VT-4).
 *
 * O rótulo do prêmio vem como `string` dos tipos gerados (regra FD-4): o
 * guarda `eRotuloPremio` afunila antes de formatar — valor fora do domínio do
 * CHECK seria bug de banco, não motivo de crash de tela.
 */
export default async function PaginaPainelRifa({ params }: Props) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    redirect("/entrar");
  }

  // RLS `rifas_organizador_le_proprias`: rifa de outro organizador chega vazia.
  const { data: rifa, error: erroLeitura } = await supabase
    .from("rifas")
    .select("*")
    .eq("id", id)
    .maybeSingle<RifaRow>();

  // Falha de rede/permissão ≠ rifa inexistente: estado de erro anunciado com
  // `role=alert` e caminho de recuperação (recarregar reexecuta o Server
  // Component) — nunca confunde com a recusa abaixo nem com o 404 default.
  if (erroLeitura) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa
          alerta
          mensagem="Não foi possível carregar a rifa. Verifique sua conexão e tente novamente."
          acao={{ texto: "Recarregar", href: `/rifas/${id}` }}
        />
      </main>
    );
  }
  if (!rifa) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa mensagem="Não encontramos essa rifa na sua conta." />
      </main>
    );
  }

  // URL pública construída no servidor a partir da requisição — o mesmo
  // endereço que o botão copia (compartilhável na T4, §2.8).
  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3100";
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "http";
  const urlPublica = `${protocolo}://${host}/r/${rifa.slug}`;

  const status = ROTULO_STATUS[rifa.status];
  const frasePremio = eRotuloPremio(rifa.premio_rotulo)
    ? formatarFrasePremio(rifa.premio_rotulo, rifa.premio_descricao, rifa.premio_valor)
    : `${rifa.premio_descricao} — ${formatarMoeda(rifa.premio_valor)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <nav aria-label="Navegação do painel" className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
        >
          <span aria-hidden="true">‹</span> Voltar às rifas
        </Link>
      </nav>

      <header className="space-y-3">
        {rifa.imagem_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL própria do Storage; otimização de imagem chega no PB-5
          <img
            src={rifa.imagem_url}
            alt=""
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

        <p className="text-base font-medium text-tinta">{frasePremio}</p>

        <p className="text-sm text-tinta-suave">
          Número: {formatarMoeda(rifa.numero_valor)} · Quantidade:{" "}
          {formatarQuantidade(rifa.quantidade)} · Total potencial:{" "}
          {formatarMoeda(rifa.quantidade * rifa.numero_valor)}
        </p>

        {/* Campo omitido quando não informado — nunca "undefined" (§3.4.1). */}
        {rifa.data_prevista ? (
          <p className="text-sm text-tinta-suave">
            Data prevista: {formatarData(rifa.data_prevista)}
          </p>
        ) : null}
      </header>

      <div className="mt-6">
        <BotaoCopiarLink url={urlPublica} />
      </div>

      {/* VT-2 · Painel de resumo (§3.4.2): em streaming com skeleton estável;
          falha de leitura vira estado de erro próprio, nunca "zero vendidos". */}
      <Suspense fallback={<EsqueletoResumo />}>
        <ResumoRifa rifaId={rifa.id} quantidade={rifa.quantidade} numeroValor={rifa.numero_valor} />
      </Suspense>

      {/* VT-4 · Grade de números + modal T3a (§3.4.4/§3.4.5): em streaming com
          skeleton estável; leitura sob RLS com erro de rede próprio. */}
      <Suspense fallback={<EsqueletoGrade />}>
        <NumerosDaRifa rifaId={rifa.id} quantidade={rifa.quantidade} />
      </Suspense>
    </main>
  );
}
