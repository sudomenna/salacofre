"use client";

/**
 * components/atoms/tables/UfHoverLink.tsx
 *
 * O `<Link>` de uma célula de UF que, **ao receber FOCO de teclado**, acende
 * aquele estado no mapa e abre o mesmo balão que o mouse abre.
 *
 * ## Por que existe — WCAG SC 1.4.13 (Content on Hover or Focus)
 *
 * O balão do mapa nacional (`<HoverCard>`) mostra 4 candidaturas + "Outros
 * (N)" por estado, e até 2026-09-20 só o ponteiro o abria: o `role="img"` do
 * mapa não tem `tabIndex`, não há um único handler de teclado naquele arquivo,
 * e o `<HoverCard>` é `aria-hidden` por construção. Conteúdo disparado por
 * hover tem de estar disponível também no foco — e não estava.
 *
 * O ponto de foco **já existia**: as 27 células da `<StateGroupedTable>` são
 * `<Link href="/uf/[sigla]">` desde 2026-09-08 (ADR-0033 § 1) e já estão na
 * ordem de tabulação. Nada de `tabIndex` novo, nenhuma parada de tabulação a
 * mais. Este componente só acopla três handlers ao link que já estava lá.
 *
 * ## Por que não assina a store
 *
 * `useHoverStore.getState()` (imperativo), nunca `useHoverStore(selector)`.
 * São 27 instâncias deste componente na home: uma assinatura por célula faria
 * o React reconciliar as 27 a cada movimento do mouse sobre o mapa — o mapa é
 * PRODUTOR da mesma store e emite a 60Hz throttled. Aqui só escrevemos; quem
 * lê é o mapa. Ver a regra de selector no topo de `lib/state/hover-store.ts`.
 *
 * ## `source: "table"` — a porta que estava sobrando
 *
 * `HoverState.source` sempre teve `"table"` no tipo e nunca teve um emissor.
 * É por esse valor que o mapa distingue "o ponteiro está sobre mim" (`"map"`,
 * que ele mesmo emitiu e deve ignorar) de "alguém focou um estado na tabela"
 * (`"table"`, que ele deve obedecer). Sem essa distinção o mapa consumiria as
 * próprias emissões e entraria em laço.
 *
 * ## Escape
 *
 * SC 1.4.13 também pede que o conteúdo seja **dispensável** sem mover o foco.
 * `Escape` limpa a store (o balão fecha) e o foco fica onde está — a pessoa
 * segue tabulando dali. Nada de `preventDefault`: `Escape` continua chegando a
 * quem mais o queira (uma folha aberta por cima, por exemplo).
 *
 * ⚠️ **Sem atraso, sem debounce** (decisão do dono, 2026-09-20). O balão do
 * mouse abre no mesmo tick do `mousemove`; o do teclado abre no mesmo tick do
 * `focus`. Um `setTimeout` aqui criaria duas velocidades para a mesma
 * informação — e quem depende do teclado é justamente quem menos deve esperar.
 */

import Link from "next/link";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import { useHoverStore } from "@/lib/state/hover-store";

export interface UfHoverLinkProps {
  /** Sigla de 2 letras — o que viaja na store (`{ type: "uf", sigla }`). */
  sigla: string;
  href: string;
  /** `id` do bloco `sr-only` com as candidaturas. Ausente ⇒ sem atributo. */
  describedById?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function UfHoverLink({
  sigla,
  href,
  describedById,
  className,
  style,
  children,
}: UfHoverLinkProps) {
  /**
   * 🔴 O `blur` limpa **só o que este link acendeu**.
   *
   * A ordem do React é `blur(A)` → `focus(B)`, então numa tabulação normal a
   * limpeza acontece antes de B escrever e nada se perde. Mas o `blur` também
   * dispara quando o foco sai para fora da tabela inteira enquanto o PONTEIRO
   * já está sobre o mapa: aí a store carrega `source: "map"` e uma limpeza
   * cega apagaria o balão do mouse, que ninguém pediu para fechar.
   */
  const fechar = () => {
    const { hovered, source } = useHoverStore.getState();
    if (source !== "table") return;
    if (hovered?.type === "uf" && hovered.sigla !== sigla) return;
    useHoverStore.getState().clear();
  };

  return (
    <Link
      href={href}
      className={className}
      style={style}
      aria-describedby={describedById}
      onFocus={() => useHoverStore.getState().setHovered({ type: "uf", sigla }, "table")}
      onBlur={fechar}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (e.key === "Escape") fechar();
      }}
    >
      {children}
    </Link>
  );
}
