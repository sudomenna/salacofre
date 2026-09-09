// @vitest-environment happy-dom
/**
 * tests/integration/home-page.test.tsx
 *
 * Smoke test do `app/(pres)/page.tsx` — verifica que a home renderiza usando o
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

import HomePage from "@/app/(pres)/page";
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
 * blocos, como o medidor de P(2T) do `<ChancesPanel />`).
 *
 * Desde 2026-09-09 o hero de `multi-1t` é o `<ResultPanel>` do kit e esta
 * função devolve zero na home; ela fica porque os testes de 2T ainda precisam
 * provar que os termômetros também NÃO aparecem lá.
 */
function termometros(doc: Document): Element[] {
  return [
    ...doc.querySelectorAll(
      'section[aria-labelledby="projecao-termometros-heading"] [role="meter"]',
    ),
  ];
}

/** As linhas de candidato do painel de resultado, na ordem do DOM. */
function linhasDeCandidato(doc: Document): Element[] {
  return [...doc.querySelectorAll('[data-testid="candidate-result-row"]')];
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

  // 2026-09-08 — o painel "Unidades federativas" (`<DecisiveUFsGrid>`) saiu da
  // home: não existe no protótipo do kit. A tabela agrupada ("Placar por
  // estado") ficou, por decisão explícita do usuário, e desceu para depois do
  // boletim. A asserção de "UFs decisivas" foi removida com o bloco.
  it("(d) contém a tabela agrupada por margem", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
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

  // 2026-09-09 — em `multi-1t` o `<ApuracaoMeta>` deixou de ser um bloco: o
  // percentual apurado virou a `<Figure>` "Apurado" do `<ResultPanel>`, com a
  // nota "X de Y votos válidos" do kit. O par "UFs apuradas Y/27" e o
  // "HH:MM:SS" saíram deste painel; o horário continua na página, no
  // `<BulletinPanel>`, e o `<ApuracaoMeta>` continua íntegro no modo `binary`.
  it("(f) a figura 'Apurado' traz o percentual e o par apurado/projetado de votos", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const texto = doc.body.textContent ?? "";

    expect(texto).toContain("Apurado");
    // Fixture: 23,4% apurado, Σ votos_atuais = 33.475.321 → 143,1 mi projetados.
    expect(texto).toContain("23,4");
    expect(texto).toContain("33,5 mi de 143,1 mi votos válidos");
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

  it("(j) P(2T)=65% é lida no ChancesPanel, e o TwoRoundIndicator não volta", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    // 2026-09-08 (ADR-0033, D19): o `TwoRoundIndicator` saiu da home. Ele
    // exibia `p_segundo_turno_overall` — a MESMA métrica do primeiro medidor
    // do `ChancesPanel`, que o protótipo (`App.jsx:350`) põe logo abaixo. A
    // home mostrava 65% duas vezes, a dois blocos de distância.
    // O dado continua na página, agora num lugar só.
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="65"');
    expect(html).toContain("Chance de ir ao 2º turno");
    // A frase do indicador removido não pode reaparecer.
    expect(html).not.toContain("65% de chance de ir a 2º turno");
  });

  // -------------------------------------------------------------------------
  // 2026-09-09 — o hero de `multi-1t` é o `<ResultPanel>` do kit (App.jsx:20).
  // Os seis termômetros do ADR-0018 saíram DESTA rota (seguem nas três outras)
  // e, com eles, brancos/nulos e abstenção — consequência declarada e aceita
  // pelo usuário. O que substitui os testes (k)/(k2)/(l) é a prova de que o
  // painel novo mostra a corrida inteira, com o colapso sendo só visual.
  // -------------------------------------------------------------------------

  it("(k) hero 1T = painel de resultado do kit, sem termômetros nesta rota", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));

    expect(termometros(doc)).toHaveLength(0);
    expect(doc.querySelector('[id^="termometro-"]')).toBeNull();

    // Duas figuras no topo do painel: "Apurado" e "Margem <primeiro nome>".
    const texto = doc.body.textContent ?? "";
    expect(texto).toContain("Apurado");
    expect(texto).toContain(`Margem ${NOME_TOP1.split(" ")[0]}`);
    // Barra de maioria com marcador em 50%, uma por base.
    expect(doc.querySelectorAll('[data-testid="vote-bar-marker"]')).toHaveLength(2);
  });

  it("(k2) as duas bases da margem ficam no HTML; a cascata revela a ativa", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));

    const parcial = doc.querySelector('[data-testid="result-margem-parcial"]');
    const proj = doc.querySelector('[data-testid="result-margem-proj"]');
    expect(parcial).not.toBeNull();
    expect(proj).not.toBeNull();
    // Fixture: 43,5 − 38,2 = 5,3 pp parcial; 43,2 − 38,0 = 5,2 pp projetado.
    expect(parcial?.textContent).toContain("+5,3");
    expect(parcial?.textContent).toContain("projeção +5,2 pp");
    expect(proj?.textContent).toContain("+5,2");
  });

  it("(l) TODOS os 11 candidatos da fixture ficam no DOM (ADR-0017 + D21)", async () => {
    const node = await HomePage();
    const html = renderToStaticMarkup(node);
    const doc = parse(html);

    // Uma linha por candidato — inclusive os oito de rank >= 4, que antes
    // viviam num bloco "Composição de Outros" separado.
    expect(linhasDeCandidato(doc)).toHaveLength(FIXTURE_CANDIDATOS.length);
    for (const c of FIXTURE_CANDIDATOS) {
      expect(html).toContain(c.nome);
    }

    // O colapso do kit é aceito como efeito VISUAL (decisão D21) e só isso: as
    // linhas excedentes seguem no DOM, sem `hidden`, sem `<details>` e sem
    // `display: none` — o que os ADRs 0017 / 0029 § 7 / 0033 § 2 proíbem é a
    // remoção de nós, que é o que o kit faz (`rows.slice(0, limit)`).
    const botao = doc.querySelector('main [data-testid="button"][aria-expanded]');
    expect(botao?.textContent).toContain(`Todos os ${FIXTURE_CANDIDATOS.length} candidatos`);
    expect(doc.querySelector("main details")).toBeNull();
    expect(doc.querySelector("main [hidden]")).toBeNull();
    expect(doc.querySelectorAll("main [data-extra-row]")).toHaveLength(
      FIXTURE_CANDIDATOS.length - 6,
    );
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

  // ADR-0033 § 1 emenda a asserção original destes dois testes. O mapa deixou
  // de ser um bloco desta página e virou a coluna persistente do
  // `<AppShellSplit>`, montada por `app/(pres)/layout.tsx` — quem fixa a
  // moldura agora é `tests/unit/shell/persistent-map-frame.test.tsx`. A ordem
  // interna do `<main>` (kicker → painel com o `<h1>` → termômetros → rodapé)
  // continua sendo a do ADR-0029 e continua fixada aqui.
  it("(v) o mapa saiu da página, e a ordem dentro do `<main>` é a do ADR-0029", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    const main = doc.querySelector("main[data-trilha]");
    expect(main).not.toBeNull();

    // 1. Nenhum mapa nesta página. Um segundo choropleth nacional aqui seria o
    //    mesmo mapa duas vezes na mesma tela, e um segundo chunk do MapLibre.
    expect(doc.querySelector('[aria-label="Mapa coroplético do Brasil"]')).toBeNull();
    expect(doc.querySelector('[data-testid="map-view-toggle"]')).toBeNull();

    // 2. Índice de cada marcador na ordem do DOM dentro do <main>.
    const html = main?.innerHTML ?? "";
    const at = (marcador: string) => {
      const i = html.indexOf(marcador);
      expect(i, `marcador ausente: ${marcador}`).toBeGreaterThanOrEqual(0);
      return i;
    };

    const kicker = at("data-trilha-kicker");
    const painel = at("Projeção Atlas Menna · não oficial");
    // 2026-09-09: o marcador de "primeiro conteúdo do painel" deixou de ser o
    // heading dos termômetros e passou a ser a primeira linha de candidato.
    const listaDeCandidatos = at("candidate-result-row");
    const rodape = at("Não oficial. Fonte:");

    // TrilhaKicker imediatamente acima do painel que carrega o <h1>
    // (ADR-0019 preservado dentro da nova ordem).
    expect(kicker).toBeLessThan(painel);
    expect(painel).toBeLessThan(listaDeCandidatos);
    // O rodapé constitucional continua fechando a página.
    expect(listaDeCandidatos).toBeLessThan(rodape);
  });

  it("(x) o painel de resultado é o PRIMEIRO conteúdo da coluna que rola", async () => {
    const node = await HomePage();
    const doc = parse(renderToStaticMarkup(node));
    // O painel de resultado abre a página: é o bloco de maior valor
    // informativo, e a recomposição de 09/09 é a mudança mais provável de o
    // empurrar para baixo por acidente.
    const primeiro = doc.querySelector('main [data-testid="panel"]');
    expect(primeiro?.querySelector('[data-testid="panel-kicker"]')?.textContent).toBe(
      "Projeção Atlas Menna · não oficial",
    );
    expect(primeiro?.querySelector("h1")?.getAttribute("id")).toBe("resultado-heading");
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
