/**
 * tests/unit/components/candidate-color.test.ts
 *
 * `components/blocks/_candidateColor.ts` — a cor da candidatura é função **só**
 * da sigla. Nenhum caminho deste módulo pode derivar tinta da posição na lista.
 *
 * ## O defeito que isto tranca (2026-09-20)
 *
 * O módulo tinha duas respostas para o mesmo caso, e as duas estavam no
 * repositório ao mesmo tempo:
 *
 *     colorForParty("PSDB/CIDADANIA")     => var(--party-outros)   ← estável
 *     candidateColor("PSDB/CIDADANIA", 3) => var(--color-cand-3)   ← posição
 *
 * A guarda `partidoIsMapped` é falsa para federação — nome composto não é
 * partido único e não está em `KNOWN_PARTY_SLUGS` — e desviava para
 * `colorForRank`, pulando exatamente a função que já sabia responder certo.
 *
 * Como o rank não é congelado em lugar nenhum (o "color lock" do ADR-0013 nunca
 * existiu de fato — ver a nota em `lib/utils/cand-color.ts`), a federação que
 * subisse ou descesse um lugar **trocava de cor entre duas atualizações da
 * página**; e desde `290b8de` a posição depende da base escolhida pelo leitor,
 * então trocaria também ao apertar Parcial/Projeção.
 *
 * ## A regra
 *
 * Constituição § 2: a cor de um partido é "estável durante toda a noite de
 * apuração e entre as duas noites do pleito: **não muda por rank, por ordem de
 * apuração, por margem ou por qualquer evento da corrida** — apenas a
 * intensidade pode variar com a margem, nunca a matiz".
 */

import { describe, expect, it } from "vitest";

import {
  candidateColor,
  candidateColorByMargin,
  candidateMarkerColor,
  partidoIsMapped,
} from "@/components/blocks/_candidateColor";
import { colorForRank } from "@/lib/utils/cand-color";
import { colorForParty, intensityForParty, textForParty } from "@/lib/utils/party-color";

/** As três formas de federação que o feed do TSE publica. */
const FEDERACOES = ["PSDB/CIDADANIA", "PSOL/REDE", "FEDERACAO BRASIL DA ESPERANCA"] as const;

/** Posições plausíveis numa corrida — inclusive fora da faixa da paleta antiga. */
const POSICOES = [1, 2, 3, 4, 5, 6, 7, 12, 99] as const;

describe("candidateColor — federação recebe cor estável, nunca do rank", () => {
  it.each(FEDERACOES)("%s tem a MESMA cor em toda posição", (sigla) => {
    const cores = new Set(POSICOES.map((p) => candidateColor(sigla, p)));
    expect(cores.size).toBe(1);
    expect([...cores][0]).toBe(colorForParty(sigla));
  });

  it("nenhuma posição produz um token de colocação", () => {
    for (const sigla of FEDERACOES) {
      for (const p of POSICOES) {
        expect(candidateColor(sigla, p)).not.toBe(colorForRank(p));
        expect(candidateColor(sigla, p)).not.toMatch(/--color-cand-/);
      }
    }
  });

  it("a cor de federação é o token de fallback da paleta", () => {
    // Uma só cor para todas as federações — consequência assumida, documentada
    // em `_candidateColor.ts`. Se um dia cada federação ganhar token próprio,
    // é ESTA asserção que deve cair, deliberadamente, junto com o ADR que a
    // autorizar; as de cima continuam valendo.
    for (const sigla of FEDERACOES) {
      expect(candidateColor(sigla)).toBe("var(--party-outros)");
    }
  });

  it("duas federações distintas não roubam a cor de um partido real", () => {
    // O risco de qualquer esquema que "sorteasse" uma cor a partir da sigla:
    // uma federação sair idêntica a um partido que está na mesma tela.
    for (const sigla of FEDERACOES) {
      for (const partido of ["PT", "PL", "PSD", "MDB", "PSDB", "PSOL"]) {
        expect(candidateColor(sigla)).not.toBe(colorForParty(partido));
      }
    }
  });
});

describe("candidateColor — partido com token próprio", () => {
  it("a sigla decide, a posição não entra", () => {
    // O caso do dono em 19/09: CAIADO/PSD em 3º. `--color-cand-3` é laranja e
    // `--party-psd` é verde.
    expect(candidateColor("PSD", 3)).toBe(colorForParty("PSD"));
    expect(candidateColor("PSD", 3)).not.toBe(colorForRank(3));
    // Mesmo partido, posições diferentes, mesma tinta.
    expect(candidateColor("PSD", 1)).toBe(candidateColor("PSD", 9));
  });

  it("partidos diferentes continuam distintos entre si", () => {
    const cores = ["PT", "PL", "PSD", "MDB", "PSDB", "PSOL"].map((s) => candidateColor(s));
    expect(new Set(cores).size).toBe(cores.length);
  });

  it("tolera caixa, espaço e pontuação da sigla como o TSE publica", () => {
    expect(candidateColor(" pt ")).toBe(candidateColor("PT"));
    expect(candidateColor("PC do B")).toBe(candidateColor("PCdoB"));
    expect(candidateColor("Missão")).toBe(candidateColor("MISSAO"));
  });
});

