import type { Metadata } from "next";
import styles from "./sobre-o-modelo.module.css";

/**
 * Página /sobre-o-modelo — Spec 011 (RF-054) + constituição § 8.
 *
 * Tratamento NYT-style (The Upshot methodology). Server Component estático;
 * sem fetch, sem `'use client'`. Todas as ilustrações são SVG inline (sem
 * dependências externas — sem D3, sem Recharts).
 *
 * Decisão de escopo S04 kickoff (2026-05-17): mockup visual NYT-style em
 * vez de MVP texto puro. Cores via tokens neutros (constituição § 2).
 */

export const metadata: Metadata = {
  title: "Sobre o Modelo — SalaCofre",
  description:
    "Como funciona o modelo estatístico de projeção da SalaCofre: swing zona-a-zona, intervalo de confiança via bootstrap, bandas de probabilidade e limitações conhecidas.",
  alternates: { canonical: "/sobre-o-modelo" },
  openGraph: {
    title: "Sobre o Modelo — SalaCofre",
    description:
      "Metodologia da projeção eleitoral SalaCofre: swing, bootstrap, agulha de probabilidade e limitações.",
    type: "article",
  },
};

export default function SobreOModeloPage() {
  return (
    <main className={styles.page}>
      <article className={styles.container}>
        <p className={styles.kicker}>Metodologia</p>
        <h1 className={styles.title}>Como a SalaCofre faz uma projeção</h1>
        <p className={styles.deck}>
          O método em três partes: medir a diferença em relação a 2022 em cada zona eleitoral,
          simular mil reamostragens para estimar incerteza, e traduzir tudo em uma probabilidade que
          se atualiza a cada novo boletim do TSE.
        </p>
        <p className={styles.byline}>Equipe SalaCofre · Última atualização: maio de 2026</p>

        {/* 1. O modelo */}
        <section className={styles.section} aria-labelledby="sec-modelo">
          <p className={styles.sectionLabel}>1 · O modelo</p>
          <h2 id="sec-modelo" className={styles.h2}>
            O que estamos calculando
          </h2>
          <p className={styles.body}>
            Em uma noite de apuração, o TSE divulga resultados parciais a cada poucos minutos. Esses
            resultados chegam <em>zona a zona</em> — o Brasil tem cerca de três mil zonas eleitorais
            — e quase sempre as primeiras zonas a serem apuradas não são representativas do país
            como um todo.
          </p>
          <p className={styles.body}>
            Em vez de mostrar o percentual bruto da apuração corrente, nosso modelo compara cada
            zona ao mesmo voto de 2022, calcula quanto a preferência <strong>mudou</strong> ali, e
            projeta esse movimento para o resto do país. O resultado é uma estimativa de como
            ficaria o pleito se 100% das urnas já tivessem sido apuradas — junto de uma faixa de
            incerteza honesta sobre essa estimativa.
          </p>
        </section>

        {/* 2. Swing zona-a-zona */}
        <section className={styles.section} aria-labelledby="sec-swing">
          <p className={styles.sectionLabel}>2 · Swing</p>
          <h2 id="sec-swing" className={styles.h2}>
            A unidade mínima: o swing zona a zona
          </h2>
          <p className={styles.body}>
            Definimos <strong>swing</strong> de um candidato em uma zona como a diferença entre seu
            percentual atual e o percentual do mesmo bloco político em 2022:
          </p>

          <div className={styles.pullquote}>
            swing<sub>z</sub> = pct<sub>atual</sub>(z) − pct<sub>2022</sub>(z)
          </div>

          <p className={styles.body}>
            Se uma zona deu 50% em 2022 e está dando 55% agora, o swing local é de +5 pontos
            percentuais. Esse swing é então agregado para a UF e para o país por{" "}
            <strong>média ponderada pelo número de eleitores aptos</strong> de cada zona — zonas
            grandes pesam mais que zonas pequenas.
          </p>

          <figure className={styles.figure} aria-labelledby="fig-swing-cap">
            <SwingIllustration />
            <figcaption id="fig-swing-cap" className={styles.figcaption}>
              <strong>Como o swing se propaga.</strong> Cada barra mostra uma zona apurada. Acima da
              linha zero, o candidato ganhou pontos em relação a 2022; abaixo, perdeu. A média
              ponderada dessas barras vira a projeção da UF.
            </figcaption>
          </figure>

          <div className={styles.callout}>
            <p className={styles.calloutLabel}>Por que zona, e não município</p>
            <p>
              A zona eleitoral é a menor unidade na qual o TSE divulga resultados detalhados durante
              a apuração. Trabalhar em zona dá ~3.000 unidades de medida em vez das ~5.570 cidades,
              mas em troca entrega resolução compatível com o ritmo de divulgação e com o histórico
              padronizado de 2022.
            </p>
          </div>
        </section>

        {/* 3. Intervalo de confiança */}
        <section className={styles.section} aria-labelledby="sec-ci">
          <p className={styles.sectionLabel}>3 · Incerteza</p>
          <h2 id="sec-ci" className={styles.h2}>
            Quanto a gente <em>não</em> sabe: o bootstrap
          </h2>
          <p className={styles.body}>
            Uma projeção sem barra de erro engana. Para estimar a incerteza, o modelo usa{" "}
            <strong>bootstrap não-paramétrico</strong> com mil reamostragens: a cada simulação,
            sorteamos com reposição um novo conjunto de zonas apuradas do tamanho original,
            recalculamos a projeção, e guardamos o resultado.
          </p>
          <p className={styles.body}>
            Ao final das mil rodadas, temos uma distribuição de projeções possíveis. O intervalo
            entre o percentil 2,5 e o percentil 97,5 dessa distribuição é o nosso{" "}
            <strong>intervalo de confiança de 95%</strong> — a faixa onde o resultado final tem 95%
            de chance de cair, condicional ao que já foi apurado.
          </p>

          <figure className={styles.figure} aria-labelledby="fig-ci-cap">
            <ConfidenceBandIllustration />
            <figcaption id="fig-ci-cap" className={styles.figcaption}>
              <strong>A banda se estreita com a apuração.</strong> Logo no início (lado esquerdo),
              poucas zonas apuradas produzem uma faixa larga. Conforme novas zonas entram, a
              estimativa central converge e o intervalo de confiança aperta em torno dela.
            </figcaption>
          </figure>

          <div className={styles.callout}>
            <p className={styles.calloutLabel}>Por que bootstrap em vez de bayesiano</p>
            <p>
              Bootstrap é determinístico (com seed fixa), reproduzível, e não exige especificar uma
              distribuição a priori. Para uma operação ao vivo onde cada execução precisa ser
              auditável, isso vale mais do que a sofisticação de um modelo bayesiano completo. A
              decisão está registrada no{" "}
              <a href="/docs/architecture/adrs/0006-bootstrap-nao-bayesiano">ADR-0006</a>.
            </p>
          </div>
        </section>

        {/* 4. Agulha */}
        <section className={styles.section} aria-labelledby="sec-agulha">
          <p className={styles.sectionLabel}>4 · Agulha</p>
          <h2 id="sec-agulha" className={styles.h2}>
            Da projeção à probabilidade: a agulha
          </h2>
          <p className={styles.body}>
            Com a distribuição bootstrap dos dois principais candidatos em mãos, calculamos a{" "}
            <strong>probabilidade de vitória</strong> como a fração das mil simulações em que o
            candidato A terminou à frente do candidato B. Essa probabilidade é o que a agulha
            aponta.
          </p>

          <figure className={styles.figure} aria-labelledby="fig-needle-cap">
            <NeedleIllustration />
            <figcaption id="fig-needle-cap" className={styles.figcaption}>
              <strong>A agulha viva.</strong> No exemplo (fictício), o Candidato A tem
              aproximadamente 72% de chance de vencer. A posição da agulha sai do bootstrap; a cor
              da banda diz <em>quão decidida</em> a corrida está.
            </figcaption>
          </figure>

          <h3 className={styles.h3}>As quatro bandas</h3>
          <p className={styles.body}>
            Nem toda chance de 60% significa a mesma coisa. Dividimos o intervalo de probabilidade
            em quatro faixas, com cores neutras calibradas para acessibilidade (não são cores
            partidárias oficiais):
          </p>

          <table className={styles.bandTable}>
            <thead>
              <tr>
                <th scope="col">Banda</th>
                <th scope="col">Faixa</th>
                <th scope="col">Leitura</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span
                    className={styles.bandSwatch}
                    style={{ background: "var(--color-tossup)" }}
                    aria-hidden="true"
                  />
                  Tossup
                </td>
                <td className={styles.bandRange}>40 – 60%</td>
                <td>Empate técnico. A corrida pode virar para qualquer lado.</td>
              </tr>
              <tr>
                <td>
                  <span
                    className={styles.bandSwatch}
                    style={{ background: "var(--color-pl-band)" }}
                    aria-hidden="true"
                  />
                  Lean
                </td>
                <td className={styles.bandRange}>60 – 75%</td>
                <td>Inclinação clara, mas o resultado oposto ainda é plausível.</td>
              </tr>
              <tr>
                <td>
                  <span
                    className={styles.bandSwatch}
                    style={{ background: "var(--color-pt-band)" }}
                    aria-hidden="true"
                  />
                  Likely
                </td>
                <td className={styles.bandRange}>75 – 95%</td>
                <td>Vitória provável; surpresa exigiria evento atípico.</td>
              </tr>
              <tr>
                <td>
                  <span
                    className={styles.bandSwatch}
                    style={{ background: "var(--color-text)" }}
                    aria-hidden="true"
                  />
                  Very&nbsp;likely
                </td>
                <td className={styles.bandRange}>&gt; 95%</td>
                <td>Resultado essencialmente decidido pelo que já foi apurado.</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 5. Limitações */}
        <section className={styles.section} aria-labelledby="sec-limits">
          <p className={styles.sectionLabel}>5 · Limitações</p>
          <h2 id="sec-limits" className={styles.h2}>
            O que o modelo <em>não</em> faz bem
          </h2>
          <p className={styles.body}>Toda projeção tem ângulos cegos. Os nossos são explícitos:</p>

          <div className={styles.limitations}>
            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>01</span>
              <div className={styles.limitationBody}>
                <strong>UFs com menos de 5% apurado.</strong> Quando uma UF ainda mal começou a
                apuração, a amostra de zonas é pequena demais para confiar. Nessa faixa, inflamos o
                intervalo de confiança em 50% adicional como pedágio à incerteza extra. Em UFs com
                0% apurado, mantemos a projeção igual ao resultado de 2022, com banda larga de
                ±10pp.
              </div>
            </div>

            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>02</span>
              <div className={styles.limitationBody}>
                <strong>Candidato sem bloco político mapeável em 2022.</strong> O swing depende de
                comparar com um valor de referência de 2022. Quando o candidato 2026 representa um
                agrupamento novo, sem ancoragem confiável no resultado anterior, o modelo se{" "}
                <strong>desabilita</strong> e a página passa a mostrar a apuração parcial bruta, com
                aviso explícito.
              </div>
            </div>

            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>03</span>
              <div className={styles.limitationBody}>
                <strong>Casos extremos disparam fallback.</strong> Volatilidade anômala entre zonas,
                swing &gt; ±30pp em uma unidade, ou divergência drástica entre projeções de UFs
                vizinhas fazem o modelo recolher a projeção e exibir só o consolidado oficial do TSE
                até que o cenário estabilize. Preferimos não opinar a opinar errado.
              </div>
            </div>

            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>04</span>
              <div className={styles.limitationBody}>
                <strong>Voto branco, nulo e abstenção.</strong> A projeção opera sobre votos
                válidos. Mudanças bruscas no comparecimento ou na taxa de votos brancos/nulos entre
                2022 e 2026 não são modeladas — entram como ruído no resíduo do swing.
              </div>
            </div>
          </div>
        </section>

        {/* 6. Quem somos */}
        <section className={styles.section} aria-labelledby="sec-team">
          <p className={styles.sectionLabel}>6 · Quem somos</p>
          <h2 id="sec-team" className={styles.h2}>
            O time por trás da SalaCofre
          </h2>
          <p className={styles.body}>
            A SalaCofre é um projeto independente de jornalismo de dados eleitorais. Os nomes da
            equipe, créditos editoriais e contato de redação serão publicados aqui antes do dia da
            eleição.
          </p>
          <p className={styles.body}>
            Não temos vínculo partidário, não recebemos financiamento de campanhas, e o código que
            produz a projeção é open source — todo o histórico de snapshots fica disponível para
            auditoria após o pleito.
          </p>
        </section>

        {/* 7. Fontes */}
        <section className={styles.section} aria-labelledby="sec-fontes">
          <p className={styles.sectionLabel}>7 · Fontes</p>
          <h2 id="sec-fontes" className={styles.h2}>
            De onde vêm os dados
          </h2>
          <ul className={styles.sourceList}>
            <li>
              <strong>Resultados eleitorais</strong>
              <span>
                Tribunal Superior Eleitoral — divulgação oficial em{" "}
                <a href="https://resultados.tse.jus.br" rel="noopener noreferrer" target="_blank">
                  resultados.tse.jus.br
                </a>
                . Coletamos os boletins JSON públicos (EA20) a cada poucos segundos durante a
                apuração, sob a resolução TSE vigente.
              </span>
            </li>
            <li>
              <strong>Histórico 2022</strong>
              <span>
                Resultados por zona eleitoral disponibilizados pelo TSE no{" "}
                <a href="https://dadosabertos.tse.jus.br" rel="noopener noreferrer" target="_blank">
                  dadosabertos.tse.jus.br
                </a>
                . Servem de baseline para o cálculo de swing.
              </span>
            </li>
            <li>
              <strong>Geometria, eleitorado e demografia</strong>
              <span>
                IBGE — malha territorial de UFs e municípios, e estatísticas de eleitorado em{" "}
                <a href="https://www.ibge.gov.br" rel="noopener noreferrer" target="_blank">
                  ibge.gov.br
                </a>
                .
              </span>
            </li>
          </ul>
        </section>

        {/* 8. Disclaimer */}
        <aside className={styles.disclaimer} aria-label="Aviso oficial">
          <p>
            <strong>Não somos um órgão oficial.</strong> Esta projeção é uma estimativa estatística.
            O resultado oficial da eleição é divulgado pelo Tribunal Superior Eleitoral em{" "}
            <a href="https://resultados.tse.jus.br" rel="noopener noreferrer" target="_blank">
              resultados.tse.jus.br
            </a>
            . Em caso de discrepância, a fonte oficial prevalece.
          </p>
        </aside>

        <footer className={styles.footer}>Não oficial. Fonte: TSE. · SalaCofre 2026</footer>
      </article>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Ilustrações SVG inline                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Ilustra o swing zona-a-zona: barras (positivas e negativas) em torno de uma
 * linha zero, com uma seta indicando a média ponderada. Cores via tokens.
 */
function SwingIllustration() {
  // 12 zonas fictícias — alguns swings positivos, alguns negativos.
  const swings = [+5.2, +3.4, +6.1, -1.8, +4.7, +2.0, -3.1, +5.5, +1.2, +4.0, -0.8, +3.6];
  const max = 8; // limite visual (pp)
  const barW = 22;
  const gap = 8;
  const left = 30;
  const top = 30;
  const height = 130;
  const zero = top + height / 2;
  const width = left + swings.length * (barW + gap) + 30;

  return (
    <svg
      className={styles.svgFrame}
      viewBox={`0 0 ${width} 200`}
      role="img"
      aria-label="Doze barras representando swings em zonas eleitorais, com média ponderada positiva próxima a +3 pontos percentuais."
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Linha zero */}
      <line
        x1={left - 8}
        x2={width - 10}
        y1={zero}
        y2={zero}
        stroke="var(--color-text)"
        strokeWidth="1"
      />
      <text
        x={left - 12}
        y={zero + 4}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        0
      </text>

      {/* Marcações ±5pp */}
      <line
        x1={left - 4}
        x2={width - 10}
        y1={zero - (5 / max) * (height / 2)}
        y2={zero - (5 / max) * (height / 2)}
        stroke="var(--color-border)"
        strokeDasharray="2,3"
      />
      <text
        x={left - 12}
        y={zero - (5 / max) * (height / 2) + 3}
        fontSize="9"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        +5
      </text>
      <line
        x1={left - 4}
        x2={width - 10}
        y1={zero + (5 / max) * (height / 2)}
        y2={zero + (5 / max) * (height / 2)}
        stroke="var(--color-border)"
        strokeDasharray="2,3"
      />
      <text
        x={left - 12}
        y={zero + (5 / max) * (height / 2) + 3}
        fontSize="9"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        −5
      </text>

      {/* Barras */}
      {swings.map((s, i) => {
        const x = left + i * (barW + gap);
        const h = Math.abs(s / max) * (height / 2);
        const y = s >= 0 ? zero - h : zero;
        const fill = s >= 0 ? "var(--color-pt)" : "var(--color-pl)";
        // Lista estática, ordem nunca muda — index estável.
        const key = `swing-bar-${i}-${s}`;
        return <rect key={key} x={x} y={y} width={barW} height={h} fill={fill} opacity={0.85} />;
      })}

      {/* Indicador de média ponderada */}
      <line
        x1={left - 8}
        x2={width - 10}
        y1={zero - (2.8 / max) * (height / 2)}
        y2={zero - (2.8 / max) * (height / 2)}
        stroke="var(--color-text)"
        strokeWidth="1.5"
        strokeDasharray="4,3"
      />
      <text
        x={width - 14}
        y={zero - (2.8 / max) * (height / 2) - 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text)"
        textAnchor="end"
        fontWeight="600"
      >
        média ponderada: +2,8 pp
      </text>

      <text
        x={left}
        y={190}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
      >
        12 zonas fictícias (ilustração)
      </text>
    </svg>
  );
}

