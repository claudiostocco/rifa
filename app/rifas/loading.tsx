/**
 * Skeleton do segmento `/rifas` (nova, painel e edição): mantém a estrutura
 * da página estável enquanto o Server Component confere a sessão e consulta
 * o banco (evita "pulo" de layout). `role="status"` anuncia o carregamento.
 */
export default function CarregandoRifas() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-12 pt-8">
      <div aria-hidden="true" className="mb-6 h-10 w-36 animate-pulse rounded-lg bg-papel-escuro" />

      <div aria-hidden="true" className="mb-6 space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-papel-escuro" />
        <div className="h-4 w-72 animate-pulse rounded bg-papel-escuro" />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-linha bg-white p-6 shadow-sm"
      >
        <span className="sr-only">Carregando a rifa…</span>

        <div className="space-y-5" aria-hidden="true">
          {[36, 24, 28, 28].map((largura, indice) => (
            <div key={indice} className="space-y-1.5">
              <div
                className="h-4 animate-pulse rounded bg-papel-escuro"
                style={{ width: largura * 4 }}
              />
              <div className="h-11 w-full animate-pulse rounded-lg bg-papel-escuro" />
            </div>
          ))}
          <div className="h-[52px] w-full animate-pulse rounded-lg bg-papel-escuro" />
        </div>
      </div>
    </main>
  );
}
