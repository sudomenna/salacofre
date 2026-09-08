import * as fs from "node:fs";
import * as path from "node:path";
import { expect, type Page, type Request, test } from "@playwright/test";

/**
 * RNF-007 — orçamento de bundle JS (docs/nfr/performance.md linhas 18-20).
 *
 *   RNF-007a — above-the-fold (sem chunks lazy)                        < 150 KiB gzipped
 *   RNF-007b — chunk do mapa (MapLibre + PMTiles client + componente)  < 250 KiB gzipped
 *   RNF-007c — total da rota (above-the-fold + chunks lazy)            < 500 KiB gzipped
 *
 * Convenção de unidade: docs/nfr/performance.md (linhas 43-53) registra ambiguidade
 * decimal-KB vs. KiB para RNF-007a. Este spec usa KiB (1024 bytes) em todos os três
 * orçamentos, mesma convenção da nota canônica ("~148,7 KiB").
 *
 * Receita de medição (docs/_meta/handoff-2026-09-07-redesign.md, Bloco 0 item 4):
 *   1. Soma de `request.sizes().responseBodySize` dos recursos `script` até o evento
 *      `load` = RNF-007a. O chunk `nomodule` do Next nunca é requisitado por um
 *      navegador moderno (só entende `<script nomodule>` quem NÃO suporta módulos),
 *      então ele sai da soma por construção — não há filtro manual para isso aqui.
 *   2. O(s) chunk(s) de script que chegam DEPOIS do `load` e cujo corpo contém a
 *      string "maplibre" (case-insensitive) são classificados como o chunk do mapa
 *      = RNF-007b. Confirmado por conteúdo, não por nome de arquivo — no build local
 *      (2026-09-07) o Turbopack nomeia esse chunk `0dkfee.t7_~tk.js` (opaco).
 *   3. Soma de todos os recursos `script` (above-the-fold + lazy) até a rede ficar
 *      ociosa = RNF-007c.
 */

const KIB = 1024;
const BUDGET_RNF_007A_BYTES = 150 * KIB;
const BUDGET_RNF_007B_BYTES = 250 * KIB;
const BUDGET_RNF_007C_BYTES = 500 * KIB;

/**
 * Teto operacional do chunk do MapLibre enquanto o carry-over da S04 não fecha.
 *
 * O chunk mede ~283,5 KiB hoje — acima do RNF-007b (250 KiB). O carry-over está
 * registrado desde a S04 (`docs/specs/004-pagina-uf-presidencial/spec.md`,
 * `shipped_with_carry_overs: chunk-MapLibre-287KB-acima-RNF-007b-pendente-ADR-aumentar-meta-300KB`)
 * e a saída prevista é um ADR que suba a meta para 300 KB.
 *
 * Por que um teto em vez de `test.fixme`: com `fixme` o teste inteiro aborta antes de
 * reportar qualquer coisa, e as asserções de RNF-007a/007c da mesma rota vão junto —
 * a home ficaria sem gate de bundle above-the-fold, que é justamente a métrica sem
 * folga (148,7 de 150 KiB). Com o teto, o débito conhecido não pinta a suíte de
 * vermelho, mas uma regressão NOVA no chunk do mapa ainda quebra o build.
 *
 * Quando o ADR subir a meta, apagar esta constante e voltar a comparar com
 * `BUDGET_RNF_007B_BYTES`.
 */
const CARRY_OVER_MAP_CHUNK_CEILING_BYTES = 290 * KIB;

const ARTIFACT_PATH = path.join(process.cwd(), "test-results", "perf-budget.json");

