/**
 * app/loading.tsx
 *
 * Streaming UI durante o load do RSC `app/page.tsx`. Mostrado pelo Next.js
 * Suspense boundary enquanto `getInitialPayload()` resolve.
 *
 * Server Component puro. Sem JS no above-the-fold (RNF-007a).
 *
 * Cobertura: estado "Loading inicial" da spec 003.
 */

import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex max-w-page flex-col gap-8 px-4 py-6 md:px-6 md:py-10">
      {/* Header skeleton */}
      <div
        className="h-8 w-48 animate-pulse rounded"
        style={{ backgroundColor: "var(--color-bg-muted)" }}
        aria-hidden="true"
      />
      {/* Headline skeleton */}
      <div className="flex flex-col gap-4">
        <div
          className="h-10 w-3/4 animate-pulse rounded"
          style={{ backgroundColor: "var(--color-bg-muted)" }}
        />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div
            className="h-24 animate-pulse rounded"
            style={{ backgroundColor: "var(--color-bg-muted)" }}
          />
          <div
            className="h-24 animate-pulse rounded"
            style={{ backgroundColor: "var(--color-bg-muted)" }}
          />
        </div>
      </div>
      {/* Map skeleton */}
      <MapSkeleton height={420} />
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
