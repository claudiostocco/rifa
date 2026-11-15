/**
 * PB-1/PB-2 · Grade pública da T4 (SPEC §3.5 · RF-11/RF-05a): Server
 * Component assíncrono consumido em `Suspense` pela página pública — skeleton
 * estável enquanto os números chegam (padrão FD-12). Lê os ESTADOS dos
 * números sob RLS pública (`numeros_publico_le_publicadas` — migração 001) e
 * o resultado VIGENTE (RN-08: `anulado_em IS NULL`) para o destaque dourado
 * 🏆 do vencedor (§2.7: estado de EXIBIÇÃO, nunca da tabela `numeros`).
 *
 * A leitura NÃO toca `compradores`/`vendas` (proibido na tela pública —
 * RN-02/RNF-05): a grade pública mostra apenas disponível/vendido/sorteado,
 * sem nome nem telefone. O `id` do número (uuid) é coluna própria da tabela
 * `numeros`, pública por RLS — é o que o modal enxuto envia à
 * `registrarVendaPublica` (PB-2), nunca dado de comprador.
 *
 * Desde a PB-2 as pastilhas são tocáveis: o modal enxuto registra comprador
 * em número disponível; vendido/sorteado mostra "Número já vendido." sem
 * formulário (glue client em `GradeComModalPublica`). Falha de rede/leitura
 * vira estado de erro com `role=alert` e caminho de recuperação (padrão
 * VT-1/VT-2), nunca confunde com grade vazia.
 */
import Link from "next/link";

import { GradeComModalPublica } from "@/components/GradeComModalPublica";
import { criarClienteServidor } from "@/lib/supabase/server";

type Props = {
  rifaId: string;
  quantidade: number;
  /** §3.5: só a etapa `aberta` registra venda — etapa encerrada/sorteada avisa. */
  vendasAbertas: boolean;
  /** Endereço da própria página — o "Recarregar" reexecuta o Server Component. */
  hrefRecarga: string;
};

export async function GradePublica({ rifaId, quantidade, vendasAbertas, hrefRecarga }: Props) {
  const supabase = await criarClienteServidor();

  const [numerosResultado, sorteioResultado] = await Promise.all([
    supabase
      .from("numeros")
      .select("id, numero, status")
      .eq("rifa_id", rifaId)
      .order("numero"),
    supabase
      .from("sorteios")
      .select("numero:numero_id (numero)")
      .eq("rifa_id", rifaId)
      .is("anulado_em", null)
      .maybeSingle(),
  ]);

  const { error: erroNumeros } = numerosResultado;
  const { error: erroSorteio } = sorteioResultado;

  if (erroNumeros || erroSorteio) {
    return (
      <section
        role="alert"
        className="rounded-card border border-red-200 bg-red-50 px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar os números da rifa. Verifique sua conexão e tente novamente.
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

  // PostgREST embute 1:1 (objeto) — a defesa `Array.isArray` é o padrão da
  // casa (`actions/sorteio.ts`); fora da faixa da rifa nunca é exibido.
  const sorteio = sorteioResultado.data;
  const numeroDoSorteio = Array.isArray(sorteio?.numero)
    ? sorteio.numero[0]?.numero
    : sorteio?.numero?.numero;
  const numeroSorteado =
    typeof numeroDoSorteio === "number" &&
    Number.isInteger(numeroDoSorteio) &&
    numeroDoSorteio >= 1 &&
    numeroDoSorteio <= quantidade
      ? numeroDoSorteio
      : undefined;

  return (
    <GradeComModalPublica
      rifaId={rifaId}
      quantidade={quantidade}
      numeros={numerosResultado.data ?? []}
      numeroSorteado={numeroSorteado}
      vendasAbertas={vendasAbertas}
    />
  );
}
