/**
 * lib/utils/hemiciclo.ts — a geometria do hemiciclo da Câmara, sem React.
 *
 * Vive aqui, e não dentro do componente, porque é **aritmética com um
 * invariante**: a soma dos assentos desenhados tem de ser exatamente `N`, e
 * `N` é `bancada.total_cadeiras` — RF-125.1. Um invariante de contagem se
 * testa melhor isolado do JSX, e é isso que separa "o SVG parece certo" de
 * "as bolinhas somam o que o TSE publicou".
 *
 * ## 🔴 `513` não é constante em lugar nenhum
 *
 * RF-124: o tamanho da Câmara é a **soma dos `lugares_a_preencher`
 * publicados**, lida em runtime. A redistribuição pelo Censo 2022
 * (PLP 177/2023) pode elevá-la a 531 e não tem desfecho confirmado. Nada neste
 * arquivo assume 513 — nem como default, nem como limite, nem como divisor.
 * Todo número de cadeira sai do argumento `total`.
 *
 * ## 🔴 O número de arcos é CONSTANTE, e é por isso que ele é constante
 *
 * {@link ARCOS_PADRAO} é 12, fixo. A tentação natural é derivá-lo de `N` —
 * "mais cadeiras, mais linhas" —, e ela está errada pelo motivo que só aparece
 * no dia em que `N` muda: com o número de arcos derivado, **cruzar um limiar
 * entre 513 e 531 reestrutura o desenho inteiro**. O leitor veria o plenário
 * mudar de forma por causa de uma decisão do Congresso sobre o Censo, e leria
 * essa mudança como informação sobre a eleição. Com o número fixo, 513 → 531
 * acrescenta uma ou duas bolinhas a cada arco e nada mais muda.
 *
 * A única exceção é o extremo pequeno: uma Câmara com menos de duas cadeiras
 * por arco produziria arcos vazios, e arco vazio no meio do desenho é um
 * buraco que se lê como cadeira faltando. Ver {@link arcosPara}.
 *
 * ## Determinismo (constituição § 6)
 *
 * Sem `Math.random()`, sem `Date`, sem estado de módulo. Mesmo `total` ⇒ mesmo
 * layout, campo a campo, casa decimal a casa decimal (as coordenadas são
 * arredondadas em {@link arred} justamente para que a comparação byte a byte
 * valha, sem depender do último bit do `Math.cos` de uma plataforma).
 *
 * ## O desenho, em quatro passos
 *
 *   1. **Arcos**: {@link ARCOS_PADRAO}, com a guarda do extremo pequeno.
 *   2. **Raios igualmente espaçados** entre {@link RAIO_INTERNO} e
 *      {@link RAIO_EXTERNO}.
 *   3. **Assentos por arco proporcionais ao raio** (arco maior comporta mais),
 *      com o resto distribuído por **maiores restos (Hare)** e desempate por
 *      índice de arco crescente — ver {@link assentosPorArco}.
 *   4. **Ângulos uniformes** dentro de cada arco, em centro de célula:
 *      `θ_j = π (j + ½) / s`. O `+ ½` não é estética — é o que faz `s = 1`
 *      funcionar sem divisão por zero e o que dá margens iguais nas duas
 *      pontas.
 *
 * A ordem de varredura é da **esquerda para a direita** (θ decrescente),
 * atravessando os arcos — é isso que faz cada agremiação ocupar uma cunha
 * contígua em vez de pontilhar o desenho inteiro.
 */

/** Raio do arco mais externo, em unidades do `viewBox`. É a escala do desenho. */
export const RAIO_EXTERNO = 100;

/**
 * Fração do raio externo em que começa o arco mais interno. 0,45 deixa o
 * "buraco" do plenário grande o bastante para os arcos não se amontoarem no
 * centro e pequeno o bastante para o arco externo não virar um fio.
 */
export const FRACAO_INTERNA = 0.45;

/** Raio do arco mais interno. */
export const RAIO_INTERNO = RAIO_EXTERNO * FRACAO_INTERNA;

