// @vitest-environment happy-dom
/**
 * Smoke tests do conjunto de blocos UF — verifica que page consumirá os
 * componentes sem erro quando montados com payload sintetizado.
 *
 * Não testa o `app/uf/[sigla]/page.tsx` diretamente (Server Component async
 * com generateStaticParams precisa de infra Next, fora do escopo unit).
 * Em vez disso, monta os blocos em conjunto como um smoke do "wireframe".
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NewsClippingPlaceholder } from "@/components/atoms/banners/NewsClippingPlaceholder";
import { WinnerBanner } from "@/components/atoms/banners/WinnerBanner";
import { Needle } from "@/components/atoms/needle/Needle";
import { CandidateRow } from "@/components/atoms/tables/CandidateRow";
import { ForecastTransparency } from "@/components/blocks/ForecastTransparency";
import { InsightCard } from "@/components/blocks/InsightCard";
import { MunicipioTable } from "@/components/blocks/MunicipioTable";
import { Footer } from "@/components/layout/Footer";

function parse(node: React.ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

describe("UF page composition (smoke)", () => {
  it("renderiza conjunto típico sem erro", () => {
    const node = (
      <main>
        <WinnerBanner candidato="Lula" partido="PT" ufSigla="SP" cor="var(--color-pt)" />
        <CandidateRow nome="Lula" partido="PT" cor="var(--color-pt)" votos={null} pct={54.1} />
        <CandidateRow
          nome="Bolsonaro"
          partido="PL"
          cor="var(--color-pl)"
          votos={null}
          pct={45.9}
        />
        <Needle
          needlePosition={0.5}
          pVitoria={0.78}
          candidatoA="Lula"
          candidatoB="Bolsonaro"
          variant="uf"
        />
        <MunicipioTable rows={[]} />
        <InsightCard
          frases={["Lula supera 2022 em SP por 2,1pp.", "Ganho expressivo em capitais."]}
          variant="uf"
        />
        <ForecastTransparency pctApurado={23.4} variant="uf" />
        <NewsClippingPlaceholder />
        <Footer />
      </main>
    );
    const doc = parse(node);
    expect(doc.body.textContent).toContain("Lula");
    expect(doc.body.textContent).toContain("Bolsonaro");
    expect(doc.body.textContent).toContain("Forecast estadual");
    expect(doc.body.textContent).toContain("Não oficial");
    expect(doc.body.textContent).toContain("Repercussão na imprensa");
  });
});
