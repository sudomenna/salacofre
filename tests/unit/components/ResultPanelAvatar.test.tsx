// @vitest-environment happy-dom
/**
 * tests/unit/components/ResultPanelAvatar.test.tsx
 *
 * **A foto no placar de apuração** — pedido do dono, 2026-09-14: "os mesmos
 * miniavatares da tela de espera, nas telas de apuração".
 *
 * O pedido tem duas metades e a segunda é a que costuma ser esquecida: a foto
 * aparecer é fácil; ela caber sem alargar a linha é o requisito. Cada metade
 * vira uma asserção diferente aqui, e a geometria abaixo é MEDIDA, não
 * escolhida — no navegador, na home em modo simulado, em 14/09:
 *
 *   - linha normal  → a 1ª faixa do grid mede **38,05px** (nome + "N votos");
 *   - linha compacta → mede **26px exatos**, ditados pela coluna de números.
 *
 * O teto é o da linha compacta: **26**. `jsdom`/`happy-dom` não fazem layout,
 * então a altura não é testável aqui; o que é testável — e o que impede a
 * regressão — é o NÚMERO que a geometria permite.
 *
 * ## A inversão de 14/09 (tarde)
 *
 * A linha compacta não recebia avatar, porque ali falta LARGURA e o preço de
 * forçá-lo é a linha crescer de 55px para 77,6px. O dono viu a tela, pediu foto
 * em TODAS as linhas e aceitou o preço. Duas consequências viraram asserção:
 *
 *   1. as seis linhas da fixture mista têm foto, não três;
 *   2. onde há avatar o nome **quebra** em vez de truncar. Esta é a que se
 *      esquece: sem ela, uma implementação que mostrasse a foto e cortasse
 *      "WILSON GRASSI" em "WILS…" passaria em tudo — e teria destruído
 *      justamente aquilo que a foto foi posta ali para fazer.
 *
 * ## Blob no ambiente de teste
 *
 * `blobUrlFor` devolve `null` sem `BLOB_PUBLIC_BASE_URL` nem
 * `BLOB_READ_WRITE_TOKEN`, e o `<CandidateAvatar>` cai nas iniciais. Sem a
 * variável abaixo, TODA asserção sobre `<img>` neste arquivo passaria a medir o
 * fallback sem dizer nada — que é o defeito de teste que não discrimina. O
 * override é o caminho previsto pelo próprio `lib/blob/paths.ts` ("o que os
 * testes usam").
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { CandidateRanking } from "@/components/blocks/CandidateRanking";
import { ResultPanel, type ResultPanelCandidate } from "@/components/blocks/ResultPanel";
import type { EdgeCandidate } from "@/lib/edge-config/types";

const BLOB_BASE = "https://teste123.public.blob.vercel-storage.com";

beforeEach(() => {
  process.env.BLOB_PUBLIC_BASE_URL = BLOB_BASE;
});

/** Teto medido: a linha COMPACTA tem 26px de caixa de conteúdo. */
const LIMITE_PX = 26;

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function cand(over: Partial<ResultPanelCandidate> & { id: number }): ResultPanelCandidate {
  return {
    nome: `Candidato ${over.id}`,
    partido: "PT",
    cor: "var(--color-cand-1)",
    votos_atuais: 1_000_000,
    pct_atual: 10,
    pct_projetado: 10,
    ...over,
  };
}

/**
 * Doze candidaturas com `sqcand` — o formato do bloco nacional de cargo 1.
 *
 * Todas acima de 3%: no `<ResultPanel>`, `compact` é `rank >= 3 && pct < 3`, e
 * a linha compacta NÃO recebe avatar (ver `AVATAR_LINHA_PX`). Manter a fixture
 * inteira fora do corte é o que faz as asserções abaixo medirem o avatar, e não
 * o corte — uma fixture com percentuais decrescentes até zero mediria os dois
 * ao mesmo tempo e não diria qual dos dois falhou.
 */
const DOZE: ResultPanelCandidate[] = Array.from({ length: 12 }, (_, i) =>
  cand({
    id: i + 1,
    rank: i + 1,
    sqcand: `28000255${String(1000 + i)}`,
    pct_atual: 40 - i * 3,
    pct_projetado: 40 - i * 3,
  }),
);

/** As três primeiras acima de 3%, as três últimas abaixo — o corte de `compact`. */
const COM_COMPACTAS: ResultPanelCandidate[] = [
  ...DOZE.slice(0, 3),
  ...[0, 1, 2].map((k) =>
    cand({
      id: 90 + k,
      rank: 4 + k,
      sqcand: `28000255${String(2000 + k)}`,
      pct_atual: 1.5,
      pct_projetado: 1.5,
    }),
  ),
];

