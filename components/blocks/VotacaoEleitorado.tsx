/**
 * components/blocks/VotacaoEleitorado.tsx
 *
 * Painel "Votação" (spec 021) — o eleitorado inteiro em três arcos, contado e
 * projetado. Renderiza em `<Panel>` próprio, depois da lista de candidaturas
 * (RF-192; a ordem das seções é responsabilidade de quem monta a página).
 *
 * ## Os três arcos, e por que são três
 *
 *   1. **Sobre os aptos**, cinco fatias, com o não apurado NOMEADO em cinza.
 *   2. **Sobre o eleitorado já apurado**, quatro fatias, sem residual.
 *   3. **Sobre os aptos**, as mesmas CINCO fatias, projetadas para o fim da
 *      noite — o arco 1 projetado, com o residual pela MESMA subtração.
 *
 * Existem três porque a aritmética do TSE não fecha num arco só. Do dicionário
 * oficial (`tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt:459-468`):
 * `comparecimento + abstencao` fecha em `instalados`, **nunca** em `aptos`; e
 * `validos + brancos + nulos` deixa de fora `anulados` e `sub_judice`, que o
 * EA20 põe dentro do comparecimento sem pertencer a candidato, branco ou nulo.
 * Medido na captura real do simulado a 100% apurado
 * (`tests/fixtures/tse/2026-sim/br-c0001-e021270-u.json`): `aptos` 163.079.139
 * contra `instalados` 163.078.872, e `anulados + sub_judice` = 19.722.460 votos
 * — **14,2% do comparecimento**. Um arco só teria 14% de buraco mudo.
 *
 * ## 🔴 A quinta fatia é derivada por SUBTRAÇÃO, nunca por um campo
 *
 * `residual = aptos − (validos + brancos + nulos + abstencao)` (RF-193).
 * É a única forma de o arco fechar em 100% **por construção**, com qualquer
 * combinação de seções não instaladas e votos anulados. Uma quinta fatia
 * calculada à parte poderia divergir do total e publicar um círculo que não
 * soma — constituição § 6. O teste `fecha em 100% por construção` trava isso
 * comparando `data-soma-abs` com `data-total`.
 *
 * 🔴 **Os arcos 1 e 3 usam a MESMA função** ({@link fatiasSobreAptos}), e isso
 * é requisito, não economia: o RF-195 foi corrigido em 2026-09-26 justamente
 * porque a versão anterior mandava NORMALIZAR o arco 3 para fechar em `aptos`.
 * A premissa era que o vão fosse ruído de bootstrap; medido na captura real de
 * 100% apurado, o bootstrap responde por ~0,0001% dele e o resto é **voto
 * anulado**, que não projeta para zero. Reescalar exigiria fator 1,1376 e
 * publicaria 114.875.061 válidos contra os 100.982.116 reais — **13.892.945
 * votos fabricados**, ao lado do arco 2 exibindo o número verdadeiro na mesma
 * tela. Duas funções separadas são o que permitiria essa divergência voltar.
 *
 * ⚠️ Por isso o cinza do arco 3 **não vai a zero** no fim da noite: ele
 * estaciona no tamanho de `anulados + sub_judice`, e a metodologia declara
 * essa soma (RF-197) exatamente para que o leitor saiba o que é aquela fatia.
 *
 * ## Três estados, e colapsar dois é o erro (RF-193b vs RF-198)
 *
 * | no payload                                   | o que é       | o que sai na tela            |
 * |----------------------------------------------|---------------|------------------------------|
 * | `votacao` ausente                            | não sabemos   | `<DetailUnavailable>`        |
 * | `contagens` com `aptos > 0`, resto `0`        | não começou   | arco 1 inteiro em "não apurado" |
 * | qualquer fatia `> 0`                         | apurando      | arco 1 normal                |
 *
 * São os três estados que o dono fixou em 14/09. O "não começou" cai fora da
 * subtração sozinho (`aptos − 0 = aptos`), então não há transição a programar
 * e **nenhum zero é fabricado**: o estado só é alcançável quando o produtor
 * publicou `aptos` de verdade. Já o arco 2 tem denominador ZERO nesse estado e
 * por isso NÃO renderiza fatias — renderiza "sem base apurada", presente no
 * DOM. Imprimir "0,0%" ali seria afirmar uma medição que não existe.
 *
 * ## Cor: nenhum partido é dono do voto nulo (constituição § 2)
 *
 * As cinco fatias são neutras por construção, e saem de {@link FATIA_COR} —
 * ponto único, para que a troca por tokens definitivos seja uma edição só.
 * Contrastes medidos contra `--surface-page` nos DOIS temas (claro #f3f4f6 /
 * escuro #14171b), porque um cinza que passa no claro costuma reprovar no
 * escuro:
 *
 *   --ink-1 ....................... 12,25:1 / 12,43:1
 *   --color-part-brancos-nulos ....  6,67:1 /  5,63:1
 *   --color-part-abstencao ........  8,19:1 /  5,67:1
 *
 * ⚠️ **Brancos e nulos dividem o MESMO token** porque o kit só tem um
 * (`--color-part-brancos-nulos`) — ele nasceu para a métrica agregada
 * "brancos e nulos" do hero, que esta spec separa em duas fatias. Em vez de
 * inventar um hex solto, "brancos" recebe a mesma cor com **hachura**: a
 * distinção é de padrão, não de matiz, o que também a torna legível para quem
 * não distingue as duas (WCAG 1.4.1 — a cor nunca é o único portador). Os
 * cinzas pálidos do kit foram medidos e REPROVAM: `--paper-3` dá 1,20:1 no
 * claro, e `--color-band-tossup` 1,28:1 (esses tokens de banda não são
 * redefinidos no tema escuro, então `--color-band-very_likely` cai a 1,85:1
 * lá). O residual usa `--surface-sunken` com contorno em `--border-strong`:
 * é o contorno que dá a borda perceptível, não o preenchimento.
 *
 * ## Nenhum texto dentro do SVG — de propósito
 *
 * O axe deste projeto joga contraste de texto em SVG no balde `incomplete`,
 * que **não reprova nada** (18 nós assim em `/sobre-o-modelo`). Aqui o SVG tem
 * só caminhos: o número grande e a legenda são HTML por cima do arco, em
 * `--text-primary` / `--text-secondary` sobre a superfície da página, onde o
 * contraste é medido de verdade. A tradução textual do gráfico (RNF-023) é a
 * legenda **visível** — não uma tabela escondida, que além de duplicar a
 * verdade cairia na armadilha de 2026-09-19 (`sr-only` não recorta `<table>`:
 * 2.424px de rolagem horizontal medidos no celular).
 *
 * Cada arco é um `<figure>` com `<figcaption>` que NOMEIA A BASE do
 * percentual, e é isso que satisfaz RF-196 sem repetir "de 163.079.139
 * eleitores aptos" em cinco linhas: as fatias estão dentro da figura cuja
 * legenda declara o denominador.
 *
 * Server Component puro — sem `"use client"`, sem estado, sem evento. O painel
 * entra no lado eager das quatro telas nacionais e não pode custar bundle
 * (RNF-007a, teto de 150 KiB de aplicação acima da dobra).
 */

