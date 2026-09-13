// @vitest-environment happy-dom
/**
 * tests/unit/components/DetailFreshness.test.tsx — ADR-0032 e ADR-0038 D5.
 *
 * `<DetailFreshness>` estava **sem nenhum teste** até 2026-09-13 (o ADR-0038
 * registra `grep -rn DetailFreshness tests/` → vazio), apesar de ser o único
 * lugar do produto que avisa que a tabela de municípios pode não corresponder
 * ao percentual apurado exibido no topo da mesma página.
 *
 * Duas coisas são medidas:
 *
 *   1. **O mecanismo continua fazendo o que faz.** O ADR-0038 D5 investigou e
 *      confirmou que ele está CORRETO para o que mede — a divergência entre
 *      dois relógios de ESCRITA (o Blob ficou para trás do resumo) — e decidiu
 *      não reescrevê-lo. Estes testes o fixam nessa forma, para que a próxima
 *      pessoa que ler "isto não detecta o TSE parado" não o conserte para um
 *      problema que ele nunca teve.
 *   2. **O clamp do negativo.** No ciclo saudável o detalhe é carimbado alguns
 *      instantes DEPOIS do resumo (Python carimba `ts_iso` → POST → Node
 *      carimba o Blob), então a subtração dá −1 no caso normal. Era inofensivo
 *      no texto, que só aparece a partir de 2 min, mas vazava para
 *      `data-lag-minutes`, um atributo cujo nome promete "minutos de defasagem".
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DETAIL_LAG_TOLERANCE_MINUTES,
  DetailFreshness,
} from "@/components/atoms/surfaces/DetailUnavailable";

function render(ts: string, resumoTs: string): Element | null {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(<DetailFreshness ts={ts} resumoTs={resumoTs} />),
    "text/html",
  );
  return doc.querySelector("[data-testid='detail-freshness']");
}

/** Carimbos com deslocamento explícito, para o teste não depender do relógio. */
const RESUMO = "2026-10-04T22:00:00-03:00";
function detalheApos(segundos: number): string {
  return new Date(Date.parse(RESUMO) + segundos * 1000).toISOString();
}

describe("<DetailFreshness /> — o clamp do negativo (ADR-0038 D5)", () => {
  it("(a) ciclo saudável (detalhe 2 s DEPOIS do resumo) → `data-lag-minutes` é 0, nunca -1", () => {
    const el = render(detalheApos(2), RESUMO);

    expect(el?.getAttribute("data-lag-minutes")).toBe("0");
    expect(el?.getAttribute("data-lag-minutes")).not.toBe("-1");
    expect(Number(el?.getAttribute("data-lag-minutes"))).toBeGreaterThanOrEqual(0);
  });

  it("(b) detalhe muito à frente do resumo (5 min) continua em 0 — o clamp não é só do -1", () => {
    // Sem `Math.max(0, …)` isto daria -5. Um teste que só cobrisse os 2 s
    // passaria com um `lagMinutes === -1 ? 0 : lagMinutes`, que é o conserto
    // errado.
    const el = render(detalheApos(300), RESUMO);
    expect(el?.getAttribute("data-lag-minutes")).toBe("0");
  });

  it("(c) o número exibido e o do atributo são o MESMO número", () => {
    // O defeito volta se o clamp valer só num dos dois. Com 4 min de atraso o
    // texto nomeia o número, e ele tem de bater com o atributo.
    const el = render(detalheApos(-4 * 60), RESUMO);
    expect(el?.getAttribute("data-lag-minutes")).toBe("4");
    expect(el?.textContent).toContain("4 min mais antigo que o resumo desta página");
  });

  it("(d) carimbo impossível de datar → 0, e nenhum NaN vaza para o atributo", () => {
    const el = render("nao-e-uma-data", RESUMO);
    expect(el?.getAttribute("data-lag-minutes")).toBe("0");
    expect(el?.getAttribute("data-lag-minutes")).not.toBe("NaN");
  });
});

describe("<DetailFreshness /> — o sinal que ele mede continua intacto (ADR-0032)", () => {
  it("(a) abaixo da tolerância: diz a hora do detalhe e cala sobre defasagem", () => {
    expect(DETAIL_LAG_TOLERANCE_MINUTES).toBe(2);
    const el = render(detalheApos(-60), RESUMO);

    expect(el?.textContent).toContain("Detalhe atualizado às");
    expect(el?.textContent).not.toContain("mais antigo");
    expect(el?.getAttribute("data-lag-minutes")).toBe("1");
  });

  it("(b) a partir da tolerância: anuncia a defasagem em texto, não em estilo sutil", () => {
    const el = render(detalheApos(-2 * 60), RESUMO);
    expect(el?.textContent).toContain("2 min mais antigo que o resumo desta página");
  });

  it("(c) ele mede ESCRITA, não o TSE — o mesmo carimbo nos dois lados é silêncio", () => {
    // A lacuna que o ADR-0038 nomeia: se a ingestão parar, os dois relógios
    // continuam avançando em sincronia e este componente fica mudo. É por isso
    // que o banner de `dado_ts` é um SEGUNDO sinal, e não uma reescrita deste.
    const el = render(RESUMO, RESUMO);
    expect(el?.getAttribute("data-lag-minutes")).toBe("0");
    expect(el?.textContent).not.toContain("mais antigo");
    expect(el?.textContent).not.toContain("TSE");
  });
});
