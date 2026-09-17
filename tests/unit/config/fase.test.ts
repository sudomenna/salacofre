/**
 * tests/unit/config/fase.test.ts — RF-153 (spec 019).
 *
 * Duas coisas são testadas aqui, e elas respondem a perguntas diferentes:
 *
 *   1. **O contrato do módulo** (`faseDoPayload`, `isPreEleicao`) — que só o
 *      campo `fase` decide, e que as quatro fontes proibidas do ADR-0043
 *      (percentual, `por_uf.length`, `composition.pre_election`, calendário)
 *      não decidem nada.
 *   2. **A guarda estrutural** — que o literal `"pre_eleicao"` não escapou do
 *      módulo para dentro de `app/` ou `components/`. A asserção é
 *      **negativa** de propósito: a positiva ("o módulo é importado") passa
 *      com uma comparação literal solta num componente ao lado.
 *
 * ## 🔴 Qual dos dois casos do RF-153 carrega o peso
 *
 * O RF-153 chama de "o teste mais importante da spec" o caso
 * `pct_apurado_total: 0.01` **sem** `fase` ⇒ modo normal. Ele **não
 * discrimina sozinho**: sob a mutação que ele existe para matar
 * (`isPreEleicao(p)` → `p.pct_apurado_total === 0`), `0.01 === 0` é `false`,
 * então mutante e original devolvem "normal" — a resposta certa pelo motivo
 * errado.
 *
 * Quem mata a mutação é o **caso irmão**: `pct_apurado_total` exatamente `0`,
 * sem `fase` ⇒ modo normal (M2). Os dois estão aqui porque a spec pede os
 * dois e porque o de `0.01` documenta a hora exata do risco — mas se algum dia
 * alguém for apagar o "redundante", apague o de `0.01`, nunca o de `0`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { FASE_PRE_ELEICAO, faseDoPayload, isPreEleicao } from "@/lib/config/fase";
import {
  payloadNormalApurando,
  payloadNormalPrimeiroBoletim,
  payloadNormalZerado,
  payloadPreEleicao,
  payloadPreEleicaoComPercentual,
} from "@/tests/fixtures/spec-019/payloads";

const RAIZ = new URL("../../..", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// O contrato do módulo
// ---------------------------------------------------------------------------

describe("RF-153 — `fase` é o único gatilho", () => {
  it("(M2 🔴) payload SEM `fase`, com `pct_apurado_total: 0` e `por_uf: []` ⇒ modo NORMAL", () => {
    // Este é o caso que discrimina. A mutação
    // `isPreEleicao(p) → p.pct_apurado_total === 0` devolve `true` aqui e
    // derruba este teste; o caso de `0.01` abaixo, não.
    const p = payloadNormalZerado();
    expect(p.pct_apurado_total).toBe(0);
    expect(p.por_uf).toHaveLength(0);
    expect(p.composition.pre_election).toBe(1);
    expect(faseDoPayload(p)).toBe("normal");
    expect(isPreEleicao(p)).toBe(false);
  });

  it("(M1) payload SEM `fase` e `pct_apurado_total: 0.01` (20h01 de 04/10) ⇒ modo NORMAL", () => {
    // ⚠️ Não discrimina sozinho — ver o cabeçalho. Fica porque nomeia o
    // momento do risco e porque a spec o exige literalmente.
    const p = payloadNormalPrimeiroBoletim();
    expect(p.pct_apurado_total).toBe(0.01);
    expect(faseDoPayload(p)).toBe("normal");
    expect(isPreEleicao(p)).toBe(false);
  });

  it("(M3) payload COM `fase` e `pct_apurado_total: 37.4` ⇒ modo PRÉ", () => {
    // Mata a mutação "na dúvida, confere os dois" (`fase && pct === 0`).
    const p = payloadPreEleicaoComPercentual();
    expect(p.pct_apurado_total).toBe(37.4);
    expect(p.por_uf.length).toBeGreaterThan(0);
    expect(faseDoPayload(p)).toBe(FASE_PRE_ELEICAO);
    expect(isPreEleicao(p)).toBe(true);
  });

  it("payload SEM `fase` em plena apuração ⇒ modo NORMAL", () => {
    expect(isPreEleicao(payloadNormalApurando())).toBe(false);
  });

  it("payload semeado ⇒ modo PRÉ", () => {
    expect(faseDoPayload(payloadPreEleicao())).toBe(FASE_PRE_ELEICAO);
    expect(isPreEleicao(payloadPreEleicao())).toBe(true);
  });

  it("`composition.pre_election: 1` sem `fase` NÃO liga o modo (ADR-0043 D2)", () => {
    // `emptyPayload()` de /governador e /senador grava exatamente isto, e a
    // spec 008 vai tornar o campo dinâmico: ~0,95 em plena apuração.
    const p = payloadNormalZerado();
    expect(p.composition.pre_election).toBe(1);
    expect(isPreEleicao(p)).toBe(false);
  });

  it("`null` e `undefined` ⇒ modo NORMAL (uma página sem payload não está em fase pré)", () => {
    // Deliberado: a faixa no ramo de espera é decisão do chamador (design
    // § D5). Se `null` devolvesse "pre_eleicao", uma falha de rede no Global
    // Config viraria uma afirmação sobre o calendário eleitoral (RNF-010).
    expect(faseDoPayload(null)).toBe("normal");
    expect(faseDoPayload(undefined)).toBe("normal");
    expect(isPreEleicao(null)).toBe(false);
    expect(isPreEleicao(undefined)).toBe(false);
  });

  it("a comparação é por igualdade exata — nenhuma variação do literal liga o modo", () => {
    for (const valor of [
      "normal",
      "",
      "pre-eleicao",
      "PRE_ELEICAO",
      "Pre_Eleicao",
      " pre_eleicao",
      "pre_eleicao ",
      "pre_eleicao2",
    ]) {
      expect(faseDoPayload({ fase: valor })).toBe("normal");
    }
    expect(faseDoPayload({ fase: null })).toBe("normal");
  });

  it("a constante É o literal que o resto do repositório procura", () => {
    expect(FASE_PRE_ELEICAO).toBe("pre_eleicao");
  });
});

// ---------------------------------------------------------------------------
// A guarda estrutural
// ---------------------------------------------------------------------------

const EXTENSOES = [".ts", ".tsx", ".css", ".mdx", ".json", ".py"];

function arquivosDe(dir: string): string[] {
  const saida: string[] = [];
  const pilha = [join(RAIZ, dir)];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (atual === undefined) break;
    for (const nome of readdirSync(atual)) {
      if (nome === "node_modules" || nome === ".next") continue;
      const caminho = join(atual, nome);
      if (statSync(caminho).isDirectory()) {
        pilha.push(caminho);
        continue;
      }
      if (EXTENSOES.some((e) => nome.endsWith(e))) saida.push(caminho);
    }
  }
  return saida;
}

/**
 * Os donos legítimos do literal, **medidos no repositório** e não copiados da
 * spec.
 *
 * ⚠️ **Divergência registrada**: o RF-153 lista três (`lib/config/fase.ts`,
 * `lib/edge-config/types.ts`, `data-pipeline/projection-seed.ts`) e **não
 * lista `scripts/edge-config-prune.ts`**, que existe (RF-165) e cita o literal
 * na prosa e nas mensagens do operador. A lista da spec está incompleta; este
 * teste adota a lista de quatro que o código sustenta, do mesmo modo que o
 * design § D7 adotou "4 nomes / 6 upserts" contra o "6 chaves" do desenho
 * aprovado.
 */
