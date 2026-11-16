"use client";

import { useEffect, useState } from "react";

/**
 * Estado online comum às telas: o aviso é global e as gravações consultam o
 * mesmo sinal do navegador antes de chamar uma Server Action.
 */
export function StatusConexao() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="sticky top-0 z-[60] border-b border-amber-300 bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-950"
    >
      Sem conexão — os dados não serão salvos até reconectar
    </div>
  );
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  return online;
}

export function estaOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}
