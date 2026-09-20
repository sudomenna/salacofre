/**
 * tests/unit/lib/malha-ibge.test.ts
 *
 * A trava contra "corpo d'água virou município".
 *
 * ## O defeito que isto existe para impedir de voltar
 *
 * A malha municipal do IBGE traz a Lagoa Mirim (`4300001`) e a Lagoa dos Patos
 * (`4300002`) como feições próprias. Até 2026-09-19 elas eram tratadas como
 * municípios em duas frentes: o gerador de simulação lhes dava peso e voto (a
 * Lagoa dos Patos apareceu na tela com "100% apurado · LULA · PT · 1 voto"), e
 * o mapa as desenhava com hover, cursor `pointer` e ficha no clique.
 *
 * ## O que esta trava cobre, e o que NÃO cobre
 *
 * São três exigências, e elas não se satisfazem com o mesmo teste:
 *
 * 1. **Alguém removeu o recorte do mapa** → morto pelo bloco "o filtro do mapa".
 *    É o mais importante: é o que conserta produção, e o único jeito de testá-lo
 *    sem subir um mapa é a expression ser construída por função pura.
 * 2. **Alguém removeu o recorte do gerador** → coberto **só indiretamente**,
 *    pelo bloco "as fixtures". ⚠️ Seja honesto sobre o limite: o teste lê as
 *    fixtures **commitadas**, não executa `simulacao-gerar.ts`. Uma regressão no
 *    gerador só fica vermelha **depois** que alguém rodar `pnpm sim` e commitar
 *    o resultado. Não dá para fazer melhor aqui: o gerador lê o Postgres, e
 *    teste nenhum desta suíte pode abrir o banco — o `DATABASE_URL` do
 *    `.env.local` é PRODUÇÃO, e em 17/09 uma suíte gravou 1.877 linhas lá.
 *    O que segura a ponta enquanto isso é o predicado compartilhado: gerador e
 *    mapa chamam o MESMO `ehMunicipioDeVerdade`, testado no primeiro bloco.
 * 3. **Apareceu uma feição NOVA na malha** (um terceiro corpo d'água numa
 *    atualização do IBGE) → é a exigência difícil, porque uma lista de dois
 *    códigos não conhece o terceiro. Coberta **indiretamente**, pelo bloco "a
 *    contagem por UF": a feição nova desequilibra a contagem da sua UF e o
 *    teste falha nomeando-a.
 *
 * 🔴 **O limite declarado**: o teste de contagem **não sabe** distinguir um
 * corpo d'água novo de um município legítimo novo. Ele falha nos dois casos, e
 * isso é deliberado — a mensagem manda um humano conferir.
 *
 * Em 2026-09-19 esse comportamento já se provou: a contagem de Mato Grosso
 * divergiu, a divergência obrigou a pesquisa, e o resultado foi descobrir que
 * **Boa Esperança do Norte existe de verdade** (instalado em 01/01/2025, após o
 * STF encerrar a ação de Nova Ubiratã). A referência é que estava velha, não o
 * dado. Um teste que tentasse decidir sozinho teria escondido isso.
 *
 * O que ele NÃO cobre, e não tem como: uma feição d'água nova que **substitua**
 * um município na mesma UF, mantendo a contagem. Nenhum dado disponível ao
 * teste distingue esse caso — só o cruzamento com o cadastro do TSE
 * distinguiria, e ele vive no banco, que teste nenhum aqui pode consultar (o
 * `DATABASE_URL` do `.env.local` é PRODUÇÃO).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ufFloorFilter } from "@/components/atoms/maps/ChoroplethMapUF";
import {
  CODIGOS_IBGE_NAO_MUNICIPIO,
  ehMunicipioDeVerdade,
  MUNICIPIOS_POR_UF,
  TOTAL_MUNICIPIOS_BRASIL,
} from "@/lib/config/malha-ibge";

const FIXTURES = [
  "municipios-pres-t1.json",
  "municipios-gov-t1.json",
  "municipios-sen-t1.json",
] as const;

/** Toda entrada `{cod_ibge, nome}` do JSON, em qualquer profundidade. */
function entradasDe(obj: unknown, acc: Array<{ cod_ibge: string; nome: string }> = []) {
  if (Array.isArray(obj)) {
    for (const v of obj) entradasDe(v, acc);
  } else if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (typeof o.cod_ibge === "string" && typeof o.nome === "string") {
      acc.push({ cod_ibge: o.cod_ibge, nome: o.nome });
    }
    for (const v of Object.values(o)) entradasDe(v, acc);
  }
  return acc;
}