const fotos = (doc: Document) => [
  ...doc.querySelectorAll('[data-testid="candidate-avatar-photo"]'),
];
const fallbacks = (doc: Document) => [
  ...doc.querySelectorAll('[data-testid="candidate-avatar-fallback"]'),
];

describe("a foto entra no placar de apuração, e a URL é derivada do sqcand", () => {
  it("as 12 linhas de resultado têm foto", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);

    expect(
      doc.querySelectorAll('[data-testid="candidate-result-row"]').length,
      "as linhas de resultado precisam existir",
    ).toBe(12);
    expect(fotos(doc).length, "toda linha do placar precisa de foto").toBe(12);
  });

  it("🔴 a URL é DERIVADA do sqcand e da UF — não é literal nem inventada", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);

    // Comparo CONJUNTOS de `sqcand`, não índices: casar por posição testaria a
    // ordem do array da fixture, que não é o que esta asserção afirma.
    const esperados = new Set(DOZE.map((c) => c.sqcand));
    const obtidos = new Set(
      fotos(doc).map((f) => (f.getAttribute("src") ?? "").replace(/^.*\/(\d+)\.jpg$/, "$1")),
    );
    expect(obtidos).toEqual(esperados);

    // E o caminho inteiro, uma vez, para prender o esquema do ADR-0041.
    expect(fotos(doc)[0]?.getAttribute("src")).toBe(
      `${BLOB_BASE}/candidatos/foto/BR/${DOZE[0]?.sqcand}.jpg`,
    );
  });

  it("🔴 a UF da FOTO é a da corrida — Governador em MG não busca a foto sob BR", () => {
    // O defeito que esta asserção pega não quebra nada no servidor: monta uma
    // URL sintaticamente válida que devolve 404 no navegador do leitor.
    const doc = parse(<ResultPanel candidatos={DOZE.slice(0, 2)} pctApurado={25} ufDaFoto="MG" />);
    for (const f of fotos(doc)) {
      expect(f.getAttribute("src")).toContain("/candidatos/foto/MG/");
    }
  });
});