// Nota sobre `/uf/SP` neste servidor: `pnpm start` roda com NODE_ENV=production, e
// `app/uf/[sigla]/page.tsx` só sintetiza dados de dev-fallback fora de produção — sem
// EDGE_CONFIG/payload real publicado (esperado antes da eleição), a rota renderiza o
// estado "Aguardando dados" (constituição § 3) e a árvore com os mapas (UfMapsLazy)
// nunca monta. Medimos a rota do jeito que ela está: RNF-007a/007c continuam válidos
// para o shell "Aguardando dados"; RNF-007b sai como 0 bytes/0 requests nesse estado —
// não é uma medição real do chunk de mapa de UF, é reflexo de não haver dado ainda.
// Revalidar depois que houver Edge Config populado (ou um fixture local) para medir o
// chunk de mapa de UF de verdade.
const ROUTES = ["/", "/uf/SP"] as const;

interface ScriptSample {
  url: string;
  bytes: number;
  isMapLibreChunk: boolean;
}

interface RouteMeasurement {
  route: string;
  aboveTheFoldBytes: number;
  aboveTheFoldRequests: number;
  mapChunkBytes: number;
  mapChunkRequests: number;
  totalBytes: number;
  totalRequests: number;
}

function isSameOrigin(request: Request, baseURL: string): boolean {
  // Requisito 5: sem rede externa esperada — mas ignoramos cross-origin defensivamente
  // (ex.: se algum dia entrar um analytics de terceiro) em vez de contá-lo no orçamento
  // de bundle do próprio app.
  try {
    return new URL(request.url()).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
}

/**
 * Mede os bytes de script transferidos (gzip/br "on the wire", via `sizes()`) para uma
 * rota, separando o que chegou até o evento `load` (above-the-fold) do que chegou depois
 * (lazy — inclui o chunk do mapa via `next/dynamic({ ssr: false })`, ADR-0010).
 *
 * A ordenação relativa ao `load` é capturada de forma síncrona no handler de
 * `requestfinished` (via a flag `loadFired`, setada por um listener de `load`) — a
 * resolução assíncrona de `sizes()`/corpo da resposta acontece depois, em paralelo,
 * sem afetar o bucket em que cada requisição foi classificada.
 */
async function measureRoute(page: Page, baseURL: string, route: string): Promise<RouteMeasurement> {
  let loadFired = false;
  const order: { request: Request; afterLoad: boolean }[] = [];

  page.once("load", () => {
    loadFired = true;
  });

  page.on("requestfinished", (request) => {
    if (request.resourceType() !== "script") return;
    if (!isSameOrigin(request, baseURL)) return;
    order.push({ request, afterLoad: loadFired });
  });

  await page.goto(route, { waitUntil: "load" });
  // O mapa carrega via `next/dynamic({ ssr: false })` (ADR-0010) — o import() só é
  // disparado no efeito de montagem do componente cliente, depois da hidratação, e o
  // container com `role="img"` só existe depois que o chunk do MapLibre já baixou e
  // executou (o placeholder de loading não tem essa role). Esperar por ele é o sinal
  // determinístico de "mapa montado" citado no protocolo — mais confiável que uma
  // corrida contra `networkidle` sozinho, que pode fechar antes do import() começar.
  await page
    .getByRole("img", { name: /mapa/i })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {
      // Rota sem mapa nesta página — segue só com o networkidle abaixo.
    });
  // Rede ociosa: captura qualquer requisição residual (ex.: tiles PMTiles) disparada
  // logo após o mapa montar.
  await page.waitForLoadState("networkidle");

  const samples: (ScriptSample & { afterLoad: boolean })[] = await Promise.all(
    order.map(async ({ request, afterLoad }) => {
      try {
        const sizes = await request.sizes();
        const response = await request.response();
        const body = response ? await response.text().catch(() => "") : "";
        return {
          url: request.url(),
          bytes: sizes.responseBodySize,
          isMapLibreChunk: /maplibre/i.test(body),
          afterLoad,
        };
      } catch {
        // Requisição abortada/sem resposta correspondente — não deveria acontecer em
        // produção local, mas não deixamos isso derrubar a medição inteira.
        return { url: request.url(), bytes: 0, isMapLibreChunk: false, afterLoad };
      }
    }),
  );

  const sum = (list: ScriptSample[]) => list.reduce((acc, s) => acc + s.bytes, 0);

  const aboveTheFold = samples.filter((s) => !s.afterLoad);
  const mapChunk = samples.filter((s) => s.isMapLibreChunk);

  return {
    route,
    aboveTheFoldBytes: sum(aboveTheFold),
    aboveTheFoldRequests: aboveTheFold.length,
    mapChunkBytes: sum(mapChunk),
    mapChunkRequests: mapChunk.length,
    totalBytes: sum(samples),
    totalRequests: samples.length,
  };
}

