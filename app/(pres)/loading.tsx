/**
 * app/(pres)/loading.tsx
 *
 * Streaming UI das rotas de Presidente — e a peça que faz a moldura persistente
 * do ADR-0033 § 1 realmente persistir.
 *
 * ## Por que este arquivo existe, e por que `app/loading.tsx` não bastava
 *
 * Um `loading.tsx` embrulha em `<Suspense>` os FILHOS do segmento onde mora.
 * O `app/loading.tsx` (raiz) fica ACIMA de `app/(pres)/layout.tsx`: enquanto o
 * RSC da rota de destino não chega, o fallback do raiz substitui tudo abaixo do
 * `RootLayout` — inclusive a moldura e o mapa. Ao chegar, o layout do grupo
 * monta de novo, e a instância MapLibre nasce outra vez.
 *
 * Medido no navegador em 08/09, com uma marca `data-*` gravada no `<canvas>`:
 *   - `/uf/SP` → `/` preservava a marca (a home é estática, não suspende);
 *   - `/` → `/uf/RJ` PERDIA a marca — a página de UF faz trabalho de servidor
 *     (`readUfProjection` + o Blob do detalhe municipal), suspende, e caía no
 *     fallback do raiz.
 *
 * Com o boundary aqui, o mais próximo da página passa a ser este — dentro do
 * layout do grupo. A moldura fica montada e só a coluna de painéis pisca.
 * Depois da mudança, a marca sobrevive nos dois sentidos.
 *
 * Server Component puro, sem JS acima da dobra (RNF-007a). O esqueleto imita a
 * coluna de painéis, e não a página inteira: o mapa, que era metade do
 * `app/loading.tsx`, agora não está em tela nenhuma vez que este fallback
 * apareça — ele continua ali ao lado, vivo.
 */

export default function PresLoading() {
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
