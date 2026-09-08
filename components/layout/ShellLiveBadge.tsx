/**
 * components/layout/ShellLiveBadge.tsx
 *
 * Selo de apuração da barra do topo (ADR-0029 § 4) — "70% APURADO" no
 * protótipo, "23,4% APURADO" aqui, "AO VIVO" antes do primeiro boletim.
 *
 * ## O problema: o shell não lê dado, mas o selo mostra dado
 *
 * `app/layout.tsx` não pode ler o Edge Config nem `searchParams`/`cookies()`
 * — qualquer um dos dois tira a home e as 54 páginas de UF do
 * pré-render estático (ADR-0025 § 2 e § 5). E, sendo irmão anterior de
 * `{children}`, o `<TopBar>` também não recebe nada da página por props.
 *
 * ## A saída: a página publica o rótulo como custom property
 *
 * Custom properties CSS podem carregar uma string usável em `content`, e
 * herdam de `:root` para o documento inteiro — inclusive para trás, para o
 * `<TopBar>`, que vem antes do `<main>` no DOM. A página emite uma regra
 * `:root { --live-pct-label: "23,4% apurado" }` (ver `liveLabelStyleTag()`
 * em `app/page.tsx`) e este selo a consome. Sem JS, sem estado, sem tornar
 * rota alguma dinâmica; o fallback `"ao vivo"` fica no próprio `content`,
 * então uma rota que não publica a variável mostra o estado genérico.
 *
 * ## Acessibilidade
 *
 * Texto gerado por `content` é lido de forma inconsistente entre leitores de
 * tela, então o número **não** é anunciado a partir daqui: o texto visível é
 * `aria-hidden`, e o selo se anuncia como "Apuração ao vivo". Nenhuma
 * informação se perde — o percentual continua sendo texto real, anunciável e
 * com `aria-live`, no `<ApuracaoMeta>` dentro do painel de resultado
 * (RF-026), que é onde ele sempre esteve. Aqui ele é cromo visual.
 *
 * Sem `role="status"`: uma live region cujo conteúdo acessível nunca muda só
 * gasta anúncio. `<LiveBadge>` (o selo da página) segue existindo e mantém
 * `role="status"` onde faz sentido.
 */

import styles from "./ShellLiveBadge.module.css";

export interface ShellLiveBadgeProps {
  className?: string;
}

export function ShellLiveBadge({ className }: ShellLiveBadgeProps) {
  return (
    <span
      className={[styles.badge, className].filter(Boolean).join(" ")}
      data-testid="shell-live-badge"
    >
      <span aria-hidden="true" className={styles.dot} data-testid="shell-live-badge-dot" />
      <span aria-hidden="true" className={styles.label} />
      <span className="sr-only">Apuração ao vivo</span>
    </span>
  );
}
