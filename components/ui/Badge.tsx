import * as React from "react";

const estilosPorTipo = {
  aberta: "bg-verde-venda-suave text-verde-venda",
  encerrada: "bg-papel-escuro text-tinta-suave",
  sorteada: "bg-ouro-suave text-ouro",
  neutro: "bg-papel-escuro text-tinta-suave",
  marca: "bg-marca-suave text-marca-forte",
} as const;

type BadgeProps = {
  tipo?: keyof typeof estilosPorTipo;
  children: React.ReactNode;
};

/** Etiqueta de estado (T1: 🟢 Aberta · 🔒 Encerrada · 🎉 Sorteada — SPEC §3.2). */
export function Badge({ tipo = "neutro", children }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        estilosPorTipo[tipo],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
