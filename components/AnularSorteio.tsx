"use client";

/**
 * SR-8 · Anulação do resultado do sorteio (RF-15/§4.14) — o organizador
 * anula o resultado VIGENTE (RN-08) direto no cartão "🏆 Resultado do
 * sorteio" da T3 (§3.4.6 item 7 — o mesmo cartão da revelação RF-10): a
 * Server Action `desfazerSorteio` marca `anulado_em` e devolve a rifa a
 * `encerrada` em transação única (RPC `desfazer_sorteio`, migração 006).
 *
 * Confirmação em 2 passos (padrão VT-4/SR-1): o texto cita a consequência
 * prescrita (rifa volta a encerrada e o re-sorteio fica permitido; o
 * histórico anulado fica preservado e invisível em tela, RF-15).
 *
 * Sucesso → Toast pt-BR + `router.refresh()`: o cartão sai de cena (não há
 * mais vigente), o badge vira 🔒 Encerrada e a barra de ações da etapa
 * `encerrada` volta (Realizar Sorteio / Reabrir vendas). Recusa → Toast de
 * erro, nunca engolida (padrão VT-4/SR-7). Em ambos os casos o toast vive no
 * HOST RAIZ (`ToastRaiz`, padrão SR-5): o próprio sucesso desmonta este
 * componente junto com o cartão, e o feedback não pode morrer com ele.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { desfazerSorteio, type EstadoAnulacao } from "@/actions/sorteio";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { emitirToastRaiz } from "@/components/ToastRaiz";

type Props = { rifaId: string };

export function AnularSorteio({ rifaId }: Props) {
  const router = useRouter();
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [pendente, iniciarPendente] = useTransition();

  const anular = () => {
    setConfirmacaoAberta(false);
    iniciarPendente(async () => {
      const resultado: EstadoAnulacao = await desfazerSorteio(rifaId);
      emitirToastRaiz({ mensagem: resultado.mensagem, tipo: resultado.ok ? "sucesso" : "erro" });
      if (resultado.ok) router.refresh();
    });
  };

  return (
    <>
      <Button
        variante="secundario"
        className="mt-4 w-full"
        onClick={() => setConfirmacaoAberta(true)}
        disabled={pendente}
      >
        {pendente ? (
          "Anulando…"
        ) : (
          <>
            <span aria-hidden="true">↩️</span> Anular resultado
          </>
        )}
      </Button>

      <Modal
        aberto={confirmacaoAberta}
        aoFechar={() => setConfirmacaoAberta(false)}
        titulo="Anular o resultado do sorteio"
      >
        <div className="space-y-4">
          <p className="text-sm text-tinta">
            O resultado atual será anulado e a rifa voltará para encerrada. Você poderá sortear
            novamente — o histórico da anulação fica preservado.
          </p>

          <div className="flex flex-col gap-2">
            <Button onClick={anular} disabled={pendente} className="w-full">
              Anular resultado
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
    </>
  );
}
