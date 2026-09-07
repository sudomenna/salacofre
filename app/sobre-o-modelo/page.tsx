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
    "Como funciona o modelo estatístico de projeção da SalaCofre: regra de três por zona eleitoral, intervalo de confiança via bootstrap, bandas de probabilidade e limitações conhecidas.",
  alternates: { canonical: "/sobre-o-modelo" },
  openGraph: {
    title: "Sobre o Modelo — SalaCofre",
    description:
      "Metodologia da projeção eleitoral SalaCofre: regra de três por zona, bootstrap, agulha de probabilidade e limitações.",
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
          O método em três partes: projetar, por regra de três, o total de cada zona eleitoral a
          partir do que ela já apurou; simular mil reamostragens para estimar a incerteza; e
          traduzir tudo em uma probabilidade que se atualiza a cada novo boletim do TSE.
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
            Em vez de mostrar apenas o percentual bruto da apuração corrente, nosso modelo pergunta,
            zona por zona:{" "}
            <em>se esta parte da zona já votou assim, quanto a zona inteira deve produzir?</em>{" "}
            Projeta o total de cada zona a partir do que ela mesma já apurou, e soma — zona a zona
            forma o estado, estado a estado forma o país. O resultado é uma estimativa de como
            ficaria o pleito se 100% das urnas já tivessem sido apuradas, junto de uma faixa de
            incerteza honesta sobre essa estimativa.
          </p>
          <p className={styles.body}>
            <strong>O resultado de 2022 não entra nessa conta.</strong> A projeção nasce
            inteiramente das urnas de 2026. O pleito anterior aparece no site apenas como comparação
            — quanto o resultado de agora se afastou do de quatro anos atrás —, um fato observado,
            nunca um ingrediente do cálculo.
          </p>
        </section>

        {/* 2. Regra de três por zona */}
        <section className={styles.section} aria-labelledby="sec-regra-de-tres">
          <p className={styles.sectionLabel}>2 · Regra de três</p>
          <h2 id="sec-regra-de-tres" className={styles.h2}>
            A unidade mínima: a regra de três por zona
          </h2>
          <p className={styles.body}>
            Dentro de uma zona eleitoral, as seções não terminam de apurar todas juntas. O boletim
            do TSE informa quantos eleitores a zona tem ao todo (os <strong>aptos</strong>) e
            quantos já estão cobertos pelas <strong>seções instaladas</strong> que reportaram. A
            razão entre esses dois números é o nosso fator de escala:
          </p>

          <div className={styles.pullquote}>
            k = eleitores aptos da zona ÷ eleitores das seções já instaladas
          </div>

          <p className={styles.body}>
            Se metade dos eleitores da zona já está coberta, k = 2: cada voto contado ali representa
            dois na zona inteira. Multiplicamos por <strong>k</strong> os votos de cada candidato e
            também o total de votos daquela zona, e obtemos o resultado projetado da zona. É a frase
            inteira do método:{" "}
            <strong>
              a partir do que cada zona já apurou, projetamos o total daquela zona e somamos
            </strong>{" "}
            — zona a zona vira estado, estado a estado vira país.
          </p>

          <p className={styles.body}>
            A parcela de um candidato no estado é a divisão de duas somas: todos os votos projetados
            dele nas zonas, sobre todos os votos projetados do estado. Não é a média dos percentuais
            das zonas. Assim uma zona grande pesa naturalmente mais que uma pequena, sem precisar de
            nenhum peso artificial — o peso já está no número de votos.
          </p>

          <figure className={styles.figure} aria-labelledby="fig-extrap-cap">
            <ExtrapolationIllustration />
            <figcaption id="fig-extrap-cap" className={styles.figcaption}>
              <strong>Como uma zona é projetada.</strong> Em cima, uma zona em que metade dos
              eleitores já está em seções instaladas: só esses votos foram contados. O fator de
              escala k = 2 estica essa contagem para o tamanho da zona inteira, preservando a
              proporção entre os candidatos. Embaixo, o total projetado da zona — que entra na soma
              do estado.
            </figcaption>
          </figure>

          <div className={styles.callout}>
            <p className={styles.calloutLabel}>E a zona que ainda não abriu nenhuma urna?</p>
            <p>
              Ela não fica de fora da conta: assumimos, provisoriamente, que vota na mesma proporção
              já observada nas zonas apuradas do próprio estado, e usamos o número de eleitores
              aptos dela para estimar o volume de votos. Por isso o total nacional aparece completo
              desde o primeiro boletim. Se um estado inteiro ainda não tem nenhuma zona apurada, ele
              herda a proporção nacional e recebe uma faixa de incerteza deliberadamente larga (±10
              pontos). Na corrida de governador não existe um "nacional" para herdar, então a UF
              fica marcada como aguardando projeção.
            </p>
          </div>

          <div className={styles.callout}>
            <p className={styles.calloutLabel}>Por que zona, e não município</p>
            <p>
              A zona eleitoral é a menor unidade na qual o TSE divulga resultados detalhados durante
              a apuração dentro da janela de tempo em que conseguimos coletar tudo a cada ciclo.
              Trabalhar em zona dá cerca de 3.000 unidades de medida em vez das ~5.570 cidades — uma
              resolução mais fina do que a do estado, o que reduz a distorção de projetar um estado
              inteiro a partir das poucas regiões que apuraram primeiro.
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
          <p className={styles.body}>
            Um detalhe que importa: em cada estado, o sorteio de zonas é <strong>o mesmo</strong>{" "}
            para todos os candidatos. Numa simulação em que sai um conjunto de zonas favorável a um
            candidato, o adversário perde na mesma simulação — as estimativas são comparáveis par a
            par, e é isso que torna honesta a probabilidade de vitória da seção seguinte.
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
              <a
                href="https://github.com/sudomenna/salacofre/blob/main/docs/architecture/adrs/0006-bootstrap-nao-bayesiano.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                ADR-0006
              </a>
              .
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
                    // FIX 2026-09-05 (a11y-perf-auditor): usava --color-pl-band, token de
                    // banda partidária (e, ademais, invertido — ver app/globals.css:22-23).
                    // Lean/Likely são intensidades de confiança simétricas (valem pro lado A
                    // ou B), não uma cor de partido — migrado para o token neutro dedicado.
                    style={{ background: "var(--color-band-lean)" }}
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
                    // FIX 2026-09-05 (a11y-perf-auditor): mesmo motivo do swatch Lean acima.
                    style={{ background: "var(--color-band-likely)" }}
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
                <strong>As primeiras urnas de uma zona não representam a zona.</strong> Este é o
                ponto cego central do método. A regra de três supõe que a parte já apurada de cada
                zona se parece com a zona inteira — e no começo da noite isso costuma ser falso: as
                seções que reportam primeiro tendem a ser sistematicamente diferentes das que
                reportam depois. É o chamado <em>viés de composição</em>, e o intervalo de confiança{" "}
                <strong>não o enxerga</strong>: reamostrar as zonas já apuradas mede a variação
                entre elas, não o quanto elas diferem das que ainda faltam. As duas mitigações são
                declaradas, não silenciosas — o intervalo é inflado abaixo de 5% apurado (item 02) e
                todo número projetado carrega o rótulo "projeção a partir do apurado". Nenhuma das
                duas elimina o viés; elas o comunicam.
              </div>
            </div>

            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>02</span>
              <div className={styles.limitationBody}>
                <strong>UFs com menos de 5% apurado.</strong> Quando uma UF ainda mal começou a
                apuração, a amostra de zonas é pequena demais para confiar. Nessa faixa, inflamos o
                intervalo de confiança em 50% adicional como pedágio à incerteza extra. Em UFs sem
                nenhuma zona apurada, a projeção é a proporção observada no país até o momento, com
                banda larga de ±10pp.
              </div>
            </div>

            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>03</span>
              <div className={styles.limitationBody}>
                <strong>O modelo não tem opinião sobre o que ainda não votou.</strong> Ele não
                incorpora pesquisas, histórico eleitoral, perfil socioeconômico da zona nem qualquer
                ajuste editorial: só aritmética sobre o boletim oficial. Isso o torna auditável e
                imune a chutes, mas também significa que uma virada anunciada por outra fonte não
                aparece aqui até aparecer nas urnas.
              </div>
            </div>

            <div className={styles.limitationItem}>
              <span className={styles.limitationNumber}>04</span>
              <div className={styles.limitationBody}>
                <strong>Voto branco, nulo e abstenção têm bases próprias.</strong> A parcela dos
                candidatos é calculada sobre os <strong>votos a votáveis</strong> — que não são a
                mesma coisa que "votos válidos" do vocabulário corrente. Brancos, nulos e abstenção
                são projetados pela mesma regra de três, mas cada um com o seu denominador, e por
                isso não somam 100% com os candidatos numa única conta. Onde exibimos tudo sobre a
                mesma base (quem compareceu), sobra um resíduo pequeno — votos anulados e sub judice
                — que declaramos na legenda em vez de esconder.
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
                . Usados <strong>apenas para comparação</strong> na tela — quanto o resultado de
                agora se afastou do de 2022. Não entram no cálculo da projeção.
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

        {/* Constituição § 1: o footer de TODA página precisa trazer "Não oficial.
            Fonte: TSE." **e** o link para resultados.tse.jus.br. O link existia só
            no <aside> acima — fora do <footer> — o que não cumpria a regra
            (achado MEDIUM do constitution-guard, 2026-09-05). Esta é a única
            página que não usa o <Footer /> compartilhado, porque ele linka para
            /sobre-o-modelo e aqui isso seria auto-referência. */}
        <footer className={styles.footer}>
          Não oficial. Fonte:{" "}
          <a href="https://resultados.tse.jus.br" rel="noopener noreferrer" target="_blank">
            TSE
          </a>
          . · SalaCofre 2026
        </footer>
      </article>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Ilustrações SVG inline                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Ilustra a regra de três por zona (ADR-0021): em cima, uma zona cuja metade
 * dos eleitores já está em seções instaladas — só esses votos foram contados;
 * embaixo, o total projetado da zona depois de multiplicar a contagem pelo
 * fator de escala `k = aptos / eleitores das seções instaladas`. A proporção
 * entre os candidatos é a mesma nas duas barras — é isso que a ilustração
 * precisa deixar claro. Cores via tokens (constituição § 2).
 */
function ExtrapolationIllustration() {
  const x0 = 60;
  const full = 460; // largura = eleitores aptos da zona
  const apurado = full / 2; // metade dos eleitores em seções instaladas
  const shareA = 0.55; // proporção fictícia entre os dois candidatos
  const barH = 34;
  const yTop = 44;
  const yBottom = 158;

  return (
    <svg
      className={styles.svgFrame}
      viewBox="0 0 600 230"
      role="img"
      aria-label="Uma zona eleitoral em que metade dos eleitores já está em seções instaladas. Os votos contados nessa metade são multiplicados pelo fator de escala k igual a 2, projetando o total da zona inteira e preservando a proporção de 55% para o candidato A e 45% para o candidato B."
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ---- Barra 1: o que já foi contado ---- */}
      <text
        x={x0}
        y={yTop - 12}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        Zona eleitoral — todos os eleitores aptos
      </text>

      {/* votos contados, divididos entre os dois candidatos */}
      <rect
        x={x0}
        y={yTop}
        width={apurado * shareA}
        height={barH}
        fill="var(--color-cand-1)"
        opacity={0.85}
      />
      <rect
        x={x0 + apurado * shareA}
        y={yTop}
        width={apurado * (1 - shareA)}
        height={barH}
        fill="var(--color-cand-2)"
        opacity={0.85}
      />
      {/* parte da zona ainda sem seção instalada */}
      <rect
        x={x0 + apurado}
        y={yTop}
        width={full - apurado}
        height={barH}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="1.5"
        strokeDasharray="5,4"
      />

      <text
        x={x0 + apurado / 2}
        y={yTop + barH + 15}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="middle"
      >
        seções instaladas: votos contados
      </text>
      <text
        x={x0 + apurado + (full - apurado) / 2}
        y={yTop + barH + 15}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="middle"
      >
        ainda sem seção instalada
      </text>

      {/* ---- Fator de escala ---- */}
      <line
        x1={x0 + full / 2}
        x2={x0 + full / 2}
        y1={yTop + barH + 28}
        y2={yBottom - 12}
        stroke="var(--color-text)"
        strokeWidth="1.5"
      />
      <path
        d={`M ${x0 + full / 2 - 5} ${yBottom - 18} L ${x0 + full / 2} ${yBottom - 8} L ${
          x0 + full / 2 + 5
        } ${yBottom - 18} Z`}
        fill="var(--color-text)"
      />
      <text
        x={x0 + full / 2 + 12}
        y={yBottom - 22}
        fontSize="12"
        fontFamily="var(--font-sans)"
        fill="var(--color-text)"
        fontWeight="600"
      >
        × k = 2
      </text>

      {/* ---- Barra 2: total projetado da zona ---- */}
      <rect
        x={x0}
        y={yBottom}
        width={full * shareA}
        height={barH}
        fill="var(--color-cand-1)"
        opacity={0.85}
      />
      <rect
        x={x0 + full * shareA}
        y={yBottom}
        width={full * (1 - shareA)}
        height={barH}
        fill="var(--color-cand-2)"
        opacity={0.85}
      />

      <text
        x={x0 + (full * shareA) / 2}
        y={yBottom + barH / 2 + 4}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-bg)"
        textAnchor="middle"
        fontWeight="600"
      >
        A · 55%
      </text>
      <text
        x={x0 + full * shareA + (full * (1 - shareA)) / 2}
        y={yBottom + barH / 2 + 4}
        fontSize="11"
        fontFamily="var(--font-sans)"
        fill="var(--color-bg)"
        textAnchor="middle"
        fontWeight="600"
      >
        B · 45%
      </text>

      <text
        x={x0}
        y={yBottom + barH + 16}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
      >
        total projetado da zona (números fictícios)
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
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        50%
      </text>
      <text
        x={padX - 8}
        y={yFor(58) + 3}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        58%
      </text>
      <text
        x={padX - 8}
        y={yFor(42) + 3}
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-text-muted)"
        textAnchor="end"
      >
        42%
      </text>

      {/* Banda — clareado do candidato ilustrativo (linha central usa
          --color-pt). FIX 2026-09-05 (a11y-perf-auditor): antes usava
          --color-pt-band, que está invertido (renderiza azul, não vermelho
          claro — ver app/globals.css:22-23); --color-cand-band-1 é o
          clareado correto de --color-cand-1/--color-pt e já está certo. */}
      <path d={bandPath} fill="var(--color-cand-band-1)" opacity={0.55} />

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

      {/* Arcos das bandas (esquerda = candidato B, direita = candidato A).
          FIX 2026-09-05 (a11y-perf-auditor): usavam --color-pl-band/-pt-band
          (invertidos entre si, ver app/globals.css:22-23). Migrado para os
          tokens que o <Needle/> real usa em modo binário 2T
          (--color-cand-band-1 = A/PT-like vermelho claro,
          --color-cand-band-2 = B/PL-like azul claro) — mantém o lado A à
          direita em vermelho e B à esquerda em azul, como em todo o app. */}
      {/* very_likely B */}
      {arc(0.0, 0.05, "var(--color-text)")}
      {/* likely B */}
      {arc(0.05, 0.25, "var(--color-cand-band-2)")}
      {/* lean B */}
      {arc(0.25, 0.4, "var(--color-cand-band-2)")}
      {/* tossup */}
      {arc(0.4, 0.6, "var(--color-tossup)")}
      {/* lean A */}
      {arc(0.6, 0.75, "var(--color-cand-band-1)")}
      {/* likely A */}
      {arc(0.75, 0.95, "var(--color-cand-band-1)")}
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
        fill="var(--color-text-muted)"
        textAnchor="middle"
      >
        (ilustração — números fictícios)
      </text>
    </svg>
  );
}
