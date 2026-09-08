// @vitest-environment happy-dom
/**
 * tests/integration/home-page.test.tsx
 *
 * Smoke test do `app/page.tsx` — verifica que a home renderiza usando o
 * fixture estável e contém todos os componentes esperados (RF-021..030.6).
 *
 * Não é E2E (sem browser real). Apenas valida a árvore SSR mínima e a
 * presença de signals dos componentes principais — guard contra regressões
 * estruturais (esquecer de mountar um block).
 *
 * Nomes de candidatos são parametrizados via fixture pra evitar acoplamento
 * com nomes específicos (fixture S05 usa "Candidato PT" / "Candidato PL"
 * em vez dos nomes históricos S04 "Lula"/"Bolsonaro").
 *
 * S07/Bloco 2 (ADR-0029) — "mapa primeiro"
 *   - A ordem dos blocos mudou; o CONTEÚDO não. O teste (v) fixa a nova
 *     ordem, e o (r) continua fixando as duas invariantes estruturais
 *     (`Footer` dentro do `<main data-trilha>`).
 *   - O `<h1>` deixou de ser "Apuração Presidencial 2026" acima da dobra e
 *     passou a ser o título do painel de resultado ("Projeção Atlas Menna" /
 *     "Resultado parcial"), na escala das outras seções. Continua único.
 *   - O `<LiveBadge>` da página saiu: o selo agora mora no `<TopBar>` do
 *     shell e é alimentado pela custom property que a página publica.
 *
 * S07/Fase 2 (ADR-0018 + ADR-0019)
 *   - 1T (fixture default, 11 candidatos): hero são os seis termômetros;
 *     `HeadlineScore`, `CandidateRanking` e a agulha `national-1t` saem.
 *   - 2T: a página lê `projection-current-t2.json` quando
 *     `FIXTURE_VARIANT=t2` — o único ponto de injeção do RSC, que não recebe
 *     props. Ali o layout `binary` continua idêntico ao de S06.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import fixture from "@/tests/fixtures/edge-config/projection-current.json" with { type: "json" };

// Top-2 names do fixture — lidos dinâmicamente pra resistir a renomes.
const FIXTURE_CANDIDATOS = (
  fixture as { national: { candidatos: Array<{ id: number; nome: string }> } }
).national.candidatos;
const NOME_TOP1 = FIXTURE_CANDIDATOS[0]?.nome ?? "Candidato PT";
const NOME_TOP2 = FIXTURE_CANDIDATOS[1]?.nome ?? "Candidato PL";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Termômetros do hero — meters dentro da seção do bloco (não os de outros
 * blocos, como o medidor de P(2T) do `<TwoRoundIndicator />`). */