import { DetailUnavailable } from "@/components/atoms/surfaces/DetailUnavailable";
import { Panel } from "@/components/atoms/surfaces/Panel";
import type {
  EdgeVotacao,
  EdgeVotacaoContagens,
  EdgeVotacaoProjetada,
} from "@/lib/edge-config/types";
import { formatPercent, formatVotes } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Vocabulário das fatias
// ---------------------------------------------------------------------------

/** As cinco fatias, na ordem canônica do RF-193. */
export type FatiaKey = "validos" | "brancos" | "nulos" | "abstencao" | "nao_apurado";

/** Ordem canônica do RF-193 — o arco 1 usa as cinco; os arcos 2 e 3, as quatro primeiras. */
export const ORDEM_FATIAS: readonly FatiaKey[] = [
  "validos",
  "brancos",
  "nulos",
  "abstencao",
  "nao_apurado",
] as const;

/** As quatro fatias contadas (sem o residual derivado). */
export const FATIAS_CONTADAS: readonly Exclude<FatiaKey, "nao_apurado">[] = [
  "validos",
  "brancos",
  "nulos",
  "abstencao",
] as const;

export const FATIA_LABEL: Record<FatiaKey, string> = {
  validos: "Votos válidos",
  brancos: "Votos em branco",
  nulos: "Votos nulos",
  abstencao: "Abstenção",
  nao_apurado: "Ainda não apurado",
};

