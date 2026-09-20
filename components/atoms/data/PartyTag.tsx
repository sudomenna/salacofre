/**
 * components/atoms/data/PartyTag.tsx
 *
 * Chip de sigla partidária do design system Atlas Menna (ADR-0025, Bloco 1).
 * Portado de `docs/design-system/atlas-menna/components/data/PartyTag.jsx`.
 *
 * Regra do kit: a sigla anda SEMPRE colada ao nome do candidato.
 *
 * Server Component puro — zero JS novo (RNF-007a).
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - o helper `partyColor(sigla)` **não** foi portado. O mapeamento
 *     sigla → cor é do ADR-0024 e mora em `lib/utils/party-color.ts`; este
 *     átomo recebe cor e tinta por prop e nada mais. Sem elas, cai no par de
 *     `--party-outros` — o segundo nível de cada fallback existe só enquanto os
 *     tokens `--party-*` não entram em `app/globals.css`, para o chip não ficar
 *     sem borda, sem ponto nem sem rótulo.
 *   - `filled` usava `color: "#fff"`, hex literal fora de token (constituição
 *     § 2). Passou por `--text-inverse` (uma tinta clara fixa) e hoje usa a
 *     prop `ink` — ver o bloco abaixo.
 *   - `size="sm"` usava `fontSize: 9`, fora da escala. Os dois tamanhos usam
 *     `--text-2xs` (10px, o menor degrau do kit) e diferem em altura/padding.
 *
 * ---------------------------------------------------------------------------
 * `filled` exige o PAR cor + tinta. Não passe um sem o outro.
 * ---------------------------------------------------------------------------
 * A variante `filled` pinta o fundo com a cor do partido e escreve por cima —
 * então o contraste do rótulo depende das duas cores juntas, e a constituição
 * § 4 (WCAG 2.1 AA) exige ≥ 4,5:1.
 *
 * Enquanto a tinta era fixa (`--text-inverse`, quase branco), a sigla ficava
 * ilegível em cima de todo partido de base clara: PSOL 2,21:1, PSB 2,34:1,
 * NOVO 2,89:1, o fallback cinza 2,55:1. E não é caso de trocar por uma tinta
 * escura fixa: das 31 bases da paleta, **19 pedem tinta clara e 12 pedem
 * escura**. Nenhuma tinta única serve, então a tinta entra por prop.
 *
 * **O par certo vem de `partyChipInk(sigla)`** (`lib/utils/party-color.ts`), que
 * devolve `{ background, ink }` medidos pelo gerador:
 *
 *     const { background, ink } = partyChipInk(candidato.partido);
 *     <PartyTag sigla={candidato.partido} filled color={background} ink={ink} />
 *
 * Note que `background` é `--party-<slug>-chip`, **não** `--party-<slug>`: para
 * MDB e Rede (verdes de meio-tom que reprovam com as duas tintas) o chip é a
 * base escurecida na mesma matiz. Usar `colorForParty()` aqui reintroduz a
 * falha nesses dois.
 *
 * ---------------------------------------------------------------------------
 * A sigla desenhada é a ABREVIADA; `data-sigla` continua a inteira
 * ---------------------------------------------------------------------------
 * Desde 2026-09-19 o chip imprime `siglaExibicao(sigla)`
 * (`lib/utils/sigla-partido.ts`): cinco siglas longas viram três letras porque
 * não cabiam na coluna de 400 px (o caso medido está em
 * `CandidateResultRow.tsx:266-271`). Oito componentes chegam aqui, então este
 * é o ponto único.
 *
 * O atributo `data-sigla` guarda a sigla **inteira**, de propósito: ele é
 * chave de máquina (seletor de teste, `querySelector`, depuração), não texto
 * de leitura. Abreviá-lo faria a tela e o DOM discordarem sobre qual partido
 * é aquele.
 *
 * `abreviar={false}` desliga a abreviação — existe para a home de Deputados
 * (`app/(dep)/deputado-federal/page.tsx`), onde a sigla aparece em contexto de
 * bancada por partido, tem espaço, e o dono quer o nome inteiro. O default é
 * `true` porque a tela apertada é a regra e a folgada é a exceção.
 *
 * **Passar `color` sem `ink` é inseguro e ninguém vai avisar em runtime**: a
 * tinta cai no default de `--party-outros` (escura), que só por acaso serve
 * para a cor que você passou. O átomo não pode conferir — ele não conhece
 * sigla, não resolve token e roda no servidor, sem `getComputedStyle`. Quem
 * garante o contraste é o gerador (`pnpm gen:party-scale` falha abaixo de
 * 4,5:1) e o teste `tests/unit/design-system/party-chip-contrast.test.ts`.
 * Na dúvida, use a variante de contorno (default), cujo texto é
 * `--text-primary` (≥ 15:1 sobre papel) qualquer que seja a cor da borda.
 */

