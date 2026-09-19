/**
 * components/atoms/overlays/HoverCard.tsx
 *
 * Tooltip que segue o ponteiro sobre o mapa (UF / município). Design system
 * Atlas Menna (ADR-0025, Bloco 1), portado de
 * `docs/design-system/atlas-menna/components/layout/HoverCard.jsx`.
 *
 * Mostra o par editorial central do design: **Parcial em tinta × Projeção em
 * ocre**, lado a lado, para a região sob o cursor.
 *
 * Server Component (sem `"use client"`): não tem estado nem evento — posição,
 * título e linhas vêm todos por prop, e `pointer-events: none` garante que ele
 * nunca intercepta o ponteiro. O pai (o mapa) é que é client; importar daqui
 * não obriga este arquivo a declarar a diretiva, e assim ele continua
 * renderizável no SSR.
 *
 * A11y: `aria-hidden`. O cartão espelha, em pixels, o que o hover do mouse já
 * revelou; para quem navega por teclado ou leitor de tela a informação tem que
 * vir da tabela/lista que acompanha o mapa (RNF-023), não de um tooltip que
 * segue um ponteiro que essa pessoa não tem.
 *
 * Divergências deliberadas em relação ao `.jsx` do kit:
 *   - percentuais por `formatPercent()` (pt-BR, determinístico) em vez de
 *     `toFixed(1).replace(".", ",")` inline.
 *   - o cabeçalho "Proj." usa `--accent-text` (5.12:1) e não `--accent-strong`
 *     (4.21:1): é texto de 10px (constituição § 4).
 *   - a célula vazia do canto do grid virou `aria-hidden` explícito.
 *
 * 2026-09-18 (pedido do dono — aproximar do tooltip do mapa eleitoral do
 * NYT): duas colunas novas, "Partido" e "Votos", com o mesmo tratamento
 * degradável de "Parcial" (some do cartão quando NENHUMA linha tem o dado —
 * ver `hasColumn` abaixo). E o tratamento da linha VENCEDORA (fundo cheio +
 * ✓), só quando `chamada === true` — ver a docstring de `HoverCard` mais
 * abaixo para o argumento completo de por que ele não pode aparecer sempre.
 *
 * 2026-09-18 (mesmo dia, mapa MUNICIPAL) — "Proj." deixa de ser a única
 * coluna que TODA chamada deste átomo garante. Município não tem projeção:
 * o modelo extrapola por ZONA eleitoral e agrega para a UF (ADR-0021), nunca
 * publica um número projetado por município — mostrar um ali seria inventar
 * dado que o produto não tem (constituição § 1). "Proj." agora usa a MESMA
 * degradação de `hasColumn` que "Parcial"/"Votos"/"Partido" já tinham: some
 * do cartão inteiro quando NENHUMA linha a carrega, em vez de uma coluna de
 * travessões prometendo um número que não existe. O balão do mapa NACIONAL
 * não muda de comportamento: `EdgeUfRow.top_candidatos[].pct` é campo
 * obrigatório (nunca `undefined`) — lá a coluna continua sempre presente,
 * só que agora por CONSEQUÊNCIA do dado, não por um caminho de código à
 * parte que não sabia degradar.
 */

import type { CSSProperties } from "react";
import { Fragment } from "react";

import { formatPercent, formatVotes } from "@/lib/utils/format";

