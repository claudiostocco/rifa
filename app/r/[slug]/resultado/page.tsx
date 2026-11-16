import type { Metadata } from "next";
import Link from "next/link";

import { BotaoCopiarResultado } from "@/components/BotaoCopiarResultado";
import { Badge } from "@/components/ui/Badge";
import {
  formatarDataHora,
  formatarFrasePremio,
  formatarMoeda,
  formatarNumero,
  formatarTelefoneOculto,
} from "@/lib/formato";
import { formatarTextoResultado } from "@/lib/resultado";
import { eRotuloPremio } from "@/lib/schemas";
import { criarClienteAdministrador, criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Resultado do sorteio",
  description: "Veja o resultado do sorteio da rifa e compartilhe com os participantes.",
};

type Props = { params: Promise<{ slug: string }> };

/**
 * SR-6 · T5 · Resultado do sorteio (rota própria `/r/{slug}/resultado` —
 * §2.8/§3.6, decisões 5): pública e compartilhável isoladamente. Lê a rifa
 * pelo slug e o resultado VIGENTE (RN-08: `anulado_em IS NULL`) sob as
 * políticas públicas de leitura — o anon NUNCA recebe nome/telefone de
 * comprador comum (RNF-05), apenas os do vencedor, prescritos na §3.6, com o
 * telefone JÁ mascarado por `formatarTelefoneOculto` no servidor (RF-10: só
 * os 2 últimos dígitos; o valor completo não cruza para o cliente, nem no
 * payload RSC nem no texto de copiar).
 *
 * O texto de compartilhamento (RF-13) é montado no servidor pela função pura
 * `formatarTextoResultado` — campos ausentes (data prevista) geram linha
 * ausente, nunca "undefined".
 */

/** Recusa amigável em pt-BR — nunca o 404 default em inglês (padrão T3/FD-12). */
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

