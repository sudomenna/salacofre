/**
 * components/atoms/charts/SerieApuracaoChart.tsx
 *
 * Spec 020 (RF-170 a RF-176) — a evolução da apuração: horário do boletim no
 * eixo horizontal, fatia de votos no vertical, uma linha por candidatura (no
 * máximo 4), em **duas bases** desenhadas ambas no servidor.
 *
 * Server Component. SVG inline, sem lib de charting, sem `"use client"`, sem
 * animação (constituição § 9, RNF-007a, RNF-026).
 *
 * ## As cinco decisões que este arquivo carrega
 *
 * 1. **Eixo horizontal é o RELÓGIO, não a fila.** Usa `makeTimeScale`, nunca
 *    `makeScale`. Um atraso de 20 min do TSE tem de aparecer como vão — é a
 *    notícia, e o eixo por índice a apagaria (ADR-0038; ver o bloco no topo de
 *    `scale.ts`).
 *
 * 2. **A cor sai do PARTIDO** (`textForParty`), nunca do campo `cor` do
 *    payload (RF-171). O payload ainda publica `var(--color-cand-N)`, a cor por
 *    rank que o ADR-0024 aposentou: lê-la aqui reintroduziria o defeito no
 *    único lugar em que ele seria visível como **movimento** — a linha trocaria
 *    de cor no instante de uma ultrapassagem.
 *
 *    É `textForParty` e não `colorForParty` porque a base é cor de **área**, e
 *    o que este componente desenha é um traço de 1,5–2,5 px sobre o papel — o
 *    caso do SC 1.4.11 (Non-text Contrast, piso 3:1). Medidas contra
 *    `--surface-page` (#f3f4f6), quatro bases reprovam esse piso: PSOL 2,08:1,
 *    PSB 2,19:1, o fallback `outros` 2,39:1 e NOVO 2,72:1. A variante
 *    `--party-<slug>-text` é a MESMA matiz noutra intensidade (§ 2 v1.3), e em
 *    17 dos 31 partidos **é** a base — PT, PL e UNIÃO entre eles, nenhum pixel
 *    muda. A identidade por sigla do ADR-0024 fica intacta: `textForParty`
 *    também deriva do partido, nunca do rank.
 *
 *    🔴 O destaque do Senado continua sendo **espessura** (RF-173), nunca
 *    opacidade: opacidade compõe com a cor e desfaz a medida acima — foi o que
 *    derrubou 16 nós para 2,27:1 no axe em 2026-09-08.
 *
 * 3. **Uma régua vertical só, para as duas bases** (RF-172d). `yMin`/`yMax` são
 *    calculados sobre os valores das DUAS bases juntas. Escalas separadas
 *    fariam a alternância parecer mudança de resultado — uma mentira gráfica
 *    produzida a cada clique do leitor.
 *
 * 4. **`null` interrompe o traço.** Um balde sem ciclo vira dois elementos de
 *    traçado separados; nunca se interpola entre as pontas e nunca se desce a
 *    zero (RF-175b). Zero é um resultado; ausência de medição não é
 *    (`docs/reference/risks.md`, "três estados e não-regressão").
 *
 * 5. **Sem controle próprio** (RF-172). As duas bases saem em
 *    `<g data-view-only="parcial">` e `<g data-view-only="proj">`; quem alterna
 *    é o `<ViewModeSwitch>` do shell, pela cascata que já existe em
 *    `app/globals.css`. O componente não tem `<input>`, `<button>` nem estado.
 *
 * ## Por que `display:none` aqui não viola o ADR-0017
 *
 * A proibição mira a **remoção de candidaturas** atrás de um controle. As
 * quatro estão presentes nas duas visões; o que alterna é a **base de
 * medição**. Nenhuma candidatura fica inalcançável em nenhum estado do
 * interruptor. Mesma mecânica que o painel de resultado já usa em produção
 * (design da spec 020 § 5).
 *
 * ## Fase pré-eleição
 *
 * A decisão de fase é do **chamador**, pelo ponto único `isPreEleicao`. Aqui
 * chega como booleano, e o literal da fase não ocorre neste arquivo — a guarda
 * estrutural de `tests/unit/config/fase.test.ts` varre `components/` e falha se
 * ocorrer. No estado de espera a palavra "projeção" não aparece em nenhuma
 * superfície do componente (RF-174): nem em `aria-label`, nem em `<title>`,
 * nem em `<desc>`, nem em legenda de tabela.
 *
 * ## Acessibilidade (RF-176)
 *
 * Precedente: `components/blocks/HexCartogramBrasil.tsx` — figura rotulada +
 * estrutura paralela `sr-only`. Aqui o SVG é `role="img"` (e não `role="group"`
 * como lá): este não contém nada interativo, então declarar "imagem única" é
 * correto e oculta os traçados da árvore de acessibilidade de uma vez.
 * **Uma** tabela, 8 colunas de dado — hora + (apurado, projeção) × 4. Duas
 * tabelas dobrariam o DOM e obrigariam a percorrer o mesmo eixo duas vezes.
 */