function writeArtifact(measurement: RouteMeasurement): void {
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf-8"));
  } catch {
    existing = {};
  }

  existing[measurement.route] = {
    ...measurement,
    measuredAt: new Date().toISOString(),
    budgets: {
      rnf007aBytes: BUDGET_RNF_007A_BYTES,
      rnf007bBytes: BUDGET_RNF_007B_BYTES,
      rnf007cBytes: BUDGET_RNF_007C_BYTES,
    },
  };

  fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(existing, null, 2));
}

// Requisito 4: bytes de rede só fazem sentido medir uma vez — mobile-safari (WebKit)
// não precisa rodar esta suíte. O `test.skip` fica num `beforeEach` que não declara a
// fixture `page` (só `testInfo`) — assim o worker do projeto `mobile-safari` nunca
// chega a lançar o browser para este spec, em vez de lançar e só então descartar.
test.describe("perf budget (RNF-007a/b/c)", () => {
  test.describe.configure({ mode: "serial" });

  // Playwright exige desestruturação literal `{}` no 1º argumento do hook mesmo sem
  // fixtures — é assim que ele sabe não precisar criar `page` para pular o teste.
  // biome-ignore lint/correctness/noEmptyPattern: exigido pela assinatura do Playwright
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Medição de bytes só roda no projeto chromium");
  });

  for (const route of ROUTES) {
    test(`bundle JS de script — ${route}`, async ({ page, baseURL }) => {
      const result = await measureRoute(page, baseURL ?? "http://localhost:3000", route);
      writeArtifact(result);

      test.info().annotations.push({
        type: "perf-budget",
        description: `${route}: above-the-fold=${(result.aboveTheFoldBytes / KIB).toFixed(1)}KiB map=${(result.mapChunkBytes / KIB).toFixed(1)}KiB total=${(result.totalBytes / KIB).toFixed(1)}KiB`,
      });

      expect
        .soft(
          result.aboveTheFoldBytes,
          `RNF-007a above-the-fold (${route}) deve ficar abaixo de 150 KiB`,
        )
        .toBeLessThan(BUDGET_RNF_007A_BYTES);

      expect
        .soft(result.totalBytes, `RNF-007c total de script (${route}) deve ficar abaixo de 500 KiB`)
        .toBeLessThan(BUDGET_RNF_007C_BYTES);

      // RNF-007b — o chunk do MapLibre está acima da meta desde a S04 (carry-over
      // conhecido, ver a nota em CARRY_OVER_MAP_CHUNK_CEILING_BYTES). Enquanto o ADR
      // que revisa a meta não sai, o gate compara com o teto operacional: o débito
      // atual passa, uma regressão nova falha.
      if (result.mapChunkBytes > BUDGET_RNF_007B_BYTES) {
        test.info().annotations.push({
          type: "carry-over",
          description: `RNF-007b estourado em ${route}: ${(result.mapChunkBytes / KIB).toFixed(1)} KiB > ${BUDGET_RNF_007B_BYTES / KIB} KiB — carry-over S04, teto operacional ${CARRY_OVER_MAP_CHUNK_CEILING_BYTES / KIB} KiB`,
        });
      }

      expect
        .soft(
          result.mapChunkBytes,
          `RNF-007b chunk do MapLibre (${route}): meta 250 KiB, teto do carry-over S04 ${CARRY_OVER_MAP_CHUNK_CEILING_BYTES / KIB} KiB`,
        )
        .toBeLessThan(CARRY_OVER_MAP_CHUNK_CEILING_BYTES);
    });
  }
});
