/**
 * tests/unit/components/cor-nunca-da-posicao.test.ts
 *
 * **Nada em `components/`, `app/` ou `lib/` deriva cor de candidatura da
 * COLOCAÇÃO.**
 *
 * ## Por que existe (e por que não bastava consertar os arquivos)
 *
 * O ADR-0024 aposentou a cor por rank em 2026-09-07. A partir daí a correção
 * andou arquivo a arquivo, e arquivo a arquivo é exatamente o método que
 * produz o defeito que ele tenta consertar:
 *
 *   - **19/09** o dono viu CAIADO/PSD **laranja na lista e verde na legenda do
 *     mapa**, na mesma tela. Nasceu daí `cor-nunca-do-payload.test.ts`, que
 *     baniu a leitura do campo `.cor` do payload (a paleta por colocação que o
 *     produtor gravava). Aquela varredura fecha UMA porta: ler a cor pronta.
 *   - **20/09 de manhã** as três funções de `_candidateColor.ts`, os dois
 *     mapas e o `StateResultSheet` perderam o desvio de rank. O
 *     `StateResultSheet` só entrou porque alguém notou: ele estava fora do
 *     escopo de quem consertou o resto, e a mesma candidatura passou algumas
 *     horas com duas tintas.
 *   - **20/09 à tarde** sobravam **seis** superfícies chamando `colorForRank`
 *     direto, sem passar por helper nenhum — e a varredura de 19/09 não via
 *     nenhuma delas, porque elas não LEEM o campo: elas **recalculam** a
 *     mesma paleta a partir do `rank`. A porta da frente estava trancada e a
 *     dos fundos aberta.
 *
 * Esta varredura fecha a dos fundos. Não é "mais um teste dos seis arquivos":
 * é a regra que impede o **sétimo**.
 *
 * ## O que a regra proíbe
 *
 * Duas formas da mesma coisa, porque quem quisesse a segunda não precisaria da
 * primeira:
 *
 *   1. **Chamar a API de rank** — `colorForRank`, `bandForRank`,
 *      `strongForRank`, `resolveCandHex`, `resolveBandHex`, `rankFromColorVar`
 *      (`lib/utils/cand-color.ts`, ADR-0013 superseded). `rankFromColorVar`
 *      entra na lista por ser o caminho INVERSO e igualmente proibido: ele
 *      extrai a colocação de dentro de uma string de cor para escolher outra
 *      cor a partir dela — foi assim que o avatar do `<CandidateRow>` sobreviveu
 *      às duas varreduras anteriores.
 *   2. **Escrever o token literal** — `var(--color-cand-3)`,
 *      `var(--color-cand-band-2)`, `var(--color-cand-1-strong)`. Sem isto a
 *      regra seria contornável com um `replace` de 10 segundos, e não
 *      hipoteticamente: os defaults de `<StateGroupedTable>` (`corA =
 *      "var(--color-cand-1)"`) e de `<TwoRoundIndicator>` (`liderCor =
 *      "var(--color-cand-1)"`) eram exatamente isso — rank cravado como
 *      string, invisível para qualquer busca por nome de função.
 *
 * **`--color-cand-other` e `--color-cand-band-other` continuam permitidos**, e
 * a distinção é de significado, não de conveniência: o cinza neutro não é uma
 * posição. Ele diz "aqui não há candidatura a identificar" — a corrida ainda
 * indefinida no cartograma, o agregado "Outros candidatos" do termômetro, a
 * participação. Por isso os padrões abaixo exigem um DÍGITO.
 *
 * ## O que a regra NÃO proíbe
 *
 * **Usar `rank`.** Ele continua sendo dado legítimo e continua na tela: é o
 * número da posição na coluna da esquerda, é o que ORDENA as listas e as
 * colunas da tabela por estado, é o que escolhe entre `size="hero"` e
 * `size="compact"`. Ordenar por posição é correto; **pintar** por posição não
 * é. A varredura mira só a tinta.
 *
 * ## O escopo: `components/`, `app/` E `lib/`
 *
 * A varredura de 19/09 nasceu olhando só `components/` e já pagou por isso
 * duas vezes:
 *
 *   - passou verde enquanto duas PÁGINAS montavam `candidateColor[c.id] = c.cor`
 *     (quem as achou foi o `tsc`, não ela) — daí `app/`;
 *   - passou verde enquanto `lib/utils/municipio-votos.ts:113` fazia
 *     `cor: c?.cor ?? …`, copiando o campo banido para dentro de um utilitário
 *     que dois componentes consomem. A cor entrava na tela por baixo da
 *     fronteira que a varredura vigiava.
 *
 * `lib/` entra aqui desde o primeiro dia por causa do segundo caso. Uma
 * varredura que escolhe onde olhar herda o ponto cego de quem a escreveu, e o
 * ponto cego, as duas vezes, foi supor que "tela" mora em `components/`.
 *
 * ## O limite
 *
 * É análise de TEXTO, com um scanner que ignora comentário e enxerga string
 * (os tokens literais moram em strings — ignorá-las cegaria metade da regra).
 * Quem renomear o import (`import { colorForRank as pintar }`) passa. Não é a
 * fronteira que importa: o defeito real nunca foi disfarçado, foi **copiado
 * literalmente** de arquivo em arquivo.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZES = [
  { dir: resolve(process.cwd(), "components"), rotulo: "components" },
  { dir: resolve(process.cwd(), "app"), rotulo: "app" },
  // Ver "O escopo" na docstring: `lib/` não é enfeite, é onde a fuga de 19/09
  // aconteceu.
  { dir: resolve(process.cwd(), "lib"), rotulo: "lib" },
] as const;

/**
 * A API da paleta por COLOCAÇÃO (`lib/utils/cand-color.ts`, ADR-0013
 * superseded pelo ADR-0024). Chamar qualquer uma destas é derivar tinta de
 * posição.
 */
