import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// `/uf/SP/senador` entra por exigência do RF-176(e): é a ÚNICA rota com
// `vagas=2` e, por isso, a única que renderiza o destaque por espessura e a
// régua da 2ª vaga (RF-173) — o caso mais arriscado da spec 020, justamente
// porque o destaque é visual e sua tradução textual vive só na legenda da
// tabela `sr-only`.
//
// `/governador` e `/sobre-o-modelo` estão fora do escopo da spec 020 e ficam:
// cobrem outras specs, e tirá-las seria reduzir cobertura alheia.
// ---------------------------------------------------------------------------
// 🔴 COMO RODAR ESTE GATE — medido em 2026-09-18, na primeira vez que ele rodou
//
// Contra o site PUBLICADO, que é o único caminho que funciona hoje:
//
//     PLAYWRIGHT_BASE_URL=https://salacofre.vercel.app npx playwright test \
//       tests/e2e/a11y-audit.spec.ts
//
// Resultado nessa data: 48/48 verdes (6 rotas × 2 viewports × 2 temas × 2
// navegadores). Exige `npx playwright install webkit` — sem ele, os 24 testes
// de `mobile-safari` falham com "Executable doesn't exist", o que NÃO é
// resultado de acessibilidade e já enganou uma sessão.
//
// ⚠️ **Contra um build de produção LOCAL (`pnpm build && pnpm start`) este gate
// NÃO roda, e a causa não é óbvia.** O `/api/projection`, que a página consulta
// em laço, devolve 500 com `Error: Must be deployed on Vercel to set response
// headers` — é o Vercel BotID (`node_modules/botid`), que fora da Vercel só
// libera em NODE_ENV=development; em build de produção ele lança. Como a página
// repete a consulta, a rede nunca fica ociosa, o `waitUntil: "networkidle"`
// abaixo estoura os 30 s e os 40 testes morrem por TIMEOUT DE NAVEGAÇÃO —
// sintoma que não se parece nem um pouco com a causa.
//
// ⚠️ E contra `pnpm dev` **não rode**: servidor de desenvolvimento de pé junto
// de suíte de teste foi o que publicou resultado eleitoral inventado no site
// público em 2026-09-14. Use o site publicado.
// ---------------------------------------------------------------------------
const ROUTES = [
  "/",
  "/uf/SP",
  "/uf/SP/governador",
  "/uf/SP/senador",
  "/governador",
  "/sobre-o-modelo",
];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
];
const THEMES = ["light", "dark"] as const;

test.describe.configure({ mode: "parallel" });

for (const route of ROUTES) {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`axe ${route} @ ${viewport.name} (${theme})`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript((t) => {
          try {
            window.localStorage.setItem("am-theme", t);
          } catch {
            /* noop */
          }
        }, theme);
        await page.goto(route, { waitUntil: "networkidle" });
        // dá tempo do mapa (MapLibre) montar e do detalhe municipal chegar
        await page.waitForTimeout(1500);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const critical = results.violations.filter((v) => v.impact === "critical");
        const serious = results.violations.filter((v) => v.impact === "serious");

        await test
          .info()
          .attach(`axe-${route.replace(/\//g, "_")}-${viewport.name}-${theme}.json`, {
            body: JSON.stringify(results.violations, null, 2),
            contentType: "application/json",
          });

        console.log(
          `\n=== ${route} | ${viewport.name} | ${theme} ===`,
          JSON.stringify(
            results.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => n.target),
            })),
            null,
            2,
          ),
        );

        expect(critical.length + serious.length, JSON.stringify(results.violations, null, 2)).toBe(
          0,
        );
      });
    }
  }
}