function carregarFixture(arquivo: string): Record<string, unknown> {
  const caminho = resolve(process.cwd(), "tests/fixtures/simulacao", arquivo);
  return JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
}

describe("malha-ibge — o predicado", () => {
  it("recusa os corpos d'água conhecidos, em número e em string", () => {
    for (const cod of CODIGOS_IBGE_NAO_MUNICIPIO) {
      expect(ehMunicipioDeVerdade(cod), `número ${cod}`).toBe(false);
      expect(ehMunicipioDeVerdade(String(cod)), `string "${cod}"`).toBe(false);
    }
  });

  it("aceita município de verdade — inclusive o mais novo do país", () => {
    // Boa Esperança do Norte (MT), instalado em 01/01/2025. Está aqui de
    // propósito: é o caso que uma "limpeza" ingênua da malha descartaria por
    // ser desconhecida, e ele vota.
    expect(ehMunicipioDeVerdade(5101837)).toBe(true);
    expect(ehMunicipioDeVerdade("3550308")).toBe(true); // São Paulo
    expect(ehMunicipioDeVerdade(4314902)).toBe(true); // Porto Alegre
  });

  it("recusa o que não vira número, em vez de deixar passar", () => {
    // Sem código não há município. Desenhar o que não se consegue identificar
    // é exatamente o defeito que este módulo existe para evitar.
    expect(ehMunicipioDeVerdade("")).toBe(false);
    expect(ehMunicipioDeVerdade("lagoa")).toBe(false);
    expect(ehMunicipioDeVerdade(Number.NaN)).toBe(false);
  });
});

describe("malha-ibge — o filtro do mapa (exigência 1)", () => {
  // 🔴 MUTAÇÃO que isto tem de matar: apagar o segundo termo de
  // `ufFloorFilter` e voltar ao `["==", ["floor", ...]]` sozinho. Sem este
  // bloco a mutação passa na suíte inteira, porque nenhum outro teste constrói
  // a expression — e foi assim que as lagoas entraram no mapa.
  it("exclui os corpos d'água do recorte da UF", () => {
    const filtro = JSON.stringify(ufFloorFilter("RS"));
    for (const cod of CODIGOS_IBGE_NAO_MUNICIPIO) {
      expect(filtro, `o filtro do RS precisa citar ${cod}`).toContain(String(cod));
    }
    expect(filtro).toContain('"!"');
    expect(filtro).toContain('"in"');
  });

  it("continua recortando pela UF — o segundo termo não pode ter comido o primeiro", () => {
    // O defeito pior que o original: um filtro que exclui as lagoas mas para
    // de recortar por UF desenharia o Brasil inteiro em cima de um estado.
    const filtro = JSON.stringify(ufFloorFilter("RS"));
    expect(filtro).toContain('"floor"');
    expect(filtro).toContain("100000");
    expect(filtro).toContain("43"); // código IBGE do RS
  });

  it("é `all` com dois termos — a forma que o MapLibre aceita", () => {
    // O docstring de `ufFloorFilter` registra que misturar sintaxe legada e
    // expression dentro do mesmo `all` faz o estilo nunca terminar de carregar.
    // Aqui só travamos a forma; o conteúdo está nos dois casos acima.
    const filtro = ufFloorFilter("SP") as unknown[];
    expect(filtro[0]).toBe("all");
    expect(filtro).toHaveLength(3);
  });

  it("UF desconhecida não casa nada, e segue excluindo as lagoas", () => {
    const filtro = JSON.stringify(ufFloorFilter("??"));
    expect(filtro).toContain("-1");
    expect(filtro).toContain(String(CODIGOS_IBGE_NAO_MUNICIPIO[0]));
  });
});