const FUNCOES_DE_RANK = [
  "colorForRank",
  "bandForRank",
  "strongForRank",
  "resolveCandHex",
  "resolveBandHex",
  "rankFromColorVar",
] as const;

/**
 * Os padrões proibidos. O `[0-9]` em cada token é deliberado — ver
 * "`--color-cand-other` continua permitido" na docstring.
 */
const PADROES: ReadonlyArray<{ re: RegExp; oque: string }> = [
  ...FUNCOES_DE_RANK.map((nome) => ({
    re: new RegExp(`(?<![\\w$])${nome}(?![\\w$])`),
    oque: `chamada a \`${nome}\``,
  })),
  {
    re: /--color-cand-(band-)?[0-9]/,
    oque: "token literal da paleta por colocação (`--color-cand-N`)",
  },
];

/**
 * Onde a paleta por colocação ainda é legítima. **Cada entrada carrega o
 * motivo escrito**, e o teste (c) abaixo exige que o motivo exista, que o
 * arquivo exista e que ele de fato ainda tenha uma ocorrência — uma permissão
 * que virou desnecessária é lixo que autoriza o próximo defeito em silêncio.
 */
const PERMITIDOS = new Map<string, string>([
  [
    "lib/utils/cand-color.ts",
    "É o módulo que DEFINE a paleta por colocação — as seis funções e o " +
      "regex `--color-cand-(\\d+)` nascem aqui. Proibi-la neste arquivo " +
      "tornaria a regra inaplicável: não sobraria nada para detectar. O " +
      "módulo segue no repositório, e não por inércia — os tokens " +
      "`--color-cand-*` só somem depois do 2º turno (ADR-0013 § Status), e " +
      "até lá um payload já publicado ainda os carrega. O cabeçalho do " +
      "arquivo diz, com todas as letras, que ele não deve ser usado para " +
      "pintar candidatura em código novo.",
  ],
  [
    "app/sobre-o-modelo/page.tsx",
    "As ilustrações da página de metodologia (a zona multiplicada por k, a " +
      "faixa de confiança, a agulha de exemplo) desenham DOIS CANDIDATOS " +
      "ABSTRATOS — `shareA` é uma constante do desenho, não vem de payload " +
      "nenhum, e não há nome, sigla nem id em lugar algum delas. Ali " +
      "`--color-cand-1` e `--color-cand-2` são só 'duas cores que se " +
      "distinguem', o mesmo papel de um 'A' e um 'B' num diagrama. Nenhuma " +
      "candidatura real recebe tinta nesta página, então não há cor que " +
      "possa trocar durante a noite.",
  ],
]);

/**
 * Apaga comentários e **preserva strings**.
 *
 * Preservar string não é detalhe: metade da regra são tokens literais, e eles
 * só existem dentro de aspas (`corA = "var(--color-cand-1)"`). O caminho
 * inverso — apagar strings — cegaria justamente o caso que o `<TwoRoundIndicator>`
 * exibia.
 *
 * Apagar comentário também não é detalhe, e por um motivo constrangedoramente
 * concreto: os arquivos consertados em 20/09 **explicam** o defeito citando o
 * nome das funções e os tokens. Um scanner ingênuo reprovaria a própria
 * documentação da correção — e a lição que isso ensina (apague o comentário
 * para o teste passar) é a pior possível.
 *
 * Substitui cada caractere de comentário por um espaço em vez de removê-lo,
 * para que o número da linha reportado continue sendo o número real.
 */
