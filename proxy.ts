/**
 * FD-8 · Proxy (Middleware) do Supabase SSR — Next 16 (guia `01-app`,
 * arquivo `proxy.ts`; o antigo `middleware.ts` está descontinuado).
 *
 * Funções: renovar a sessão em toda requisição autenticada e proteger as
 * rotas do organizador (§2.8): `/`, `/rifas/*` e `/perfil/*` só com sessão;
 * `/entrar` redireciona o usuário já logado de volta ao app. Rotas públicas
 * (`/r/*`, estáticos) ficam fora do matcher — não gastam chamada ao Auth.
 * A conferência usa `getUser()` (validação no servidor do Auth), não apenas
 * a leitura otimista do cookie, conforme a recomendação do guia de
 * autenticação do Next + Supabase. Falha de rede no Auth = sem acesso
 * (fecha a porta; a tela pública continua independente).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/database.types";

const ROTA_ENTRAR = "/entrar";

/** Prefixos do organizador (§2.8): T1 `/`, T2/T3 `/rifas`, `/perfil`. */
const ROTAS_ORGANIZADOR = ["/rifas", "/perfil"];

function eRotaOrganizador(caminho: string): boolean {
  return (
    caminho === "/" ||
    ROTAS_ORGANIZADOR.some((rota) => caminho.startsWith(`${rota}/`) || caminho === rota)
  );
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnon) {
    throw new Error(
      "Configuração do Supabase ausente: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  let resposta = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, chaveAnon, {
    // Sessão httpOnly (§4.17) — ver comentário em lib/supabase/server.ts.
    cookieOptions: { httpOnly: true },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaDefinir) {
        for (const { name, value } of cookiesParaDefinir) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaDefinir) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const usuario = error ? null : data.user;

  const caminho = request.nextUrl.pathname;

  if (!usuario && eRotaOrganizador(caminho)) {
    const destino = request.nextUrl.clone();
    destino.pathname = ROTA_ENTRAR;
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  if (usuario && caminho === ROTA_ENTRAR) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  matcher: [
    // Tudo exceto estáticos e a área pública `/r/*` (T4/T5 sem sessão).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|r/).*)",
  ],
};