/**
 * Ilustra a banda de confiança ao longo do tempo de apuração: faixa larga no
 * início, faixa estreita perto do fim, linha central convergindo para o ponto.
 */
function ConfidenceBandIllustration() {
  // Curva de projeção central + banda superior/inferior, em função do % apurado.
  const points = 40;
  const width = 600;
  const height = 200;
  const padX = 40;
  const padY = 30;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;

  // Center converges to 53 (fictício), com leve oscilação.
  const center = (i: number) => {
    const t = i / (points - 1);
    return 50 + 3 * Math.sin(t * 2.4) + 3 * t;
  };
  // Banda diminui de ±10 pp para ±1 pp.
  const halfBand = (i: number) => {
    const t = i / (points - 1);
    return 10 * (1 - t) + 1;
  };

  const xFor = (i: number) => padX + (i / (points - 1)) * innerW;
  const yFor = (v: number) => padY + ((60 - v) / 20) * innerH; // domínio 40..60

  const upper = Array.from({ length: points }, (_, i) => yFor(center(i) + halfBand(i)));
  const lower = Array.from({ length: points }, (_, i) => yFor(center(i) - halfBand(i)));

  const bandPath =
    "M " +
    upper.map((y, i) => `${xFor(i)},${y}`).join(" L ") +
    " L " +
    lower
      .map((y, i) => `${xFor(points - 1 - i)},${y}`)
      .reverse()
      .reverse()
      .join(" L ") +
    " Z";

  const linePath = `M ${Array.from(
    { length: points },
    (_, i) => `${xFor(i)},${yFor(center(i))}`,
  ).join(" L ")}`;

  return (
    <svg
      className={styles.svgFrame}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Banda de confiança decrescente ao longo da apuração: faixa larga no início afunilando para uma estimativa central de aproximadamente 53% ao final."
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Eixo Y: 50% */}
      <line
        x1={padX}
        x2={width - padX}
        y1={yFor(50)}
        y2={yFor(50)}
        stroke="var(--color-border)"
        strokeDasharray="3,3"
      />
      <text
        x={padX - 8}
        y={yFor(50) + 3}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        50%
      </text>
      <text
        x={padX - 8}
        y={yFor(58) + 3}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        58%
      </text>
      <text
        x={padX - 8}
        y={yFor(42) + 3}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="end"
      >
        42%
      </text>

      {/* Banda */}
      <path d={bandPath} fill="var(--color-pt-band)" opacity={0.55} />

      {/* Linha central */}
      <path d={linePath} fill="none" stroke="var(--color-pt)" strokeWidth="2" />

      {/* Ponto final */}
      <circle cx={xFor(points - 1)} cy={yFor(center(points - 1))} r={4} fill="var(--color-pt)" />

      {/* Eixo X */}
      <line
        x1={padX}
        x2={width - padX}
        y1={height - padY + 4}
        y2={height - padY + 4}
        stroke="var(--color-text)"
        strokeWidth="1"
      />
      <text
        x={padX}
        y={height - 8}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        0% apurado
      </text>
      <text
        x={width - padX}
        y={height - 8}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        100% apurado
      </text>

      {/* Anotação */}
      <text
        x={xFor(points - 1) + 8}
        y={yFor(center(points - 1)) + 4}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text)"
        fontWeight="600"
      >
        ≈ 53%
      </text>
    </svg>
  );
}

