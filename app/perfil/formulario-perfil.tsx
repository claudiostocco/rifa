"use client";

import { useActionState, useState } from "react";

import { salvarPerfil, type EstadoPerfil } from "@/actions/perfil";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatarTelefoneE164, mascaraTelefoneDigitacao } from "@/lib/formato";

type Props = {
  /** Valores atuais vindos do servidor, já prontos para exibição. */
  nomeInicial: string;
  /** WhatsApp atual em máscara de exibição; vazio na 1ª configuração. */
  whatsappInicial: string;
};

/** WhatsApp digitável (máscara parcial ou completa) fecha no E.164 do contrato. */
const e164Valido = (texto: string): boolean => {
  try {
    formatarTelefoneE164(texto);
    return true;
  } catch {
    return false;
  }
};

/**
 * Formulário do perfil (FD-9 · §4.17): validação no servidor via Server
 * Action (`PerfilInputSchema`), máscara progressiva no campo, botão pendente
 * durante o envio e feedback acessível de sucesso/erro (role=status/alert).
 */
export function FormularioPerfil({ nomeInicial, whatsappInicial }: Props) {
  const [estado, disparar, enviando] = useActionState<EstadoPerfil, FormData>(
    salvarPerfil,
    undefined,
  );
  const [nome, setNome] = useState(nomeInicial);
  const [whatsapp, setWhatsapp] = useState(whatsappInicial);
  const [telefoneTocado, setTelefoneTocado] = useState(false);

  const erroTelefone =
    telefoneTocado && whatsapp !== "" && !e164Valido(whatsapp)
      ? "Telefone incompleto — informe DDD + número (ex.: (11) 98888-7777)"
      : undefined;

  return (
    <form action={disparar} className="space-y-5" aria-busy={enviando}>
      <Input
        rotulo="Nome de exibição"
        id="nomeExibicao"
        name="nomeExibicao"
        autoComplete="name"
        placeholder="Como os compradores vão te ver"
        maxLength={120}
        required
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
      />
      <Input
        rotulo="WhatsApp"
        id="whatsapp"
        name="whatsapp"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(11) 98888-7777"
        dica="Com DDD. É o contato exibido no rodapé das suas rifas."
        erro={erroTelefone}
        required
        value={whatsapp}
        onBlur={() => setTelefoneTocado(true)}
        onChange={(evento) => setWhatsapp(mascaraTelefoneDigitacao(evento.target.value))}
      />

      <Button type="submit" tamanho="grande" className="w-full" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar perfil"}
      </Button>

      {estado && estado.ok ? (
        <p
          role="status"
          className="rounded-lg bg-verde-venda-suave px-3 py-2 text-sm font-medium text-green-900"
        >
          {estado.mensagem}
        </p>
      ) : null}
      {estado && !estado.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {estado.mensagem}
        </p>
      ) : null}
    </form>
  );
}
