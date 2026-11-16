"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

type Props = {
  /** Texto pronto (SR-6) montado no SERVIDOR — nunca contém o telefone completo. */
  texto: string;
};

/**
 * Botão "Copiar resultado" da T5 (§3.6 · RF-13): copia o texto formatado para
 * o WhatsApp. Se a API de clipboard estiver indisponível ou a permissão
 * negada, o texto formatado aparece selecionável abaixo para a cópia manual
 * — nunca crash (PB-6 · Cenário B). Feedback via Toast do design system
 * (`role=status`, some sozinho).
 */
export function BotaoCopiarResultado({ texto }: Props) {
  const [aviso, setAviso] = useState<{ mensagem: string; tipo: "sucesso" | "erro" } | null>(null);
  const [manual, setManual] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso({
        mensagem: "Resultado copiado! Cole no WhatsApp ou onde quiser.",
        tipo: "sucesso",
      });
    } catch {
      setManual(true);
      setAviso({
        mensagem: "Não foi possível copiar automaticamente. Copie o texto abaixo manualmente.",
        tipo: "erro",
      });
    }
  };

  return (
    <div className="rounded-card border border-linha bg-white p-4 shadow-sm">
      <Button variante="secundario" className="w-full" onClick={copiar}>
        Copiar resultado
      </Button>

      {/* Caminho manual (clipboard negado/indisponível): o texto completo fica
          selecionável — contíguo e sem "undefined". */}
      {manual ? (
        <p className="mt-3 select-all whitespace-pre-wrap break-words text-sm text-tinta-suave">
          {texto}
        </p>
      ) : null}

      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </div>
  );
}