function semComentarios(fonte: string): string {
  const out: string[] = [];
  let i = 0;
  const n = fonte.length;
  while (i < n) {
    const c = fonte[i] as string;
    const prox = fonte[i + 1];
    // Comentário de linha
    if (c === "/" && prox === "/") {
      while (i < n && fonte[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }
    // Comentário de bloco (cobre `/** … */` e `{/* … */}` do JSX)
    if (c === "/" && prox === "*") {
      while (i < n && !(fonte[i] === "*" && fonte[i + 1] === "/")) {
        out.push(fonte[i] === "\n" ? "\n" : " ");
        i++;
      }
      // o `*/` final
      out.push(" ", " ");
      i += 2;
      continue;
    }
    // Strings e templates — copiados INTEIROS, inclusive o conteúdo.
    if (c === '"' || c === "'" || c === "`") {
      const aspas = c;
      out.push(c);
      i++;
      while (i < n) {
        const d = fonte[i] as string;
        out.push(d);
        i++;
        if (d === "\\") {
          if (i < n) {
            out.push(fonte[i] as string);
            i++;
          }
          continue;
        }
        if (d === aspas) break;
        // Uma string simples não atravessa linha; se atravessar, é template —
        // e template pode, então só paramos no delimitador.
        if (d === "\n" && aspas !== "`") break;
      }
      continue;
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

/** Linhas (1-based) que casam algum {@link PADROES}, fora de comentário. */
function linhasQuePintamPorPosicao(
  fonte: string,
): Array<{ n: number; oque: string; texto: string }> {
  const out: Array<{ n: number; oque: string; texto: string }> = [];
  semComentarios(fonte)
    .split("\n")
    .forEach((linha, idx) => {
      for (const { re, oque } of PADROES) {
        if (re.test(linha)) out.push({ n: idx + 1, oque, texto: linha.trim() });
      }
    });
  return out;
}

function arquivosDe(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDe(caminho, acc);
    } else if ([".ts", ".tsx"].includes(extname(nome))) {
      acc.push(caminho);
    }
  }
  return acc;
}

function todosOsArquivos(): Array<{ caminho: string; rel: string }> {
  return RAIZES.flatMap((r) =>
    arquivosDe(r.dir).map((caminho) => ({
      caminho,
      rel: `${r.rotulo}/${caminho.slice(r.dir.length + 1)}`,
    })),
  );
}

describe("nenhuma superfície pinta candidatura pela COLOCAÇÃO", () => {
  it("(a) varre components/, app/ e lib/ — os três lugares por onde a cor chega à tela", () => {
    const infratores: string[] = [];
    for (const { caminho, rel } of todosOsArquivos()) {
      if (PERMITIDOS.has(rel)) continue;
      for (const { n, oque, texto } of linhasQuePintamPorPosicao(readFileSync(caminho, "utf8"))) {
        infratores.push(`${rel}:${n} — ${oque}\n    ${texto}`);
      }
    }

    expect(
      infratores,
      infratores.length === 0
        ? ""
        : `Estes pontos derivam cor da COLOCAÇÃO do candidato — a paleta que o ` +
            `ADR-0024 aposentou em 2026-09-07:\n\n${infratores.join("\n")}\n\n` +
            `A constituição § 2 exige que a cor de uma candidatura seja estável a ` +
            `noite inteira e "não mude por rank, por ordem de apuração, por margem ` +
            `ou por qualquer evento da corrida". O rank NÃO é congelado em lugar ` +
            `nenhum do pipeline (ver o cabeçalho de lib/utils/cand-color.ts), então ` +
            `toda cor derivada dele troca entre dois ciclos — e, desde 290b8de, ` +
            `troca também quando o leitor aperta Parcial/Projeção.\n\n` +
            `Use, de components/blocks/_candidateColor.ts (ou, em components/atoms/ ` +
            `e lib/, os equivalentes de lib/utils/party-color.ts):\n` +
            `  • candidateColor(partido)       — preenchimento COM extensão ` +
            `(barra, hexágono, polígono, <rect>)\n` +
            `  • candidateMarkerColor(partido) — MARCADOR sem extensão ` +
            `(bolinha, quadradinho de legenda, ponto de 8×8)\n` +
            `  • partyChipInk(partido)         — par fundo+tinta para superfície ` +
            `sólida COM TEXTO em cima (avatar, chip, hexágono rotulado)\n\n` +
            `Precisa só do cinza neutro ("aqui não há candidatura a identificar")? ` +
            `--color-cand-other e --color-cand-band-other continuam permitidos.\n\n` +
            `Se a leitura for mesmo legítima, acrescente o arquivo a PERMITIDOS ` +
            `**com o motivo escrito** — e não porque o teste ficou vermelho.`,
    ).toEqual([]);
  });

  it("(b) a varredura acha o padrão quando ele existe — senão não prova nada", () => {
    // Sem estes casos, um regex quebrado faria (a) passar sempre: varreria
    // tudo, não encontraria nada, e chamaria isso de "está limpo".
    expect(linhasQuePintamPorPosicao("const c = colorForRank(rank);")).toHaveLength(1);
    expect(linhasQuePintamPorPosicao("corBand={bandForRank(rank)}")).toHaveLength(1);
    expect(linhasQuePintamPorPosicao("background: strongForRank(r)")).toHaveLength(1);
    expect(linhasQuePintamPorPosicao("const hex = resolveCandHex(1);")).toHaveLength(1);
    expect(linhasQuePintamPorPosicao("const b = resolveBandHex(2);")).toHaveLength(1);
    // O caminho INVERSO: extrair a colocação de dentro da cor.
    expect(linhasQuePintamPorPosicao("const rank = rankFromColorVar(cor);")).toHaveLength(1);
    // O token literal — dentro de string, que é onde ele mora de verdade.
    expect(linhasQuePintamPorPosicao('corA = "var(--color-cand-1)",')).toHaveLength(1);
    expect(linhasQuePintamPorPosicao('fill="var(--color-cand-band-2)"')).toHaveLength(1);
    expect(linhasQuePintamPorPosicao('background: "var(--color-cand-3-strong)"')).toHaveLength(1);

    // O cinza neutro NÃO é posição — não pode reprovar, ou o cartograma e o
    // agregado "Outros" ficariam sem token.
    expect(linhasQuePintamPorPosicao('return "var(--color-cand-other)";')).toHaveLength(0);
    expect(linhasQuePintamPorPosicao('corBand="var(--color-cand-band-other)"')).toHaveLength(0);

    // Usar `rank` para ORDENAR ou DIMENSIONAR é legítimo e tem de passar.
    expect(linhasQuePintamPorPosicao(".sort((a, b) => a.rank - b.rank)")).toHaveLength(0);
    expect(linhasQuePintamPorPosicao('size={rank === 1 ? "hero" : "compact"}')).toHaveLength(0);
    expect(linhasQuePintamPorPosicao("candidateColor(c.partido)")).toHaveLength(0);

    // Comentário não acusa — é o que permite documentar a correção sem que a
    // documentação vire a próxima violação.
    expect(linhasQuePintamPorPosicao("// era colorForRank(rank), ver ADR-0024")).toHaveLength(0);
    expect(linhasQuePintamPorPosicao("/* colorForRank(1) */ const x = 1;")).toHaveLength(0);
    // Docblock real, com crase e token literal dentro — a forma exata em que a
    // medição de contraste está escrita em `<ProjectionThermometer />`.
    expect(
      linhasQuePintamPorPosicao("/**\n * `--color-cand-3` mede 2,99:1 sobre o papel.\n */"),
    ).toHaveLength(0);
    expect(linhasQuePintamPorPosicao("{/* --color-cand-1 */}")).toHaveLength(0);
    // Bloco de várias linhas: a linha de dentro não acusa, a de fora acusa.
    expect(
      linhasQuePintamPorPosicao("/*\n colorForRank aqui é comentário\n*/\ncolorForRank(2);"),
    ).toEqual([{ n: 4, oque: "chamada a `colorForRank`", texto: "colorForRank(2);" }]);

    // Nome que só CONTÉM o proibido não é o proibido (fronteira de palavra).
    expect(linhasQuePintamPorPosicao("meuColorForRankCustom(1)")).toHaveLength(0);
  });

  it("(c) a lista de permitidos é explícita, justificada e ainda necessária", () => {
    // Uma lista vazia faria (a) reprovar — mas afirmar isso aqui é o que
    // impede a permissão de virar um `new Map()` decorativo que ninguém lê.
    expect(PERMITIDOS.size).toBeGreaterThan(0);

    const problemas: string[] = [];
    const porRel = new Map(todosOsArquivos().map((a) => [a.rel, a.caminho]));

    for (const [rel, motivo] of PERMITIDOS) {
      const caminho = porRel.get(rel);
      if (!caminho) {
        problemas.push(`${rel}: permitido, mas o arquivo não existe (renomeado? apagado?).`);
        continue;
      }
      // Motivo de verdade, não `""` nem "ok" para calar o teste.
      if (motivo.trim().length < 80) {
        problemas.push(
          `${rel}: o motivo tem ${motivo.trim().length} caracteres. ` +
            `Escreva POR QUE a paleta por colocação é legítima ali.`,
        );
      }
      // Permissão que não é mais necessária é lixo: ela autoriza em silêncio o
      // próximo `colorForRank` que alguém escrever nesse arquivo.
      if (linhasQuePintamPorPosicao(readFileSync(caminho, "utf8")).length === 0) {
        problemas.push(
          `${rel}: está em PERMITIDOS mas não tem mais nenhuma ocorrência. ` +
            `Remova a entrada — ela só serve para autorizar a próxima.`,
        );
      }
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