export interface HoverCardRow {
  name: string;
  /** Cor do candidato/partido, `var(--token)`. Vira o ponto de 8×8 (linha
   * comum) — some quando `winnerBackground` está definido (o ✓ toma o lugar). */
  color: string;
  /** Parcial (% de votos válidos apurados deste candidato nesta UF) em
   * 0–100. Ausente ou não-finita ⇒ a coluna "Parcial" some do cartão
   * inteiro (ver `HoverCard`), em vez de exibir uma coluna de travessões. */
  pct?: number;
  /**
   * Projeção em 0–100. Mesma degradação de `pct`/`votos`/`partido`
   * (2026-09-18): `undefined`/não-finita não vira mais travessão garantido —
   * a coluna "Proj." inteira some quando NENHUMA linha a carrega (ver
   * `hasColumn` em `HoverCard`). É o caso do mapa MUNICIPAL: não existe
   * projeção por município (ADR-0021 — o modelo extrapola por zona e agrega
   * para a UF), então nenhuma linha desse cartão tem `proj`, e a coluna nunca
   * chega a existir. O mapa NACIONAL continua com a coluna sempre visível
   * porque `EdgeUfRow.top_candidatos[].pct` é campo obrigatório — a garantia
   * hoje vem do DADO, não de um caminho de renderização que não sabia
   * degradar.
   */
  proj?: number;
  /** Sigla do partido — coluna "Partido". `undefined`/vazio ⇒ "—" na
   * linha; coluna inteira some quando NENHUMA linha a tem. */
  partido?: string;
  /** Votos absolutos apurados — coluna "Votos". `0` é publicado como "0"
   * (fato real, zero boletim chegado); só `undefined` vira "—". Coluna
   * inteira some quando NENHUMA linha tem o dado. */
  votos?: number;
  /**
   * Par (fundo, tinta) já RESOLVIDO pelo caller para a linha do vencedor
   * CHAMADO — nunca calculado aqui. Este átomo não conhece partido (teste
   * (h), `HoverCard.test.tsx`): quem sabe se a UF foi chamada e qual token
   * de contraste usar é `_NationalChoroplethMapImpl.buildHoverRows`
   * (`partyChipInk`/`strongForRank`, medidos ≥4,5:1). `undefined` (o caso
   * comum — UF ainda não chamada) não pinta fundo nenhum; só a 1ª linha
   * recebe um negrito sóbrio (ver `HoverCard`), nunca a marca de vitória.
   * Só tem efeito na linha de ÍNDICE 0 (a líder, `top_candidatos[0]`).
   */
  winnerBackground?: string;
  /** Tinta legível sobre `winnerBackground` — anda sempre em par com ele. */
  winnerInk?: string;
}

export interface HoverCardProps {
  /** Deslocamento do ponteiro dentro do contêiner do mapa, em px. */
  x: number;
  y: number;
  /** Vira o cartão para a esquerda quando ele encostaria na borda direita. */
  flip?: boolean;
  title: string;
  kicker?: string;
  /** % apurado da região, 0–100. */
  apurado?: number;
  rows: readonly HoverCardRow[];
  className?: string;
  style?: CSSProperties;
}

/**
 * Piso da coluna do nome, em px — inclui o ponto de 8×8 e o `gap` que o separa
 * do texto. É o que impede o nome de ser espremido a zero pelas colunas
 * numéricas (ver o `minmax` em `HoverCard`). Dimensionado para caber um
 * primeiro nome inteiro mais o começo do segundo em `--type-body-sm`; nomes
 * longos truncam com reticências, que é o comportamento desejado — o defeito
 * era truncar ANTES da primeira letra terminar.
 */
const NOME_MIN_PX = 116;

/**
 * Quanto o teto de largura do cartão cresce por coluna opcional presente
 * ("Partido", "Votos", "Parcial"). Os 280px de base são o teto histórico do
 * cartão de duas colunas; cada coluna nova precisa do seu próprio espaço, ou
 * ela o toma do nome.
 */
const COLUNA_EXTRA_PX = 72;

const HEAD_STYLE: CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  textAlign: "right",
};

/**
 * Cabeçalho da coluna de TEXTO ("Part."), alinhado à esquerda. Derivado de
 * {@link HEAD_STYLE} em vez de mutá-lo: o mesmo objeto é usado pelos quatro
 * cabeçalhos, e trocar `textAlign` nele levaria "Votos", "Parcial" e "Proj."
 * junto — números alinhados à esquerda perdem a coluna decimal, que é o que
 * torna a tabela comparável de relance.
 */
const HEAD_TEXT_STYLE: CSSProperties = { ...HEAD_STYLE, textAlign: "left" };

/**
 * Margem negativa que faz uma faixa de largura total (fundo do vencedor, fio
 * separador) **sangrar** até as bordas do cartão, desfazendo o `padding` dele.
 *
 * Constante e não literal repetido porque os dois valores têm de andar juntos:
 * o `padding` do cartão é `var(--space-3)`, e uma sangria que não o espelhe
 * deixa a faixa curta (faltando um lado) ou vazando para fora da borda. Quem
 * mudar o padding encontra esta constante ao lado.
 */
const SANGRIA = "calc(-1 * var(--space-3))";

function fmt(value: number | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : formatPercent(value);
}

function fmtVotos(value: number | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : formatVotes(value);
}

function fmtPartido(value: string | undefined): string {
  return value?.trim() ? value : "—";
}