/**
 * Número de arcos. **Constante de desenho, não derivada de `N`** — ver o
 * cabeçalho. Com 12 arcos e ~513 cadeiras o espaçamento angular (≈5,24) e o
 * radial (5,00) quase coincidem, que é o que faz as bolinhas saírem redondas e
 * igualmente afastadas nos dois eixos.
 */
export const ARCOS_PADRAO = 12;

/** Folga em volta do arco, para o contorno do assento não ser cortado. */
const MARGEM = 3;

/** Fração do menor espaçamento que vira raio do assento. */
const OCUPACAO_DO_ASSENTO = 0.4;

/**
 * Quantos arcos para `total` cadeiras: {@link ARCOS_PADRAO}, exceto no extremo
 * pequeno.
 *
 * A guarda é `total < 2 · arcos ⇒ arcos = max(1, ⌊total / 2⌋)`: abaixo de duas
 * cadeiras por arco a distribuição proporcional começa a produzir arcos com
 * zero assentos, e um arco vazio no meio do desenho se lê como cadeira
 * faltando, não como escolha de layout.
 *
 * Não é caminho hipotético: um payload degradado com 4 ou 10 cadeiras
 * publicadas passa por aqui na primeira meia hora da apuração.
 */
export function arcosPara(total: number): number {
  if (total <= 0) return 0;
  if (total < 2 * ARCOS_PADRAO) return Math.max(1, Math.floor(total / 2));
  return ARCOS_PADRAO;
}

/** Raios dos arcos, do interno para o externo. Um arco só ⇒ o raio médio. */
export function raiosDosArcos(arcos: number): number[] {
  if (arcos <= 0) return [];
  if (arcos === 1) return [(RAIO_INTERNO + RAIO_EXTERNO) / 2];
  const passo = (RAIO_EXTERNO - RAIO_INTERNO) / (arcos - 1);
  return Array.from({ length: arcos }, (_, k) => RAIO_INTERNO + k * passo);
}

/**
 * Assentos por arco, do interno (índice 0) para o externo.
 *
 * Proporcional ao raio (o arco externo é mais longo e comporta mais), com o
 * resto do arredondamento distribuído por **maiores restos** — o método de
 * Hare —, desempate por **índice de arco crescente**.
 *
 * 🔴 O `Σ === total` é o ponto inteiro desta função, e é o invariante de
 * RF-125.1 na sua forma geométrica. `Math.floor` sozinho perde entre 0 e
 * `arcos − 1` cadeiras, e a perda é invisível: o desenho continua bonito, só
 * com menos cadeiras do que a Câmara tem. O desempate existe porque dois arcos
 * com o mesmo resto fracionário trocariam de lugar entre execuções sem ele, e
 * a cor das cadeiras junto (constituição § 6).
 */
export function assentosPorArco(total: number, arcos: number): number[] {
  if (total <= 0 || arcos <= 0) return [];
  const raios = raiosDosArcos(arcos);
  const somaRaios = raios.reduce((a, b) => a + b, 0);

  const quotas = raios.map((r) => (total * r) / somaRaios);
  const base = quotas.map((q) => Math.floor(q));
  const resto = total - base.reduce((a, b) => a + b, 0);

  const porResto = quotas
    .map((q, k) => ({ k, frac: q - Math.floor(q) }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.k - b.k));

  for (let j = 0; j < resto; j++) {
    const alvo = (porResto[j] as { k: number }).k;
    base[alvo] = (base[alvo] as number) + 1;
  }
  return base;
}

/** Uma cadeira, já posicionada. */
export interface AssentoGeometria {
  /** Posição na varredura esquerda → direita. É por ela que a cor é atribuída. */
  i: number;
  /** Arco a que pertence. 0 = mais interno. */
  arco: number;
  cx: number;
  cy: number;
}

