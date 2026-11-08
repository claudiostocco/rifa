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

  React.useEffect(() => {
    if (!aberto) return;

    containerRef.current?.focus();

    const aoDigitar = (evento: KeyboardEvent) => {
      if (evento.key === TECLA_ESCAPE) aoFechar();
    };

    document.addEventListener("keydown", aoDigitar);
    return () => document.removeEventListener("keydown", aoDigitar);
  }, [aberto, aoFechar]);

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
            className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-tinta-suave hover:bg-papel-escuro"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
