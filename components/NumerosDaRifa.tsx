/**
 * VT-4 · Números e vendas vigentes da rifa (SPEC §3.4.4/§3.4.5) — Server
 * Component assíncrono consumido em `Suspense` pela T3: o cabeçalho e o
 * resumo renderizam na hora e a grade chega em streaming com skeleton
 * estável (`EsqueletoGrade`, padrão FD-12/VT-2).
 *
 * Leituras sob RLS (`numeros_organizador_proprias` + `vendas_organizador_...`
 * — rifa de outro organizador nunca vaza): números com id/estado e as vendas
 * VIGENTES com nome/telefone do comprador (prefill da edição T3a). Os dados
 * de comprador são EXCLUSIVOS da rota protegida (RN-02/RNF-05) — nada daqui
 * alcança as telas públicas. Falha de rede/leitura vira estado de erro
 * anunciado com `role=alert` e caminho de recuperação, nunca confunde com
 * grade vazia (padrão VT-1/VT-2). As duas consultas rodam em paralelo.
 */
import Link from "next/link";

import { GradeComModal, type NumeroDaGrade, type VendaDaGrade } from "@/components/GradeComModal";
import { criarClienteServidor } from "@/lib/supabase/server";

type Props = { rifaId: string; quantidade: number };

export async function NumerosDaRifa({ rifaId, quantidade }: Props) {
  const supabase = await criarClienteServidor();

  const [numerosResultado, vendasResultado] = await Promise.all([
    supabase.from("numeros").select("id, numero, status").eq("rifa_id", rifaId).order("numero"),
    supabase
      .from("vendas")
      .select("numeros!inner(numero), compradores(nome, telefone)")
      .is("removida_em", null)
      .eq("numeros.rifa_id", rifaId),
  ]);

  const { error: erroNumeros } = numerosResultado;
  const { error: erroVendas } = vendasResultado;

  if (erroNumeros || erroVendas) {
    return (
      <section
        role="alert"
        className="mt-6 rounded-card border border-red-200 bg-red-50 px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar os números da rifa. Verifique sua conexão e tente novamente.
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

  const numeros: NumeroDaGrade[] = (numerosResultado.data ?? []).map((numero) => ({
    id: numero.id,
    numero: numero.numero,
    status: numero.status,
  }));

  const vendas: VendaDaGrade[] = (vendasResultado.data ?? []).map((venda) => ({
    numero: venda.numeros.numero,
    nome: venda.compradores.nome,
    telefone: venda.compradores.telefone,
  }));

  return <GradeComModal quantidade={quantidade} numeros={numeros} vendas={vendas} />;
}