export interface HemicicloLayout {
  /** `assentos.length`. Igual ao `total` pedido, por construção (RF-125.1). */
  total: number;
  arcos: number;
  /** Assentos por arco, do interno para o externo. */
  porArco: number[];
  /** Raio de cada bolinha, em unidades do `viewBox`. */
  raioAssento: number;
  width: number;
  height: number;
  assentos: AssentoGeometria[];
}

/**
 * Arredonda para 3 casas. Existe para o SVG sair **byte a byte igual** entre
 * execuções e plataformas: `Math.cos` não é garantido bit a bit pelo padrão da
 * linguagem, e 3 casas em unidades de um `viewBox` de 210 são bem mais finas
 * que um pixel em qualquer tamanho de render.
 */
function arred(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * O layout inteiro para `total` cadeiras.
 *
 * `total <= 0` devolve um layout vazio com caixa mínima — a tela que não tem
 * número não desenha bolinha nenhuma, e não inventa uma Câmara de tamanho
 * padrão para preencher o espaço (design 017 § D8).
 */
export function layoutHemiciclo(total: number): HemicicloLayout {
  const n = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const arcos = arcosPara(n);

  if (arcos === 0) {
    return {
      total: 0,
      arcos: 0,
      porArco: [],
      raioAssento: 0,
      width: arred(2 * (RAIO_EXTERNO + MARGEM)),
      height: arred(RAIO_EXTERNO + 2 * MARGEM),
      assentos: [],
    };
  }

  const raios = raiosDosArcos(arcos);
  const porArco = assentosPorArco(n, arcos);

  // O raio da bolinha sai do MENOR dos dois espaçamentos. Usar só o radial
  // deixaria os assentos do arco externo encavalados; usar só o angular
  // deixaria corredores largos entre os arcos.
  const gapRadial =
    arcos > 1 ? (RAIO_EXTERNO - RAIO_INTERNO) / (arcos - 1) : RAIO_EXTERNO - RAIO_INTERNO;
  let gapAngular = Number.POSITIVE_INFINITY;
  for (let k = 0; k < arcos; k++) {
    const s = porArco[k] as number;
    if (s < 1) continue;
    // Centro de célula: `s` células no arco de π ⇒ passo π·r / s.
    gapAngular = Math.min(gapAngular, (Math.PI * (raios[k] as number)) / s);
  }
  if (!Number.isFinite(gapAngular)) gapAngular = gapRadial;
  const raioAssento = arred(OCUPACAO_DO_ASSENTO * Math.min(gapRadial, gapAngular));

  const cx0 = RAIO_EXTERNO + raioAssento + MARGEM;
  const cy0 = RAIO_EXTERNO + raioAssento + MARGEM;
  const width = arred(2 * cx0);
  const height = arred(cy0 + raioAssento + MARGEM);

  // Gera com o ângulo em mãos, ordena pela varredura, só então numera.
  const brutos: Array<AssentoGeometria & { theta: number }> = [];
  for (let k = 0; k < arcos; k++) {
    const s = porArco[k] as number;
    const r = raios[k] as number;
    for (let j = 0; j < s; j++) {
      const theta = (Math.PI * (j + 0.5)) / s;
      brutos.push({
        i: 0,
        arco: k,
        theta,
        cx: arred(cx0 + r * Math.cos(theta)),
        cy: arred(cy0 - r * Math.sin(theta)),
      });
    }
  }

  // Esquerda → direita: θ decrescente. Desempate pelo arco (interno primeiro),
  // para a ordenação ser TOTAL — duas cadeiras no mesmo ângulo em arcos
  // diferentes trocariam de lugar entre execuções sem este segundo critério, e
  // a cor delas junto (constituição § 6).
  brutos.sort((a, b) => (b.theta !== a.theta ? b.theta - a.theta : a.arco - b.arco));

  const assentos: AssentoGeometria[] = brutos.map((s, i) => ({
    i,
    arco: s.arco,
    cx: s.cx,
    cy: s.cy,
  }));

  return { total: assentos.length, arcos, porArco, raioAssento, width, height, assentos };
}
