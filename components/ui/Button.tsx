import * as React from "react";

type ButtonVariantProps = {
  /** Estilo semântico; `primario` usa a marca terracota (contraste AA em fundo claro). */
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
  /** Tamanho com altura mínima de 44px (RNF-03 área de toque). */
  tamanho?: "medio" | "grande";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Classes do estilo primário (variante primario + tamanho medio) — reusadas
 * em `Link`, que renderiza <a> e não pode ser um <button> (T1 "+ Nova Rifa").
 * Mantidas em sincronia com `estilosVariante` e `estilosTamanho`.
 */
export const classesBotaoPrimario =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca bg-marca text-white hover:bg-marca-forte active:bg-marca-forte disabled:bg-marca/40";

const estilosVariante: Record<NonNullable<ButtonVariantProps["variante"]>, string> = {
  primario: "bg-marca text-white hover:bg-marca-forte active:bg-marca-forte disabled:bg-marca/40",
  secundario:
    "border border-linha bg-white text-tinta hover:bg-papel-escuro disabled:text-tinta/40",
  perigo: "border border-red-300 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300",
  fantasma: "bg-transparent text-tinta-suave hover:bg-papel-escuro disabled:opacity-40",
};

const estilosTamanho = {
  medio: "min-h-[44px] px-4 text-sm",
  grande: "min-h-[52px] px-6 text-base",
} as const;

/**
 * Botão base do design system (ET-9). Sem hooks/logo — componentizável em
 * Server Components; interatividade fica na folha client que o consome.
 */
export function Button({
  variante = "primario",
  tamanho = "medio",
  className = "",
  type = "button",
  ...props
}: ButtonVariantProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca",
        estilosVariante[variante],
        estilosTamanho[tamanho],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
