import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/database.types";

/**
 * id do usuário da sessão httpOnly (ou null, quando expirou). Helper comum
 * às Server Actions de escrita (rifas, vendas, ciclo, sorteio): a sessão é
 * sempre conferida no servidor antes de tocar o banco (§2.2).
 */
export async function usuarioDaSessao(): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getUser();
  return sessao?.user?.id ?? null;
}

/**
 * Client de leitura/escrita autenticada para Server Components e Server Actions.
 * Sessão via cookies httpOnly (@supabase/ssr) — sempre respeita as RLS.
 * `cookies()` é Promise no Next 16: o chamador precisa de `await`.
 */
export async function criarClienteServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnon) {
    throw new Error(
      "Configuração do Supabase ausente no servidor: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, chaveAnon, {
    // Sessão httpOnly (§4.17): o browser nunca lê o token — client.ts é
    // anônimo e as escritas passam pelas Server Actions (SPEC §2.3).
    cookieOptions: { httpOnly: true },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaDefinir) {
        try {
          for (const { name, value, options } of cookiesParaDefinir) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamada a partir de Server Component: o middleware renova a sessão.
        }
      },
    },
  });
}

/**
 * Client administrador (`service_role`), que ignora RLS para obras atômicas
 * (criação de rifa + números, sorteio, exclusão). Confinado ao servidor —
 * nunca importado por componentes client (guarda abaixo e teste ET-4/ET-2).
 */
export function criarClienteAdministrador() {
  // gotcha de domínio: um import acidental em 'use client' chegaria aqui com
  // `window` definido — aborta em vez de vazar a chave para o bundle.
  if (typeof window !== "undefined") {
    throw new Error(
      "A chave service_role não pode ser usada no navegador. Use a Server Action correspondente.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chaveServiceRole) {
    throw new Error(
      "Configuração do Supabase ausente no servidor: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createServerClient<Database>(url, chaveServiceRole, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Cliente de serviço usa service_role e não mantém sessão de cookie.
      },
    },
  });
}