/**
 * Uma coluna numérica opcional ("Parcial", "Votos") só existe quando ALGUMA
 * linha tem o dado de verdade — nunca uma coluna inteira de travessões
 * prometendo um dado que o produto não tem.
 *
 * Até 2026-09-18 isto só valia para "Parcial": o payload do Edge Config
 * carregava parcial **agregada por região** (`pct_apurado`, no cabeçalho do
 * cartão), não por candidato — `EdgeUfRow.top_candidatos` só tinha
 * `pct_projetado`. Desde então `top_candidatos[]` também publica
 * `pct_atual`/`votos_atuais` por candidato (`api/model/project.py`), mas o
 * princípio de degradação continua: payload pré-migração ou sob
 * `model_fallback_tier` ainda não tem os campos, e a coluna some em vez de
 * mostrar travessão em toda linha.
 *
 * Mesmo dia, mesma função, um consumidor a mais: "Proj." passa a usar
 * `hasColumn` também (era a única coluna sem essa checagem — ver a docstring
 * de `HoverCardRow.proj`). O mapa municipal é quem nunca preenche `proj` em
 * linha nenhuma; o nacional preenche em todas (campo obrigatório do
 * payload), então na prática a coluna nunca sumiu de lá.
 */
function hasColumn(rows: readonly HoverCardRow[], pick: (r: HoverCardRow) => number | undefined) {
  return rows.some((r) => {
    const v = pick(r);
    return v != null && Number.isFinite(v);
  });
}

/** Mesma degradação de `hasColumn`, para a coluna de texto "Partido". */
function hasPartido(rows: readonly HoverCardRow[]): boolean {
  return rows.some((r) => !!r.partido && r.partido.trim() !== "");
}