const DONOS_DO_LITERAL = [
  "lib/config/fase.ts",
  "lib/edge-config/types.ts",
  "data-pipeline/projection-seed.ts",
  "scripts/edge-config-prune.ts",
];

describe("RF-153 — guarda estrutural: o literal não escapa do módulo", () => {
  it("`app/` e `components/` não contêm a string `pre_eleicao` em lugar nenhum", () => {
    const arquivos = [...arquivosDe("app"), ...arquivosDe("components")];

    // 🔴 Anti-vácuo. Um `readdirSync` que passe a apontar para o lugar errado
    // devolveria zero arquivos e a asserção negativa abaixo passaria sem
    // olhar nada. Os números são pisos folgados, não contagens exatas.
    expect(arquivos.length).toBeGreaterThan(100);
    expect(arquivos.filter((f) => f.endsWith(".tsx")).length).toBeGreaterThan(80);

    // E a varredura tem de saber achar o que está lá: um controle positivo
    // sobre uma string que sabidamente existe em `components/`.
    const comIsPreEleicao = arquivos.filter((f) =>
      readFileSync(f, "utf8").includes("isPreEleicao"),
    );
    expect(comIsPreEleicao.length).toBeGreaterThan(0);

    const infratores = arquivos
      .filter((f) => readFileSync(f, "utf8").includes("pre_eleicao"))
      .map((f) => relative(RAIZ, f));

    expect(infratores).toEqual([]);
  });

  it("fora de `app/` e `components/`, o literal só vive nos quatro donos", () => {
    const arquivos = [
      ...arquivosDe("lib"),
      ...arquivosDe("data-pipeline"),
      ...arquivosDe("scripts"),
      ...arquivosDe("api"),
    ];
    expect(arquivos.length).toBeGreaterThan(60);

    const comLiteral = arquivos
      .filter((f) => readFileSync(f, "utf8").includes("pre_eleicao"))
      .map((f) => relative(RAIZ, f))
      .sort();

    expect(comLiteral).toEqual([...DONOS_DO_LITERAL].sort());
  });

  it("os dois emissores Python não conhecem o literal (RF-166, lado do fonte)", () => {
    for (const arq of ["api/model/project.py", "api/model/deputado_payload.py"]) {
      const fonte = readFileSync(join(RAIZ, arq), "utf8");
      expect(fonte.includes("pre_eleicao")).toBe(false);
      // `pre_election` (o peso de `composition`) continua lá e é outra coisa.
      expect(fonte.includes("pre_election")).toBe(true);
    }
  });
});