/**
 * Ponto único da cor das fatias — ver o § "Cor" no cabeçalho do arquivo para
 * os contrastes medidos e para a razão de "brancos" ser hachurado em vez de
 * ter matiz própria. `hachura: true` desenha por cima do preenchimento uma
 * série de traços na cor da superfície.
 */
export const FATIA_COR: Record<FatiaKey, { fill: string; hachura?: boolean; contorno?: string }> = {
  validos: { fill: "var(--ink-1)" },
  brancos: { fill: "var(--color-part-brancos-nulos)", hachura: true },
  nulos: { fill: "var(--color-part-brancos-nulos)" },
  abstencao: { fill: "var(--color-part-abstencao)" },
  nao_apurado: { fill: "var(--surface-sunken)", contorno: "var(--border-strong)" },
};

// ---------------------------------------------------------------------------
// Aritmética — exportada porque é onde os defeitos moram
// ---------------------------------------------------------------------------

/** Uma fatia já resolvida: rótulo, absoluto e percentual sobre a base do arco. */
export interface Fatia {
  key: FatiaKey;
  label: string;
  abs: number;
  pct: number;
}

/**
 * As quatro fatias contadas, vindas de QUALQUER origem — das contagens do TSE
 * (arco 1) ou da projeção (arco 3). O tipo existe para que a regra do residual
 * seja literalmente a mesma função nos dois casos; ver o § do residual no
 * cabeçalho para o que aconteceu quando as duas regras eram separadas.
 */
export interface QuatroFatias {
  validos: number;
  brancos: number;
  nulos: number;
  abstencao: number;
}

/**
 * `validos + brancos + nulos + abstencao`.
 *
 * ⚠️ Não é `comparecimento`, não é `instalados` e não é `aptos`. Sobre as
 * contagens, é o eleitorado JÁ APURADO — base do arco 2 e subtraendo do
 * residual do arco 1. Ver o § da aritmética do TSE no cabeçalho.
 */
export function somaQuatro(q: QuatroFatias): number {
  return q.validos + q.brancos + q.nulos + q.abstencao;
}

/** Atalho legível para a base do arco 2. */
export function somaApurada(c: EdgeVotacaoContagens): number {
  return somaQuatro(c);
}

/**
 * O residual do RF-193, por SUBTRAÇÃO, **sem clamp**.
 *
 * Devolve o número cru, inclusive negativo. Não clampa de propósito: um
 * `Math.max(0, …)` aqui transformaria "a projeção soma mais que o eleitorado"
 * — que é um payload inconsistente — num arco calado que fecha por acidente.
 * Quem decide o que fazer com o negativo é {@link fatiasSobreAptos}.
 */
export function residualSobreAptos(aptos: number, q: QuatroFatias): number {
  return aptos - somaQuatro(q);
}

/** Percentual sobre uma base, com guarda de divisão por zero. */
function pctDe(parte: number, base: number): number {
  return base > 0 ? (parte / base) * 100 : 0;
}

/**
 * As CINCO fatias sobre `aptos`, com o residual por subtração — a regra do
 * RF-193, usada pelo arco 1 (contagens) e pelo arco 3 (projeção).
 *
 * Devolve `null` quando o residual é **negativo**, isto é, quando as quatro
 * fatias somam mais que o eleitorado apto. O chamador então renderiza um
 * estado explícito em vez de desenhar. Clampar a zero faria o anel passar de
 * 180° e desenhar errado **em silêncio** (RF-195), e reescalar publicaria
 * números fabricados (constituição § 6): as duas saídas silenciosas são piores
 * que dizer que o dado não fecha.
 */
export function fatiasSobreAptos(aptos: number, q: QuatroFatias): Fatia[] | null {
  const residual = residualSobreAptos(aptos, q);
  if (residual < 0) return null;
  const abs: Record<FatiaKey, number> = {
    validos: q.validos,
    brancos: q.brancos,
    nulos: q.nulos,
    abstencao: q.abstencao,
    nao_apurado: residual,
  };
  return ORDEM_FATIAS.map((key) => ({
    key,
    label: FATIA_LABEL[key],
    abs: abs[key],
    pct: pctDe(abs[key], aptos),
  }));
}

/** Arco 1 (RF-193): cinco fatias sobre `aptos`. Fecha em `aptos` por construção. */
export function fatiasCirculo1(c: EdgeVotacaoContagens): Fatia[] | null {
  return fatiasSobreAptos(c.aptos, c);
}

