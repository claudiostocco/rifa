"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/**
 * Client do navegador (leitura pública com `anon` + sessão do organizador).
 * Usa apenas variáveis de ambiente NEXT_PUBLIC_* — nunca a service_role.
 * Regra de ouro: o browser lê; a escrita fica nas Server Actions (SPEC §2.2).
 */
let clienteSingleton: SupabaseClient<Database> | null = null;

export function criarClienteNavegador(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnon) {
    throw new Error(
      "Configuração do Supabase ausente: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  clienteSingleton =
    clienteSingleton ?? createBrowserClient<Database>(url, chaveAnon);

  return clienteSingleton;
}
