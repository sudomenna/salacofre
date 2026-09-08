/**
 * components/layout/ShellControls.tsx
 *
 * A segunda linha do `<TopBar>` (ADR-0029 §§ 2–3): a navegação de cargo do
 * desktop à esquerda e, à direita, os dois controles globais — turno e
 * "Parcial / Projeção". É a composição do protótipo
 * (`ui_kits/atlas-menna/App.jsx:330-332`), onde os três dividem a mesma
 * linha no desktop e os dois controles ocupam a largura toda no mobile.
 *
 * Server Component. O único pedaço client aqui dentro é o
 * `<ViewModeSwitch>`; `<TurnoSwitch>` e a navegação de cargo são RSC puros e
 * este wrapper não introduz fronteira nova.
 *
 * ## Por que os controles somem em páginas sem corrida
 *
 * O shell mora em `app/layout.tsx`, ou seja, também em `/sobre-o-modelo`,
 * que não tem número nenhum para alternar entre parcial e projeção nem turno
 * para escolher. Controle que não controla nada é ruído — e, para quem
 * navega por teclado, parada morta. A informação "esta rota tem corrida" já
 * está no DOM: cada página de corrida emite `main[data-trilha]` (ADR-0019).
 * O `.module.css` lê esse atributo com `:has()` a partir do `<body>` e
 * esconde só o grupo de controles (a navegação de cargo continua em todas as
 * rotas) — mesma técnica, e mesma justificativa, de `CargoTabs.module.css`:
 * zero JS, sem tornar a rota dinâmica.
 */

import type { ReactNode } from "react";
import { ViewModeSwitch } from "@/components/atoms/controls/ViewModeSwitch";
import { TurnoSwitch } from "@/components/layout/TurnoSwitch";
import styles from "./ShellControls.module.css";

export interface ShellControlsProps {
  /**
   * Navegação de cargo do desktop (`<CargoTabs placement="top" />`). Vem por
   * prop, e não importada aqui, para que o layout continue sendo o único
   * lugar que decide a composição do shell.
   */
  cargoNav?: ReactNode;
}

export function ShellControls({ cargoNav }: ShellControlsProps) {
  return (
    <div className={styles.row}>
      {cargoNav}
      <div className={styles.controls} data-testid="shell-controls">
        <TurnoSwitch className={styles.control} />
        <ViewModeSwitch className={styles.control} />
      </div>
    </div>
  );
}