describe("candidateColor — candidatura sem sigla", () => {
  it.each([null, undefined, "", "   "])("%o cai no token estável, em qualquer posição", (sigla) => {
    const cores = new Set(POSICOES.map((p) => candidateColor(sigla, p)));
    expect(cores.size).toBe(1);
    expect([...cores][0]).toBe("var(--party-outros)");
  });

  it("sigla desconhecida (erro de dado) também não é pintada pela posição", () => {
    expect(candidateColor("SIGLA-QUE-NAO-EXISTE", 2)).toBe(
      candidateColor("SIGLA-QUE-NAO-EXISTE", 8),
    );
    expect(candidateColor("SIGLA-QUE-NAO-EXISTE", 2)).not.toBe(colorForRank(2));
  });
});

describe("candidateMarkerColor — mesma regra, variante legível (RNF-035)", () => {
  it.each(FEDERACOES)("%s: mesma cor em toda posição, e é a variante -text", (sigla) => {
    const cores = new Set(POSICOES.map((p) => candidateMarkerColor(sigla, p)));
    expect(cores.size).toBe(1);
    expect([...cores][0]).toBe(textForParty(sigla));
    expect([...cores][0]).toBe("var(--party-outros-text)");
  });

  it("nenhuma posição produz um token de colocação", () => {
    for (const p of POSICOES) {
      expect(candidateMarkerColor("PSOL/REDE", p)).not.toBe(colorForRank(p));
      expect(candidateMarkerColor(null, p)).not.toMatch(/--color-cand-/);
    }
  });

  it("o marcador NÃO é a cor base — o ponto de 8×8 precisa da variante legível", () => {
    // `--party-outros` mede 2,39:1 sobre o papel; a variante `-text` é a que o
    // gerador mediu para ler. Trocar uma pela outra é o defeito de
    // acessibilidade que o ADR-0024 nomeia, e ele não aparece em 17 dos 31
    // partidos — por isso a asserção usa justamente um dos que diferem.
    expect(candidateMarkerColor("PSOL/REDE")).not.toBe(candidateColor("PSOL/REDE"));
    expect(candidateMarkerColor("PSOL")).not.toBe(candidateColor("PSOL"));
  });
});

describe("candidateColorByMargin — só a intensidade varia (constituição § 2)", () => {
  it("federação: a matiz é a mesma em qualquer posição, para a mesma margem", () => {
    for (const p of POSICOES) {
      expect(candidateColorByMargin("PSDB/CIDADANIA", p, 7)).toBe(
        candidateColorByMargin("PSDB/CIDADANIA", 1, 7),
      );
      expect(candidateColorByMargin("PSDB/CIDADANIA", p, 7)).not.toBe(colorForRank(p));
    }
  });

  it("a margem — e só ela — muda o nível, na rampa de `outros`", () => {
    expect(candidateColorByMargin("PSOL/REDE", 3, 0.5)).toBe(intensityForParty("PSOL/REDE", 1));
    expect(candidateColorByMargin("PSOL/REDE", 3, 20)).toBe(intensityForParty("PSOL/REDE", 5));
    // Rampa de verdade, não cor sólida repetida.
    expect(candidateColorByMargin("PSOL/REDE", 3, 0.5)).not.toBe(
      candidateColorByMargin("PSOL/REDE", 3, 20),
    );
  });

  it("margem sem medida (NaN) fica no nível mais claro, nunca em `decidido`", () => {
    expect(candidateColorByMargin("PT", 1, Number.NaN)).toBe(intensityForParty("PT", 1));
  });
});

describe("partidoIsMapped — continua respondendo sobre o TOKEN, não sobre cor", () => {
  it("federação e sigla ausente não têm token próprio", () => {
    for (const sigla of FEDERACOES) expect(partidoIsMapped(sigla)).toBe(false);
    expect(partidoIsMapped(null)).toBe(false);
    expect(partidoIsMapped("")).toBe(false);
    expect(partidoIsMapped("SIGLA-QUE-NAO-EXISTE")).toBe(false);
  });

  it("partido registrado tem", () => {
    expect(partidoIsMapped("PT")).toBe(true);
    expect(partidoIsMapped("PSD")).toBe(true);
  });

  it("🔴 responder `false` NÃO pode mais mudar a cor", () => {
    // A guarda existe para escolher o par medido de chip/tinta, não para
    // escolher entre partido e rank. Esta asserção é o que impede que ela volte
    // a ser um desvio de cor.
    expect(partidoIsMapped("PSDB/CIDADANIA")).toBe(false);
    expect(candidateColor("PSDB/CIDADANIA", 3)).toBe(colorForParty("PSDB/CIDADANIA"));
  });
});

describe("🔴 trava de FONTE — este módulo não importa a paleta por colocação", () => {
  /**
   * Varredura de fonte, no espírito de
   * `tests/unit/components/cor-nunca-do-payload.test.ts`: as asserções de
   * comportamento acima cobrem as três funções que existem hoje, mas uma quarta
   * função escrita amanhã não estaria em teste nenhum. Enquanto `cand-color`
   * não for importável daqui, nenhuma delas pode nascer pintando por posição.
   */
  it("não há import de `lib/utils/cand-color` em `_candidateColor.ts`", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const bruto = readFileSync(
      path.join(process.cwd(), "components/blocks/_candidateColor.ts"),
      "utf8",
    );
    // Sem os comentários: o arquivo EXPLICA o defeito citando `colorForRank`
    // pelo nome, e uma varredura crua reprovaria a própria documentação dele.
    const codigo = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(codigo).not.toMatch(/from\s+["'][^"']*cand-color["']/);
    expect(codigo).not.toMatch(/\bcolorForRank\b/);
    // E a varredura não é vazia por acidente: o corpo real continua aqui.
    expect(codigo).toMatch(/\bcolorForParty\b/);
  });
});
