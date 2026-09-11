import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/uf/SP", "/uf/SP/governador", "/governador", "/sobre-o-modelo"];
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

        await test.info().attach(`axe-${route.replace(/\//g, "_")}-${viewport.name}-${theme}.json`, {
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

        expect(critical.length + serious.length, JSON.stringify(results.violations, null, 2)).toBe(0);
      });
    }
  }
}
