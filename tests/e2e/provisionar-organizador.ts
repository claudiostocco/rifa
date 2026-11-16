/**
 * FD-8 · Provisionamento do organizador para os testes E2E.
 *
 * O cadastro público está DESATIVADO (SPEC §4.17): o usuário de teste é
 * criado uma única vez via API admin do stack local (`supabase status`),
 * imitando o provisionamento feito no painel. A service_role vive apenas
 * no processo do Playwright — jamais no bundle do app.
 *
 * Idempotência: com execução paralela (fullyParallel), o GoTrue local
 * responde HTTP 500 (chave duplicada em `users_email_partial_key`) quando
 * o usuário já existe — então a existência é verificada antes e depois da
 * criação, e só um usuário realmente ausente causa falha.
 */
import { execSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

/** Credenciais fixas do organizador de teste (§4.17: sem cadastro público). */
export const CREDENCIAIS_ORGANIZADOR = {
  email: "organizador@rifa.test",
  senha: "organizador-rifa-2026",
} as const;

type StatusSupabase = Record<string, string>;

/** Credenciais do stack local (`supabase status`) para os clients admin dos testes. */
export function lerStatusLocal(): { url: string; serviceRole: string } {
  const bruto = execSync("supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(bruto) as StatusSupabase;
  return {
    url: status.API_URL,
    serviceRole: status.SERVICE_ROLE_KEY,
  };
}

export async function provisionarOrganizador(): Promise<void> {
  const { url, serviceRole } = lerStatusLocal();
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const organizadorExiste = async (): Promise<boolean> => {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    return data?.users.some((usuario) => usuario.email === CREDENCIAIS_ORGANIZADOR.email) ?? false;
  };

  if (await organizadorExiste()) return;

  await admin.auth.admin.createUser({
    email: CREDENCIAIS_ORGANIZADOR.email,
    password: CREDENCIAIS_ORGANIZADOR.senha,
    email_confirm: true,
  });

  // Criação em corrida com outro worker: confirmando com a listagem real.
  if (!(await organizadorExiste())) {
    throw new Error(
      `Organizador ${CREDENCIAIS_ORGANIZADOR.email} não ficou disponível no stack local.`,
    );
  }
}
