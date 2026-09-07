/**
 * components/atoms/controls/BaseToggle.tsx
 *
 * Segmented control que alterna o denominador dos termômetros de candidato
 * do hero de 1º turno (S07/Fase 5, decisão E2b): **um botão troca a base de
 * todos os termômetros de uma vez, e a tela abre em votáveis**.
 *
 * Cobertura: ADR-0018 (hero de seis termômetros), ADR-0021 (extrapolação do
 * apurado), RF-022/RF-023.
 *
 * Server Component, zero JS novo
 *   O estado mora na URL (`?base=comparecimento`), não em React state. Os
 *   dois botões são `<Link scroll={false}>`: navegação soft do App Router
 *   (só o payload RSC muda, sem reload, sem perder o mapa nem o cache SWR),
 *   e nenhum byte novo no above-the-fold — RNF-007a está a ~1,3 KiB do teto
 *   de 150 KiB, e transformar `<ProjectionThermometers />` em Client
 *   Component para carregar um estado booleano não cabe no orçamento.
 *
 * Por que `aria-current` e NÃO `aria-pressed`
 *   O plano pedia `aria-pressed`, que é estado de `role="button"`. Aqui os
 *   controles são links (`role="link"`), e `aria-pressed` em link é
 *   atributo não permitido: axe-core reprova em `aria-allowed-attr`, o que
 *   quebraria o gate de RNF-022/WCAG 2.1 AA. `aria-current` é exatamente a
 *   propriedade ARIA para "este é o item corrente do conjunto" em links, e
 *   é o mesmo padrão já usado por `<Tabs />`. A hierarquia de fontes
 *   (constituição/NFR acima de plano) resolve o conflito a favor do ARIA
 *   válido — ver relatório da Fase 5.
 *
 * Por que `<nav>` e não `<div role="group">`
 *   O conjunto é literalmente um par de links que muda um parâmetro da view
 *   corrente — a mesma forma de um controle de paginação, que a WAI recomenda
 *   embrulhar em `<nav aria-label="...">`. Além de ser a semântica honesta,
 *   evita `role="group"` (que o Biome quer trocar por `<fieldset>`, elemento
 *   para agrupar controles de formulário — o que aqui seria errado).
 *
 * Determinismo (constituição § 6): a montagem do href é pura e ordena as
 * chaves preservadas, então a mesma entrada gera sempre a mesma URL.
 *
 * O 2º turno não usa este controle: o modo `binary` segue com
 * `<HeadlineScore />` intocado.
 */

import Link from "next/link";

import { denominadorLabel, type ProjectionBase } from "@/lib/utils/participacao";

/** Nome do search param. Único ponto de verdade — rotas e testes importam daqui. */
export const BASE_PARAM = "base";

/** Base default: a tela abre em votáveis (decisão E2b). */
export const BASE_DEFAULT: ProjectionBase = "votaveis";

/**
 * Normaliza o valor cru do search param. Ausência, valor inválido, valor
 * repetido (`?base=a&base=b`) — tudo cai no default, nunca em erro: uma URL
 * torta não pode derrubar a home no dia da eleição (constituição § 7).
 */
export function parseBaseParam(raw: string | string[] | undefined): ProjectionBase {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "comparecimento" ? "comparecimento" : BASE_DEFAULT;
}

export interface BaseToggleProps {
  /** Base ativa (já normalizada por `parseBaseParam`). */
  value: ProjectionBase;
  /** Caminho da rota atual, sem query — ex. `/`, `/uf/SP`, `/uf/SP/governador`. */
  pathname: string;
  /**
   * Demais search params da rota, preservados nos dois hrefs (o
   * `?status=` de `/governador`, por exemplo). `base` é ignorado aqui —
   * quem manda é `value`.
   */
  searchParams?: Record<string, string | string[] | undefined>;
  className?: string;
}

const OPTIONS: ReadonlyArray<{ id: ProjectionBase; label: string }> = [
  { id: "votaveis", label: denominadorLabel("votaveis") },
  { id: "comparecimento", label: denominadorLabel("comparecimento") },
];

/**
 * Href da rota atual com `base` trocado. A base default sai da URL em vez de
 * virar `?base=votaveis`: mantém a URL limpa, faz o link "votáveis" apontar
 * para a mesma URL que o canonical (RNF-027) e evita uma segunda variante de
 * cache CDN para o estado default (ADR-0002).
 */
export function hrefForBase(
  pathname: string,
  base: ProjectionBase,
  searchParams: Record<string, string | string[] | undefined> = {},
): string {
  const qs = new URLSearchParams();
  for (const key of Object.keys(searchParams).sort()) {
    if (key === BASE_PARAM) continue;
    const raw = searchParams[key];
    if (raw === undefined) continue;
    for (const v of Array.isArray(raw) ? raw : [raw]) qs.append(key, v);
  }
  if (base !== BASE_DEFAULT) qs.set(BASE_PARAM, base);
  const query = qs.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function BaseToggle({ value, pathname, searchParams, className }: BaseToggleProps) {
  return (
    <nav
      aria-label="Base do percentual dos candidatos"
      data-testid="base-toggle"
      data-value={value}
      className={[
        "inline-flex flex-wrap items-center gap-1 rounded-md border p-1 text-xs",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundColor: "var(--color-bg-muted)",
        borderColor: "var(--color-border)",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <Link
            key={opt.id}
            href={hrefForBase(pathname, opt.id, searchParams)}
            // Sem rolar ao alternar: o hero já está sob os olhos do leitor e
            // um salto ao topo a cada troca de base seria desorientador.
            scroll={false}
            aria-current={active ? "true" : undefined}
            data-base={opt.id}
            data-active={active ? "true" : "false"}
            className="rounded px-3 py-1.5 transition-colors"
            style={{
              backgroundColor: active ? "var(--color-bg)" : "transparent",
              color: active ? "var(--color-text)" : "var(--color-text-muted)",
              fontWeight: active ? 600 : 400,
              border: active ? "1px solid var(--color-border)" : "1px solid transparent",
            }}
          >
            {opt.label}
          </Link>
        );
      })}
    </nav>
  );
}
