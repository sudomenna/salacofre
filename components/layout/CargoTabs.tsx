/**
 * components/layout/CargoTabs.tsx
 *
 * Navegação global de cargos do shell (ADR-0025 § 2). Renderiza dentro do
 * `<TopBar>` em `app/layout.tsx`, portanto acima da dobra de TODAS as rotas.
 *
 * Quatro abas, decisão D5 do usuário (2026-09-07):
 *   Presidente `/` · Governador `/governador` · Senador · Deputado Federal.
 * As duas últimas aparecem **desabilitadas** até as specs 016/017 shipparem —
 * um `<span aria-disabled="true">` com a razão em `title` e em `sr-only`,
 * nunca um `<a>` que levaria a 404 (o `<TabBar>` implementa esse modo).
 *
 * ## Aba atual sem JS e sem tornar a rota dinâmica
 *
 * Um layout raiz não recebe a rota. As saídas usuais são todas proibidas
 * aqui: `usePathname()` exigiria `"use client"` acima da dobra (RNF-007a está
 * em 148,7 KiB de 150 — sem folga); `headers()`/`cookies()`/`searchParams`
 * tornariam dinâmicas as 54 páginas de UF hoje pré-renderizadas
 * (ADR-0025 § 2 e § 5); um slot de parallel route (`app/@cargo/...`) casaria
 * `/uf/[sigla]/governador` só com um segmento dinâmico dentro do slot, o que
 * duplicaria `generateStaticParams` em rota paralela.
 *
 * A informação, porém, já está no DOM: cada página emite
 * `main[data-trilha="pres"|"gov"]` (ADR-0019). `CargoTabs.module.css` lê esse
 * atributo com `:has()` a partir do `<body>` e marca a aba — cor, sublinhado
 * e um texto "página atual" que só existe (para olho e para leitor de tela)
 * na aba da trilha corrente. Zero JS, zero render dinâmico, sem duplicar
 * estado entre layout e página.
 *
 * Consequência aceita: não há atributo `aria-current` literal, porque ele
 * teria de ser decidido no render do servidor — exatamente o que não se pode
 * fazer aqui. O portador do estado é o texto revelado por CSS, que leitores
 * de tela anunciam normalmente (elementos em `display: none` ficam fora da
 * árvore de acessibilidade; os demais, dentro). O sinal não é só cor
 * (WCAG 1.4.1): há sublinhado E texto.
 *
 * Server Component puro — sem `"use client"`, sem hook, sem evento.
 */

import { TabBar } from "@/components/layout/TabBar";
import styles from "./CargoTabs.module.css";

/** Texto revelado por CSS só na aba da trilha corrente (ver o `.module.css`). */
function CurrentFlag() {
  return <span className={`sr-only ${styles.flag}`}> (página atual)</span>;
}

const EM_BREVE =
  "Cargo ainda não coberto pela SalaCofre. Esta aba fica indisponível até a apuração deste cargo entrar no ar.";

const ITEMS = [
  {
    value: "pres",
    href: "/",
    label: (
      <>
        Presidente
        <CurrentFlag />
      </>
    ),
  },
  {
    value: "gov",
    href: "/governador",
    label: (
      <>
        Governador
        <CurrentFlag />
      </>
    ),
  },
  { value: "sen", label: "Senador", disabled: true, disabledReason: EM_BREVE },
  {
    value: "dep",
    label: "Deputado Federal",
    disabled: true,
    disabledReason: EM_BREVE,
  },
] as const;

export function CargoTabs() {
  return (
    <TabBar
      ariaLabel="Cargos"
      className={styles.cargoTabs}
      items={ITEMS}
      // Sentinela deliberada: nenhum item casa com `""`, então o `<TabBar>`
      // não escolhe ativo no servidor — quem escolhe é o CSS, a partir de
      // `main[data-trilha]`. Ver o bloco de doc acima.
      value=""
      // O `<TabBar>` nasceu como nav inferior de mobile (`sticky bottom-0`,
      // safe-area). No topo, dentro do `<TopBar>`, ele é uma faixa em fluxo
      // normal. `style` é o último spread no componente, então vence os
      // defaults dele — `className` não venceria o `paddingBottom` inline.
      style={{ position: "static", paddingBottom: 0 }}
    />
  );
}