describe("🔴 a altura da linha não muda — o avatar cabe no que a linha JÁ tinha", () => {
  it("o avatar é quadrado, declarado em px e não passa do teto medido de 26", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);

    for (const f of fotos(doc)) {
      const w = Number(f.getAttribute("width"));
      const h = Number(f.getAttribute("height"));
      expect(w, "largura precisa estar declarada (sem ela, CLS — RNF-002)").toBeGreaterThan(0);
      expect(h, "altura precisa estar declarada").toBeGreaterThan(0);
      expect(w, "quadrado, senão o círculo vira elipse").toBe(h);
      // 🔴 A asserção do pedido. A linha COMPACTA tem 26px de caixa: 27 já a
      // empurra, e com ela o painel inteiro se desloca.
      expect(
        w,
        `avatar de ${w}px alarga a linha compacta (teto ${LIMITE_PX}px)`,
      ).toBeLessThanOrEqual(LIMITE_PX);
    }
  });

  it("é circular e o corte é `top` — nunca uma porcentagem (RF-161)", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);
    const style = fotos(doc)[0]?.getAttribute("style") ?? "";

    expect(style, "sem `--radius-pill` o avatar sai quadrado").toContain("--radius-pill");
    expect(style).toContain("top");
    // A varredura de vocabulário do RF-161 roda sobre o HTML renderizado e não
    // distingue um `18%` dentro de um `style` de um percentual na tela. Ela já
    // reprovou a linha de identidade por isso em 14/09.
    expect(style, "percentual no atributo `style` reprova a varredura do RF-161").not.toContain(
      "%",
    );
  });

  it("🔴 a linha `compact` TAMBÉM recebe avatar — decisão do dono, 14/09", () => {
    // A inversão do dia. Até 14/09 a linha compacta era excluída para não
    // crescer: com avatar, o selo do partido desce para a segunda linha e a
    // linha vai de 55px para 77,6px (medido na home, coluna de 400px — a
    // compacta mais folgada, "EDMILSON COSTA PCB", tinha 4,8px de sobra em
    // 171,2px, e o custo do avatar é `diâmetro + afastamento` = 34px).
    //
    // O dono viu a tela sem rosto nas candidaturas abaixo de 3%, pediu foto em
    // todas e aceitou o custo. A medida continua verdadeira; a decisão sobre ela
    // é que mudou.
    //
    // 🔴 Esta asserção é a que morre com o `&& !compact` de volta no átomo.
    const doc = parse(<ResultPanel candidatos={COM_COMPACTAS} pctApurado={25} ufDaFoto="BR" />);

    expect(
      doc.querySelectorAll('[data-testid="candidate-result-row"]').length,
      "as 6 linhas continuam no DOM — nada foi escondido",
    ).toBe(6);
    expect(fotos(doc).length, "as SEIS linhas têm foto, compactas inclusive").toBe(6);
    expect(fallbacks(doc).length, "e nenhuma caiu nas iniciais — todas têm sqcand").toBe(0);
  });

  it("🔴 a foto da linha compacta tem o MESMO diâmetro da normal", () => {
    // O caminho fácil e errado para caber na compacta seria encolher o avatar.
    // Ele não resolve nada — o que estoura na compacta é a LARGURA, e o custo é
    // `diâmetro + afastamento` — e produziria duas colunas de foto desalinhadas
    // na mesma lista, que é pior que o problema.
    const doc = parse(<ResultPanel candidatos={COM_COMPACTAS} pctApurado={25} ufDaFoto="BR" />);
    const larguras = new Set(fotos(doc).map((f) => f.getAttribute("width")));

    expect(larguras.size, "um único diâmetro na lista inteira").toBe(1);
    expect([...larguras][0]).toBe(String(LIMITE_PX));
  });

  it("🔴 onde há avatar, o nome QUEBRA — nunca reticências", () => {
    // A regra de prioridade do pedido: "deixe a linha crescer, nunca corte o
    // nome". `happy-dom` não faz layout, então o que se mede é o MECANISMO —
    // a classe `truncate` (overflow hidden + ellipsis + nowrap) é a única coisa
    // que produz "WILS…" nesta linha, e ela não pode estar aqui.
    //
    // Asserção deliberadamente NÃO feita: "o nome está no DOM". Ele está nos
    // dois casos — com `truncate` o corte é do navegador, não do HTML —, então
    // essa asserção passa com o defeito e não prova nada.
    const doc = parse(<ResultPanel candidatos={COM_COMPACTAS} pctApurado={25} ufDaFoto="BR" />);
    const nomes = [...doc.querySelectorAll('[data-testid="candidate-result-name"]')];

    expect(nomes.length, "uma célula de nome por linha").toBe(6);
    for (const n of nomes) {
      expect(n.getAttribute("class") ?? "", n.textContent ?? "").not.toContain("truncate");
      // `min-width: auto` num item flex vale a maior PALAVRA e empurraria a
      // célula de volta; sem isto a quebra existe mas a coluna estoura.
      expect(n.getAttribute("style") ?? "").toContain("min-width:0");
      expect(n.getAttribute("style") ?? "").toContain("break-word");
    }
  });

  it("🔴 (par) sem avatar, a truncagem CONTINUA — a mudança é só onde há foto", () => {
    // O par que separa "tirei o truncate onde havia foto" de "tirei o truncate
    // de todo lugar". O segundo mudaria `<CandidateRanking>` e
    // `<MinorCandidatesList>`, três telas fora do pedido, e passaria sozinho na
    // asserção acima.
    const doc = parse(<CandidateRanking candidatos={DOZE.slice(0, 3) as EdgeCandidate[]} />);
    const nomes = [...doc.querySelectorAll('[data-testid="candidate-result-name"]')];

    expect(nomes.length).toBe(3);
    for (const n of nomes) {
      expect(n.getAttribute("class") ?? "").toContain("truncate");
    }
  });

  it("(controle) a linha SEM avatar continua existindo — nada foi imposto às outras listas", () => {
    // `<CandidateRanking>` e `<MinorCandidatesList>` passam pelo mesmo átomo e
    // NÃO pediram avatar. Sem esta asserção, uma implementação que ligasse a
    // foto por default passaria em tudo acima e mudaria três telas fora do
    // pedido.
    const doc = parse(<CandidateRanking candidatos={DOZE.slice(0, 3) as EdgeCandidate[]} />);
    expect(fotos(doc).length, "o ranking não pediu foto").toBe(0);
    expect(fallbacks(doc).length, "nem a caixa vazia dela").toBe(0);
  });
});

