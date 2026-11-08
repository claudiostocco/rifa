import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * GlobalSetup de integração (ET-7): lê `supabase status` do stack local
 * já iniciado com as migrações e expõe URL/keys via variáveis de ambiente.
 * O stack DEVE estar no ar: `supabase start` antes de `pnpm test:int`.
 */

const raiz = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

type StatusSupabase = Record<string, string | Record<string, unknown>>;

export default function setup(): () => void {
  let bruto: string;

  try {
    bruto = execSync("supabase status -o json", {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(
      "Supabase local indisponível. Antes de `pnpm test:int`, rode `supabase start` (ET-7)."
    );
  }

  const status = JSON.parse(bruto) as StatusSupabase;

  const url = (status.API_URL as string) ?? "";
  const chaveAnon = (status.ANON_KEY as string) ?? "";
  const chaveService = (status.SERVICE_ROLE_KEY as string) ?? "";

  if (!url || !chaveAnon || !chaveService) {
    throw new Error(
      "supabase status não retornou API_URL/ANON_KEY/SERVICE_ROLE_KEY — verifique o stack local (ET-7)."
    );
  }

  process.env.TEST_SUPABASE_URL = url;
  process.env.TEST_SUPABASE_ANON_KEY = chaveAnon;
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY = chaveService;

  // teardown no-op: o stack local é reaproveitado entre execuções (ET-7).
  return () => {};
}
