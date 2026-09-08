"use client";

/**
 * components/atoms/controls/ThemeToggle.tsx
 *
 * O botão de tema do masthead (ADR-0025 § 5). Portado de
 * `docs/design-system/atlas-menna/components/actions/ThemeToggle.jsx`, com a
 * mesma pílula de 32px, o mesmo ponto de estado e os mesmos rótulos
 * "Claro"/"Escuro".
 *
 * Mora em `components/atoms/controls/` porque é irmão do `<ViewModeSwitch>`: os
 * dois são controles de shell, client, sem dado de domínio, escrevendo um
 * atributo no `<html>` para o CSS resolver o resto. O kit guarda o arquivo em
 * `components/actions/`, mas o catálogo deste repositório
 * (`docs/architecture/folder-structure.md`) não tem essa pasta — `atoms/controls`
 * é onde `SegmentedControl`, `TurnoSwitch` e `ViewModeSwitch` já vivem.
 *
 * ## Divergências deliberadas em relação ao `.jsx` do kit
 *
 *   - **o estado não vem por prop.** No protótipo o `App` inteiro é client e
 *     passa `theme`/`onChange`; aqui o shell é RSC e só este botão é client, então
 *     ele assina a store (`lib/state/theme-client.ts`). Uma prop obrigaria o
 *     `<TopBar>` a virar Client Component — e ele está acima da dobra em TODAS
 *     as rotas, a ~1,3 KiB do teto de 150 KiB do RNF-007a.
 *   - **`aria-pressed`** em vez de só `aria-label`: o botão é um alternador de
 *     dois estados, e quem usa leitor de tela precisa ouvir em qual está, não
 *     só o que ele faz.
 *   - **`suppressHydrationWarning` no rótulo.** O servidor renderiza sempre
 *     "Claro" (não conhece a preferência do visitante); o script anti-flash já
 *     deixou `data-theme="dark"` no `<html>`, e o primeiro render do cliente
 *     usa `getServerSnapshot()` — o texto é corrigido no `useSyncExternalStore`
 *     logo em seguida. É só o rótulo que diverge por um tick: a COR já está
 *     certa desde o primeiro paint, porque ela vem da cascata CSS.
 *   - **44px de alvo no mobile.** O kit usa 32px de altura; a constituição § 4
 *     pede `--tap-min` (44px) em alvo de toque. O botão mantém a pílula de 32px
 *     visualmente e ganha área de toque por `padding` vertical em telas
 *     estreitas — ver `ThemeToggle.module.css`.
 */

import { setTheme, useTheme } from "@/lib/state/theme-client";
import styles from "./ThemeToggle.module.css";

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useTheme();
  const dark = theme === "dark";

  return (
    <button
      aria-label="Alternar entre tema claro e escuro"
      aria-pressed={dark}
      className={[styles.toggle, className].filter(Boolean).join(" ")}
      data-testid="theme-toggle"
      onClick={() => setTheme(dark ? "light" : "dark")}
      type="button"
    >
      <span aria-hidden="true" className={styles.dot} />
      <span className={styles.label} suppressHydrationWarning>
        {dark ? "Escuro" : "Claro"}
      </span>
    </button>
  );
}
