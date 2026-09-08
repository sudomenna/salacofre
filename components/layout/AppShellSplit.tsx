/**
 * components/layout/AppShellSplit.tsx
 *
 * A moldura de duas colunas do protótipo (ADR-0033 § 1). Server Component
 * puro: nenhum estado, nenhum hook, nenhum JS novo acima da dobra — a forma
 * inteira vive em `AppShellSplit.module.css`, que também documenta as medidas
 * lidas em `ui_kits/atlas-menna/App.jsx:371-388`.
 *
 * Dois slots:
 *   - `map`     — a coluna da direita no desktop, a faixa de 52vh no mobile;
 *   - `children`— os painéis, isto é, o `<main>` da página, que rola sozinho
 *                 dentro da coluna esquerda no desktop.
 *
 * A ordem no DOM é painéis → mapa, invertida visualmente no mobile por
 * `order: -1`. Assim o `<main>` continua sendo o primeiro conteúdo na ordem
 * de leitura e de tabulação nos dois breakpoints, e o teclado chega à coluna
 * que rola sem atravessar antes o bloco de mapa.
 *
 * `data-shell-split` não é usado por CSS (o seletor é a classe local, que o
 * `:has()` do módulo já alcança) — existe como âncora estável para teste e
 * inspeção, já que o nome da classe é hasheado.
 */

import type { ReactNode } from "react";

import styles from "./AppShellSplit.module.css";

export interface AppShellSplitProps {
  /** Coluna da direita no desktop; faixa acima dos painéis no mobile. */
  map: ReactNode;
  /** Os painéis — tipicamente o `<main>` da página. */
  children: ReactNode;
}

export function AppShellSplit({ map, children }: AppShellSplitProps) {
  return (
    <div className={styles.split} data-shell-split="">
      <div className={styles.panels}>{children}</div>
      <div className={styles.map}>{map}</div>
    </div>
  );
}
