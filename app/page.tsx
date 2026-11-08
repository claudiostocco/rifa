/**
 * Tela mínima da Fase 0 (ET-1): valida build/render e serve de ponto de
 * entrada; a T1 "Minhas Rifas" substitui esta página na Fase 1 (FD-12).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-marca text-2xl text-white"
      >
        🎫
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-tinta">Rifa App</h1>
        <p className="text-base text-tinta-suave">
          Crie rifas, registre vendas e realize o sorteio com transparência.
        </p>
      </div>
    </main>
  );
}
