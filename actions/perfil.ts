"use server";

/**
 * FD-9 · Perfil do organizador (SPEC §4.17) — única porta de escrita em
 * `perfis`. Usa o client de sessão (`anon` + cookie httpOnly), que respeita
 * a RLS `perfis_atualiza_proprio`: cada organizador só atualiza a própria
 * linha — nada de `service_role` aqui. Mensagens sempre pt-BR prontas para
 * Toast/alerta do formulário (§2.2); falha de rede/permissão nunca vaza
 * erro técnico para a UI.
 */
import { formatarTelefoneE164 } from "@/lib/formato";
import { PerfilInputSchema } from "@/lib/schemas";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Estado consumido pelo `useActionState` do formulário do perfil. */
export type EstadoPerfil = { ok: boolean; mensagem: string } | undefined;

export async function salvarPerfil(
  _estadoAnterior: EstadoPerfil,
  formData: FormData,
): Promise<EstadoPerfil> {
  const whatsappDigitado = String(formData.get("whatsapp") ?? "");
  let whatsapp = whatsappDigitado;
  try {
    // A UI digita com máscara; o contrato gravado é E.164 (§4.19). O conversor
    // aceita os dois formatos. Quando falha, o valor original segue adiante —
    // é o Zod quem devolve a mensagem pt-BR do contrato (sem throw cruzando a UI).
    whatsapp = formatarTelefoneE164(whatsappDigitado);
  } catch {
    whatsapp = whatsappDigitado;
  }

  const dados = PerfilInputSchema.safeParse({
    nomeExibicao: String(formData.get("nomeExibicao") ?? "").trim(),
    whatsapp,
  });

  if (!dados.success) {
    const problema = dados.error.issues[0];
    return { ok: false, mensagem: problema?.message ?? "Verifique os campos do formulário." };
  }

  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    return {
      ok: false,
      mensagem: "Sua sessão expirou. Entre novamente para salvar o perfil.",
    };
  }

  // `.select("id")` devolve as linhas efetivamente atualizadas: UPDATE que não
  // encontra a linha do perfil (ex.: conta recriada sem o trigger) não pode
  // reportar sucesso silencioso.
  const { data: atualizados, error } = await supabase
    .from("perfis")
    .update({
      nome_exibicao: dados.data.nomeExibicao,
      whatsapp: dados.data.whatsapp,
    })
    .eq("id", sessao.user.id)
    .select("id");

  if (error) {
    return {
      ok: false,
      mensagem: "Não foi possível salvar o perfil agora. Tente novamente em instantes.",
    };
  }
  if (!atualizados || atualizados.length === 0) {
    return {
      ok: false,
      mensagem: "Não encontramos o seu perfil. Entre novamente para recriá-lo.",
    };
  }

  return { ok: true, mensagem: "Perfil salvo com sucesso." };
}
