"use client";

/**
 * SR-1/SR-2/SR-5 · Botões do ciclo por etapa (SPEC §3.4.6, item 6) —
 * consumidos pelo Server Component `AcoesCicloRifa`:
 *   - **aberta** → [🔒 Encerrar vendas] com confirmação (§3.4.6); abaixo do
 *     mínimo o texto prescrito da §4.8/RN-06 aparece e o organizador decide
 *     ("Encerrar mesmo assim" ou "Cancelar") — o mínimo é aviso, não bloqueio;
 *   - **encerrada** → [🎉 Realizar Sorteio] em DESTAQUE com a confirmação
 *     prescrita "O sorteio será feito entre X números vendidos" (§4.9; o
 *     mínimo NUNCA bloqueia o sorteio, §4.8/decisão 10) e [↩️ Reabrir
 *     vendas] direto (sem confirmação na SPEC);
 *   - **sorteada** → sem ações do ciclo (as do resultado chegam em SR-6/SR-8).
 *
 * SR-5 · RF-09a: no sucesso do sorteio a gravação NÃO espera a animação —
 * toast prescrito + `router.refresh()` acontecem na hora (a rifa já virou
 * "sorteada" no servidor) e a `RoletaSorteio` gira sobre o snapshot JÁ
 * gravado, desacelerando nele (§4.9). Por isso Toast e roleta vivem no nível
 * raiz deste componente: `AcoesCicloRifa` o mantém montado na MESMA posição
 * da árvore quando o status vira "sorteada" (o card por etapa é interno
 * aqui), e o refresh não mata nem o aviso nem a roleta aberta.
 *
 * Recusa da Server Action → toast de erro, nunca engolida (VT-4). A
 * conferência de transição é sempre no servidor (§2.7) — os botões disparam.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { encerrarVendas, reabrirVendas, type EstadoCiclo } from "@/actions/ciclo";
import { sortear, type EstadoSorteio } from "@/actions/sorteio";
import { RoletaSorteio } from "@/components/RoletaSorteio";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import type { StatusRifa } from "@/lib/estados";
import { formatarQuantidade } from "@/lib/formato";
import type { ParticipanteRoleta } from "@/components/RoletaSorteio";

type Props = {
  rifaId: string;
  status: StatusRifa;
  vendidos: number;
  qtdMinima: number;
  /** SR-5 · vendas vigentes da rifa (primeiros nomes + números) — cenário da roleta. */
  participantes: ParticipanteRoleta[];
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

/** Variante de sucesso do `EstadoSorteio` — snapshot já gravado (SR-3). */
type SorteioGravado = Extract<EstadoSorteio, { ok: true }>;

