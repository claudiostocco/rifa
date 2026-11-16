import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormularioRifa } from "@/components/FormularioRifa";
import { criarClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Nova rifa",
  description: "Crie uma rifa com prêmio, valores e numeração de 001 até a quantidade escolhida.",
};

/**
 * FD-13 · T2 · Criar (rota `/rifas/nova` — SPEC §2.8, §3.3). Rota protegida:
 * o proxy (FD-8) já exige sessão; a conferência aqui é a barreira real do
 * Server Component (renderização sem sessão nunca acontece).
 */
export default async function PaginaNovaRifa() {
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    redirect("/entrar");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <nav aria-label="Navegação da criação" className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
        >
          <span aria-hidden="true">‹</span> Voltar às rifas
        </Link>
      </nav>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-tinta">Nova rifa</h1>
      <p className="mb-6 text-sm text-tinta-suave">
        Ao criar, os números de 001 até a quantidade escolhida ficam disponíveis na hora.
      </p>

      <FormularioRifa />
    </main>
  );
}
