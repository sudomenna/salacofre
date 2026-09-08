/**
 * app/(gov)/loading.tsx
 *
 * Gêmeo de `app/(pres)/loading.tsx` para a trilha Governador — e existe pelo
 * mesmo motivo, documentado lá: sem um boundary DENTRO do layout do grupo, o
 * `app/loading.tsx` da raiz substitui a moldura inteira a cada navegação que
 * suspende, e o mapa remonta.
 */

export default function GovLoading() {
  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-4 py-6 md:px-6 md:py-10">
      <div
        className="h-8 w-48 animate-pulse rounded"
        style={{ backgroundColor: "var(--color-bg-muted)" }}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-4">
        <div
          className="h-10 w-3/4 animate-pulse rounded"
          style={{ backgroundColor: "var(--color-bg-muted)" }}
          aria-hidden="true"
        />
        <div
          className="h-24 animate-pulse rounded"
          style={{ backgroundColor: "var(--color-bg-muted)" }}
          aria-hidden="true"
        />
      </div>
      <p className="sr-only" aria-live="polite" role="status">
        Carregando dados da apuração…
      </p>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
