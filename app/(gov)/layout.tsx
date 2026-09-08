/**
 * app/(gov)/layout.tsx
 *
 * A moldura persistente da trilha GOVERNADOR (ADR-0033 § 1) — irmã de
 * `app/(pres)/layout.tsx` e com as mesmas invariantes documentadas lá.
 * Envolve `/governador` (as 27 corridas) e `/uf/[sigla]/governador`.
 *
 * O escopo da Decisão 1 é a transição DENTRO do mesmo cargo. A troca de cargo
 * (`<CargoTabs>`: Presidente ↔ Governador) atravessa dois grupos de rota
 * distintos e, por construção, desmonta a moldura — o ADR nomeia isso como
 * consequência aceita, não como defeito.
 */

import { AppShellSplit } from "@/components/layout/AppShellSplit";
import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";

export default function GovLayout({ children }: { children: React.ReactNode }) {
  return <AppShellSplit map={<PersistentMapFrame cargo="gov" />}>{children}</AppShellSplit>;
}
