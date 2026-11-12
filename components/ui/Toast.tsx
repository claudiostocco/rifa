"use client";

import * as React from "react";

type ToastProps = {
  /** Mensagem pt-BR pronta para exibição (padrão das Server Actions — SPEC §2.2). */
  mensagem: string;
  /** `sucesso` = verde · `erro` = vermelho · `neutro` = tinta. */
  tipo?: "sucesso" | "erro" | "neutro";
  /** Duração até desaparecer (ms); 0 = persiste até ação do usuário. */
  duracaoMs?: number;
  aoEncerrar?: () => void;
};

const estilosPorTipo = {
  sucesso: "bg-verde-venda text-white",
  erro: "bg-red-700 text-white",
  neutro: "bg-tinta text-white",
} as const;

/**
 * Toast base (ET-9): mensagem em português, `role=status` acessível e
 * desaparece sozinho após a duração (com timer testável via fake timers).
 */
export function Toast({ mensagem, tipo = "neutro", duracaoMs = 4000, aoEncerrar }: ToastProps) {
  React.useEffect(() => {
    if (duracaoMs <= 0) return;

    const timer = setTimeout(() => {
      aoEncerrar?.();
    }, duracaoMs);

    return () => clearTimeout(timer);
  }, [duracaoMs, aoEncerrar]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-lg px-4 py-3",
        "flex min-h-[44px] items-center justify-between gap-3 text-sm font-medium shadow-lg",
        estilosPorTipo[tipo],
      ].join(" ")}
    >
      <span>{mensagem}</span>
      {aoEncerrar ? (
        <button
          type="button"
          onClick={aoEncerrar}
          aria-label="Fechar aviso"
          className="shrink-0 rounded px-1 text-white/80 hover:text-white"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
