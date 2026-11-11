import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatarTelefone } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";

import { FormularioPerfil } from "./formulario-perfil";

export const metadata: Metadata = {
  title: "Meu perfil",
  description: "Nome de exibição e WhatsApp do organizador, exibidos no rodapé das rifas públicas.",
};

/** Iniciais para o avatar (fallback neutro quando o nome ainda é o do e-mail). */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? "");
  return letras.join("") || "♪";
}

/**
 * FD-9 · Tela `/perfil` (§2.8): primeira configuração do organizador — nome de
 * exibição + WhatsApp, exibidos depois no rodapé da T4 (decisão 7). Rota
 * protegida: o proxy já exige sessão; a conferência no servidor é a barreira
 * real (a renderização sem sessão nunca acontece).
 */
export default async function PaginaPerfil() {
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao?.user) {
    redirect("/entrar");
  }

  // Leitura da própria linha via RLS (`perfis_leitura_publica` cobre, mas o
  // filtro por id restringe a superfície ao mínimo necessário).
  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome_exibicao, whatsapp")
    .eq("id", sessao.user.id)
    .maybeSingle();

  const nomeExibicao = perfil?.nome_exibicao ?? "";
  let whatsappMascarado = "";
  if (perfil?.whatsapp) {
    try {
      // Perfis provisionados pelo trigger nascem com whatsapp "" — nesse caso
      // o campo começa vazio para a 1ª configuração.
      whatsappMascarado = formatarTelefone(perfil.whatsapp);
    } catch {
      whatsappMascarado = "";
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <nav aria-label="Navegação do perfil" className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
        >
          <span aria-hidden="true">‹</span> Voltar às rifas
        </Link>
      </nav>

      <div className="rounded-2xl border border-linha bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-marca text-lg font-semibold text-white"
          >
            {iniciais(nomeExibicao)}
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-tinta">Meu perfil</h1>
            <p className="text-sm text-tinta-suave">
              É assim que você aparece e como os interessados falam com você no rodapé das suas
              rifas.
            </p>
          </div>
        </div>

        <FormularioPerfil nomeInicial={nomeExibicao} whatsappInicial={whatsappMascarado} />
      </div>
    </main>
  );
}