/**
 * Mockup da agulha de probabilidade: semicírculo com gradiente entre as
 * quatro bandas (tossup central, lean, likely, very_likely nas pontas), e
 * uma agulha apontando ~72% (Candidato A favorito). Estática, sem JS.
 */
function NeedleIllustration() {
  const cx = 200;
  const cy = 180;
  const r = 140;

  // Agulha em ~72% (favorável ao candidato A à direita).
  const probA = 0.72;
  // 0% = ângulo π (esquerda), 100% = 0 (direita). Vamos varrer π → 0.
  const angle = Math.PI * (1 - probA);
  const needleLen = r - 12;
  const tipX = cx + needleLen * Math.cos(angle);
  const tipY = cy - needleLen * Math.sin(angle);

  // Arcos: 4 bandas espelhadas em torno de 50%.
  // 0–5% very_likely_B, 5–25% likely_B, 25–40% lean_B, 40–60% tossup,
  // 60–75% lean_A, 75–95% likely_A, 95–100% very_likely_A.
  const arc = (from: number, to: number, color: string) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return (
      <path
        d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
        fill="none"
        stroke={color}
        strokeWidth="22"
        strokeLinecap="butt"
      />
    );
  };

  return (
    <svg
      className={styles.svgFrame}
      viewBox="0 0 400 220"
      role="img"
      aria-label="Agulha de probabilidade indicando aproximadamente 72% de chance de vitória para o Candidato A. Arco dividido em bandas: tossup ao centro, lean e likely nas laterais."
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Gradiente sutil pra base do arco */}
      <defs>
        <radialGradient id="needleGlow" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="var(--color-bg-muted)" />
          <stop offset="100%" stopColor="var(--color-bg)" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="400" height="220" fill="url(#needleGlow)" />

      {/* Arcos das bandas (esquerda = candidato B, direita = candidato A) */}
      {/* very_likely B */}
      {arc(0.0, 0.05, "var(--color-text)")}
      {/* likely B */}
      {arc(0.05, 0.25, "var(--color-pl-band)")}
      {/* lean B */}
      {arc(0.25, 0.4, "var(--color-pl-band)")}
      {/* tossup */}
      {arc(0.4, 0.6, "var(--color-tossup)")}
      {/* lean A */}
      {arc(0.6, 0.75, "var(--color-pt-band)")}
      {/* likely A */}
      {arc(0.75, 0.95, "var(--color-pt-band)")}
      {/* very_likely A */}
      {arc(0.95, 1.0, "var(--color-text)")}

      {/* Tick em 50% */}
      <line
        x1={cx}
        x2={cx}
        y1={cy - r - 14}
        y2={cy - r + 14}
        stroke="var(--color-text)"
        strokeWidth="2"
      />
      <text
        x={cx}
        y={cy - r - 20}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="middle"
        fontWeight="600"
      >
        50 / 50
      </text>

      {/* Labels lateral */}
      <text
        x={cx - r - 4}
        y={cy + 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        Candidato B
      </text>
      <text
        x={cx + r + 4}
        y={cy + 6}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        Candidato A
      </text>

      {/* Agulha */}
      <line
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke="var(--color-text)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={8} fill="var(--color-text)" />
      <circle cx={cx} cy={cy} r={3} fill="var(--color-bg)" />

      {/* Label da probabilidade */}
      <text
        x={cx}
        y={cy + 32}
        fontSize="13"
        fontFamily="var(--font-sans)"
        fill="var(--color-text)"
        textAnchor="middle"
        fontWeight="600"
      >
        Candidato A: 72% de chance
      </text>
      <text
        x={cx}
        y={cy + 50}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-faint)"
        textAnchor="middle"
      >
        (ilustração — números fictícios)
      </text>
    </svg>
  );
}
