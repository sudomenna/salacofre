/**
 * components/layout/CargoTabs.tsx
 *
 * Navegação global de cargos do shell (ADR-0025 § 2). Renderiza dentro do
 * `<TopBar>` em `app/layout.tsx`, portanto acima da dobra de TODAS as rotas.
 *
 * Quatro abas, decisão D5 do usuário (2026-09-07):
 *   Presidente `/` · Governador `/governador` · Senador `/senador` ·
 *   Deputado Federal.
 *
 * Senador saiu do modo desabilitado em 2026-09-11, com a implementação da
 * spec 016: a rota existe e responde. Deputado Federal (spec 017) continua
 * como `<span aria-disabled="true">` com a razão em `title` e em `sr-only`,
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
 *
 * ## S07/Bloco 2 (ADR-0029 § 3) — duas posições, uma por breakpoint
 *
 * `placement="bottom"` é a barra fixa no rodapé do mobile (<960px), zona de
 * alcance do polegar e convenção de app — é a posição que resolve o bug de
 * "Deputado Federal" quebrando em duas linhas no topo em 430px.
 * `placement="top"` continua no `<TopBar>`, mas só a partir de 960px, com a
 * moldura de `SegmentedControl` que o protótipo usa nesse breakpoint
 * (`ui_kits/atlas-menna/App.jsx:330`).
 *
 * O layout renderiza **as duas** e deixa o CSS escolher por media query. Os
 * dois `<nav aria-label="Cargos">` nunca coexistem na árvore de
 * acessibilidade: o escondido está em `display: none`, que o remove da
 * árvore e da ordem de tabulação — não há landmark duplicado nem parada de
 * teclado fantasma em nenhum breakpoint. Escolher a posição no servidor
 * exigiria saber a largura da viewport, o que só o cliente sabe.
 *
 * O ADR pede literalmente um `<SegmentedControl>` no topo do desktop. Aqui
 * ele é um `<TabBar>` **com a aparência** de segmented control, e a
 * divergência é deliberada: `SegmentedControl` é Client Component com
 * `onChange`, e cargo é **rota** (`/`, `/governador`), não estado client
 * (ADR-0025 § 6). Trocar `<Link>` por `onChange` somaria JS acima da dobra em
 * todas as rotas e quebraria a navegação sem JS. O que o ADR descreve é a
 * forma; a semântica de navegação é a de link.
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
  {
    value: "sen",
    href: "/senador",
    label: (
      <>
        Senador
        <CurrentFlag />
      </>
    ),
  },
  {
    value: "dep",
    // "Deputado Federal" não cabe numa coluna de 1/4 de 430px: quebrava em
    // duas linhas e esticava a barra inteira (o defeito que o ADR-0029 § 3
    // atribuía à posição da navegação, mas que sobrevive à mudança de
    // posição). O kit resolve com o rótulo curto — `TabBar.jsx` do protótipo
    // usa "Deputado". Aqui o visível é "Deputado" e o " Federal" continua no
    // DOM em `sr-only`, então o NOME ACESSÍVEL segue sendo "Deputado Federal"
    // — o rótulo visível é prefixo do acessível, que é o que a WCAG 2.5.3
    // (Label in Name) exige.
    label: (
      <>
        Deputado<span className="sr-only"> Federal</span>
      </>
    ),
    disabled: true,
    disabledReason: EM_BREVE,
  },
] as const;

export interface CargoTabsProps {
  /**
   * `"bottom"` (default) — barra fixa no rodapé, visível só abaixo de 960px.
   * `"top"` — faixa dentro do `<TopBar>`, visível só a partir de 960px.
   */
  placement?: "top" | "bottom";
}

export function CargoTabs({ placement = "bottom" }: CargoTabsProps) {
  const top = placement === "top";

  return (
    <TabBar
      ariaLabel="Cargos"
      className={`${styles.cargoTabs} ${top ? styles.top : styles.bottom}`}
      items={ITEMS}
      // Sentinela deliberada: nenhum item casa com `""`, então o `<TabBar>`
      // não escolhe ativo no servidor — quem escolhe é o CSS, a partir de
      // `main[data-trilha]`. Ver o bloco de doc acima.
      value=""
      // O `<TabBar>` nasceu como nav inferior de mobile (`sticky bottom-0`,
      // safe-area). No topo, dentro do `<TopBar>`, ele é uma faixa em fluxo
      // normal. `style` é o último spread no componente, então vence os
      // defaults dele — `className` não venceria o `paddingBottom` inline.
      // `gridTemplateColumns` é inline no `<TabBar>` (`repeat(4, 1fr)`), e
      // folha de estilo não vence inline: no topo do desktop as quatro abas
      // devem ter a largura do rótulo, não um quarto da tela cada.
      style={
        top
          ? {
              position: "static",
              paddingBottom: 0,
              borderTop: 0,
              gridTemplateColumns: "repeat(4, auto)",
            }
          : undefined
      }
    />
  );
}
