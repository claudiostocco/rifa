import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormularioRifa, type RifaParaEdicao } from "@/components/FormularioRifa";
import { formatarValorDigitacao } from "@/lib/formato";
import { eRotuloPremio } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { RifaRow } from "@/lib/supabase/tipos";

export const metadata: Metadata = {
  title: "Editar rifa",
  description: "Ajuste título, prêmio e valores de uma rifa aberta.",
};

type Props = { params: Promise<{ id: string }> };

/** Recusa amigável em pt-BR — nunca o 404 default em inglês. */
function Recusa({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-card border border-linha bg-white px-6 py-10 text-center shadow-sm">
      <p className="text-sm font-medium text-tinta">{mensagem}</p>
      <Link
        href="/"
        className="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-marca underline underline-offset-2"
      >
        Voltar às rifas
      </Link>
    </div>
  );
}

/** Estrutura comum (nav + título) para o formulário e para as recusas. */
function Estrutura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <nav aria-label="Navegação da edição" className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
        >
          <span aria-hidden="true">‹</span> Voltar às rifas
        </Link>
      </nav>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-tinta">Editar rifa</h1>
      <p className="mb-6 text-sm text-tinta-suave">
        Somente rifas abertas podem ser editadas; as alterações valem para as rifas já publicadas.
      </p>

      {children}
    </main>
  );
}

/**
 * FD-13 · T2 · Editar (rota `/rifas/{id}/editar` — SPEC §2.8, §3.3, §4.13).
 * Rota protegida: o proxy (FD-8) já exige sessão; a conferência aqui é a
 * barreira real do Server Component.
 *
 * Consultas via client de sessão sob RLS (`rifas_organizador_le_proprias` e
 * `vendas_organizador_proprias`): rifa de outro organizador chega vazia e
 * vira recusa amigável — nunca dados de terceiros. A contagem de vendas para
 * a RN-09 conta QUALQUER venda (vigente ou removida), igual à `editarRifa`
 * (FD-11): refez a numeração apagaria o histórico em cascata.
 */
export default async function PaginaEditarRifa({ params }: Props) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    redirect("/entrar");
  }

  const { data: rifa, error } = await supabase
    .from("rifas")
    .select("*")
    .eq("id", id)
    .maybeSingle<RifaRow>();

  // `error` cobre id fora do formato uuid (22P02) e falha de rede/permissão.
  if (error || !rifa) {
    return (
      <Estrutura>
        <Recusa mensagem="Não encontramos essa rifa na sua conta." />
      </Estrutura>
    );
  }

  if (rifa.status !== "aberta") {
    return (
      <Estrutura>
        <Recusa mensagem="Somente rifas abertas podem ser editadas." />
      </Estrutura>
    );
  }

  const { data: numeros } = await supabase.from("numeros").select("id").eq("rifa_id", rifa.id);

  let vendas: number | null = 0;
  if (numeros && numeros.length > 0) {
    const { count, error: erroVendas } = await supabase
      .from("vendas")
      .select("id", { count: "exact", head: true })
      .in(
        "numero_id",
        numeros.map((numero) => numero.id),
      );
    vendas = erroVendas ? null : (count ?? 0);
  }

  if (vendas === null) {
    return (
      <Estrutura>
        <Recusa mensagem="Não foi possível carregar a rifa agora. Verifique sua conexão e tente novamente." />
      </Estrutura>
    );
  }

  // Rótulo chega como `string` dos tipos gerados (regra FD-4): o guarda
  // afunila; valor fora do domínio do CHECK cai no padrão da migração.
  const rifaParaEdicao: RifaParaEdicao = {
    id: rifa.id,
    titulo: rifa.titulo,
    descricao: rifa.descricao ?? "",
    premio_descricao: rifa.premio_descricao,
    premio_rotulo: eRotuloPremio(rifa.premio_rotulo) ? rifa.premio_rotulo : "estimado",
    premio_valor: formatarValorDigitacao(rifa.premio_valor),
    numero_valor: formatarValorDigitacao(rifa.numero_valor),
    quantidade: rifa.quantidade,
    qtd_minima: rifa.qtd_minima,
    data_prevista: rifa.data_prevista ?? "",
  };

  return (
    <Estrutura>
      <FormularioRifa rifa={rifaParaEdicao} quantidadeBloqueada={vendas > 0} />
    </Estrutura>
  );
}
