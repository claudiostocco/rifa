/**
 * Skeleton do segmento `/r/{slug}` (PB-1 · T4 pública — SPEC §3.5, estado
 * "carregando"): mantém a estrutura da página estável enquanto o Server
 * Component consulta o banco (evita "pulo" de layout). `role="status"`
 * anuncia o carregamento (padrão FD-12).
 */
export default function CarregandoRifaPublica() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-linha bg-white p-6 shadow-sm"
      >
        <span className="sr-only">Carregando a rifa…</span>

        <div className="space-y-4" aria-hidden="true">
          <div className="h-7 w-64 animate-pulse rounded bg-papel-escuro" />
          <div className="h-5 w-44 animate-pulse rounded bg-papel-escuro" />
          <div className="h-4 w-32 animate-pulse rounded bg-papel-escuro" />
        </div>
      </div>
    </main>
  );
}