function termometros(doc: Document): Element[] {
  return [
    ...doc.querySelectorAll(
      'section[aria-labelledby="projecao-termometros-heading"] [role="meter"]',
    ),
  ];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HomePage (integration / smoke)", () => {
  it("(a) o h1 é o título do painel de resultado, e os top-2 da fixture aparecem", async () => {
    // Server Component async — chamamos manualmente
    const node = await HomePage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain(NOME_TOP1);
    expect(html).toContain(NOME_TOP2);

    // ADR-0029 § 5: em multi-1t o <h1> é o título do PAINEL de resultado, não
    // mais um título gigante acima da dobra — e continua havendo exatamente
    // um. Os dois textos ficam no DOM; `data-view-only` (cascata do shell)
    // revela o da base ativa.
    const doc = parse(html);
    const h1s = doc.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.getAttribute("id")).toBe("resultado-heading");
    expect(h1s[0]?.textContent).toContain("Projeção Atlas Menna");
    expect(h1s[0]?.textContent).toContain("Resultado parcial");
    expect(
      [...h1s[0]!.querySelectorAll("[data-view-only]")].map((s) =>
        s.getAttribute("data-view-only"),
      ),
    ).toEqual(["parcial", "proj"]);
  });

  it("(b) contém o footer constitucional § 1", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Não oficial");
    expect(html).toContain("TSE");
  });

  it("(c) em 1T NÃO renderiza a agulha nacional (ADR-0018 — P(2T) já está no TwoRoundIndicator)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("Forecast nacional");
  });

  it("(d) contém UFs decisivas e tabela agrupada por margem", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("UFs decisivas");
    expect(html).toContain("Resultados por estado");
    // siglas conhecidas do fixture
    expect(html).toContain(">SP<");
    expect(html).toContain(">MG<");
  });

  it("(e) contém ForecastTransparency (constituição § 8)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("O que está movendo o forecast");
  });

  it("(f) ApuracaoMeta — timestamp + ufs apuradas", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Apurado");
    expect(html).toContain("/27");
  });

  it("(g) publica o rótulo de apuração que alimenta o selo do TopBar (ADR-0029 § 4)", async () => {
    // O selo migrou para o `<TopBar>`, que é do layout e não lê dado. A ponte
    // é uma custom property em `:root` — ver `components/layout/ShellLiveBadge.tsx`.
    const node = await HomePage();
    const html = renderToStaticMarkup(node);

    // React NÃO escapa entidades dentro de `<style>` (verificado no markup
    // gerado) — se algum dia passar a escapar, `&quot;` chegaria ao CSS como
    // seis caracteres literais e a regra inteira quebraria em silêncio. Daí a
    // asserção ser sobre o literal exato, com aspas.
    const m = html.match(/--live-pct-label:"([^"]*)"/);
    expect(m, "a página precisa publicar --live-pct-label para o selo do TopBar").not.toBeNull();
    // Fixture: 23,4% apurado.
    expect(m?.[1]).toBe("23,4% apurado");
    // E o valor sanitizado nunca pode fechar o literal CSS.
    expect(m?.[1]).not.toMatch(/["\\]/);
  });

  // -------------------------------------------------------------------------
  // S05/F4 — Multi-candidato (Fase 4: pages dispatch + integração)
  // Fixture é 1T (turno=1) com 11 candidatos e P(2T)=0.65 → modo multi-1t.
  // -------------------------------------------------------------------------

  it("(h) TurnoBadge mostra '1º turno' no header (multi-1t)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("1º turno");
    expect(html).toContain('aria-label="Turno atual: 1º turno"');
  });

  it("(i) RaceTypeIndicator mostra contagem de candidatos em 1T", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Fixture S05 tem 11 candidatos com pct >= 0,5% (todos passam o
    // threshold de 0,5% do RaceTypeIndicator em 1T).
    expect(html).toMatch(/Disputa entre \d+ candidatos/);
  });

  it("(j) TwoRoundIndicator renderiza com P(2T)=65% (fixture)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // Fixture: p_segundo_turno_overall = 0.65 → 65%, fora do gate trivial
    // (|0.65 − 0.5| > 0.1), então o medidor renderiza.
    expect(html).toContain("65% de chance de ir a 2º turno");
    // `role="meter"` com aria-valuenow=65
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="65"');
  });

  it("(k) hero 1T = seis termômetros na ordem canônica (ADR-0018)", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));

    expect(doc.body.textContent).toContain("Projeção do 1º turno");
    expect(termometros(doc)).toHaveLength(6);

    // Rank 1..3 pelo id do candidato na fixture + os três agregados.
    const ids = [1, 2, 3].map((r) => FIXTURE_CANDIDATOS[r - 1]?.id);
    for (const id of ids) {
      expect(doc.querySelector(`#termometro-cand-${id}`)).not.toBeNull();
    }
    expect(doc.querySelector("#termometro-outros")).not.toBeNull();
    expect(doc.querySelector("#termometro-brancos-nulos")).not.toBeNull();
    expect(doc.querySelector("#termometro-abstencao")).not.toBeNull();
  });

  it("(k2) fixture traz participacao → nenhum termômetro em 'aguardando'", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const estados = termometros(doc).map(
      (m) => m.parentElement?.getAttribute("data-estado") ?? "?",
    );
    expect(estados).toEqual(Array(6).fill("projetado"));

    // Denominador misto rotulado (D3): as três bases aparecem no bloco.
    const bases = [
      `#termometro-cand-${FIXTURE_CANDIDATOS[0]?.id}`,
      "#termometro-brancos-nulos",
      "#termometro-abstencao",
    ].map((sel) => doc.querySelector(sel)?.getAttribute("data-base"));
    expect(bases).toEqual(["votaveis", "comparecimento", "eleitores_instalados"]);
  });

  it("(l) 'Composição de Outros' lista os candidatos de rank >= 4 (ADR-0017 — sempre no DOM)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("Composição de Outros");
    // Fixture rank 4..11: PDT, UNIÃO, NOVO, PTB, UP, PCB, PSTU, DC.
    expect(html).toContain("Candidato PDT");
    expect(html).toContain("Candidato NOVO");
    expect(html).toContain("Candidato DC");
  });

  it("(m) em 1T o HeadlineScore e o CandidateRanking saem do fluxo (ADR-0018)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).not.toContain("headline-score-heading");
    expect(html).not.toMatch(/lidera, Candidato MDB briga pela 2ª vaga/);
    // O rank 3 continua visível — mas como termômetro do hero.
    expect(html).toContain("Candidato MDB");
  });

  it("(n) <main data-trilha='pres'> + kicker da trilha presidencial (ADR-0019)", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("pres");
    const kicker = doc.querySelector("[data-trilha-kicker]");
    expect(kicker?.getAttribute("data-trilha-kicker")).toBe("pres");
    expect(kicker?.textContent?.replace(/\s+/g, " ").trim()).toBe("PRESIDÊNCIA · Brasil");
  });

  // -------------------------------------------------------------------------
  // S07/Bloco 1 (ADR-0025) — gramática editorial: seções em <Panel>, três
  // blocos novos, e as duas invariantes estruturais da página.
  // -------------------------------------------------------------------------

  it("(r) o <Footer> continua DENTRO do <main data-trilha> desta página", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));

    const main = doc.querySelector("main[data-trilha]");
    expect(main).not.toBeNull();
    // A pergunta não é "existe um footer", é "ele está dentro do main" — o
    // shell global (app/layout.tsx) não fornece nenhum dos dois.
    const footer = main?.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("Não oficial");
    expect(doc.querySelectorAll("footer")).toHaveLength(1);
  });

  it("(s) todo bloco do fluxo está dentro de um <Panel>, e nenhum Panel fica vazio", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));

    const panels = Array.from(doc.querySelectorAll('[data-testid="panel"]'));
    expect(panels.length).toBeGreaterThanOrEqual(8);
    for (const p of panels) {
      // Um Panel sem conteúdo desenharia um filete órfão — é exatamente o que
      // acontece se um bloco com gate próprio (RunoffScenarios) for envolvido
      // sem consultar o gate antes.
      expect((p.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("(t) os três blocos novos renderizam com dado do fixture", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const texto = doc.body.textContent ?? "";

    // Boletim (RF-026 + RF-044 por template)
    expect(doc.querySelector("#bulletin-panel-heading")?.textContent).toBe(
      "O que está acontecendo agora",
    );
    expect(doc.querySelectorAll('[data-testid="bulletin-list"] > li').length).toBeGreaterThan(0);

    // Redutos (RF-024 / RF-030.6) — uma coluna por candidato do top 3
    expect(doc.querySelector("#strongholds-panel-heading")?.textContent).toBe(
      "Onde cada força é mais forte",
    );
    expect(doc.querySelectorAll('[data-testid="stronghold-column"]')).toHaveLength(3);

    // O que falta apurar (RF-026 / RF-024)
    expect(doc.querySelector("#remaining-panel-heading")?.textContent).toBe(
      "O que ainda falta apurar",
    );
    expect(doc.querySelectorAll('[data-testid="remaining-table"] tbody tr').length).toBeGreaterThan(
      0,
    );

    // Fixture: 23,4% apurado → 76,6% por apurar; 14/27 UFs com boletim.
    expect(texto).toContain("76,6%");
  });

  it("(u) a projeção segue rotulada como não oficial já no kicker da 1ª seção (constituição § 1)", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const kickers = Array.from(doc.querySelectorAll('[data-testid="panel-kicker"]')).map(
      (k) => k.textContent,
    );
    expect(kickers[0]).toBe("Projeção Atlas Menna · não oficial");
  });

  // -------------------------------------------------------------------------
  // S07/Bloco 2 (ADR-0029) — mapa primeiro.
  // -------------------------------------------------------------------------

  it("(v) a ordem dos blocos é a do ADR-0029: ticker, mapa, banner, painel de resultado", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const main = doc.querySelector("main[data-trilha]");
    expect(main).not.toBeNull();

    // Índice de cada marcador na ordem do DOM dentro do <main>.
    const html = main?.innerHTML ?? "";
    const at = (marcador: string) => {
      const i = html.indexOf(marcador);
      expect(i, `marcador ausente: ${marcador}`).toBeGreaterThanOrEqual(0);
      return i;
    };

    const mapa = at("Mapa coroplético do Brasil");
    const kicker = at("data-trilha-kicker");
    const painel = at("Projeção Atlas Menna · não oficial");
    const termometros = at("projecao-termometros-heading");
    const rodape = at("Não oficial. Fonte:");

    // 1. O mapa é o primeiro bloco de conteúdo — antes do painel de resultado
    //    e, portanto, antes dos termômetros (que continuam existindo,
    //    ADR-0029 § 6: mudaram de posição, não de conteúdo).
    expect(mapa).toBeLessThan(painel);
    expect(mapa).toBeLessThan(termometros);
    // 2. TrilhaKicker imediatamente acima do painel que carrega o <h1>
    //    (ADR-0019 preservado dentro da nova ordem).
    expect(mapa).toBeLessThan(kicker);
    expect(kicker).toBeLessThan(painel);
    // 3. O rodapé constitucional continua fechando a página.
    expect(termometros).toBeLessThan(rodape);
  });

  it("(w) o mapa hero reserva a altura de viewport, e o esqueleto reserva a MESMA", async () => {
    // Se o esqueleto reservasse 420px fixos e o mapa `clamp(400px, 52vh, ...)`,
    // o chunk do MapLibre chegando empurraria a página inteira (CLS).
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    expect(html).toContain("clamp(400px, 52vh, 520px)");
    expect(html).toContain("--map-height");
  });

  it("(x) os seis termômetros do ADR-0018 continuam abaixo do mapa, intactos", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    // Mesma asserção do teste (k), repetida aqui de propósito: a recomposição
    // do ADR-0029 é a mudança mais provável de derrubar o hero por acidente.
    expect(termometros(doc)).toHaveLength(6);
    expect(doc.querySelector("#termometro-brancos-nulos")).not.toBeNull();
    expect(doc.querySelector("#termometro-abstencao")).not.toBeNull();
  });

  it("(y) 'Composição de Outros' traz parcial E projeção por candidato (ADR-0029 § 7)", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const linhas = [...doc.querySelectorAll("[data-testid='candidate-result-row']")];

    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      const celulas = [...linha.querySelectorAll("[data-view-cell]")].map((c) =>
        c.getAttribute("data-view-cell"),
      );
      expect(celulas).toEqual(["parcial", "proj"]);
    }
    // E nada de collapsible entrou junto com o formato do kit (ADR-0017).
    expect(doc.querySelector("main details")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // S07/Fase 2 — modo binary (2º turno) permanece o layout de S06.
  // -------------------------------------------------------------------------

  describe("modo binary (2º turno, FIXTURE_VARIANT=t2)", () => {
    it("(o) renderiza a agulha nacional e o HeadlineScore, sem termômetros", async () => {
      vi.stubEnv("FIXTURE_VARIANT", "t2");
      const node = await HomePage();
      const doc = parse(renderToStaticMarkup(node));

      expect(doc.body.textContent).toContain("Forecast nacional");
      expect(doc.querySelector("#headline-score-heading")).not.toBeNull();
      expect(doc.body.textContent).not.toContain("Projeção do 1º turno");
      expect(termometros(doc)).toHaveLength(0);
      expect(doc.querySelector('[id^="termometro-"]')).toBeNull();
    });

    it("(p) badge de 2º turno e trilha presidencial preservados", async () => {
      vi.stubEnv("FIXTURE_VARIANT", "t2");
      const node = await HomePage();
      const doc = parse(renderToStaticMarkup(node));

      expect(doc.body.textContent).toContain("2º turno");
      expect(doc.querySelector("main")?.getAttribute("data-trilha")).toBe("pres");
      // O <h1> continua sendo o do HeadlineScore — e continua único.
      expect(doc.querySelectorAll("h1")).toHaveLength(1);
      expect(doc.querySelector("h1")?.getAttribute("id")).toBe("headline-score-heading");
    });

    it("(q) 'Composição de Outros' não aparece em 2T (só há dois candidatos)", async () => {
      vi.stubEnv("FIXTURE_VARIANT", "t2");
      const node = await HomePage();
      const html = renderToStaticMarkup(node);
      expect(html).not.toContain("Composição de Outros");
    });
  });
});
