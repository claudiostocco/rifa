import type { Metadata } from "next";

import { FormularioEntrar } from "./formulario-entrar";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesso do organizador ao painel de rifas.",
};

/**
 * FD-8 · Tela de acesso (§2.8 `/entrar`): única rota de autenticação.
 * Sem cadastro público (§4.17) — contas provisionadas pelo painel do
 * Supabase; a dica informa isso em vez de link de cadastro.
 */
export default function Entrar() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-linha bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca text-2xl text-white"
          >
            🎫
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-tinta">Rifa App</h1>
            <p className="text-sm text-tinta-suave">Entre para gerenciar suas rifas e vendas.</p>
          </div>
        </div>

        <FormularioEntrar />

        <p className="mt-6 text-center text-xs text-tinta-suave">
          O acesso é criado no provisionamento da conta — não há cadastro público.
        </p>
      </div>
    </main>
  );
}
