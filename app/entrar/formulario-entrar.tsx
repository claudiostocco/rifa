"use client";

import { useActionState } from "react";

import { entrar, type EstadoEntrar } from "@/actions/autenticacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Formulário de acesso (FD-8 · T `entrar`): validação no servidor via
 * Server Action, feedback pendente no botão (nenhum clique duplo) e
 * mensagem de erro acessível (`role=alert`).
 */
export function FormularioEntrar() {
  const [estado, disparar, enviando] = useActionState<EstadoEntrar, FormData>(entrar, undefined);

  return (
    <form action={disparar} className="space-y-5" aria-busy={enviando}>
      <Input
        rotulo="E-mail"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="voce@exemplo.com"
        required
      />
      <Input
        rotulo="Senha"
        id="senha"
        name="senha"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        required
      />

      <Button type="submit" tamanho="grande" className="w-full" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </Button>

      {estado && !estado.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {estado.mensagem}
        </p>
      ) : null}
    </form>
  );
}
