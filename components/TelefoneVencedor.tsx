"use client";

/**
 * SR-7 · Revelação do telefone do ganhador (RF-10 · SPEC §3.4.6 item 7) —
 * no resultado exibido na T3, os dígitos "••" são clicáveis: o toque chama a
 * Server Action `revelarTelefoneVencedor` (SR-7), que autoriza NO SERVIDOR
 * (sessão + posse da rifa + sorteio vigente) e devolve o telefone já
 * formatado. O E.164 completo NUNCA está no payload da página — chega apenas
 * pela resposta da ação, em resposta a um gesto explícito do organizador.
 *
 * A prop `telefoneOculto` chega JÁ mascarada pelo servidor
 * (`formatarTelefoneOculto` — o mesmo rótulo da T5, §3.6); este componente
 * nunca monta máscara por conta própria.
 *
 * Recusa da ação → toast de erro, nunca engolida (padrão VT-4/SR-1). Os
 * segmentos "••" são botões inline (não o `Button` em bloco do design
 * system), mas herdam dele a altura mínima de 44px e o anel de foco (RNF-03).
 */
import { useState, useTransition } from "react";

import { revelarTelefoneVencedor } from "@/actions/sorteio";
import { Toast } from "@/components/ui/Toast";

type Props = {
  rifaId: string;
  /** Máscara prescrita já formada no servidor — ex.: "(11) 9••••-••44". */
  telefoneOculto: string;
};

type Aviso = { mensagem: string; tipo: "sucesso" | "erro" };

export function TelefoneVencedor({ rifaId, telefoneOculto }: Props) {
  const [telefoneRevelado, setTelefoneRevelado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [pendente, iniciarPendente] = useTransition();

  const revelar = () => {
    if (telefoneRevelado || pendente) return;
    iniciarPendente(async () => {
      const resultado = await revelarTelefoneVencedor(rifaId);
      if (resultado.ok) {
        setTelefoneRevelado(resultado.telefone);
      } else {
        setAviso({ mensagem: resultado.mensagem, tipo: "erro" });
      }
    });
  };

  if (telefoneRevelado) {
    return (
      <div role="status">
        <p className="text-sm text-tinta">{telefoneRevelado}</p>
        <p className="text-xs text-tinta-suave">Telefone visível só para você.</p>
      </div>
    );
  }

  return (
    <>
      {/* Os "••" clicáveis (§3.4.6): a máscara é fatiada pelos trechos contíguos
          de balas — `split(/(•+)/)` devolve texto e balas alternados, e cada
          grupo de balas vira um botão que revela o telefone completo. */}
      <p className="flex min-h-[44px] flex-wrap items-center text-sm text-tinta-suave">
        {telefoneOculto.split(/(•+)/).map((segmento, indice) =>
          segmento.startsWith("•") ? (
            <button
              key={`balas-${indice}`}
              type="button"
              onClick={revelar}
              disabled={pendente}
              aria-label="Revelar o telefone completo do ganhador"
              className="inline-flex min-h-[44px] items-center rounded-md px-1 font-medium text-marca underline decoration-dotted underline-offset-4 transition-colors hover:text-marca-forte focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:text-tinta/40"
            >
              {segmento}
            </button>
          ) : (
            <span key={`texto-${indice}`} className="inline-flex items-center">
              {segmento}
            </span>
          ),
        )}
      </p>

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </>
  );
}
