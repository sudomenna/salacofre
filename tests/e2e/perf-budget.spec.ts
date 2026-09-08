import * as fs from "node:fs";
import * as path from "node:path";
import { expect, type Page, type Request, test } from "@playwright/test";

/**
 * RNF-007 — orçamento de bundle JS (docs/nfr/performance.md).
 *
 *   RNF-007a — above-the-fold **de aplicação** (total − piso de framework)  < 150 KiB
 *   RNF-007b — chunk do mapa (MapLibre + PMTiles client + componente)       < 300 KiB
 *   RNF-007c — total da rota (above-the-fold + chunks lazy)                 < 500 KiB
 *
 * O escopo do RNF-007a mudou em 2026-09-08 (constituição 1.4, ADR-0030): ele deixou
 * de somar o runtime que o time não controla. Medido em 2026-09-07, o above-the-fold
 * da home eram 153.482 B em 8 requests, dos quais 71.080 são o React DOM e o resto é
 * runtime do Next e do bundler — `/sobre-o-modelo`, a rota mais simples do site,
 * baixava exatamente o mesmo tanto. O teto de 150 KiB media a escolha de framework,
 * não as decisões do time, e sobravam 118 bytes para a aplicação inteira.
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
const BUDGET_RNF_007B_BYTES = 300 * KIB;

/**
 * Piso de framework above-the-fold (RNF-007a-floor), em bytes.
 *
 * É o **maior** valor observado entre as rotas medidas em 2026-09-07 — escolha
 * conservadora: subtrair um piso maior que o real de uma rota faz o orçamento de
 * aplicação parecer MENOR do que é, nunca maior, então o gate erra para o lado de
 * reprovar, não de deixar passar.
 *
 * Recalibrar **apenas** quando Next ou React subirem de versão major, nunca por PR:
 * se um PR pudesse mexer nesta constante, o gate deixaria de medir qualquer coisa.
 * Para recalibrar: rode este spec, olhe `aboveTheFoldBytes` da rota mais simples do
 * site (`/sobre-o-modelo`, sem mapa e sem polling) e use esse número.
 */
const FRAMEWORK_FLOOR_BYTES = 153_482;
const BUDGET_RNF_007C_BYTES = 500 * KIB;

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
    frameworkFloorBytes: FRAMEWORK_FLOOR_BYTES,
    applicationBytes: measurement.aboveTheFoldBytes - FRAMEWORK_FLOOR_BYTES,
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

      // RNF-007a mede o que o time controla: total above-the-fold menos o piso de
      // framework (ADR-0030). Um valor negativo significa que a rota baixou MENOS que
      // o piso registrado — acontece em rota mais enxuta que a que definiu o piso, e é
      // informação legítima, não erro; o clamp a zero evita "orçamento negativo" no
      // relatório sem esconder o número real, que vai no artefato.
      const aplicacaoBytes = result.aboveTheFoldBytes - FRAMEWORK_FLOOR_BYTES;

      test.info().annotations.push({
        type: "perf-budget",
        description:
          `${route}: aplicação=${(aplicacaoBytes / KIB).toFixed(1)}KiB ` +
          `(above-the-fold ${(result.aboveTheFoldBytes / KIB).toFixed(1)}KiB − piso ${(FRAMEWORK_FLOOR_BYTES / KIB).toFixed(1)}KiB) ` +
          `map=${(result.mapChunkBytes / KIB).toFixed(1)}KiB total=${(result.totalBytes / KIB).toFixed(1)}KiB`,
      });

      expect
        .soft(
          aplicacaoBytes,
          `RNF-007a (${route}): orçamento de APLICAÇÃO = ${result.aboveTheFoldBytes} B medidos − ${FRAMEWORK_FLOOR_BYTES} B de piso de framework. ` +
            "Se estourou, o peso veio de código nosso — não do React nem do Next.",
        )
        .toBeLessThan(BUDGET_RNF_007A_BYTES);

      expect
        .soft(result.totalBytes, `RNF-007c total de script (${route}) deve ficar abaixo de 500 KiB`)
        .toBeLessThan(BUDGET_RNF_007C_BYTES);

      // RNF-007b passou de 250 para 300 KiB em 2026-09-08 (ADR-0030), formalizando o
      // carry-over da S04 em vez de mantê-lo como teto operacional escondido no teste.
      expect
        .soft(
          result.mapChunkBytes,
          `RNF-007b chunk do MapLibre (${route}) deve ficar abaixo de ${BUDGET_RNF_007B_BYTES / KIB} KiB`,
        )
        .toBeLessThan(BUDGET_RNF_007B_BYTES);
    });
  }
});
