/**
 * components/layout/TurnoSwitch.tsx
 *
 * Controle "1º turno / 2º turno" do shell (ADR-0029 § 2).
 *
 * ## Isto é navegação, não um botão de "fingir turno"
 *
 * O turno corrente NÃO é escolhido pelo visitante: sai do calendário
 * (`lib/config/calendar.currentPresidentialTurno()`, ADR-0012), e é ele que decide qual
 * corrida está **ao vivo** — badge, polling e alias do Edge Config. O que
 * este controle faz é oferecer o turno **arquivado** como destino de
 * navegação, exatamente o mecanismo que já alimenta o `<TurnoOneRecap />`
 * (`readArchivedProjection({ cargo: "pres", turno: 1 })` em `app/page.tsx`)
 * — o padrão de chamador explícito que o ADR-0028 formaliza, agora em UI.
 *
 * ## Server Component, zero JS, rota continua estática
 *
 * `currentPresidentialTurno()` é pura (só lê o relógio, sem I/O — ver o cabeçalho de
 * `lib/config/calendar.ts`), então o controle é resolvido no render sem
 * `searchParams`, `cookies()` nem `headers()`: as 54 páginas de UF e a home
 * seguem pré-renderizadas estáticas (ADR-0025 § 2 e § 5). O turno ativo vira
 * um `<a aria-current="page">` para a própria rota; o outro turno vira
 * `<a>` quando existe rota de arquivo para ele e `<span aria-disabled>`
 * quando não existe.
 *
 * ## Por que "2º turno" aparece desabilitado e não some
 *
 * ADR-0029 § 2 (a): antes de 04/10/2026 só existe uma opção real. Ocultar a
 * outra sugeriria que a plataforma não cobre 2º turno; mostrá-la clicável
 * levaria a uma rota sem dado. Desabilitada e com a razão anunciada é o
 * único estado honesto — e é o mesmo padrão que `<TabBar>` já usa para
 * Senador/Deputado Federal.
 *
 * ## Estado da arte hoje (2026-09-08)
 *
 * Não existe rota de arquivo de turno no app (`app/` não tem segmento de
 * turno, e ADR-0029 não cria um). Portanto, **hoje**, seja qual for o turno
 * corrente, a outra opção renderiza desabilitada. `hrefByTurno` existe para
 * que ligar o arquivo, quando a rota existir, seja passar uma prop — não
 * reescrever este componente.
 */

import Link from "next/link";
import type { CSSProperties } from "react";
import { currentPresidentialTurno, type Turno } from "@/lib/config/calendar";

const TURNOS: readonly Turno[] = [1, 2];

const LABEL: Record<Turno, string> = {
  1: "1º turno",
  2: "2º turno",
};

const SEM_ARQUIVO: Record<Turno, string> = {
  1: "O 1º turno ainda não foi apurado — não há resultado arquivado para exibir.",
  2: "O 2º turno ainda não aconteceu — não há resultado para exibir.",
};

export interface TurnoSwitchProps {
  /**
   * Turno corrente. Default: `currentPresidentialTurno()` (calendário, ADR-0012). A prop
   * existe para teste e para preview — não para o visitante.
   */
  turno?: Turno;
  /**
   * Rota de cada turno. O turno corrente aponta para a rota atual; um turno
   * arquivado aponta para a rota de arquivo, quando ela existir. Turno sem
   * entrada aqui renderiza desabilitado.
   */
  hrefByTurno?: Partial<Record<Turno, string>>;
  className?: string;
}

function itemStyle(active: boolean, disabled: boolean, index: number): CSSProperties {
  return {
    flex: 1,
    display: "grid",
    placeItems: "center",
    minHeight: "var(--tap-min)",
    padding: "0 var(--space-3)",
    border: 0,
    borderLeft: index > 0 ? "1px solid var(--border-strong)" : undefined,
    background: active ? "var(--surface-inverse)" : "transparent",
    color: disabled ? "var(--text-faint)" : active ? "var(--text-inverse)" : "var(--text-primary)",
    font: "var(--type-label)",
    fontSize: "var(--text-xs)",
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : undefined,
  };
}

export function TurnoSwitch({ turno, hrefByTurno, className }: TurnoSwitchProps) {
  const atual = turno ?? currentPresidentialTurno();

  return (
    // `role="group"` e não `nav`: o documento já tem um landmark de navegação
    // nomeado ("Cargos"); um segundo landmark para duas opções da mesma
    // corrida só engrossaria o sumário do leitor de tela. O estado fica em
    // `aria-current="page"` no item ativo (RNF-022).
    // biome-ignore lint/a11y/useSemanticElements: `useSemanticElements` sugere <fieldset>, que é agrupamento de CONTROLE DE FORMULÁRIO e exigiria <legend>. Aqui os itens são links/estáticos de navegação; `role="group"` + `aria-label` é o padrão ARIA correto.
    <div
      aria-label="Turno da apuração"
      className={["inline-flex overflow-hidden rounded-sm", className].filter(Boolean).join(" ")}
      data-testid="turno-switch"
      data-value={String(atual)}
      role="group"
      style={{
        width: "100%",
        border: "1px solid var(--border-strong)",
        background: "var(--surface-card)",
      }}
    >
      {TURNOS.map((t, index) => {
        const active = t === atual;
        const href = hrefByTurno?.[t];
        // Sem `href` o item nunca vira `<a>`: um link para a rota errada é
        // pior que texto. O turno ativo sem rota declarada continua marcado
        // com `aria-current="page"` (é onde o leitor está); o inativo sem
        // rota é o caso "arquivo não existe", que vira desabilitado.
        const disabled = !active && !href;

        if (active && !href) {
          return (
            <span
              aria-current="page"
              data-active="true"
              data-value={String(t)}
              key={t}
              style={itemStyle(true, false, index)}
            >
              {LABEL[t]}
            </span>
          );
        }

        if (disabled) {
          return (
            <span
              aria-disabled="true"
              data-active="false"
              data-disabled="true"
              data-value={String(t)}
              key={t}
              style={itemStyle(false, true, index)}
              title={SEM_ARQUIVO[t]}
            >
              {LABEL[t]}
              <span className="sr-only">{SEM_ARQUIVO[t]}</span>
            </span>
          );
        }

        return (
          <Link
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            data-value={String(t)}
            href={href as string}
            key={t}
            style={itemStyle(active, false, index)}
          >
            {LABEL[t]}
          </Link>
        );
      })}
    </div>
  );
}
