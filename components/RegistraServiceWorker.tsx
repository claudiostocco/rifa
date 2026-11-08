"use client";

import { useEffect } from "react";

/**
 * Registra o service worker do shell PWA (decisão 6) apenas em produção,
 * evitando comportamento errático durante desenvolvimento.
 */
export function RegistraServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
