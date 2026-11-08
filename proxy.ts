import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão httpOnly do Supabase em toda navegação (@supabase/ssr).
 * Next 16 usa a convenção proxy.ts (middleware.ts está deprecated).
 * Otimizado para performance: paraleliza refresh do Supabase com a resposta
 * para evitar waterfall (diretriz async-parallel).
 */
export async function proxy(request: NextRequest) {
  let respostaSupabase = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chaveAnon) {
    return respostaSupabase;
  }

  const supabase = createServerClient(url, chaveAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaDefinir) {
        for (const { name, value } of cookiesParaDefinir) {
          request.cookies.set(name, value);
        }
        respostaSupabase = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaDefinir) {
          respostaSupabase.cookies.set(name, value, options);
        }
      },
    },
  });

  // Importante para Server Components: evita refetch desnecessário.
  const { data } = await supabase.auth.getClaims();

  // Rotas protegidas (T1, T3 e afins da sessão do organizador — Fases 1/2).
  const emRotaProtegida =
    request.nextUrl.pathname.startsWith("/rifas") ||
    request.nextUrl.pathname.startsWith("/perfil");

  if (emRotaProtegida && !data?.claims) {
    const urlLogin = new URL("/entrar", request.nextUrl.origin);
    return NextResponse.redirect(urlLogin);
  }

  return respostaSupabase;
}

export const config = {
  matcher: [
    /*
     * Roda em tudo menos arquivos estáticos, next/image e service worker.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|icons|.*\\.(?:svg|png|jpg|jpeg|webp|gif|css|js|woff2?)$).*)",
  ],
};
