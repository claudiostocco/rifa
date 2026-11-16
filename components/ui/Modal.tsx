"use client";

import * as React from "react";

type ModalProps = {
  /** Controla exibição (folha client que detém o estado). */
  aberto: boolean;
  aoFechar: () => void;
  /** Título pt-BR anunciado pelo leitor de tela (nome do modal T3a). */
  titulo: string;
  children: React.ReactNode;
};

const TECLA_ESCAPE = "Escape";

/**
 * Modal base (ET-9) usado pelo T3a/T4. Focus entra no container e ESC fecha;
 * backdrop clicável fecha também. A11y: role=dialog + aria-modal + aria-labelledby.
 */
export function Modal({ aberto, aoFechar, titulo, children }: ModalProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fecharRef = React.useRef(aoFechar);

  React.useEffect(() => {
    fecharRef.current = aoFechar;
  }, [aoFechar]);

  React.useEffect(() => {
    if (!aberto) return;

    const elementoAnterior = document.activeElement;
    const dialogo = containerRef.current;
    const campoInicial = dialogo?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    (campoInicial ?? dialogo)?.focus();

    const aoDigitar = (evento: KeyboardEvent) => {
      if (evento.key === TECLA_ESCAPE) {
        fecharRef.current();
        return;
      }

      if (evento.key !== "Tab" || !dialogo) return;

      const elementosFocaveis = Array.from(
        dialogo.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((elemento) => !elemento.hasAttribute("hidden") && elemento.getAttribute("aria-hidden") !== "true");
      const primeiro = elementosFocaveis[0];
      const ultimo = elementosFocaveis[elementosFocaveis.length - 1];
      const ativo = document.activeElement;

      if (!primeiro || !ultimo) {
        evento.preventDefault();
        dialogo.focus();
      } else if (evento.shiftKey && (ativo === primeiro || !dialogo.contains(ativo))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (ativo === ultimo || !dialogo.contains(ativo))) {
        evento.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoDigitar);
    return () => {
      document.removeEventListener("keydown", aoDigitar);
      if (elementoAnterior instanceof HTMLElement && elementoAnterior.isConnected) {
        elementoAnterior.focus();
      }
    };
  }, [aberto]);

  if (!aberto) return null;

  const idTitulo = "titulo-do-modal";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 p-4 sm:items-center"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="w-full max-w-sm rounded-card bg-white p-4 shadow-xl outline-none"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={idTitulo} className="text-lg font-semibold text-tinta">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-tinta-suave hover:bg-papel-escuro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
