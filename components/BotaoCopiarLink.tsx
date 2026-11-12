"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

type Props = {
  /** URL pública completa (protocolo + host + /r/{slug}) construída no servidor. */
  url: string;
};

/**
 * Botão "Copiar link público" do cabeçalho da T3 (§3.4.1; RF-13 copiar para
 * WhatsApp é completado no PB-6). O endereço fica visível: se a API de
 * clipboard estiver indisponível ou a permissão negada, o fallback é copiar
 * manualmente — nunca crash (PB-6 · Cenário B). O feedback usa o Toast do
 * design system (`role=status`, some sozinho).
 */
export function BotaoCopiarLink({ url }: Props) {
  const [aviso, setAviso] = useState<{ mensagem: string; tipo: "sucesso" | "erro" } | null>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setAviso({ mensagem: "Link copiado! Cole no WhatsApp ou onde quiser.", tipo: "sucesso" });
    } catch {
      setAviso({
        mensagem:
          "Não foi possível copiar automaticamente. Selecione o link acima e copie manualmente.",
        tipo: "erro",
      });
    }
  };

  return (
    <div className="rounded-card border border-linha bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-tinta">Link público da rifa</p>
      <p aria-label="Endereço público da rifa" className="mt-1 break-all text-sm text-tinta-suave">
        {url}
      </p>
      <Button variante="secundario" className="mt-3 w-full" onClick={copiar}>
        Copiar link público
      </Button>
      {aviso ? (
        <Toast mensagem={aviso.mensagem} tipo={aviso.tipo} aoEncerrar={() => setAviso(null)} />
      ) : null}
    </div>
  );
}