/**
 * Arco 2 (RF-194): quatro fatias sobre o eleitorado já apurado, SEM residual.
 * Devolve `[]` quando a base é zero — o chamador então renderiza "sem base
 * apurada" em vez de quatro "0,0%" fabricados (RF-193b).
 */
export function fatiasCirculo2(c: EdgeVotacaoContagens): Fatia[] {
  const base = somaApurada(c);
  if (base <= 0) return [];
  const abs: Record<Exclude<FatiaKey, "nao_apurado">, number> = {
    validos: c.validos,
    brancos: c.brancos,
    nulos: c.nulos,
    abstencao: c.abstencao,
  };
  return FATIAS_CONTADAS.map((key) => ({
    key,
    label: FATIA_LABEL[key],
    abs: abs[key],
    pct: pctDe(abs[key], base),
  }));
}

/**
 * Arco 3 (RF-195): o arco 1 projetado. As quatro projeções entram **cruas**,
 * sem reescala, e a quinta fatia sai da mesma subtração.
 *
 * Não há `fator_normalizacao` no contrato, e a ausência é deliberada: seria um
 * campo que valeria sempre 1 e cuja simples presença sugeriria uma
 * normalização que não acontece. O IC95 de cada métrica continua publicado em
 * `EdgeParticipacao`, sobre a base de lá.
 */
export function fatiasCirculo3(c: EdgeVotacaoContagens, p: EdgeVotacaoProjetada): Fatia[] | null {
  return fatiasSobreAptos(c.aptos, p);
}

// ---------------------------------------------------------------------------
// Geometria do arco — semicírculo, SVG inline, zero dependência
// ---------------------------------------------------------------------------

const VB_W = 320;
const VB_H = 180;
const CX = VB_W / 2;
const CY = 164;
const R = 132;
const ESPESSURA = 26;
/** Vão entre fatias, em graus. Só aplicado quando a fatia é larga o bastante
 *  para sobrar arco — sem isso uma fatia de 0,3% desapareceria no vão. */
const VAO_DEG = 1.2;

function ponto(angDeg: number): [number, number] {
  const rad = (angDeg * Math.PI) / 180;
  return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
}

/**
 * Caminho de um setor do semicírculo superior — 180° (esquerda) a 360°
 * (direita). `largeArc` é sempre 0: nenhuma fatia de um semicírculo passa de
 * 180°.
 */