describe("malha-ibge — as fixtures de simulação (exigência 2)", () => {
  for (const arquivo of FIXTURES) {
    it(`${arquivo} não contém corpo d'água`, () => {
      const entradas = entradasDe(carregarFixture(arquivo));
      const intrusos = entradas.filter((m) => !ehMunicipioDeVerdade(m.cod_ibge));
      expect(
        intrusos,
        `feições que não são município vazaram para a fixture: ` +
          `${intrusos.map((m) => `${m.cod_ibge} ${m.nome}`).join(", ")}`,
      ).toEqual([]);
    });
  }
});

describe("malha-ibge — a contagem por UF (exigência 3, com limite declarado)", () => {
  it("a referência soma 5.571 — e não 5.570, que é o número de 2022", () => {
    expect(TOTAL_MUNICIPIOS_BRASIL).toBe(5571);
    expect(Object.keys(MUNICIPIOS_POR_UF)).toHaveLength(27);
  });

  /*
   * ===== 2026-09-19 — os três cargos entram no grupo conferido =====
   *
   * Aqui havia uma tranca: um caso que media `municipios: []` em gov e sen e
   * avisava, no dia em que isso deixasse de ser verdade, para MOVER os dois
   * arquivos para o grupo abaixo — senão eles seriam "uma porta sem tranca:
   * um corpo d'água novo entraria por ela em silêncio".
   *
   * O dia chegou: `data-pipeline/simulacao-gerar.ts` passou a produzir detalhe
   * municipal para Presidente, Governador e Senador, e a tranca foi obedecida
   * — os dois arquivos estão na lista da conferência por UF, e não num caso à
   * parte. O aviso cumpriu exatamente o papel para que foi escrito.
   */
  for (const arquivo of FIXTURES) {
    it(`${arquivo} tem exatamente os municípios de cada UF`, () => {
      const porUf = new Map<string, Set<string>>();
      const raiz = carregarFixture(arquivo);
      for (const [uf, bloco] of Object.entries(raiz)) {
        if (!(uf in MUNICIPIOS_POR_UF)) continue;
        const cods = new Set(entradasDe(bloco).map((m) => m.cod_ibge));
        porUf.set(uf, cods);
      }

      const divergencias: string[] = [];
      for (const [uf, esperado] of Object.entries(MUNICIPIOS_POR_UF)) {
        const obtido = porUf.get(uf)?.size ?? 0;
        if (obtido !== esperado) {
          divergencias.push(`${uf}: ${obtido} na fixture, ${esperado} esperados`);
        }
      }

      expect(
        divergencias,
        divergencias.length === 0
          ? ""
          : `A malha divergiu da referência em ${divergencias.length} UF(s): ` +
              `${divergencias.join(" | ")}.\n\n` +
              `🔴 ISTO NÃO DIZ SOZINHO O QUE ACONTECEU — confira antes de "consertar".\n` +
              `   Há três causas possíveis, e duas exigem ações OPOSTAS:\n` +
              `   (a) apareceu um corpo d'água novo na malha do IBGE\n` +
              `       → acrescente o código a CODIGOS_IBGE_NAO_MUNICIPIO;\n` +
              `   (b) foi criado um município de VERDADE\n` +
              `       → atualize MUNICIPIOS_POR_UF (foi o caso de Boa Esperança\n` +
              `         do Norte/MT, instalado em 01/01/2025 — a referência é que\n` +
              `         estava velha, e o dado estava certo);\n` +
              `   (c) o gerador de simulação perdeu municípios\n` +
              `       → é regressão, e a mais grave das três.\n\n` +
              `   Ambos os arquivos em lib/config/malha-ibge.ts.`,
      ).toEqual([]);
    });
  }
});
