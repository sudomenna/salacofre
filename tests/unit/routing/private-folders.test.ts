/**
 * tests/unit/routing/private-folders.test.ts
 *
 * **Este teste existe por causa de um defeito real, encontrado em 2026-09-11**:
 * `app/api/_internal/edge-write/route.ts` — o endpoint por onde o orchestrator
 * Python publica a projeção — **nunca foi roteável**. No App Router do Next.js,
 * um diretório com prefixo `_` é uma *private folder* e fica FORA do
 * roteamento por completo. O comentário original do arquivo declarava a
 * premissa invertida ("rotas com path começando em `_internal` NUNCA são
 * expostas publicamente; Vercel não filtra automaticamente") — o Next filtra,
 * e o que ele filtra é a rota inteira, não o acesso a ela.
 *
 * ## Por que ninguém notou
 *
 * O caller Python trata o edge-write como best-effort: um 404 vira
 * `_log("warn", "edge-write http error")` e o ciclo segue
 * (`api/model/project.py`). O modelo computava, persistia em `projections` e
 * reportava `model_project_ok` — e **nenhuma** gravação no Global Config ou no
 * Vercel Blob jamais acontecia, em nenhum ambiente. Mesma família dos outros
 * defeitos desta janela: nada dá erro, só não acontece.
 *
 * ## O que este teste trava
 *
 * A regra estrutural, não o sintoma: nenhum `route.ts` / `page.tsx` sob `app/`
 * pode ter um segmento de caminho iniciado por `_`. É uma varredura do fonte
 * porque a alternativa — provar roteamento de verdade — exigiria `next build` +
 * um servidor de pé, caro demais para a suíte unitária.
 *
 * Segmentos `(grupo)` e `[param]` continuam válidos e são ignorados de
 * propósito: só o prefixo `_` remove a rota.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(process.cwd(), "app");
const ROUTE_FILES = new Set(["route.ts", "route.tsx", "page.ts", "page.tsx"]);

/** Caminhos relativos a `app/` de todo arquivo que define uma rota. */
function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectRouteFiles(full, acc);
    } else if (ROUTE_FILES.has(entry)) {
      acc.push(relative(APP_DIR, full));
    }
  }
  return acc;
}

describe("App Router — private folders (prefixo `_`)", () => {
  const routeFiles = collectRouteFiles(APP_DIR);

  it("encontra rotas para varrer (guarda contra um teste que afere o nada)", () => {
    expect(routeFiles.length).toBeGreaterThan(5);
  });

  it("nenhuma rota vive sob um diretório com prefixo `_` — ele a torna inalcançável", () => {
    const inalcancaveis = routeFiles.filter((rel) =>
      // O último segmento é o próprio arquivo; só os diretórios importam.
      rel
        .split(sep)
        .slice(0, -1)
        .some((seg) => seg.startsWith("_")),
    );

    expect(
      inalcancaveis,
      `Rota(s) sob private folder — respondem 404 em TODO ambiente, sem erro:\n` +
        inalcancaveis.map((r) => `  app/${r}`).join("\n"),
    ).toEqual([]);
  });

  it("o endpoint de gravação do modelo está num caminho alcançável", () => {
    // Trava o caso concreto que motivou o teste: se alguém restaurar o
    // prefixo, a cadeia modelo → Global Config → Blob volta a falhar em
    // silêncio, e é isso que quebra aqui.
    expect(routeFiles).toContain(join("api", "internal", "edge-write", "route.ts"));
    expect(routeFiles).not.toContain(join("api", "_internal", "edge-write", "route.ts"));
  });
});