export function BotoesCiclo({ rifaId, status, vendidos, qtdMinima, participantes }: Props) {
  const router = useRouter();
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // SR-5 · snapshot do resultado gravado que abre a roleta (null = fechada).
  const [sorteioGravado, setSorteioGravado] = useState<SorteioGravado | null>(null);
  const [pendente, iniciarPendente] = useTransition();

  const abaixoDoMinimo = vendidos < qtdMinima;

  /** Feedback comum: mensagem da ação no Toast; sucesso revalida o painel. */
  const processar = (resultado: EstadoCiclo) => {
    setAviso({ mensagem: resultado.mensagem, tipo: resultado.ok ? "sucesso" : "erro" });
    if (resultado.ok) router.refresh();
  };

  const encerrar = () => {
    setConfirmacaoAberta(false);
    iniciarPendente(async () => {
      processar(await encerrarVendas(rifaId));
    });
  };

  const reabrir = () => {
    iniciarPendente(async () => {
      processar(await reabrirVendas(rifaId));
    });
  };

  const sortearAgora = () => {
    setConfirmacaoAberta(false);
    iniciarPendente(async () => {
      const resultado = await sortear(rifaId);
      // A gravação não espera a animação (§4.9): toast prescrito + refresh
      // imediatos; a roleta gira DEPOIS, sobre o snapshot já gravado.
      setAviso({ mensagem: resultado.mensagem, tipo: resultado.ok ? "sucesso" : "erro" });
      if (resultado.ok) {
        setSorteioGravado(resultado);
        router.refresh();
      }
    });
  };

  const encerrarRoleta = () => setSorteioGravado(null);

  /** Card da etapa corrente (§3.4.6) — interno para que a posição deste
   *  componente na árvore (e seu estado) sobreviva à troca de status. */
  let conteudo: ReactNode = null;
  if (status === "encerrada") {
    conteudo = (
      <section
        aria-label="Ações da rifa"
        className="mt-6 rounded-card border border-linha bg-white p-4 shadow-sm"
      >
        {/* §3.4.6 — [🎉 Realizar Sorteio] em DESTAQUE (primario), acima de
            Reabrir vendas. A confirmação é prescrita (§4.9): contagem exata
            de vendidos; o mínimo NUNCA avisa nem bloqueia aqui (§4.8). */}
        <Button className="w-full" onClick={() => setConfirmacaoAberta(true)} disabled={pendente}>
          {pendente ? (
            "Sorteando…"
          ) : (
            <>
              <span aria-hidden="true">🎉</span> Realizar Sorteio
            </>
          )}
        </Button>

        <Button variante="secundario" className="w-full" onClick={reabrir} disabled={pendente}>
          {pendente ? (
            "Reabrindo…"
          ) : (
            <>
              <span aria-hidden="true">↩️</span> Reabrir vendas
            </>
          )}
        </Button>

        <Modal
          aberto={confirmacaoAberta}
          aoFechar={() => setConfirmacaoAberta(false)}
          titulo="Realizar o sorteio"
        >
          <div className="space-y-4">
            {/* §4.9 — texto prescrito com a contagem exata (inclusive 0:
                o bloqueio de rifa sem vendidos vem do servidor, §4.9/F7). */}
            <p className="text-sm text-tinta">
              O sorteio será feito entre {formatarQuantidade(vendidos)} números vendidos.
            </p>

            <div className="flex flex-col gap-2">
              <Button onClick={sortearAgora} disabled={pendente} className="w-full">
                Confirmar
              </Button>
              <Button
                variante="secundario"
                onClick={() => setConfirmacaoAberta(false)}
                disabled={pendente}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      </section>
    );
  } else if (status === "aberta") {
    conteudo = (
      <section
        aria-label="Ações da rifa"
        className="mt-6 rounded-card border border-linha bg-white p-4 shadow-sm"
      >
        <Button
          variante="secundario"
          className="w-full"
          onClick={() => setConfirmacaoAberta(true)}
          disabled={pendente}
        >
          {pendente ? (
            "Encerrando…"
          ) : (
            <>
              <span aria-hidden="true">🔒</span> Encerrar vendas
            </>
          )}
        </Button>

        <Modal
          aberto={confirmacaoAberta}
          aoFechar={() => setConfirmacaoAberta(false)}
          titulo="Encerrar vendas"
        >
          <div className="space-y-4">
            {/* §4.8/RN-06 — texto prescrito do aviso de mínimo (decisão 10: o
                organizador decide; o sorteio nunca bloqueia pelo mínimo). */}
            {abaixoDoMinimo ? (
              <p className="text-sm text-tinta">
                {formatarQuantidade(vendidos)} vendidos — abaixo do mínimo{" "}
                {formatarQuantidade(qtdMinima)}. Encerrar mesmo assim?
              </p>
            ) : (
              <p className="text-sm text-tinta">
                As vendas serão encerradas e o link público deixará de aceitar novas compras.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button onClick={encerrar} disabled={pendente} className="w-full">
                {abaixoDoMinimo ? "Encerrar mesmo assim" : "Confirmar"}
              </Button>
              <Button
                variante="secundario"
                onClick={() => setConfirmacaoAberta(false)}
                disabled={pendente}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      </section>
    );
  }

  return (
    <>
      {conteudo}

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}

      {/* SR-5 · RF-09a: roleta sobre o snapshot JÁ gravado — sobrevive ao
          refresh que trouxe o status "sorteada" (raiz do componente). */}
      {sorteioGravado ? (
        <RoletaSorteio
          participantes={participantes}
          resultado={sorteioGravado.resultado}
          aoEncerrar={encerrarRoleta}
        />
      ) : null}
    </>
  );
}
