"use client";

/**
 * SR-1/SR-2 · Botões do ciclo por etapa (SPEC §3.4.6, item 6) — consumidos
 * pelo Server Component `AcoesCicloRifa`:
 *   - **aberta** → [🔒 Encerrar vendas] com confirmação (§3.4.6); abaixo do
 *     mínimo o texto prescrito da §4.8/RN-06 aparece e o organizador decide
 *     ("Encerrar mesmo assim" ou "Cancelar") — o mínimo é aviso, não bloqueio;
 *   - **encerrada** → [🎉 Realizar Sorteio] em DESTAQUE com a confirmação
 *     prescrita "O sorteio será feito entre X números vendidos" (§4.9; o
 *     mínimo NUNCA bloqueia o sorteio, §4.8/decisão 10) e [↩️ Reabrir
 *     vendas] direto (sem confirmação na SPEC).
 *
 * Sucesso → Toast pt-BR + `router.refresh()` (badge, resumo e grade
 * re-renderizam no servidor); recusa da Server Action → toast de erro, nunca
 * engolida (VT-4). A conferência de transição é sempre no servidor (§2.7) —
 * os botões apenas disparam.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { encerrarVendas, reabrirVendas, type EstadoCiclo } from "@/actions/ciclo";
import { sortear } from "@/actions/sorteio";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import type { StatusRifa } from "@/lib/estados";
import { formatarQuantidade } from "@/lib/formato";

type Props = {
  rifaId: string;
  status: StatusRifa;
  vendidos: number;
  qtdMinima: number;
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

export function BotoesCiclo({ rifaId, status, vendidos, qtdMinima }: Props) {
  const router = useRouter();
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
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
      setAviso({ mensagem: resultado.mensagem, tipo: resultado.ok ? "sucesso" : "erro" });
      if (resultado.ok) router.refresh();
    });
  };

  if (status === "sorteada") return null; // ações do resultado chegam em SR-4/SR-6/SR-8

  if (status === "encerrada") {
    return (
      <>
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

        {aviso ? (
          <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
        ) : null}
      </>
    );
  }

  return (
    <>
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

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </>
  );
}