import type { CSSProperties } from "react";

import { siglaExibicao } from "@/lib/utils/sigla-partido";

/** Fallback enquanto os tokens `--party-*` (ADR-0024) não entram em globals.css. */
export const PARTY_TAG_FALLBACK_COLOR = "var(--party-outros, var(--color-cand-other))";

/**
 * Tinta default — o par medido do fallback cinza: `--party-outros` (#9aa0a8)
 * com `--party-outros-ink` (#14171b) dá **6,82:1**, bem acima do mínimo de 4,5:1
 * do § 4. O segundo nível (`--text-primary`, que é `--ink-0`) resolve para o
 * mesmo #14171b, então o default continua seguro mesmo sem `tokens-party.css`
 * carregado. É o par default inteiro que é seguro — trocar só a cor, não.
 */
export const PARTY_TAG_FALLBACK_INK = "var(--party-outros-ink, var(--text-primary))";

export type PartyTagSize = "sm" | "md";

export interface PartyTagProps {
  /**
   * Sigla do partido — ex. "PT". Passe sempre a **inteira**, como ela vem do
   * payload: é ela que vai para `data-sigla`, e é sobre ela que a abreviação
   * de exibição roda. Caixa alta é do CSS, não do dado.
   */
  sigla: string;
  /**
   * Encurtar a sigla na tela (`REPUBLICANOS` → `REP`,
   * `lib/utils/sigla-partido.ts`). Default `true`.
   *
   * `false` só na home de Deputados — ver o bloco no topo do arquivo. Não é
   * uma preferência de estilo: é o único lugar onde o dono pediu o nome
   * inteiro, e passar `false` em qualquer outra tela reintroduz a truncagem
   * com reticências que motivou a abreviação.
   */
  abreviar?: boolean;
  size?: PartyTagSize;
  /**
   * Chip sólido: `color` vira fundo e `ink` vira rótulo. **Passe o par inteiro**
   * — `partyChipInk(sigla)` de `lib/utils/party-color.ts` devolve os dois já
   * medidos em ≥ 4,5:1. Ver o bloco no topo do arquivo.
   */
  filled?: boolean;
  /**
   * Cor do partido/federação, sempre `var(--token)` (ADR-0024). Com `filled`,
   * use `partyChipInk(sigla).background` (o token `-chip`), não `colorForParty`.
   */
  color?: string;
  /**
   * Tinta do rótulo na variante `filled`, sempre `var(--token)`. Sem ela o chip
   * usa a tinta do fallback cinza, que **não** tem contraste garantido contra
   * uma `color` arbitrária. Ignorada na variante de contorno, cujo texto é
   * sempre `--text-primary`.
   */
  ink?: string;
  className?: string;
  style?: CSSProperties;
}

export function PartyTag({
  sigla,
  abreviar = true,
  size = "md",
  filled = false,
  color = PARTY_TAG_FALLBACK_COLOR,
  ink = PARTY_TAG_FALLBACK_INK,
  className,
  style,
}: PartyTagProps) {
  return (
    <span
      data-testid="party-tag"
      data-sigla={sigla}
      data-filled={filled ? "true" : "false"}
      className={["inline-flex items-center whitespace-nowrap rounded-xs", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        gap: "var(--space-1)",
        height: size === "sm" ? 16 : 20,
        padding: size === "sm" ? "0 var(--space-1)" : "0 var(--space-2)",
        border: `1px solid ${color}`,
        background: filled ? color : "transparent",
        color: filled ? ink : "var(--text-primary)",
        font: "var(--type-kicker)",
        fontSize: "var(--text-2xs)",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {filled ? null : (
        <span
          aria-hidden="true"
          data-testid="party-tag-dot"
          className="flex-none"
          style={{
            width: 6,
            height: 6,
            borderRadius: "var(--radius-pill)",
            background: color,
          }}
        />
      )}
      {abreviar ? siglaExibicao(sigla) : sigla}
    </span>
  );
}
