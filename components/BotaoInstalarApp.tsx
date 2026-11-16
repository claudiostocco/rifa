"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function BotaoInstalarApp() {
  const [eventoInstalacao, setEventoInstalacao] = useState<EventoInstalacao | null>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    function aoSolicitarInstalacao(evento: Event) {
      evento.preventDefault();
      setEventoInstalacao(evento as EventoInstalacao);
    }

    function aoInstalar() {
      setInstalado(true);
      setEventoInstalacao(null);
    }

    window.addEventListener("beforeinstallprompt", aoSolicitarInstalacao);
    window.addEventListener("appinstalled", aoInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", aoSolicitarInstalacao);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  async function instalar() {
    if (!eventoInstalacao) return;

    await eventoInstalacao.prompt();
    const escolha = await eventoInstalacao.userChoice;
    setEventoInstalacao(null);
    if (escolha.outcome === "accepted") setInstalado(true);
  }

  if (instalado || !eventoInstalacao) return null;

  return (
    <Button type="button" onClick={() => void instalar()}>
      Instalar app
    </Button>
  );
}
