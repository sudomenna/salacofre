/**
 * app/(cand)/candidatos/loading.tsx
 *
 * Suspense boundary de `/candidatos` (T-13), mostrado enquanto a fatia do Blob
 * resolve.
 *
 * Server Component puro — zero JS (RF-146). Medido em 13/09 no build de
 * produção: a rota baixa as mesmas 8 requisições de `/sobre-o-modelo`, 150.285 B
 * gz sem o chunk `nomodule` — abaixo do piso de framework registrado
 * (RNF-007a-floor, 153.482 B). Pela definição vigente do RNF-007a (ADR-0030:
 * total medido − piso), o above-the-fold de aplicação é zero e a folga é o
 * orçamento inteiro de 150 KB, não os "1,3 KiB" que esta linha afirmava com a
 * métrica de escopo antigo.
 *
 * ## O esqueleto tem as medidas reais, não medidas bonitas
 *
 * As células usam a MESMA proporção 161×225 da foto do TSE e a mesma grade do
 * `<CandidatosGrid>`. Um esqueleto com outra medida troca um CLS por outro: o
 * salto deixa de acontecer no carregamento da imagem e passa a acontecer na
 * troca do esqueleto pelo conteúdo, que é pior porque acontece mais tarde
 * (RNF-002).
 *
 * A animação some sob `prefers-reduced-motion` (RNF-026), como em
 * `app/loading.tsx`.
 */

import {
  CANDIDATE_PHOTO_HEIGHT,
  CANDIDATE_PHOTO_WIDTH,
} from "@/components/atoms/data/CandidateAvatar";

/**
 * As células do esqueleto. É esqueleto — a quantidade não afirma nada sobre o
 * dado que vai chegar.
 *
 * Lista de chaves estáveis em vez de `Array.from` com índice: a lista nunca
 * reordena nem recebe item, mas a regra de chave do Biome não sabe disso, e
 * inventar uma exceção aqui ensinaria a inventá-la onde importa.
 */
const CELULAS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"] as const;

export default function Loading() {
  return (
    <main
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 960,
        gap: "var(--space-8)",
        padding: "var(--space-10) var(--space-5) 0",
        paddingBottom: "calc(var(--space-16) + env(safe-area-inset-bottom))",
      }}
    >
      <div
        aria-hidden="true"
        className="animate-pulse"
        style={{
          height: "var(--space-10)",
          width: "60%",
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-sm)",
        }}
      />

      <ul
        aria-hidden="true"
        className="grid list-none"
        style={{
          gap: "var(--space-5) var(--space-4)",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          margin: 0,
          padding: 0,
        }}
      >
        {CELULAS.map((id) => (
          <li key={id} className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            <div
              className="animate-pulse"
              style={{
                width: "100%",
                aspectRatio: `${CANDIDATE_PHOTO_WIDTH} / ${CANDIDATE_PHOTO_HEIGHT}`,
                background: "var(--surface-sunken)",
                borderRadius: "var(--radius-sm)",
              }}
            />
            <div
              className="animate-pulse"
              style={{
                height: "var(--space-4)",
                width: "80%",
                background: "var(--surface-sunken)",
                borderRadius: "var(--radius-sm)",
              }}
            />
          </li>
        ))}
      </ul>

      <p className="sr-only" aria-live="polite" role="status">
        Carregando a lista de candidaturas…
      </p>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
