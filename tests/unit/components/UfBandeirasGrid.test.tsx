// @vitest-environment happy-dom
/**
 * tests/unit/components/UfBandeirasGrid.test.tsx — as 27 corridas com bandeira.
 *
 * 🔴 O fio condutor é que **o caminho SEM bandeira é o caminho normal**, não a
 * borda: em 2026-09-18 os 27 arquivos ainda não existem, e é este estado que
 * vai ao ar. Então ele é o primeiro bloco, e é testado como comportamento
 * declarado — não como acidente que "por enquanto funciona".
 *
 * O segundo fio é que a grade **não pode perder dado**. Ela substituiu uma
 * lista textual que carregava maior bancada, empates, vagas sem candidato
 * elegível e placar de cadeiras; trocar isso por um ícone bonito é o defeito
 * que o ADR-0017 nomeia.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { UfBandeirasGrid } from "@/components/blocks/UfBandeirasGrid";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

const resumos = {
  SP: { detalhe: "maior bancada: PL (19)", vagas: "70 de 70" },
  RR: { detalhe: "aguardando apuração", vagas: "vagas não publicadas" },
};

describe("UfBandeirasGrid — os 27 estados, sempre", () => {
  it("renderiza 27 links, inclusive os que não estão no payload", () => {
    // Geografia é identidade e fala; progresso de apuração é medição e cala.
    // Um estado ausente da grade se lê como estado que não elege ninguém.
    const doc = parse(<UfBandeirasGrid cargo={6} resumos={resumos} />);
    expect(doc.querySelectorAll('[data-testid="corrida-uf"]')).toHaveLength(27);
  });

  it("estado sem linha no payload diz que aguarda — nunca um zero (RF-124)", () => {
    const doc = parse(<UfBandeirasGrid cargo={6} resumos={resumos} />);
    const ac = doc.querySelector('[data-uf="AC"]');
    expect(ac?.textContent).toContain("aguardando apuração");
    expect(ac?.textContent).toContain("vagas não publicadas");
    expect(ac?.textContent, "imprimiu um placar que ninguém mediu").not.toMatch(/\b0 de 0\b/);
  });

  // 🔴 MUTAÇÃO: apagar `resumos` do componente e deixar só bandeira + sigla —
  // que é literalmente o que o plano desta tarefa pedia ("27 links com bandeira
  // + sigla"). O teste morre: o dado que a lista anterior carregava sumiu.
  it("não perde nenhum dado que a lista de texto carregava", () => {
    const doc = parse(<UfBandeirasGrid cargo={6} resumos={resumos} />);
    const sp = doc.querySelector('[data-uf="SP"]');
    expect(sp?.textContent).toContain("maior bancada: PL (19)");
    expect(sp?.querySelector('[data-testid="corrida-vagas"]')?.textContent).toBe("70 de 70");
    expect(doc.querySelector('[data-uf="RR"] [data-testid="corrida-vagas"]')?.textContent).toBe(
      "vagas não publicadas",
    );
  });

  it("o destino do link sai da tabela canônica de cargos, não de literal", () => {
    const doc = parse(<UfBandeirasGrid cargo={6} resumos={resumos} />);
    expect(doc.querySelector('[data-uf="SP"]')?.getAttribute("href")).toBe(
      "/uf/SP/deputado-federal",
    );
    // Cargo 3 muda o slug — se o componente cravasse a rota, isto não mudaria.
    const gov = parse(<UfBandeirasGrid cargo={3} />);
    expect(gov.querySelector('[data-uf="SP"]')?.getAttribute("href")).toBe("/uf/SP/governador");
  });
});

describe("UfBandeirasGrid — 🔴 sem bandeira, o item degrada para texto", () => {
  // 🔴 MUTAÇÃO: remover a guarda de existência de `<UfFlag>` (o
  // `if (!temBandeira(chave)) return null`). Passam a sair 27 `<svg>` com
  // `<use href="#uf-flag-XX">` apontando para `<symbol>` que não existe —
  // caixas vazias no layout, que é justamente o "ícone quebrado" que o
  // requisito proíbe.
  it("hoje (fonte vazia) não há `<svg>` de bandeira nem `<use>` órfão", () => {
    const doc = parse(<UfBandeirasGrid cargo={6} resumos={resumos} />);
    expect(doc.querySelectorAll('[data-testid="uf-flag"]')).toHaveLength(0);
    expect(doc.querySelectorAll("use")).toHaveLength(0);
    expect(doc.querySelectorAll('[data-testid="uf-flag-sprite"]')).toHaveLength(0);
  });

  it("e mesmo assim nome por extenso e sigla continuam em TEXTO, nos 27", () => {
    // É isto que reconcilia a grade com RF-162/163: o rótulo é texto. A
    // bandeira, quando chegar, é reconhecimento, não informação.
    const doc = parse(<UfBandeirasGrid cargo={6} />);
    const ac = doc.querySelector('[data-uf="AC"]');
    expect(ac?.textContent).toContain("Acre");
    expect(ac?.textContent).toContain("AC");
    expect(ac?.getAttribute("aria-label")).toBe("Acre (AC)");
    expect(doc.querySelector('[data-uf="SP"]')?.textContent).toContain("São Paulo");
  });
});

describe("UfBandeirasGrid — com bandeiras na fonte, o sprite entra uma vez só", () => {
  it("emite um `<symbol>` por bandeira e um `<use>` por item que a tem", async () => {
    // A fonte gerada é substituída para exercitar o outro ramo — os arquivos
    // reais ainda não existem, e esperar por eles deixaria metade do
    // componente sem teste até uma data que ninguém controla.
    vi.resetModules();
    vi.doMock("@/lib/data/uf-flags.generated", () => ({
      UF_FLAG_VIEWBOX: "0 0 70 100",
      UF_FLAGS: {
        SP: { viewBox: "0 0 700 1000", corpo: '<path id="ufflag-SP-a" d="M0 0h1v1z"/>' },
        RJ: { viewBox: "0 0 700 1000", corpo: '<path id="ufflag-RJ-a" d="M0 0h1v1z"/>' },
      },
    }));
    const { UfBandeirasGrid: Grade } = await import("@/components/blocks/UfBandeirasGrid");
    const doc = parse(<Grade cargo={6} />);

    expect(doc.querySelectorAll('[data-testid="uf-flag-sprite"]')).toHaveLength(1);
    expect(doc.querySelectorAll("symbol")).toHaveLength(2);
    expect(doc.querySelectorAll('[data-testid="uf-flag"]')).toHaveLength(2);
    expect(doc.querySelector('[data-uf="SP"] use')?.getAttribute("href")).toBe("#uf-flag-SP");

    // As 25 sem arquivo continuam sem `<svg>` — a degradação é por item.
    expect(doc.querySelector('[data-uf="AC"] svg')).toBeNull();
    expect(doc.querySelector('[data-uf="AC"]')?.textContent).toContain("Acre");

    // A bandeira é decorativa: o nome do estado já está em texto ao lado, e um
    // `aria-label` na imagem faria o leitor de tela dizê-lo duas vezes por item.
    const flag = doc.querySelector('[data-testid="uf-flag"]');
    expect(flag?.getAttribute("aria-hidden")).toBe("true");
    expect(flag?.getAttribute("focusable")).toBe("false");

    vi.doUnmock("@/lib/data/uf-flags.generated");
    vi.resetModules();
  });
});
