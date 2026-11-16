"use client";

/**
 * Toast no nível raiz da T3 (SR-8 · correção 15/11/2026 — mesmo padrão da
 * SR-5, que mantém Toast/Roleta sobrevivendo ao `router.refresh()`): host
 * client único montado na raiz da página do painel. Componentes que são
 * REMOVIDOS da árvore pelo próprio sucesso (o cartão do resultado sai de
 * cena por RN-08) não podem renderizar o próprio toast — o estado morreria
 * com a desmontagem. O feedback viaja por um evento tipado de `window` e o
 * host, que sobrevive ao refresh, exibe o `Toast` do design system.
 */
import { useEffect, useState } from "react";

import { Toast } from "@/components/ui/Toast";

export type AvisoRaiz = { mensagem: string; tipo: "sucesso" | "erro" | "neutro" };

const EVENTO_TOAST_RAIZ = "rifa:toast-raiz";

/** Emite um aviso para o host raiz — a mensagem prescrita da Server Action. */
export function emitirToastRaiz(aviso: AvisoRaiz): void {
  window.dispatchEvent(new CustomEvent<AvisoRaiz>(EVENTO_TOAST_RAIZ, { detail: aviso }));
}

type AvisoComChave = AvisoRaiz & { chave: number };

export function ToastRaiz() {
  const [aviso, setAviso] = useState<AvisoComChave | null>(null);

  useEffect(() => {
    // A chave reinicia o timer do Toast em emissões consecutivas (o Toast é
    // remontado — igual a trocar a mensagem do próprio componente).
    let contador = 0;
    const aoReceber = (evento: Event) => {
      const { mensagem, tipo } = (evento as CustomEvent<AvisoRaiz>).detail;
      setAviso({ mensagem, tipo, chave: contador++ });
    };
    window.addEventListener(EVENTO_TOAST_RAIZ, aoReceber);
    return () => window.removeEventListener(EVENTO_TOAST_RAIZ, aoReceber);
  }, []);

  if (!aviso) return null;

  return (
    <Toast
      key={aviso.chave}
      mensagem={aviso.mensagem}
      tipo={aviso.tipo}
      aoEncerrar={() => setAviso(null)}
    />
  );
}
