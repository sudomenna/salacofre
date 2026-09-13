/**
 * components/atoms/controls/SearchInput.tsx
 *
 * Campo de busca (candidato, UF, município) do design system Atlas Menna
 * (ADR-0025, Bloco 1). Portado de
 * `docs/design-system/atlas-menna/components/actions/SearchInput.jsx`.
 *
 * ## Duas variantes, um só campo desenhado
 *
 * | | quem controla o valor | onde pode ser renderizado |
 * |---|---|---|
 * | {@link SearchInput} | o pai, por `value`/`onChange` | **só de Client Component** |
 * | {@link SearchField} | o navegador (`name` + `defaultValue`) | Server **ou** Client |
 *
 * `<SearchField>` nasceu com a spec 018: `/candidatos` filtra por
 * `<form method="get">` + `searchParams`, sem uma linha de JavaScript de
 * aplicação (RF-146, RF-147 — "Given um navegador com JavaScript desabilitado,
 * when o leitor filtra, then funciona"). Um campo controlado não serve ali: ele
 * exige `useState` no pai, e RNF-007a está em **148,7 KiB de 150**.
 *
 * ## Por que este módulo NÃO tem `"use client"`
 *
 * Tinha, até a spec 018. A diretiva é de **módulo**: com ela no topo, importar
 * `<SearchField>` de um Server Component abriria fronteira de cliente e traria
 * runtime para o bundle — exatamente o que o RF-146 proíbe. Sem diretiva, o
 * módulo é *compartilhado*: entra no grafo do cliente quando um Client
 * Component o importa, e renderiza no servidor quando um Server Component o
 * importa.
 *
 * A alternativa seria duplicar a moldura do campo (rótulo, lupa, medidas,
 * contrastes) num segundo arquivo — e duas molduras divergem no primeiro ajuste
 * de padding. O custo desta escolha é nomeado: **`<SearchInput>` (controlado)
 * passa a exigir que o CHAMADOR seja `"use client"`**. Renderizá-lo de um
 * Server Component falha em runtime com "Event handlers cannot be passed to
 * Client Component props" — erro alto e cedo, não defeito silencioso. Hoje
 * nenhuma página o importa; quem o adotar, adota num componente de cliente.
 *
 * ## Divergências deliberadas em relação ao `.jsx` do kit
 *
 *   - `label` é **obrigatório**. No kit o `<label>` embrulhava o `<input>` sem
 *     texto nenhum: o campo ficava sem nome acessível, e `placeholder` não é
 *     nome acessível (RNF-022 / WCAG 4.1.2). Aqui o rótulo existe sempre —
 *     visível, ou visualmente escondido com `.sr-only` (default).
 *   - `autoFocus` foi removido: roubar o foco no load desorienta quem navega
 *     por teclado ou leitor de tela (a regra `a11y/noAutofocus` do Biome, que
 *     está ligada neste repo, reprovaria).
 *   - o botão de limpar tem `var(--tap-min)` (44px) de lado, com margem
 *     negativa para absorver o padding direito do campo sem esticá-lo. Só
 *     existe na variante controlada: limpar sem JS é o que o `type="search"`
 *     nativo e o reset do formulário já fazem.
 *   - `type="search"` e `autoComplete="off"`, para o campo se comportar como
 *     busca (tecla Esc limpa em alguns navegadores) sem sugerir histórico.
 */

import type { CSSProperties, ReactNode } from "react";

/**
 * Onde o rótulo visível fica.
 *
 * `"inline"` — dentro da moldura, à esquerda da lupa. É o desenho do kit e o
 * default, preservado byte a byte.
 *
 * `"above"` — acima da moldura, como qualquer `<label>`/`<select>` de
 * formulário. Existe porque em 375px o rótulo inline **come o campo**: "BUSCAR
 * POR NOME" quebra em duas linhas dentro de uma caixa de 44px e sobra menos de
 * um terço da largura para o que o leitor digita. Medido no navegador em
 * 13/09, e é a disposição que alinha a busca com os dois `<select>` do filtro
 * de `/candidatos`.
 *
 * `"above"` exige `id` — sem ele o `<label>` de cima não se amarra a nada, e o
 * campo fica sem nome acessível (WCAG 4.1.2).
 */
export type FieldLabelPlacement = "inline" | "above";