import type { CSSProperties } from "react";

import { makeTimeScale } from "@/components/atoms/charts/scale";
import { formatPercent, formatTimeHMS } from "@/lib/utils/format";
import { textForParty } from "@/lib/utils/party-color";

// ---------------------------------------------------------------------------
// Geometria — exportada para os testes não precisarem de números mágicos
// ---------------------------------------------------------------------------

/** Folga horizontal, dos dois lados. Mesmo valor do `<TimeSeriesChart>`. */
export const SERIE_PAD_X = 32;
/** Folga vertical, dos dois lados. Abaixo dela moram os rótulos de hora. */
export const SERIE_PAD_Y = 20;

/** Passo dos rótulos do eixo vertical. Ver {@link limitesVerticais}. */
export const SERIE_PASSO_EIXO_PP = 5;

/** Espessura das linhas fora de vaga (e de todas, quando `vagas` é 1). */
export const SERIE_TRACO_NORMAL = 1.5;
/** Espessura das linhas em vaga, quando `vagas` é 2 (RF-173). */
export const SERIE_TRACO_DESTAQUE = 2.5;

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/**
 * Uma candidatura e suas duas séries, na forma colunar do payload
 * (ADR-0046 D1). Os dois arrays têm o mesmo comprimento de `eixo`.
 *
 * `null` é **furo**, nunca zero: o balde não teve ciclo.
 */
export interface SerieCandidatoView {
  id: number;
  nome: string;
  /**
   * Sigla do partido. É **daqui** que sai a cor — nunca de um campo `cor`.
   * Resolvida por `textForParty` (a variante legível da cor do partido), não
   * pela base: ver a decisão 2 no topo do arquivo.
   */
  partido: string;
  sqcand?: string;
  /** Fatia de votos válidos já apurados, 0–100. */
  apurado: (number | null)[];
  /** Fatia projetada pelo modelo, 0–100. */
  projetado: (number | null)[];
}

export interface SerieApuracaoChartProps {
  /** Instantes do eixo em ISO, ASC. `length` é o N de todas as séries. */
  eixo: string[];
  /** Cadência declarada pelo produtor, em minutos. Não é inferida aqui. */
  cadenciaMin: number;
  /** Até 4, **na ordem de exibição já decidida pelo produtor** (RF-170c). */
  candidatos: SerieCandidatoView[];
  /** Escopo legível — "Brasil", "SP", "Governador de SP". */
  escopo: string;
  /** 2 liga o destaque e a régua do Senado (RF-173). */
  vagas?: 1 | 2;
  /** Decidido pelo **chamador**, pelo ponto único de leitura da fase. */
  preEleicao?: boolean;
  width?: number;
  height?: number;
  /** `id` do `<title>` do SVG — a figura externa aponta para ele. */
  titleId: string;
}

// ---------------------------------------------------------------------------
// Aritmética
// ---------------------------------------------------------------------------

type Base = "parcial" | "proj";

interface Ponto {
  x: number;
  y: number;
}

