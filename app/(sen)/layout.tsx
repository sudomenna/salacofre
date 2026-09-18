/**
 * app/(sen)/layout.tsx
 *
 * A moldura persistente da trilha SENADOR (ADR-0033 § 1) — irmã de
 * `app/(gov)/layout.tsx` e `app/(pres)/layout.tsx`, com as mesmas
 * invariantes documentadas lá. Envolve `/senador` (as 27 corridas) e
 * `/uf/[sigla]/senador`.
 *
 * ## 2026-09-18 — este arquivo é NOVO
 *
 * Até aqui `/senador` e `/uf/[sigla]/senador` não tinham moldura de mapa: a
 * spec 016 tirou "mapa municipal e maiores colégios" de escopo (§
 * Escopo/Fora), e os dois `page.tsx` documentavam explicitamente ficar FORA
 * do `<AppShellSplit>`/`<PersistentMapFrame>` por causa disso.
 *
 * Pedido do dono (2026-09-18): a mesma moldura que Presidente e Governador já
 * têm — mas só no nível BRASIL. `PersistentMapFrame.tsx` (ramo `cargo ===
 * "sen"`) mostra o MESMO coroplético MapLibre+PMTiles das outras duas
 * trilhas, pintado pelo partido do líder de cada UF na corrida de Senador; no
 * nível UF ele continua sem coroplético municipal (o motivo do § Escopo/Fora
 * não mudou — `municipios-sen-t1.json` grava `municipios: []` de propósito) e
 * mostra um painel textual em vez de inventar um mapa que a fonte não tem.
 *
 * O conteúdo das duas páginas (`page.tsx`) não muda: elas já usam a MESMA
 * classe `<main data-trilha="sen" className="mx-auto flex min-h-screen
 * max-w-page ...">` que as páginas de Governador usam dentro desta mesma
 * moldura — o `max-w-page`/`mx-auto` já convive com a coluna mais estreita do
 * `<AppShellSplit>` sem ajuste, porque é o padrão que Governador já validou.
 *
 * As duas invariantes de `app/(pres)/layout.tsx`/`app/(gov)/layout.tsx`
 * seguem valendo aqui: nenhuma API dinâmica (`cookies()`, `headers()`,
 * `searchParams`) neste arquivo — ele é Server Component puro hospedando um
 * Client Component, e `useParams()`/`fetch` acontecem só dentro dele.
 */

import { AppShellSplit } from "@/components/layout/AppShellSplit";
import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";

export default function SenLayout({ children }: { children: React.ReactNode }) {
  return <AppShellSplit map={<PersistentMapFrame cargo="sen" />}>{children}</AppShellSplit>;
}