interface FieldChromeProps {
  htmlFor?: string;
  label: string;
  showLabel: boolean;
  labelPlacement: FieldLabelPlacement;
  testId: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Rótulo em caixa alta — o mesmo desenho nas duas disposições. */
const LABEL_STYLE: CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

/**
 * A moldura: rótulo, lupa e o campo em si.
 *
 * Local e **sem props de função** — é o que permite as duas variantes
 * compartilharem desenho sem que a variante de servidor arraste handler nenhum.
 */
function FieldChrome({
  htmlFor,
  label,
  showLabel,
  labelPlacement,
  testId,
  className,
  style,
  children,
}: FieldChromeProps) {
  const acima = showLabel && labelPlacement === "above";

  // Em `above` a caixa é uma `<div>` e o `<label>` fica fora dela, amarrado por
  // `htmlFor`. Em `inline` a caixa É o `<label>`, como no kit.
  const Caixa = acima ? "div" : "label";

  const caixa = (
    <Caixa
      htmlFor={acima ? undefined : htmlFor}
      data-testid={testId}
      className={["flex items-center rounded-sm", className].filter(Boolean).join(" ")}
      style={{
        gap: "var(--space-2)",
        height: "var(--tap-min)",
        padding: "0 var(--space-3)",
        border: "1px solid var(--border-strong)",
        background: "var(--surface-card)",
        ...style,
      }}
    >
      {acima ? null : (
        <span
          className={showLabel ? undefined : "sr-only"}
          data-testid="search-input-label"
          style={showLabel ? LABEL_STYLE : undefined}
        >
          {label}
        </span>
      )}
      <svg
        aria-hidden="true"
        focusable="false"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
        style={{ color: "var(--text-secondary)" }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      {children}
    </Caixa>
  );

  if (!acima) return caixa;

  return (
    <div>
      <label
        htmlFor={htmlFor}
        data-testid="search-input-label"
        style={{ ...LABEL_STYLE, display: "block", marginBottom: "var(--space-1)" }}
      >
        {label}
      </label>
      {caixa}
    </div>
  );
}

/** Estilo do `<input>`, idêntico nas duas variantes. */
const INPUT_STYLE: CSSProperties = {
  border: 0,
  outline: 0,
  background: "transparent",
  color: "var(--text-primary)",
  font: "var(--type-body)",
};

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Nome acessível do campo — ex. "Buscar candidato, UF ou município". */
  label: string;
  /** Mostra o rótulo acima do campo em vez de escondê-lo (`.sr-only`). */
  showLabel?: boolean;
  placeholder?: string;
  /** Chamado depois de `onChange("")` quando o usuário aperta o botão limpar. */
  onClear?: () => void;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Variante **controlada**. O valor é do pai; exige `"use client"` no chamador —
 * ver o bloco "Por que este módulo NÃO tem `use client`" no cabeçalho.
 */
export function SearchInput({
  value,
  onChange,
  label,
  showLabel = false,
  placeholder = "Buscar",
  onClear,
  id,
  className,
  style,
}: SearchInputProps) {
  return (
    <FieldChrome
      htmlFor={id}
      label={label}
      showLabel={showLabel}
      labelPlacement="inline"
      testId="search-input"
      className={className}
      style={style}
    >
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        data-testid="search-input-field"
        className="min-w-0 flex-1"
        style={INPUT_STYLE}
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          data-testid="search-input-clear"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="flex flex-none items-center justify-center"
          style={{
            width: "var(--tap-min)",
            height: "var(--tap-min)",
            marginRight: "calc(-1 * var(--space-3))",
            border: 0,
            background: "transparent",
            color: "var(--text-secondary)",
            font: "var(--type-body)",
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </FieldChrome>
  );
}

export interface SearchFieldProps {
  /**
   * `name` do campo no `<form method="get">` — vira a chave em `searchParams`.
   * Obrigatório: um campo sem `name` **não é submetido**, e o filtro
   * silenciosamente não faria nada.
   */
  name: string;
  /**
   * Valor inicial. Repor o valor submetido é o que mantém o formulário
   * preenchido depois do submit (RF-148).
   */
  defaultValue?: string;
  /** Nome acessível do campo. */
  label: string;
  showLabel?: boolean;
  /**
   * Onde o rótulo visível fica. Default `"above"` — ver
   * {@link FieldLabelPlacement} para a medição que motivou o default.
   */
  labelPlacement?: FieldLabelPlacement;
  placeholder?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Variante **não-controlada**, para `<form method="get">`. Server Component
 * puro: nenhum handler, nenhum estado, zero JS (RF-146/RF-147).
 */
export function SearchField({
  name,
  defaultValue,
  label,
  showLabel = false,
  labelPlacement = "above",
  placeholder = "Buscar",
  id,
  className,
  style,
}: SearchFieldProps) {
  return (
    <FieldChrome
      htmlFor={id}
      label={label}
      showLabel={showLabel}
      labelPlacement={labelPlacement}
      testId="search-field"
      className={className}
      style={style}
    >
      <input
        id={id}
        name={name}
        type="search"
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder={placeholder}
        data-testid="search-field-input"
        className="min-w-0 flex-1"
        style={INPUT_STYLE}
      />
    </FieldChrome>
  );
}
