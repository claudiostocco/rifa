import * as React from "react";

type InputProps = {
  /** Rótulo sempre visível; exigido junto de `id` (a11y/WCAG 1.3.1). */
  rotulo: string;
  id: string;
  /** Mensagem de erro pt-BR exibida abaixo do campo e vinculada por aria. */
  erro?: string;
  dica?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">;

/**
 * Campo de texto base (ET-9) com rótulo, dica e estado de erro acessíveis.
 */
export function Input({ rotulo, id, erro, dica, className = "", ...props }: InputProps) {
  const idDica = dica ? `${id}-dica` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descritoPor = idErro ?? idDica;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {rotulo}
      </label>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor}
        className={[
          "min-h-[44px] w-full rounded-lg border bg-white px-3 text-base text-tinta",
          "placeholder:text-tinta-suave/60 disabled:cursor-not-allowed disabled:bg-papel-escuro disabled:text-tinta-suave",
          erro ? "border-red-600" : "border-linha focus:border-marca",
          className,
        ].join(" ")}
        {...props}
      />
      {dica && !erro ? (
        <span id={idDica} className="text-xs text-tinta-suave">
          {dica}
        </span>
      ) : null}
      {erro ? (
        <span id={idErro} className="text-xs font-medium text-red-700">
          {erro}
        </span>
      ) : null}
    </div>
  );
}
