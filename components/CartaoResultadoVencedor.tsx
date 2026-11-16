/**
 * SR-7 · Cartão do resultado do sorteio na T3 (§3.4.6 item 7 · RF-10) —
 * Server Component assíncrono consumido em `Suspense` pela T3: some (null)
 * quando a rifa ainda não tem sorteio VIGENTE (RN-08: `anulado_em IS NULL`)
 * e aparece com número, nome e telefone do ganhador quando há resultado.
 * SR-8: o mesmo cartão oferece [↩️ Anular resultado] (RF-15) — após a
 * anulação ele sai de cena (não há mais vigente) e a rifa volta a 🔒.
 *
 * Leitura sob RLS (`sorteios_organizador_proprias` — rifa de outro
 * organizador nunca vaza): o telefone chega em E.164 e é mascarado AQUI no
 * servidor por `formatarTelefoneOculto` (RF-10) — o cliente recebe apenas o
 * rótulo oculto "(11) 9••••-••44"; a revelação do valor completo é tarefa da
 * action `revelarTelefoneVencedor` (SR-7), autorizada no servidor.
 *
 * Falha de rede/leitura ≠ ausência de resultado: estado de erro anunciado
 * com `role=alert` e caminho de recuperação (padrão VT-1/VT-2).
 */
import Link from "next/link";

import { AnularSorteio } from "@/components/AnularSorteio";
import { TelefoneVencedor } from "@/components/TelefoneVencedor";
import { formatarNumero, formatarTelefoneOculto } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";

type Props = { rifaId: string; quantidade: number };

export async function CartaoResultadoVencedor({ rifaId, quantidade }: Props) {
  const supabase = await criarClienteServidor();

  // Sorteio VIGENTE (RN-08): resultado anulado ou inexistente → sem cartão.
  const { data: sorteio, error } = await supabase
    .from("sorteios")
    .select("numero:numero_id (numero), comprador:comprador_id (nome, telefone)")
    .eq("rifa_id", rifaId)
    .is("anulado_em", null)
    .maybeSingle();

  if (error) {
    return (
      <section
        role="alert"
        className="mt-6 rounded-card border border-red-200 bg-red-50 px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-red-800">
          Não foi possível carregar o resultado do sorteio. Verifique sua conexão e tente novamente.
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
  if (!sorteio) return null;

  // PostgREST embute 1:1 (objeto) — defesa padrão da casa (`actions/sorteio.ts`).
  const numeroBruto = Array.isArray(sorteio.numero)
    ? sorteio.numero[0]?.numero
    : sorteio.numero?.numero;
  const comprador = Array.isArray(sorteio.comprador) ? sorteio.comprador[0] : sorteio.comprador;

  // Dado incompleto/fora do domínio de `formatarNumero` (bug de banco, nunca
  // pela via da casa): cartão omitido em vez de crashar a tela do organizador.
  if (
    !comprador ||
    typeof numeroBruto !== "number" ||
    numeroBruto < 1 ||
    numeroBruto > quantidade
  ) {
    return null;
  }

  // RF-10 no servidor: o payload carrega só o rótulo oculto. Telefone
  // malformado (gravação direta) cai no rótulo neutro, sem botão de revelação.
  let telefoneOculto: string | null = null;
  try {
    telefoneOculto = formatarTelefoneOculto(comprador.telefone);
  } catch {
    telefoneOculto = null;
  }

  return (
    <section
      aria-label="Resultado do sorteio"
      className="mt-6 rounded-card border border-linha bg-white p-6 shadow-sm"
    >
      <p className="text-sm font-medium text-tinta-suave">
        <span aria-hidden="true">🏆</span> Resultado do sorteio
      </p>

      <div className="mt-3 text-center">
        <p className="text-4xl font-bold tracking-tight text-ouro">{formatarNumero(numeroBruto)}</p>
        <p className="mt-2 text-base font-semibold text-tinta">{comprador.nome}</p>

        <div className="mt-2 flex justify-center">
          {telefoneOculto ? (
            <TelefoneVencedor rifaId={rifaId} telefoneOculto={telefoneOculto} />
          ) : (
            <p className="text-sm text-tinta-suave">Telefone não divulgado</p>
          )}
        </div>
      </div>

      {/* SR-8 · RF-15: anulação do resultado vigente (transação única na RPC
          desfazer_sorteio) — no sucesso o cartão sai de cena (RN-08) junto
          com o refresh que devolve o badge 🔒 e as ações da etapa encerrada. */}
      <AnularSorteio rifaId={rifaId} />
    </section>
  );
}