export function caminhoArco(inicioDeg: number, fimDeg: number): string {
  const [x1, y1] = ponto(inicioDeg);
  const [x2, y2] = ponto(fimDeg);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Ângulos de cada fatia, proporcionais ao absoluto, cobrindo 180°. */
export function angulosDasFatias(
  fatias: readonly Fatia[],
  total: number,
): { key: FatiaKey; inicio: number; fim: number }[] {
  if (total <= 0) return [];
  let cursor = 180;
  return fatias.map((f) => {
    const sweep = (f.abs / total) * 180;
    const inicio = cursor;
    cursor += sweep;
    // Vão só quando sobra arco depois de tirá-lo dos dois lados.
    const cabeVao = sweep > VAO_DEG * 2 + 0.4;
    return {
      key: f.key,
      inicio: cabeVao ? inicio + VAO_DEG / 2 : inicio,
      fim: cabeVao ? cursor - VAO_DEG / 2 : cursor,
    };
  });
}

// ---------------------------------------------------------------------------
// Arco + legenda
// ---------------------------------------------------------------------------

interface ArcoProps {
  id: string;
  /** Título da figura — vira o `<figcaption>`. */
  titulo: string;
  /** Nome da BASE do percentual. É o que satisfaz RF-196 para as fatias todas. */
  baseLabel: string;
  /** Total da base, em absoluto. Vai no centro do arco. */
  total: number;
  fatias: readonly Fatia[];
  /** Renderizado no lugar das fatias quando não há o que desenhar. */
  vazio?: { testid: string; texto: string };
}

function Arco({ id, titulo, baseLabel, total, fatias, vazio }: ArcoProps) {
  // Não existe mais "denominador da geometria" separado do total. Ele existia
  // para o arco 3 fechar o anel quando as projeções não somavam `aptos`; desde
  // a correção do RF-195 o arco 3 tem a quinta fatia por subtração e fecha em
  // `aptos` pela mesma construção do arco 1. Um segundo denominador hoje só
  // serviria para reintroduzir a divergência entre os dois arcos.
  const geomTotal = total;
  // 🔴 Fatia de valor ZERO sai do arco E da legenda (achado do próprio teste,
  // 2026-09-26). Duas razões, e as duas são de correção, não de estilo:
  //
  //   1. um setor de 0° ainda produzia um `<path>` no DOM — invisível na tela,
  //      mas presente para teste, inspetor e leitor de tela;
  //   2. pior, a legenda imprimia "Ainda não apurado — 0,0% · 0" no fim da
  //      noite, que é o zero fabricado que a spec proíbe justamente na fatia
  //      que o RF-193 manda DESAPARECER quando o residual zera.
  //
  // Some das duas superfícies ao mesmo tempo, de propósito: uma linha de
  // legenda dizendo 0,0% ao lado de um arco sem aquela faixa obrigaria o
  // leitor a decidir qual das duas está certa. `somaAbs` abaixo continua
  // somando as fatias TODAS — tirar um zero não muda soma, e é ela que prova
  // que o arco fecha em 100%.
  const visiveis = fatias.filter((f) => f.abs > 0);
  const arcos = angulosDasFatias(visiveis, geomTotal);
  const somaAbs = fatias.reduce((s, f) => s + f.abs, 0);

  return (
    <figure
      data-testid={id}
      data-total={String(total)}
      data-soma-abs={String(somaAbs)}
      style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
    >
      <figcaption
        style={{
          font: "var(--type-kicker)",
          letterSpacing: "var(--tracking-caps)",
          textTransform: "uppercase",
          color: "var(--accent-text)",
        }}
      >
        {titulo}
      </figcaption>

      {vazio ? (
        <p
          data-testid={vazio.testid}
          style={{
            margin: 0,
            font: "var(--type-body-sm)",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border-hairline)",
            paddingTop: "var(--space-2)",
          }}
        >
          {vazio.texto}
        </p>
      ) : (
        <div style={{ position: "relative" }}>
          {/* Só caminhos aqui dentro — nenhum `<text>`. Ver o § "Nenhum texto
              dentro do SVG" no cabeçalho: o axe não reprova contraste de texto
              em SVG, então o texto vive em HTML por cima. */}
          <svg
            role="img"
            aria-label={`${titulo} — ${formatVotes(total)} ${baseLabel}`}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            style={{ width: "100%", height: "auto", display: "block" }}
          >
            {arcos.map(({ key, inicio, fim }) => {
              const cor = FATIA_COR[key];
              const d = caminhoArco(inicio, fim);
              const fatia = visiveis.find((f) => f.key === key);
              return (
                <g key={key}>
                  <path
                    data-testid={`${id}-fatia-${key}`}
                    data-pct={fatia ? fatia.pct.toFixed(4) : "0"}
                    data-abs={String(fatia?.abs ?? 0)}
                    d={d}
                    fill="none"
                    stroke={cor.fill}
                    strokeWidth={ESPESSURA}
                  />
                  {cor.contorno ? (
                    // O residual é pálido de propósito ("em cinza", RF-193) e é
                    // o contorno que lhe dá borda perceptível nos dois temas —
                    // o preenchimento sozinho mede 1,2:1.
                    <path
                      d={d}
                      fill="none"
                      stroke={cor.contorno}
                      strokeWidth={1}
                      style={{ opacity: 0.9 }}
                    />
                  ) : null}
                  {cor.hachura ? (
                    // Hachura = traços na cor da superfície por cima do
                    // preenchimento. Distingue "brancos" de "nulos" sem um
                    // token novo e sem depender de matiz (WCAG 1.4.1).
                    <path
                      data-testid={`${id}-hachura-${key}`}
                      d={d}
                      fill="none"
                      stroke="var(--surface-page)"
                      strokeWidth={ESPESSURA}
                      strokeDasharray="2 5"
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>

          {/* Número grande + base, em HTML, centrados na boca do arco. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "6%",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div
              data-testid={`${id}-total`}
              style={{
                font: "var(--type-figure)",
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-primary)",
                lineHeight: 1.05,
              }}
            >
              {formatVotes(total)}
            </div>
            <div
              data-testid={`${id}-base`}
              style={{
                font: "var(--type-body-sm)",
                fontSize: "var(--text-xs)",
                color: "var(--text-secondary)",
              }}
            >
              {baseLabel}
            </div>
          </div>
        </div>
      )}

      {/* Tradução textual do gráfico (RNF-023), VISÍVEL. Cada linha traz o
          absoluto e o percentual; a base é a da figura, declarada no
          `<figcaption>` e no rótulo central (RF-196). */}
      {visiveis.length > 0 ? (
        <ul
          data-testid={`${id}-legenda`}
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--space-2) var(--space-3)",
          }}
        >
          {visiveis.map((f) => (
            <li
              key={f.key}
              data-testid={`${id}-legenda-${f.key}`}
              data-pct={f.pct.toFixed(4)}
              data-abs={String(f.abs)}
              data-base={baseLabel}
              style={{
                display: "flex",
                gap: "var(--space-2)",
                alignItems: "flex-start",
                borderTop: "1px solid var(--border-hairline)",
                paddingTop: "var(--space-1)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: "none",
                  width: 12,
                  height: 12,
                  marginTop: 3,
                  background: FATIA_COR[f.key].fill,
                  // 🔴 O marcador repete a HACHURA do arco (medido no
                  // navegador em 2026-09-26). Sem isto, "brancos" e "nulos"
                  // saíam com o mesmo quadrado — as duas fatias dividem o
                  // token, e era só a hachura que as separava no desenho. A
                  // legenda é a tradução textual do gráfico (RNF-023): um
                  // marcador que não corresponde ao setor quebra justamente a
                  // ligação que ela existe para fazer.
                  backgroundImage: FATIA_COR[f.key].hachura
                    ? "repeating-linear-gradient(45deg, transparent 0 2px, var(--surface-page) 2px 3px)"
                    : undefined,
                  border: FATIA_COR[f.key].contorno
                    ? `1px solid ${FATIA_COR[f.key].contorno}`
                    : undefined,
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    font: "var(--type-body-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  {f.label}
                </span>
                <span
                  style={{
                    display: "block",
                    font: "var(--type-body-sm)",
                    fontSize: "var(--text-xs)",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text-secondary)",
                  }}
                >
                  {formatPercent(f.pct, 1)} · {formatVotes(f.abs)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// O painel
// ---------------------------------------------------------------------------

export interface VotacaoEleitoradoProps {
  /**
   * Bloco `votacao` do payload. Ausente ou `null` ⇒ `<DetailUnavailable>`
   * (RF-198), nunca zeros. Não confundir com `contagens` zeradas, que é o
   * estado "não começou" do RF-193b.
   */
  votacao?: EdgeVotacao | null;
  /** Kicker do `<Panel>` — ex. "Presidente · Brasil". */
  kicker?: string;
  heading?: string;
  headingLevel?: 1 | 2 | 3 | 4;
  /** `id` do heading; amarra o `aria-labelledby` da `<section>` do Panel. */
  titleId?: string;
  className?: string;
}

const TITLE_ID_PADRAO = "votacao-eleitorado-heading";

export function VotacaoEleitorado({
  votacao,
  kicker,
  heading = "Votação",
  headingLevel = 2,
  titleId = TITLE_ID_PADRAO,
  className,
}: VotacaoEleitoradoProps) {
  // RF-198 — o painel degrada, nunca some. `votacao` ausente é "não sabemos";
  // é DIFERENTE de `contagens` zeradas, que é "não começou" (RF-193b).
  if (!votacao?.contagens) {
    return (
      <Panel
        kicker={kicker}
        title={heading}
        titleId={titleId}
        headingLevel={headingLevel}
        className={className}
      >
        <DetailUnavailable label="A votação do eleitorado" reason="not_found" />
      </Panel>
    );
  }

  const c = votacao.contagens;
  const apurado = somaApurada(c);
  const projetada = votacao.projetada;

  // `null` em c1/c3 significa residual NEGATIVO — as quatro fatias somam mais
  // que o eleitorado apto. Não é um estado de espera, é um payload que não
  // fecha, e cada arco o diz na própria caixa em vez de desenhar torto.
  const c1 = fatiasCirculo1(c);
  const c2 = fatiasCirculo2(c);
  const c3 = projetada ? fatiasCirculo3(c, projetada) : null;

  const anuladosESubJudice = c.anulados + c.sub_judice;
  const naoInstalados = Math.max(0, c.aptos - c.instalados);

  return (
    <Panel
      kicker={kicker}
      title={heading}
      titleId={titleId}
      headingLevel={headingLevel}
      className={className}
    >
      <div
        data-testid="votacao-eleitorado"
        data-apurado={String(apurado)}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "var(--space-5) var(--space-6)",
        }}
      >
        {/* Arco 1 — RF-193 / RF-193b. As cinco fatias sobre os aptos. */}
        <Arco
          id="votacao-circulo-1"
          titulo="Do eleitorado apto"
          baseLabel="eleitores aptos"
          total={c.aptos}
          fatias={c1 ?? []}
          vazio={
            c1
              ? undefined
              : {
                  testid: "votacao-circulo-1-inconsistente",
                  texto:
                    "As contagens publicadas somam mais que o eleitorado apto — não é possível montar este gráfico sem inventar um número.",
                }
          }
        />

        {/* Arco 2 — RF-194. Base própria, nomeada, e sem fatia residual.
            Denominador zero (RF-193b) NÃO vira "0,0%": vira texto. */}
        <Arco
          id="votacao-circulo-2"
          titulo="Do eleitorado já apurado"
          baseLabel="eleitorado já apurado"
          total={apurado}
          fatias={c2}
          vazio={
            c2.length === 0
              ? {
                  testid: "votacao-circulo-2-sem-base",
                  texto:
                    "A apuração ainda não começou — não há eleitorado apurado para servir de base a este gráfico.",
                }
              : undefined
          }
        />

        {/* Arco 3 — RF-195. O arco 1 projetado: as MESMAS cinco fatias, pela
            mesma subtração. Sem base amostral, "aguardando projeção", sempre no
            DOM (ADR-0017 / ADR-0018). Projeção que não fecha é um terceiro
            caso, e tem texto próprio — confundi-lo com "aguardando" mandaria o
            operador esperar por um dado que já chegou, e errado. */}
        <Arco
          id="votacao-circulo-3"
          titulo="Projeção para o fim da apuração"
          baseLabel="eleitores aptos (projetado)"
          total={c.aptos}
          fatias={c3 ?? []}
          vazio={
            c3
              ? undefined
              : projetada
                ? {
                    testid: "votacao-circulo-3-inconsistente",
                    texto:
                      "A projeção publicada soma mais que o eleitorado apto — não é possível montar este gráfico sem inventar um número.",
                  }
                : {
                    testid: "votacao-circulo-3-aguardando",
                    texto:
                      "Aguardando projeção — ainda não há zona apurada suficiente para projetar o fim da apuração.",
                  }
          }
        />
      </div>

      {/* Metodologia (constituição § 8). RF-197 exige que anulados e sub
          judice, fora das fatias nomeadas, sejam DECLARADOS aqui: são 14,2%
          do comparecimento na captura real do simulado, e omitir sem dizer
          publicaria um arco com 14% de buraco mudo. */}
      <p
        data-testid="votacao-metodologia"
        style={{
          marginTop: "var(--space-4)",
          font: "var(--type-body-sm)",
          fontSize: "var(--text-xs)",
          color: "var(--text-secondary)",
        }}
      >
        Os três gráficos têm bases diferentes e não devem ser comparados fatia a fatia: o primeiro e
        o terceiro são sobre os {formatVotes(c.aptos)} eleitores aptos; o segundo, só sobre o
        eleitorado já apurado.{" "}
        {anuladosESubJudice > 0 ? (
          <>
            <strong style={{ fontWeight: 600 }}>
              {formatVotes(anuladosESubJudice)} votos anulados e sub judice
            </strong>{" "}
            não formam fatia própria, por decisão editorial, e estão dentro de “Ainda não apurado”.{" "}
          </>
        ) : null}
        {naoInstalados > 0 ? (
          <>
            “Ainda não apurado” também inclui {formatVotes(naoInstalados)} eleitores de seções ainda
            não instaladas ou não totalizadas.{" "}
          </>
        ) : null}
        {projetada ? (
          <>
            As quatro projeções são publicadas como saem do modelo, sem reescala, e a fatia cinza do
            terceiro gráfico é a mesma subtração do primeiro. Por isso ela{" "}
            <strong style={{ fontWeight: 600 }}>não chega a zero no fim da apuração</strong>:
            estaciona no tamanho dos votos anulados e sub judice, que continuam existindo depois de
            a última urna ser contada. O intervalo de confiança de cada métrica é publicado à parte,
            sobre a base de cada uma.
          </>
        ) : null}
      </p>
    </Panel>
  );
}