export default async function PaginaResultado({ params }: Props) {
  const { slug } = await params;
  const supabase = await criarClienteServidor();

  // Rifa pelo slug (§2.8: o slug é a chave das URLs públicas). As políticas
  // públicas escondem arquivada/excluida — slug inexistente chega vazio igual.
  const { data: rifa, error: erroRifa } = await supabase
    .from("rifas")
    .select("id, titulo, premio_descricao, premio_rotulo, premio_valor, quantidade, data_prevista")
    .eq("slug", slug)
    .maybeSingle();

  // Falha de rede/permissão ≠ resultado inexistente (padrão VT-1/VT-2).
  if (erroRifa) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa
          alerta
          mensagem="Não foi possível carregar o resultado. Verifique sua conexão e tente novamente."
          href={`/r/${slug}/resultado`}
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

  // Resultado VIGENTE (RN-08) e o anulado MAIS RECENTE em paralelo: a badge de
  // anulação (§3.6) só aparece quando NÃO há vigente — com resultado novo, o
  // histórico de anulação não é exibido em tela (RF-15).
  //
  // **Decisão do usuário (14/11/2026, Opção B):** estas DUAS leituras usam
  // `service_role` (server-only). O anon RLS nega TODO acesso a `compradores`
  // (privacidade RNF-05 — migração 001), então o embed do vencedor chegava
  // null; abrir vencedores ao anon exporia o E.164 COMPLETO na API (RF-10).
  // Aqui o telefone completo vive só na memória do servidor e é mascarado por
  // `formatarTelefoneOculto` ANTES de qualquer renderização/payload RSC.
  const admin = criarClienteAdministrador();
  const [sorteioVigenteResultado, anuladoRecenteResultado] = await Promise.all([
    admin
      .from("sorteios")
      .select("sorteado_em, numero:numero_id (numero), comprador:comprador_id (nome, telefone)")
      .eq("rifa_id", rifa.id)
      .is("anulado_em", null)
      .maybeSingle(),
    admin
      .from("sorteios")
      .select("anulado_em")
      .eq("rifa_id", rifa.id)
      .not("anulado_em", "is", null)
      .order("anulado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { error: erroSorteio } = sorteioVigenteResultado;
  const { error: erroAnulado } = anuladoRecenteResultado;
  if (erroSorteio || erroAnulado) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa
          alerta
          mensagem="Não foi possível carregar o resultado. Verifique sua conexão e tente novamente."
          href={`/r/${slug}/resultado`}
          acao="Recarregar"
        />
      </main>
    );
  }

  const sorteio = sorteioVigenteResultado.data;

  // Padrão da casa (actions/sorteio.ts): defesa contra forma inesperada do
  // embed 1:1 do PostgREST — array ou objeto, nunca um número cru.
  const numeroBruto = Array.isArray(sorteio?.numero)
    ? sorteio.numero[0]?.numero
    : sorteio?.numero?.numero;
  const comprador = Array.isArray(sorteio?.comprador) ? sorteio.comprador[0] : sorteio?.comprador;

  // Sem sorteio vigente (RN-08) — estado prescrito da §3.6; com anulação
  // recente, a badge prescrita com data/hora (SR-8 completa o cenário).
  if (!sorteio || typeof numeroBruto !== "number" || !comprador) {
    const anuladoEm = anuladoRecenteResultado.data?.anulado_em;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <p className="text-sm font-medium text-tinta-suave">{rifa.titulo}</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-tinta">
          Sorteio ainda não realizado
        </h1>
        <div
          role="status"
          className="mt-6 rounded-card border border-linha bg-white px-6 py-10 text-center shadow-sm"
        >
          <p className="text-sm text-tinta-suave">
            O resultado aparecerá aqui assim que o organizador realizar o sorteio.
          </p>
          {typeof anuladoEm === "string" ? (
            <div className="mt-4">
              <Badge tipo="neutro">Sorteio anulado em {formatarDataHora(anuladoEm)}</Badge>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  // Domínio do `formatarNumero` (FD-6): número fora da faixa é bug de banco —
  // recusa honesta em vez de renderizar valor inventado ou crashar a tela.
  if (numeroBruto < 1 || numeroBruto > rifa.quantidade) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
        <Recusa
          alerta
          mensagem="Não foi possível carregar o resultado. Verifique sua conexão e tente novamente."
          href={`/r/${slug}/resultado`}
          acao="Recarregar"
        />
      </main>
    );
  }

  // RF-10 no servidor: o público vê só os 2 últimos dígitos. Telefone
  // malformado (impossível pela via da casa, mas possível por gravação direta)
  // NUNCA vaza integral: cai no rótulo neutro em vez de estourar a tela.
  let telefoneOculto: string;
  try {
    telefoneOculto = formatarTelefoneOculto(comprador.telefone);
  } catch {
    telefoneOculto = "Telefone não divulgado";
  }

  const frasePremio = eRotuloPremio(rifa.premio_rotulo)
    ? formatarFrasePremio(rifa.premio_rotulo, rifa.premio_descricao, rifa.premio_valor)
    : `${rifa.premio_descricao} — ${formatarMoeda(rifa.premio_valor)}`;
  const numeroExibido = formatarNumero(numeroBruto);

  // Texto de compartilhamento (RF-13) montado INTEIRO no servidor — o E.164
  // completo não chega ao client (nem ao payload RSC, nem ao clipboard).
  const textoCompartilhavel = formatarTextoResultado({
    titulo: rifa.titulo,
    numero: numeroBruto,
    nome: comprador.nome,
    telefoneOculto,
    frasePremio,
    sorteadoEm: sorteio.sorteado_em,
    ...(rifa.data_prevista ? { dataPrevista: rifa.data_prevista } : {}),
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      {/* Prescrito da §3.6: 🎉 "Número sorteado: 047" — o heading da tela. */}
      <p className="mt-1 text-sm font-medium text-tinta-suave">{rifa.titulo}</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-tinta">
        <span aria-hidden="true">🎉</span> Número sorteado: <strong>{numeroExibido}</strong>
      </h1>

      <section
        aria-label="Dados do vencedor"
        className="mt-6 rounded-card border border-linha bg-white p-6 text-center shadow-sm"
      >
        <p className="text-5xl font-bold tracking-tight text-ouro">{numeroExibido}</p>
        <p className="mt-3 text-lg font-semibold text-tinta">{comprador.nome}</p>
        <p className="text-sm text-tinta-suave">{telefoneOculto}</p>

        <div className="mt-4 space-y-1 border-t border-linha pt-4 text-sm text-tinta-suave">
          <p className="text-base font-medium text-tinta">{frasePremio}</p>
          <p>Sorteado em: {formatarDataHora(sorteio.sorteado_em)}</p>
        </div>
      </section>

      <div className="mt-6">
        <BotaoCopiarResultado texto={textoCompartilhavel} />
      </div>
    </main>
  );
}
