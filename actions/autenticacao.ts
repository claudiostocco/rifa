"use server";

/**
 * FD-8 · Autenticação do organizador (SPEC §4.17) — única porta de escrita
 * da sessão. Cadastro público é DESATIVADO (decisão: contas provisionadas
 * no painel/seed), então só existe entrar. Mensagens sempre pt-BR prontas
 * para o Toast/alerta do formulário; nenhum erro técnico cruza a UI.
 */
import { redirect } from "next/navigation";

import { EntrarInputSchema } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoEntrar = { ok: false; mensagem: string } | undefined;

/** Mapeia erros do GoTrue para pt-BR; erros inesperados nunca vazam cru. */
function traduzirErroDeAutenticacao(status: number, mensagem: string): string {
  if (mensagem.includes("Invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (status === 429) {
    return "Muitas tentativas de acesso. Aguarde alguns instantes e tente novamente.";
  }
  if (status >= 500) {
    return "O servidor de acesso está indisponível agora. Tente novamente em instantes.";
  }
  return "Não foi possível entrar. Verifique seus dados e tente novamente.";
}

export async function entrar(
  _estadoAnterior: EstadoEntrar,
  formData: FormData,
): Promise<EstadoEntrar> {
  const dados = EntrarInputSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });

  if (!dados.success) {
    const problema = dados.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os campos do formulário." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });

  if (error) {
    return {
      ok: false,
      mensagem: traduzirErroDeAutenticacao(error.status ?? 500, error.message),
    };
  }

  // redirect() encerra a action com NEXT_REDIRECT — nunca capturar em try/catch.
  redirect("/");
}
