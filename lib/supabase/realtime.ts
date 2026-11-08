"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { criarClienteNavegador } from "@/lib/supabase/client";

type MudancaStatusNumero = "INSERT" | "UPDATE" | "DELETE";

/** Registro do evento POSTGRES_CHANGES da tabela numeros (RF-18). */
export type MudancaStatusNumeros = {
  type: MudancaStatusNumero;
  resposta: {
    id: string;
    rifa_id: string;
    numero: number;
    status: string;
  };
};

/**
 * Assina as mudanças de `numeros` de uma rifa para a grade atualizar ao vivo
 * (SPEC §2.5/RF-18). Só `numeros` chega ao anon via RLS — nunca compradores/vendas.
 */
export function assinarMudancaNumeros(
  rifaId: string,
  aoMudar: (nova: MudancaStatusNumeros) => void
): RealtimeChannel {
  const cliente = criarClienteNavegador();

  return cliente
    .channel(`numeros-da-rifa-${rifaId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "numeros",
        filter: `rifa_id=eq.${rifaId}`,
      },
      (payload) => {
        // União INSERT | UPDATE | DELETE: `new` existe em insert/update,
        // `old` em update/delete — nargs via narrowing por `in`.
        const registro =
          "new" in payload && payload.new !== null ? payload.new : payload.old;

        if (registro && typeof registro === "object") {
          const resposta = registro as MudancaStatusNumeros["resposta"];
          aoMudar({ type: payload.eventType as MudancaStatusNumero, resposta });
        }
      }
    )
    .subscribe();
}
