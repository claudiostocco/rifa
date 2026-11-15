"use client";

/**
 * VT-4 · Modal T3a do organizador (SPEC §3.4.5): título "Número 037", nome
 * (2–120) e telefone obrigatórios com máscara progressiva. Em número
 * `disponivel` registra a venda; em `vendido` os dados chegam preenchidos e
 * o organizador transfere (Salvar) ou remove (com confirmação inline).
 *
 * O modal é apresentacional: valida o contrato no cliente com a MESMA regra
 * do servidor (`VendaInputSchema` + `formatarTelefoneE164`, padrão FD-13) e
 * delega as Server Actions a quem o consome (GradeComModal). Falha do
 * servidor chega como `erroServidor` — exibida com `role=alert`, modal
 * permanece aberto; recusas de corrida ("Esse número acabou de ser
 * vendido") nunca são engolidas.
 *
 * PB-2 · variante pública (§3.5, "modal enxuto"): o consumidor T4 omite
 * `aoRemover` e nunca abre o modal em número vendido — só o registro de
 * comprador em número disponível existe na T4.
 */
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { StatusNumero } from "@/lib/estados";
import {
  formatarNumero,
  formatarTelefone,
  formatarTelefoneE164,
  mascaraTelefoneDigitacao,
} from "@/lib/formato";
import { VendaInputSchema } from "@/lib/schemas";

type Props = {
  /** Número exibido no título (§3.4.5: "Número 037"). */
  numero: number;
  status: StatusNumero;
  /** Comprador da venda vigente — prefill na edição/transferência. */
  comprador?: { nome: string; telefone: string };
  /** `true` enquanto a Server Action está em voo (botões travados, "Salvando…"). */
  pendente: boolean;
  /** Falha da Server Action (corrida, sessão, banco) — `role=alert` inline. */
  erroServidor: string | null;
  /** Registrar (disponível) ou transferir (vendido) — o consumidor decide. */
  aoEnviar: (nome: string, telefoneE164: string) => void;
  /**
   * Remoção com confirmação (RF-06, exclusiva do organizador). Omitida na
   * variante pública (PB-2/§3.5: a T4 não edita, transfere nem remove) —
   * sem o callback o bloco de remoção não entra no DOM (RNF-03: botão morto
   * não existe).
   */
  aoRemover?: () => void;
  aoFechar: () => void;
};

type ErrosCampos = { nome?: string; telefone?: string };

export function ModalVenda({
  numero,
  status,
  comprador,
  pendente,
  erroServidor,
  aoEnviar,
  aoRemover,
  aoFechar,
}: Props) {
  // Remount pelo `key` do consumidor reinicia o formulário a cada número.
  const [nome, setNome] = useState(comprador?.nome ?? "");
  const [telefoneDigitado, setTelefoneDigitado] = useState(
    comprador ? telefoneInicial(comprador.telefone) : "",
  );
  const [erros, setErros] = useState<ErrosCampos>({});
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const atualizar = () => setOffline(!navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  const vendido = status === "vendido";

  const aoSubmeter = (evento: FormEvent) => {
    evento.preventDefault();
    if (pendente || !navigator.onLine) {
      if (!navigator.onLine) setOffline(true);
      return;
    }

    // Validação campo a campo com os MESMOS schemas do contrato (FD-13):
    // os dois erros aparecem juntos, cada um sob o seu campo.
    const errosEncontrados: ErrosCampos = {};

    const resultadoNome = VendaInputSchema.shape.nome.safeParse(nome);
    if (!resultadoNome.success) {
      errosEncontrados.nome = resultadoNome.error.issues[0]?.message;
    }

    let telefoneE164: string | undefined;
    if (telefoneDigitado.trim() === "") {
      errosEncontrados.telefone = "Informe o telefone do comprador";
    } else {
      try {
        telefoneE164 = formatarTelefoneE164(telefoneDigitado);
      } catch (erro) {
        errosEncontrados.telefone =
          erro instanceof Error ? erro.message : "Informe o telefone do comprador";
      }
    }

    if (errosEncontrados.nome || errosEncontrados.telefone) {
      setErros(errosEncontrados);
      return;
    }
    if (telefoneE164 === undefined) return;

    setErros({});
    aoEnviar(nome, telefoneE164);
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Número ${formatarNumero(numero)}`}>
      <form
        onSubmit={aoSubmeter}
        className="space-y-4"
        noValidate
      >
        {offline ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Sem conexão — os dados não serão salvos até reconectar.
          </p>
        ) : null}
        {vendido ? (
          aoRemover ? (
            <p className="text-xs text-tinta-suave">
              Venda registrada. Você pode transferir para outro comprador ou remover a venda — o
              histórico fica preservado.
            </p>
          ) : (
            <p className="text-xs text-tinta-suave">Número já vendido.</p>
          )
        ) : null}

        <Input
          id="nome-comprador"
          rotulo="Nome"
          placeholder="Nome do comprador"
          autoComplete="off"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          erro={erros.nome}
          disabled={pendente || offline}
        />

        <Input
          id="telefone-comprador"
          rotulo="Telefone"
          placeholder="(11) 90000-0000"
          inputMode="tel"
          autoComplete="off"
          value={telefoneDigitado}
          onChange={(evento) => setTelefoneDigitado(mascaraTelefoneDigitacao(evento.target.value))}
          erro={erros.telefone}
          disabled={pendente || offline}
        />

        {erroServidor ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            {erroServidor}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <Button type="submit" disabled={pendente || offline}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>

          {vendido && aoRemover ? (
            confirmandoRemocao ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-800">
                  Remover esta venda? O comprador sai do número, mas o histórico fica preservado.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variante="perigo" onClick={aoRemover} disabled={pendente || offline}>
                    {pendente ? "Removendo…" : "Confirmar remoção"}
                  </Button>
                  <Button
                    variante="fantasma"
                    onClick={() => setConfirmandoRemocao(false)}
                    disabled={pendente || offline}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variante="perigo"
                onClick={() => setConfirmandoRemocao(true)}
                disabled={pendente || offline}
              >
                Remover venda
              </Button>
            )
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

/** E.164 do banco → máscara para o prefill; dado malformado não derruba o modal. */
function telefoneInicial(telefoneE164: string): string {
  try {
    return formatarTelefone(telefoneE164);
  } catch {
    return telefoneE164;
  }
}
