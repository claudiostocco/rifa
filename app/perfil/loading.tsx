/**
 * Skeleton da rota `/perfil`: mantém a estrutura do card estável enquanto o
 * Server Component confere a sessão e lê o perfil (evita "pulo" de layout).
 * `role="status"` anuncia o carregamento para tecnologias assistivas.
 */
export default function CarregandoPerfil() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div aria-hidden="true" className="mb-6 h-10 w-36 animate-pulse rounded-lg bg-papel-escuro" />

      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-linha bg-white p-6 shadow-sm"
      >
        <span className="sr-only">Carregando seu perfil…</span>

        <div className="mb-6 flex flex-col items-center gap-3">
          <div aria-hidden="true" className="h-14 w-14 animate-pulse rounded-full bg-papel-escuro" />
          <div aria-hidden="true" className="h-5 w-40 animate-pulse rounded bg-papel-escuro" />
          <div aria-hidden="true" className="h-4 w-64 animate-pulse rounded bg-papel-escuro" />
        </div>

        <div className="space-y-5" aria-hidden="true">
          <div className="space-y-1.5">
            <div className="h-4 w-36 animate-pulse rounded bg-papel-escuro" />
            <div className="h-11 w-full animate-pulse rounded-lg bg-papel-escuro" />
          </div>
          <div className="space-y-1.5">
            <div className="h-4 w-24 animate-pulse rounded bg-papel-escuro" />
            <div className="h-11 w-full animate-pulse rounded-lg bg-papel-escuro" />
          </div>
          <div className="h-12 w-full animate-pulse rounded-lg bg-papel-escuro" />
        </div>
      </div>
    </main>
  );
}