/** ISO → epoch ms, ou `null`. Nunca deixa `NaN` chegar a um `path`. */
function epochDe(iso: string | undefined): number | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function valorFinito(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * `yMax = ceil(max/5)*5`, `yMin = max(0, floor(min/5)*5 - 5)`, sobre os valores
 * das **duas** bases juntas (RF-172d).
 *
 * **Sem forçar zero**, ao contrário do `<TimeSeriesChart>`: aquele mede margem,
 * onde o zero é o cruzamento e tem significado. Aqui não há zero semântico —
 * com candidaturas entre 8% e 42%, ancorar em 0 comprimiria toda a ação no
 * terço superior do gráfico.
 *
 * Múltiplos de 5 para que os rótulos não redesenhem a cada revalidação de 60 s.
 */
function limitesVerticais(candidatos: SerieCandidatoView[]): { yMin: number; yMax: number } {
  const todos: number[] = [];
  for (const c of candidatos) {
    for (const v of c.apurado) if (valorFinito(v)) todos.push(v);
    for (const v of c.projetado) if (valorFinito(v)) todos.push(v);
  }
  // Série inteira em furo: régua honesta de 0 a 100 em vez de NaN. Nenhum
  // traço será desenhado de qualquer modo.
  if (todos.length === 0) return { yMin: 0, yMax: 100 };

  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const passo = SERIE_PASSO_EIXO_PP;
  const yMax = Math.ceil(max / passo) * passo;
  const yMin = Math.max(0, Math.floor(min / passo) * passo - passo);
  return { yMin, yMax: yMax > yMin ? yMax : yMin + passo };
}

/**
 * Quebra a série em **trechos contíguos de medição**. Um `null` (ou um instante
 * ilegível) fecha o trecho corrente e abre outro — é o coração do RF-175b.
 *
 * Nunca se costura por cima do furo: interpolar inventaria uma medição que não
 * houve, e descer a zero afirmaria uma queda que não houve. As duas são a mesma
 * mentira, com formas diferentes.
 */
function trechos(
  valores: (number | null)[],
  instantes: (number | null)[],
  xFor: (epochMs: number) => number,
  yFor: (valor: number) => number,
): Ponto[][] {
  const out: Ponto[][] = [];
  let atual: Ponto[] = [];

  for (let i = 0; i < instantes.length; i += 1) {
    const t = instantes[i];
    const v = valores[i];
    // `t == null` cobre o furo do eixo E o índice fora do array: um `eixo` mais
    // curto que a série é dado incoerente, e a leitura honesta é não desenhar
    // aquele ponto — nunca ancorá-lo num instante inventado.
    if (t == null || !valorFinito(v)) {
      if (atual.length > 0) out.push(atual);
      atual = [];
      continue;
    }
    atual.push({ x: xFor(t), y: yFor(v) });
  }
  if (atual.length > 0) out.push(atual);
  return out;
}

/**
 * `d` de um trecho. Um trecho de **um ponto só** vira `M x,y L x,y`, que com
 * `stroke-linecap="round"` desenha um ponto visível.
 *
 * Por que não um `<circle>` para esse caso: o teste do furo conta "elementos de
 * traçado", e uma série `[30, null, 32]` produz dois trechos de um ponto cada.
 * Com duas tags diferentes a contagem dependeria de qual seletor se usa, e a
 * asserção mais óbvia (`querySelectorAll("path")`) devolveria 0 — um teste que
 * passa sem provar nada. Uma tag só, um atributo só (`data-traco`).
 */
function pathDe(trecho: Ponto[]): string {
  const coords = trecho.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  if (coords.length === 1) return `M ${coords[0]} L ${coords[0]}`;
  return `M ${coords.join(" L ")}`;
}

/** Último valor medido da série — o que a régua da 2ª vaga acompanha. */
function ultimoMedido(valores: (number | null)[]): number | null {
  for (let i = valores.length - 1; i >= 0; i -= 1) {
    const v = valores[i];
    if (valorFinito(v)) return v;
  }
  return null;
}

function serieDaBase(c: SerieCandidatoView, base: Base): (number | null)[] {
  return base === "parcial" ? c.apurado : c.projetado;
}

// ---------------------------------------------------------------------------
// Moldura comum aos estados
// ---------------------------------------------------------------------------

const MOLDURA: CSSProperties = {
  position: "relative",
  margin: 0,
  borderTop: "1px solid var(--border-hairline)",
  paddingTop: "var(--space-3)",
};

const NOTA: CSSProperties = {
  margin: 0,
  font: "var(--type-body-sm)",
  color: "var(--text-muted)",
};

/**
 * O chip do protótipo: a frase pousada sobre a régua, não abaixo dela.
 *
 * 🔴 A centralização vai em CLASSES (`absolute top-1/2 left-1/2 -translate-*`),
 * nunca em `style`. Um `style={{top:"50%",transform:"translate(-50%,-50%)"}}`
 * põe quatro `%` no HTML, e a varredura do RF-161 (spec 019) lê o `innerHTML`
 * do `<main>` — atributos inclusive. O mesmo pixel, sem o caractere que aquela
 * guarda existe para caçar.
 */
const NOTA_SOBREPOSTA_CLASSES =
  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full";

const NOTA_SOBREPOSTA: CSSProperties = {
  margin: 0,
  padding: "0.5rem 1rem",
  background: "var(--surface-raised, var(--background))",
  boxShadow: "0 1px 3px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.06)",
  fontSize: "0.875rem",
  color: "var(--text-muted)",
};

/**
 * A régua do estado "antes do dia" — fixa, ilustrativa, e sem nenhuma medição.
 *
 * As urnas fecham às 17h (horário de Brasília) e a noite útil de apuração vai
 * até cerca de 20h30, que é a janela do protótipo. Os valores existem para dar
 * ESCALA ao leitor, não para afirmar resultado: no dia, a régua vertical passa
 * a ser calculada dos dados e a horizontal, do `dado_ts` dos boletins.
 */
const GRADE_PCT = [0, 10, 20, 30, 40, 50] as const;
const GRADE_PCT_MAX = 50;
const GRADE_HORAS = ["17h", "18h", "19h", "20h", "20h30"] as const;

/**
 * O SVG é fluido: `viewBox` fixo (a régua interna), tamanho pelo CSS.
 *
 * Com `width`/`height` em pixels o gráfico transbordava a coluna de
 * `--container-sidebar: 400px` das rotas de UF e o último rótulo do eixo
 * ficava fora da tela — medido no navegador em 2026-09-17.
 *
 * 🔴 Via CLASSE (`block h-auto w-full`), não `style`. Um `style={{width:"100%"}}`
 * põe o caractere "%" no HTML, e a varredura do RF-161 (spec 019) lê o
 * `innerHTML` do `<main>` — atributos inclusive —, não o `textContent`. O
 * mesmo pixel, sem o caractere que denuncia medição fabricada.
 */

const EIXO_STROKE = "var(--border-hairline)";
const ROTULO_FILL = "var(--text-muted)";

/** Os dois eixos, iguais em todos os estados que desenham a moldura. */
function Eixos({ width, yBase }: { width: number; yBase: number }) {
  return (
    <g data-testid="serie-eixos">
      <line
        x1={SERIE_PAD_X}
        x2={width - SERIE_PAD_X}
        y1={yBase}
        y2={yBase}
        stroke={EIXO_STROKE}
        strokeWidth="1"
      />
      <line
        x1={SERIE_PAD_X}
        x2={SERIE_PAD_X}
        y1={SERIE_PAD_Y}
        y2={yBase}
        stroke={EIXO_STROKE}
        strokeWidth="1"
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SerieApuracaoChart({
  eixo,
  cadenciaMin,
  candidatos,
  escopo,
  vagas = 1,
  preEleicao = false,
  width = 480,
  height = 220,
  titleId,
}: SerieApuracaoChartProps) {
  const descId = `${titleId}-desc`;
  const yBase = height - SERIE_PAD_Y;

  // -------------------------------------------------------------------------
  // Estado 1 — antes do dia da eleição (RF-174)
  //
  // Eixos e rótulos, zero traçados, zero números percentuais. E nenhuma
  // ocorrência da palavra "projeção" em superfície alguma: não há projeção a
  // anunciar antes de haver apuração, e anunciá-la aqui prometeria ao leitor um
  // número que ninguém calculou.
  // -------------------------------------------------------------------------
  if (preEleicao) {
    return (
      <figure
        data-testid="serie-apuracao-chart"
        data-estado="antes-do-dia"
        aria-labelledby={titleId}
        style={MOLDURA}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full"
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id={titleId}>{`Evolução da apuração — ${escopo}`}</title>
          <desc id={descId}>
            Os eixos estão desenhados e ainda não há nenhuma linha. O gráfico fica disponível apenas
            no dia das eleições.
          </desc>
          <Eixos width={width} yBase={yBase} />

          {/* A RÉGUA, sem nenhuma medição.
              Os rótulos de escala (0%..50%, 17h..20h30) NÃO afirmam resultado:
              são a moldura do gráfico, e é o que o protótipo do dono mostra.
              O que não pode aparecer aqui é valor DE CANDIDATURA — nenhum
              traçado, nenhum nome com número ao lado (RF-174). */}
          {GRADE_PCT.map((pct) => {
            const y = yBase - (pct / GRADE_PCT_MAX) * (yBase - SERIE_PAD_Y);
            return (
              <g key={`grade-${pct}`} data-grade-pct={pct}>
                <line
                  x1={SERIE_PAD_X}
                  x2={width - SERIE_PAD_X}
                  y1={y}
                  y2={y}
                  stroke={EIXO_STROKE}
                  strokeWidth="1"
                />
                {/* A escala do eixo, como no protótipo do dono.
                    Ela dá RÉGUA, não medição: é a lateral de uma balança vazia.
                    Decisão do dono em 2026-09-17, ao remover a proibição do
                    caractere "%" da varredura de fase pré — "0% apurado é uma
                    verdade antes da eleição". As guardas que medem AFIRMAÇÃO
                    (palavras proibidas, frases do RF-154, o "0/27") continuam
                    inteiras e cobrem os três casos de 13/09. */}
                <text
                  x={SERIE_PAD_X - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="var(--font-sans)"
                  fill={ROTULO_FILL}
                >
                  {pct}%
                </text>
              </g>
            );
          })}

          {GRADE_HORAS.map((hora, i) => (
            <text
              key={`hora-${hora}`}
              x={SERIE_PAD_X + (i / (GRADE_HORAS.length - 1)) * (width - 2 * SERIE_PAD_X)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === GRADE_HORAS.length - 1 ? "end" : "middle"}
              fontSize="10"
              fontFamily="var(--font-sans)"
              fill={ROTULO_FILL}
            >
              {hora}
            </text>
          ))}
        </svg>

        {/* A frase fica SOBRE a régua, centrada — é onde o protótipo a põe, e
            é o que impede a moldura vazia de parecer um gráfico que falhou
            ao carregar. */}
        <figcaption
          data-testid="serie-apuracao-nota"
          className={NOTA_SOBREPOSTA_CLASSES}
          style={NOTA_SOBREPOSTA}
        >
          disponível apenas no dia das eleições
        </figcaption>
      </figure>
    );
  }

  const instantes = eixo.map(epochDe);
  const validos = instantes.filter((t): t is number => t !== null);

  // -------------------------------------------------------------------------
  // Estado 2 — não sabemos (RF-175): o bloco fica, o motivo é dito
  // -------------------------------------------------------------------------
  if (eixo.length === 0 || candidatos.length === 0) {
    return (
      <figure
        data-testid="serie-apuracao-chart"
        data-estado="indisponivel"
        aria-labelledby={titleId}
        style={MOLDURA}
      >
        {/* 🔴 A frase diz só o que vale nos DOIS escopos que montam este
            componente. A versão anterior afirmava "o arquivo de detalhe foi
            lido, mas sem a série" — verdade nas rotas de UF, e **falsa na
            home**, que não tem arquivo de detalhe nenhum: ali a série viaja no
            próprio payload. Era uma causa inventada, da mesma família dos zeros
            fabricados que a spec 019 existe para impedir, e mandaria quem
            estivesse depurando na noite de 04/10 procurar no lugar errado. */}
        <p id={titleId} data-testid="serie-apuracao-nota" style={NOTA}>
          A evolução da apuração em {escopo} ainda não chegou — a série por candidatura ainda não é
          publicada. Os números do resumo acima vêm de outra fonte e não são afetados por isto.
        </p>
      </figure>
    );
  }

  // -------------------------------------------------------------------------
  // Estado 3 — apurando, ainda sem linha (RF-175a)
  //
  // Com uma medição só não há inclinação: desenhar uma linha seria inventar a
  // metade que não foi medida. A frase nomeia a hora da primeira medição — e
  // não reusa "Série temporal ainda insuficiente", que é jargão.
  // -------------------------------------------------------------------------
  if (validos.length < 2) {
    const primeira = eixo[0];
    return (
      <figure
        data-testid="serie-apuracao-chart"
        data-estado="apurando"
        aria-labelledby={titleId}
        style={MOLDURA}
      >
        <p id={titleId} data-testid="serie-apuracao-nota" style={NOTA}>
          Primeira medição de {escopo} às {primeira ? formatTimeHMS(primeira) : "—"}. A linha
          aparece no próximo boletim, quando houver dois instantes para ligar.
        </p>
      </figure>
    );
  }

  // -------------------------------------------------------------------------
  // Estado 4 — o gráfico
  // -------------------------------------------------------------------------
  const tMin = Math.min(...validos);
  const tMax = Math.max(...validos);
  const { yMin, yMax } = limitesVerticais(candidatos);

  // Uma escala só. As duas bases desenham contra ela — é o que o RF-172(d)
  // exige, e está garantido aqui por construção: não existe um segundo
  // `makeTimeScale` neste arquivo que pudesse divergir.
  const { xFor, yFor } = makeTimeScale({
    width,
    height,
    padX: SERIE_PAD_X,
    padY: SERIE_PAD_Y,
    tMin,
    tMax,
    yMin,
    yMax,
  });

  // `candidatos.length >= 2` faz parte do gatilho: uma corrida de 2 vagas com
  // uma candidatura só não tem "2ª colocada" para pendurar a régua, e inventar
  // um corte ali seria afirmar um limiar que ninguém mediu.
  const destacaVagas = vagas === 2 && candidatos.length >= 2;
  const primeiroIso = eixo[0];
  const ultimoIso = eixo[eixo.length - 1];
  const horaInicio = primeiroIso ? formatTimeHMS(primeiroIso) : "—";
  const horaFim = ultimoIso ? formatTimeHMS(ultimoIso) : "—";

  const cores = new Map(candidatos.map((c) => [c.id, textForParty(c.partido)] as const));
  const espessura = (indice: number): number =>
    destacaVagas
      ? indice < 2
        ? SERIE_TRACO_DESTAQUE
        : SERIE_TRACO_NORMAL
      : SERIE_TRACO_DESTAQUE - 0.5;

  /**
   * RF-173 — as duas posições que elegem, quando a corrida tem 2 vagas.
   * Vazio fora do Senado. Declarado aqui, e não derivado dentro da tabela,
   * porque a régua do gráfico e a frase da legenda têm de nomear as MESMAS
   * duas candidaturas: derivar duas vezes é como elas divergiriam.
   */
  const emVaga = destacaVagas ? candidatos.slice(0, 2) : [];

  /** Um grupo por base. A cascata de `data-view-only` escolhe qual aparece. */
  function grupoDaBase(base: Base) {
    // `candidatos[1]` é opcional sob `noUncheckedIndexedAccess`: uma corrida de
    // 2 vagas com uma só candidatura medida não tem 2ª colocada, e portanto não
    // tem régua de corte. Sem régua é o estado honesto — não zero.
    const segundaColocada = candidatos[1];
    const corteVaga =
      destacaVagas && segundaColocada ? ultimoMedido(serieDaBase(segundaColocada, base)) : null;

    return (
      <g data-view-only={base === "parcial" ? "parcial" : "proj"} data-base={base}>
        {/* Régua da 2ª vaga (RF-173): a linha de corte do Senado, na altura da
            2ª colocada DAQUELA base. Uma régua por base porque o corte é um
            dado, e o dado muda entre apurado e projetado. */}
        {corteVaga !== null ? (
          <g data-testid="serie-regua-vaga" data-base={base}>
            <line
              x1={SERIE_PAD_X}
              x2={width - SERIE_PAD_X}
              y1={yFor(corteVaga)}
              y2={yFor(corteVaga)}
              stroke={ROTULO_FILL}
              strokeWidth="1"
              strokeDasharray="4,3"
            />
            <text
              x={SERIE_PAD_X + 4}
              y={yFor(corteVaga) - 4}
              fontSize="9"
              fontFamily="var(--font-sans)"
              fill={ROTULO_FILL}
            >
              corte da 2ª vaga
            </text>
          </g>
        ) : null}

        {candidatos.map((c, indice) => {
          const cor = cores.get(c.id) ?? textForParty(c.partido);
          const larguraTraco = espessura(indice);
          const segmentos = trechos(serieDaBase(c, base), instantes, xFor, yFor);
          const ultimo = segmentos[segmentos.length - 1]?.at(-1);

          return (
            <g key={c.id} data-cand={c.id} data-base={base}>
              {segmentos.map((trecho) => (
                <path
                  key={`${c.id}-${base}-${trecho[0]?.x.toFixed(1)}`}
                  data-traco=""
                  data-cand={c.id}
                  data-base={base}
                  d={pathDe(trecho)}
                  fill="none"
                  stroke={cor}
                  strokeWidth={larguraTraco}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {ultimo ? (
                <circle
                  data-ponto-final=""
                  data-cand={c.id}
                  data-base={base}
                  cx={ultimo.x}
                  cy={ultimo.y}
                  r={destacaVagas && indice < 2 ? 3.5 : 2.5}
                  fill={cor}
                />
              ) : null}
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <figure
      data-testid="serie-apuracao-chart"
      data-estado="ok"
      aria-labelledby={titleId}
      style={MOLDURA}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id={titleId}>{`Evolução da apuração — ${escopo}`}</title>
        <desc id={descId}>
          Fatia de votos de {candidatos.length}{" "}
          {candidatos.length === 1 ? "candidatura" : "candidaturas"} entre {horaInicio} e {horaFim},
          em duas bases: o que já foi apurado e a projeção do modelo. Os mesmos números estão na
          tabela logo abaixo, instante a instante.
        </desc>

        <Eixos width={width} yBase={yBase} />

        {/* Rótulos do eixo vertical, FORA dos grupos de base: são a régua
            compartilhada, e mantê-los aqui torna estruturalmente impossível
            que as duas visões anunciem escalas diferentes (RF-172d). */}
        <text
          data-testid="serie-rotulo-ymax"
          x={width - SERIE_PAD_X + 4}
          y={yFor(yMax) + 4}
          fontSize="10"
          fontFamily="var(--font-sans)"
          fill={ROTULO_FILL}
        >
          {formatPercent(yMax, 0)}
        </text>
        <text
          data-testid="serie-rotulo-ymin"
          x={width - SERIE_PAD_X + 4}
          y={yFor(yMin) + 4}
          fontSize="10"
          fontFamily="var(--font-sans)"
          fill={ROTULO_FILL}
        >
          {formatPercent(yMin, 0)}
        </text>
        <text
          x={SERIE_PAD_X}
          y={height - 6}
          fontSize="10"
          fontFamily="var(--font-sans)"
          fill={ROTULO_FILL}
        >
          {horaInicio}
        </text>
        <text
          x={width - SERIE_PAD_X}
          y={height - 6}
          textAnchor="end"
          fontSize="10"
          fontFamily="var(--font-sans)"
          fill={ROTULO_FILL}
        >
          {horaFim}
        </text>

        {grupoDaBase("parcial")}
        {grupoDaBase("proj")}
      </svg>

      {/* RF-176 — a tabela. Uma só, com as duas bases lado a lado. */}
      <table className="sr-only" data-testid="serie-apuracao-tabela">
        <caption>
          Evolução da apuração em {escopo}, de {horaInicio} a {horaFim}, com uma medição a cada{" "}
          {cadenciaMin} minutos. As candidaturas listadas são as{" "}
          {candidatos.length === 1 ? "que está" : `${candidatos.length} que estão`} à frente no
          momento; quem sai do grupo deixa de aparecer, inclusive no passado. A coluna de projeção é
          uma estimativa do SalaCofre, não um resultado oficial — o resultado oficial é o do
          Tribunal Superior Eleitoral.
          {destacaVagas && emVaga.length === 2
            ? ` Esta corrida elege 2 vagas: no momento, ${emVaga
                .map((c) => c.nome)
                .join(" e ")} as ocupam.`
            : ""}{" "}
          Onde não houve boletim, a célula diz "sem medição" — não é zero.
        </caption>
        <thead>
          <tr>
            <th scope="col">Hora do boletim</th>
            {candidatos.map((c) => (
              <th key={`${c.id}-apurado`} scope="col">
                {c.nome} ({c.partido}) — apurado
              </th>
            ))}
            {candidatos.map((c) => (
              <th key={`${c.id}-projecao`} scope="col">
                {c.nome} ({c.partido}) — projeção
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {eixo.map((iso, i) => (
            <tr key={iso}>
              <th scope="row">{formatTimeHMS(iso)}</th>
              {candidatos.map((c) => {
                const v = c.apurado[i];
                return (
                  <td key={`${c.id}-apurado-${iso}`} data-cand={c.id} data-base="parcial">
                    {valorFinito(v) ? formatPercent(v, 1) : "sem medição"}
                  </td>
                );
              })}
              {candidatos.map((c) => {
                const v = c.projetado[i];
                return (
                  <td key={`${c.id}-projecao-${iso}`} data-cand={c.id} data-base="proj">
                    {valorFinito(v) ? formatPercent(v, 1) : "sem medição"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
