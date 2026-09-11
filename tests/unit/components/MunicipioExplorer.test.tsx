// @vitest-environment happy-dom
/**
 * tests/unit/components/MunicipioExplorer.test.tsx
 *
 * A folha do município passou a ter QUATRO gatilhos em 2026-09-10 (tabela,
 * grade, MAPA e o × que fecha) e um só estado, no store de módulo
 * `components/shared/municipio-sheet-store.ts`. O que estes testes protegem é
 * o contrato desse estado: quem escreve nele abre a folha certa, e um
 * `cod_ibge` que o payload não cobre não abre folha nenhuma.
 *
 * ## Por que este arquivo monta de verdade em vez de `renderToStaticMarkup`
 *
 * O resto da suíte de componentes renderiza estático, e aqui isso não serve:
 * o `useStore` do Zustand v5 resolve `useSyncExternalStore` pelo
 * `getInitialState()` no caminho de servidor, então um `select()` feito antes
 * do render seria invisível — a folha nunca apareceria e o teste passaria
 * verde medindo nada. Montamos no cliente (`createRoot` + `act`, happy-dom),
 * que é o único jeito de o store ser observado. É o mesmo caminho do clique
 * real do mapa (`ChoroplethMapUF` → `useMunicipioSheetStore.getState().select`),
 * menos o MapLibre — o handler do mapa não faz nada além dessa chamada, então
 * o que fica fora daqui é só a entrega do evento pelo canvas WebGL, que o
 * `tests/e2e/municipio-sheet.spec.ts` alcança pelo caminho da tabela.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MunicipioExplorer } from "@/components/blocks/MunicipioExplorer";
import type { MunicipioRow } from "@/components/blocks/MunicipioTable";
import { useMunicipioSheetStore } from "@/components/shared/municipio-sheet-store";
import type { EdgeUfCandidate, EdgeUfMunicipio } from "@/lib/edge-config/types";

// biome-ignore lint/suspicious/noExplicitAny: flag global do ambiente de `act`
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function cand(over: Partial<EdgeUfCandidate>): EdgeUfCandidate {
  return {
    id: 0,
    nome: "",
    partido: "",
    cor: "var(--color-cand-other)",
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    ci95: { lower: 0, upper: 0 },
    ...over,
  };
}

// A folha lê destes candidatos apenas nome, partido e cor: os percentuais dela
// saem de `votos_reportados` do município, não do resumo da UF.
const candidatos: EdgeUfCandidate[] = [
  cand({ id: 13, nome: "Candidato PT", partido: "PT", cor: "var(--party-pt)" }),
  cand({ id: 22, nome: "Candidato PL", partido: "PL", cor: "var(--party-pl)" }),
];

const municipios: EdgeUfMunicipio[] = [
  {
    cod_ibge: "3550308",
    nome: "São Paulo",
    pct_apurado: 72.5,
    lider: { candidato_id: 13, partido: "PT", votos: 1200, margem_pp: 20 },
    votos_reportados: { 13: 1200, 22: 800 },
  },
  {
    cod_ibge: "3509502",
    nome: "Campinas",
    pct_apurado: 55,
    lider: { candidato_id: 22, partido: "PL", votos: 500, margem_pp: 25 },
    votos_reportados: { 13: 300, 22: 500 },
  },
];

const rows: MunicipioRow[] = municipios.map((m) => ({
  cod_ibge: m.cod_ibge,
  nome: m.nome,
  lider: m.lider.candidato_id,
  liderCor: m.lider.candidato_id === 13 ? "var(--party-pt)" : "var(--party-pl)",
  liderNome: m.lider.partido,
  margemPp: m.lider.margem_pp,
  pctApurado: m.pct_apurado,
  votosReportados: Object.values(m.votos_reportados).reduce((a, b) => a + b, 0),
}));

let container: HTMLElement;
let root: Root;

function montar() {
  act(() => {
    root.render(
      <MunicipioExplorer
        ufSigla="SP"
        municipios={municipios}
        rows={rows}
        candidatos={candidatos}
      />,
    );
  });
}

/** O que o clique do mapa faz — a única coisa que ele faz. */
function cliqueNoMapa(codIbge: string) {
  act(() => {
    useMunicipioSheetStore.getState().select(codIbge);
  });
}

function folha() {
  return container.querySelector('[data-testid="sheet"]');
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useMunicipioSheetStore.getState().clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("<MunicipioExplorer /> — a folha aberta pelo mapa", () => {
  it("(a) sem seleção, nenhuma folha no DOM", () => {
    montar();
    expect(folha()).toBeNull();
  });

  it("(b) o clique no mapa abre A folha daquele município — uma só", () => {
    montar();
    cliqueNoMapa("3509502");

    // UMA folha. O gatilho do mapa reaproveita a que a tabela já usava; não
    // existe uma segunda folha para o caminho do mapa.
    expect(container.querySelectorAll('[data-testid="sheet"]')).toHaveLength(1);
    expect(folha()?.textContent).toContain("Campinas");
    expect(folha()?.textContent).toContain("Município · SP");
  });

  it("(c) município sem dado no payload é no-op — o mapa desenha mais do que o payload cobre", () => {
    montar();
    cliqueNoMapa("3500000");
    // Sem entrada em `municipios` não há nome nem apurado para titular a
    // folha; abrir um diálogo vazio comunicaria menos que não abrir.
    expect(folha()).toBeNull();
  });

  it("(d) fechar a folha limpa o store — o próximo clique reabre", () => {
    montar();
    cliqueNoMapa("3550308");
    const fechar = container.querySelector<HTMLElement>('[data-testid="sheet-close"]');
    act(() => fechar?.click());

    expect(folha()).toBeNull();
    expect(useMunicipioSheetStore.getState().codIbge).toBeNull();

    cliqueNoMapa("3550308");
    expect(folha()).not.toBeNull();
  });

  it("(e) desmontar (trocar de rota) fecha a folha — ela não reabre sozinha depois", () => {
    montar();
    cliqueNoMapa("3550308");
    expect(folha()).not.toBeNull();

    act(() => root.unmount());
    expect(useMunicipioSheetStore.getState().codIbge).toBeNull();

    // Remonta como a próxima página faria: nasce fechada.
    root = createRoot(container);
    montar();
    expect(folha()).toBeNull();
  });

  it("(f) a folha traz o apurado e as linhas de candidato, sem coluna de projeção", () => {
    montar();
    cliqueNoMapa("3550308");

    expect(folha()?.textContent).toContain("Apurado");
    expect(container.querySelectorAll('[data-testid="municipio-sheet-row"]')).toHaveLength(2);
    // 1200 de 2000 = 60,0%. Percentual sobre o apurado NO município.
    expect(folha()?.textContent).toContain("60,0%");
    // Não existe projeção municipal no payload, e a folha diz isso em vez de
    // repetir o parcial numa coluna "PROJ." como o protótipo faz.
    expect(folha()?.textContent).toContain("não existe projeção municipal");
    expect(folha()?.textContent).not.toContain("PROJ.");
  });

  it("(g) declara que a segunda medida é voto apurado, não eleitorado", () => {
    // O `Figure` "Eleitores" do protótipo não pode existir: `EdgeUfMunicipio`
    // não publica eleitorado por município. A folha põe o que existe (votos
    // apurados) e diz na nota que é isso.
    montar();
    cliqueNoMapa("3550308");

    expect(folha()?.textContent).toContain("Votos apurados");
    expect(folha()?.textContent).toContain("não publica o eleitorado do município");
    expect(folha()?.textContent).not.toContain("Eleitores");
  });
});