describe("degrada sem quebrar — nunca uma imagem quebrada", () => {
  it("sem `sqcand` (Governador/Senador nacional, RF-145) cai nas iniciais, MESMA caixa", () => {
    // É o estado por CONTRATO do bloco nacional de cargo 3 e 5: ali as 27
    // corridas dividem o mesmo espaço de `id` e uma foto apontaria para outra
    // pessoa. As 12 caem juntas, então as linhas continuam alinhadas.
    const semSqcand = DOZE.map(({ sqcand: _fora, ...resto }) => resto);
    const doc = parse(<ResultPanel candidatos={semSqcand} pctApurado={25} />);

    expect(fotos(doc).length, "sem sqcand não pode haver `<img>` — seria 404 na tela").toBe(0);
    expect(
      fallbacks(doc).length,
      "e a caixa das iniciais ocupa o lugar, para a linha não encolher",
    ).toBe(12);
  });

  it("sem Blob configurado cai nas iniciais, mesmo COM sqcand", () => {
    // Preview sem credencial, e o harness de teste por default. `blobUrlFor`
    // devolve `null` e o átomo faz o resto (ADR-0032 item 3).
    process.env.BLOB_PUBLIC_BASE_URL = "";
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);

    expect(fotos(doc).length).toBe(0);
    expect(fallbacks(doc).length).toBe(12);
  });

  it("sigla malformada vira fallback, não 500 (constituição § 7)", () => {
    // `candidatoFotoBlobPathname` LANÇA com sigla fora do alfabeto de caminho.
    // Sem o `try` de `candidatoFotoUrl`, a página inteira caía por causa de um
    // avatar.
    const doc = parse(
      <ResultPanel candidatos={DOZE.slice(0, 3)} pctApurado={25} ufDaFoto="B R/" />,
    );

    expect(doc.querySelectorAll('[data-testid="candidate-result-row"]').length).toBe(3);
    expect(fotos(doc).length).toBe(0);
    expect(fallbacks(doc).length).toBe(3);
  });

  it("as iniciais saem do nome de EXIBIÇÃO, não do cru", () => {
    // "VETERINÁRIO WILSON GRASSI" daria a bolinha "VG" ao lado do texto
    // "WILSON GRASSI". Aqui a foto está desligada de propósito (sem sqcand),
    // que é o único estado em que as iniciais aparecem.
    const doc = parse(
      <ResultPanel
        candidatos={[
          cand({
            id: 1,
            rank: 1,
            nome: "VETERINÁRIO WILSON GRASSI",
            partido: "DEMOCRATA",
            pct_atual: 30,
            pct_projetado: 30,
          }),
        ]}
        pctApurado={25}
      />,
    );
    expect(fallbacks(doc)[0]?.textContent).toBe("WG");
  });
});

describe("performance — a política de `eager` é a mesma da grade", () => {
  it("as 3 primeiras carregam cedo; da 4ª em diante é preguiçoso", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);
    const loading = fotos(doc).map((f) => f.getAttribute("loading"));

    expect(loading.slice(0, 3), "o pódio está acima da dobra em todo tamanho medido").toEqual([
      "eager",
      "eager",
      "eager",
    ]);
    // 🔴 O par: sem ele, um `eager` para todas as 12 passaria na asserção acima.
    expect(new Set(loading.slice(3)), "o resto da lista precisa ser lazy").toEqual(
      new Set(["lazy"]),
    );
  });

  it("nenhuma foto recebe `fetchpriority` — preload de JPEG compete com o LCP", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);
    for (const f of fotos(doc)) {
      expect(f.getAttribute("fetchpriority")).toBeNull();
    }
  });
});

describe("acessibilidade — a foto é decorativa, o nome está em texto ao lado", () => {
  it("`alt` vazio e `aria-hidden`: o leitor de tela não anuncia a pessoa duas vezes", () => {
    const doc = parse(<ResultPanel candidatos={DOZE} pctApurado={25} ufDaFoto="BR" />);
    for (const f of fotos(doc)) {
      expect(f.getAttribute("alt"), "alt precisa existir e ser VAZIO").toBe("");
      expect(f.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("o nome continua em texto na linha — a foto não substituiu nada", () => {
    // O par da asserção acima. Sem ele, apagar o nome da linha e deixar só a
    // foto passaria em "alt vazio" e destruiria a tela para quem ouve.
    const doc = parse(<ResultPanel candidatos={DOZE.slice(0, 1)} pctApurado={25} ufDaFoto="BR" />);
    expect(doc.querySelector('[data-testid="candidate-result-row"]')?.textContent).toContain(
      "Candidato 1",
    );
  });
});