export function HoverCard({
  x,
  y,
  flip = false,
  title,
  kicker,
  apurado,
  rows,
  className,
  style,
}: HoverCardProps) {
  const parcial = hasColumn(rows, (r) => r.pct);
  const votos = hasColumn(rows, (r) => r.votos);
  const partido = hasPartido(rows);
  // 🔴 2026-09-18 (mapa municipal) — `proj` agora passa pelo MESMO `hasColumn`
  // das outras três. Antes era incondicional (comentário aqui dizia "é a
  // única métrica que TODA linha tem"), premissa que só valia para o mapa
  // NACIONAL. Município não tem projeção (ver docstring de `HoverCardRow.proj`)
  // e não deve fingir uma coluna vazia de travessões.
  const proj = hasColumn(rows, (r) => r.proj);
  // `minmax(NOME_MIN_PX, 1fr)` (nome) + uma coluna `auto` por dado disponível,
  // "Partido"/"Votos"/"Parcial"/"Proj." na ordem pedida pelo dono — cada uma
  // condicionada à sua própria checagem de presença, "Proj." incluída.
  //
  // 🔴 **`minmax`, não `1fr` puro** (2026-09-18, reportado pelo dono com
  // captura). `1fr` é *fração do que sobrar*, e com quatro colunas `auto`
  // numéricas não sobrava nada: o nome colapsava para a largura de UMA letra
  // ("FLAVIO BOLSONARO" virava "F") e o `text-ellipsis` não tinha nem espaço
  // para as reticências. `1fr` funcionava quando o balão tinha duas colunas;
  // ele não foi reavaliado quando o balão passou a ter cinco.
  //
  // O piso vence a fração: `minmax` garante a largura mínima do nome ANTES de
  // distribuir sobra, e as colunas numéricas (todas `auto`, conteúdo curto e
  // `whitespace-nowrap`) cedem o excedente. O nome ainda trunca com reticências
  // quando é longo de verdade — o que muda é que agora trunca legível.
  // `extras` NÃO conta `proj` (2026-09-18): o teto de `maxWidth` abaixo (280px
  // + `COLUNA_EXTRA_PX` por extra) já tratava "nome + Proj." como a base de
  // DUAS colunas do balão original — `proj` sempre esteve embutido nos 280,
  // nunca contado como extra. Mudar isso agora encolheria/alargaria o teto do
  // balão NACIONAL (que sempre tem `proj`) sem nenhum pedido do dono para tal;
  // no municipal, `proj` ausente só significa um teto ligeiramente folgado —
  // inofensivo, porque `width: max-content` já dimensiona pelo conteúdo real.
  const extras = [partido, votos, parcial].filter(Boolean).length;
  const gridTemplateColumns = [
    `minmax(${NOME_MIN_PX}px, 1fr)`,
    partido && "auto",
    votos && "auto",
    parcial && "auto",
    proj && "auto",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      aria-hidden="true"
      data-testid="hover-card"
      data-flip={flip ? "true" : "false"}
      className={["pointer-events-none absolute rounded-sm", className].filter(Boolean).join(" ")}
      style={{
        left: x,
        top: y,
        transform: flip ? "translate(calc(-100% - 12px), 12px)" : "translate(12px, 12px)",
        zIndex: 20,
        // 🔴 **Encolhe para o conteúdo** (2026-09-18, 2ª queixa do dono sobre a
        // mesma coluna). Sem isto o cartão ocupava SEMPRE o `maxWidth`, a
        // coluna do nome (`1fr`) engolia toda a sobra, e com nome curto
        // ("LULA") abria um vão de ~200px até a sigla do partido. No tooltip do
        // NYT esse vão não existe: a caixa é larga porque os NOMES são longos
        // ("Donald J. Trump"), não porque há espaço morto.
        //
        // `max-content` faz `1fr` resolver para o tamanho do conteúdo; o
        // `minWidth` segue como piso do cartão, o `maxWidth` como teto, e o
        // piso `NOME_MIN_PX` da coluna continua impedindo o colapso quando o
        // teto aperta. Os dois defeitos — nome espremido a uma letra e nome
        // com vão enorme — eram o MESMO parâmetro mal calibrado nas duas
        // pontas.
        width: "max-content",
        minWidth: 220,
        // A largura máxima ACOMPANHA o número de colunas. Os 280px eram o teto
        // do balão de duas colunas (nome + projeção); com "Partido", "Votos" e
        // "Parcial" o mesmo teto espremia o nome até sumir. Cada coluna extra
        // ganha `COLUNA_EXTRA_PX`, e `min(92vw, …)` impede que o balão
        // ultrapasse a viewport — ele é posicionado junto ao cursor e um teto
        // em px puro sairia da tela em janela estreita.
        maxWidth: `min(92vw, ${280 + extras * COLUNA_EXTRA_PX}px)`,
        padding: "var(--space-3)",
        background: "var(--surface-card)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-float)",
        animation: "am-fade var(--dur-fast) var(--ease-out)",
        ...style,
      }}
    >
      {kicker ? (
        <div
          style={{
            font: "var(--type-kicker)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div
        className="flex items-baseline justify-between"
        style={{ gap: "var(--space-3)", marginTop: 2, marginBottom: "var(--space-2)" }}
      >
        <div data-testid="hover-card-title" style={{ font: "var(--type-title)" }}>
          {title}
        </div>
        {apurado != null ? (
          <div
            data-testid="hover-card-apurado"
            className="whitespace-nowrap"
            style={{ font: "var(--type-data)", color: "var(--text-muted)" }}
          >
            {`${Math.round(Math.max(0, Math.min(100, apurado)))}% apurado`}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          gap: "var(--space-1) var(--space-3)",
          font: "var(--type-body-sm)",
        }}
      >
        <span aria-hidden="true" />
        {/* "PART." abreviado a pedido do dono (2026-09-18), e alinhado à
            ESQUERDA como no tooltip do NYT — lá `PARTY`/`Dem.`/`Rep.`/`Lib.`
            têm as bordas esquerdas alinhadas, e só as colunas numéricas
            (`VOTES`, `PCT.`, `E.V.`) vão à direita. Alinhar a sigla à esquerda
            também a encosta no nome, que era a queixa: com o partido à direita
            sobrava um vão entre "LULA" e "PT". */}
        {partido ? <span style={HEAD_TEXT_STYLE}>Part.</span> : null}
        {votos ? <span style={HEAD_STYLE}>Votos</span> : null}
        {parcial ? <span style={HEAD_STYLE}>Parcial</span> : null}
        {proj ? <span style={{ ...HEAD_STYLE, color: "var(--accent-text)" }}>Proj.</span> : null}
        {rows.map((row, i) => {
          // A linha de ÍNDICE 0 é sempre a líder (`top_candidatos[0]`,
          // ordenado por projeção desc — ver `EdgeUfRow.top_candidatos`).
          // `winnerBackground` só vem preenchido quando o CALLER decidiu que
          // a UF foi CHAMADA para ela (ver docstring de `HoverCardRow`); é
          // por isso que a checagem de índice basta e não precisa de mais
          // nenhuma prop de "é a linha N".
          const isLeading = i === 0;
          const isCalledWinner = isLeading && row.winnerBackground != null;
          const ink = isCalledWinner ? row.winnerInk : undefined;
          return (
            <Fragment key={row.name}>
              {isCalledWinner ? (
                // 🔴 **Só a coluna do NOME**, não a linha inteira — correção de
                // uma leitura errada minha das capturas do NYT (2026-09-18).
                // Ali a faixa colorida cobre `✓ Hillary Clinton` e **termina
                // antes de `Dem.`**: os números (`385,234`, `48.3%`, `5`)
                // seguem em tinta escura sobre o fundo do cartão. Pintar a
                // linha toda troca a cor de quatro colunas de números e afoga
                // a comparação que a tabela existe para permitir.
                //
                // Sangra só à ESQUERDA, até a borda do cartão (no NYT a faixa
                // encosta na lateral); à direita ela para onde a coluna acaba.
                //
                // Item de grid explícito na linha `i + 2` (a 1ª é o
                // cabeçalho), desenhado ANTES das células de texto no DOM para
                // ficar por baixo delas — CSS Grid empilha por ordem de
                // pintura, não por posição (mesma regra do `z-index: auto`).
                <span
                  aria-hidden="true"
                  style={{
                    gridColumn: "1 / 2",
                    gridRow: i + 2,
                    background: row.winnerBackground,
                    // **Sangra até as bordas do cartão** (2026-09-18, fidelidade
                    // ao NYT): lá a faixa do vencedor encosta nas laterais da
                    // caixa, não para na primeira coluna. As margens negativas
                    // desfazem o `padding` do cartão; `SANGRIA` mantém os dois
                    // números amarrados — mudar o padding sem mudar a sangria
                    // deixaria a faixa curta ou vazando.
                    marginLeft: SANGRIA,
                    // Cantos retos: a faixa encosta na lateral esquerda do
                    // cartão e acompanha o raio dele em vez de desenhar o seu.
                    borderRadius: 0,
                  }}
                />
              ) : null}
              {/* Fio separador entre candidatos (NYT). Só a partir da 2ª linha
                  — acima da 1ª está o cabeçalho, que já se separa pelo peso e
                  pela cor. Nunca colide com a faixa do vencedor: ela só existe
                  em `i === 0` e o fio só em `i > 0`. */}
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  style={{
                    gridColumn: "1 / -1",
                    gridRow: i + 2,
                    marginInline: SANGRIA,
                    borderTop: "1px solid var(--border-hairline)",
                  }}
                />
              ) : null}
              <span
                className="flex min-w-0 items-center"
                style={{
                  gap: "var(--space-2)",
                  // 🔴 Negrito **só no vencedor chamado** (2026-09-18). Antes era
                  // `isLeading`, e isso é ênfase sem fato por trás: liderar a
                  // projeção com 12% apurado não é vencer, e o negrito era a
                  // única marca da linha 0 num cartão onde nada mais dizia por
                  // que ela se destacava. Quem lidera já se lê pela POSIÇÃO (a
                  // lista vem ordenada) e pela cor do estado no mapa. No NYT o
                  // único nome destacado é o do vencedor — e lá a apuração está
                  // em 100%. Constituição § 1: a tela não afirma o que não sabe.
                  fontWeight: isCalledWinner ? 600 : 400,
                  // `ink` (tinta legível sobre a faixa) vale SÓ aqui: a faixa
                  // cobre apenas esta coluna, e pintar os números de branco os
                  // deixaria ilegíveis sobre o fundo claro do cartão.
                  color: ink,
                }}
              >
                {isCalledWinner ? (
                  // ✓ substitui o ponto de cor: a identidade partidária já
                  // está no FUNDO da linha inteira, um ponto da mesma cor por
                  // cima ficaria redundante (e às vezes ilegível contra ele).
                  <span aria-hidden="true" className="flex-none">
                    ✓
                  </span>
                ) : (
                  <span
                    className="flex-none"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "var(--radius-xs)",
                      background: row.color,
                    }}
                  />
                )}
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{row.name}</span>
              </span>
              {partido ? (
                <span
                  data-testid="hover-card-partido"
                  style={{ font: "var(--type-body-sm)", textAlign: "left" }}
                >
                  {fmtPartido(row.partido)}
                </span>
              ) : null}
              {votos ? (
                <span
                  data-testid="hover-card-votos"
                  style={{ font: "var(--type-figure-sm)", textAlign: "right" }}
                >
                  {fmtVotos(row.votos)}
                </span>
              ) : null}
              {parcial ? (
                <span
                  data-testid="hover-card-parcial"
                  style={{ font: "var(--type-figure-sm)", textAlign: "right" }}
                >
                  {fmt(row.pct)}
                </span>
              ) : null}
              {proj ? (
                <span
                  data-testid="hover-card-proj"
                  style={{
                    font: "var(--type-figure-sm)",
                    textAlign: "right",
                    color: "var(--accent-text)",
                  }}
                >
                  {fmt(row.proj)}
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
