/**
 * components/atoms/nav/TrilhaKicker.tsx
 *
 * Rótulo de trilha acima do `<h1>` de cada página (ADR-0019).
 *
 *   PRESIDÊNCIA · Brasil › SP
 *   GOVERNADOR · SP
 *
 * Serve para o leitor reconhecer em qual das duas trilhas está **antes** de
 * ler qualquer palavra do conteúdo: a cor vem de `--trilha-accent`, que é
 * redefinida por `main[data-trilha="pres"]` / `main[data-trilha="gov"]` em
 * `app/globals.css`. Fora de um `<main data-trilha>` o token cai no default
 * neutro do `:root` (`var(--color-text)`) — degrade sem quebra.
 *
 * Constituição § 2: o accent é institucional, nunca partidário; ele colore
 * apenas chrome de navegação e jamais um dado de apuração/projeção (as cores
 * de candidato continuam vindo de `--color-cand-*`, ADR-0013).
 *
 * Server Component puro — sem state, sem hooks, sem `framer-motion`
 * (RNF-007a: renderiza above-the-fold nas quatro páginas).
 *
 * A11y
 *   - Texto real (não `background-image`), legível por leitor de tela.
 *   - Separadores `·` e `›` são decorativos (`aria-hidden`); o conteúdo
 *     semântico são o rótulo da trilha e os crumbs.
 *   - A regra superior é `border-top` (decoração), não um `<hr>`.
 */

export type Trilha = "pres" | "gov";

const TRILHA_LABEL: Record<Trilha, string> = {
  pres: "PRESIDÊNCIA",
  gov: "GOVERNADOR",
};

export interface TrilhaKickerProps {
  /** Trilha de cargo — dita rótulo e cor de accent. */
  trilha: Trilha;
  /**
   * Profundidade da navegação, do mais amplo ao mais específico.
   * Ex.: `["Brasil", "SP"]` → "PRESIDÊNCIA · Brasil › SP".
   * Vazio → só o rótulo da trilha.
   */
  crumbs: string[];
  className?: string;
}

export function TrilhaKicker({ trilha, crumbs, className }: TrilhaKickerProps) {
  // Defensivo: crumbs vazios/undefined não devem produzir "· ›  ›".
  const trail = (crumbs ?? []).filter((c) => typeof c === "string" && c.trim().length > 0);

  return (
    <p
      data-trilha-kicker={trilha}
      className={["pt-2 text-xs uppercase tracking-wide", className].filter(Boolean).join(" ")}
      style={{
        borderTop: "3px solid var(--trilha-accent)",
        color: "var(--trilha-accent)",
        fontWeight: 600,
      }}
    >
      <span>{TRILHA_LABEL[trilha]}</span>
      {trail.map((crumb, i) => (
        // Crumbs são rótulos estáveis e únicos por página ("Brasil", "SP").
        <span key={crumb}>
          <span aria-hidden="true">{i === 0 ? " · " : " › "}</span>
          <span style={{ fontWeight: 400 }}>{crumb}</span>
        </span>
      ))}
    </p>
  );
}
