/**
 * app/api/projection/municipios/route.ts
 *
 * GET /api/projection/municipios?uf=<sigla>&cargo=<pres|gov>
 *
 * Read path CLIENTE do detalhe municipal (ADR-0032) — existe porque
 * `readUfDetail` (`lib/blob/uf-detail.ts`) só pode rodar no servidor (o Blob
 * lê `BLOB_READ_WRITE_TOKEN`/`BLOB_PUBLIC_BASE_URL`, `env` de servidor, e a
 * chamada usa `next: { revalidate }` do Data Cache do Next). A moldura
 * persistente do mapa (`components/layout/PersistentMapFrame.tsx`, ADR-0033
 * § 1) é Client Component — resolve a UF corrente via `useParams()` e busca
 * seu próprio dado — então precisa de um endpoint, exatamente como já faz
 * para o resumo via `GET /api/projection?uf=`.
 *
 * `turno` não é parâmetro: as duas páginas de UF que hoje leem
 * `readUfDetail` resolvem turno da mesma forma que este endpoint replica —
 * Presidente via `currentRace()` (turno corrente), Governador fixo em 1
 * (`app/(gov)/uf/[sigla]/governador/page.tsx`, ainda sem alternância 2T
 * nesta rota). Se um turno 2 de Governador existir antes deste endpoint
 * ganhar o parâmetro, ele devolverá o turno errado — mesmo risco que as
 * páginas já assumem hoje.
 *
 * Dev fallback (carry-over do map-builder, 2026-09-09): quando
 * `readUfDetail` devolve "unavailable" E o ambiente não é produção, tenta
 * `devMunicipiosFixtureFor` — fixture municipal versionada gerada do
 * Postgres real de dev (`lib/blob/uf-detail.ts`), só cobre
 * `cargo=pres,turno=1`. Nunca aplicado quando `NODE_ENV === "production"`.
 */

import { NextResponse } from "next/server";

import { devMunicipiosFixtureFor, readUfDetail } from "@/lib/blob/uf-detail";
import type { Cargo } from "@/lib/config/calendar";
import { currentRace } from "@/lib/config/calendar";

const UF_REGEX = /^[A-Z]{2}$/;
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

function resolveCargoETurno(cargoParam: string | null): { cargo: Cargo; turno: 1 | 2 } {
  if (cargoParam === "gov") return { cargo: "gov", turno: 1 };
  // Default e único outro valor aceito: presidencial, mesma resolução de
  // turno que `app/(pres)/uf/[sigla]/page.tsx` usa.
  const race = currentRace();
  return { cargo: "pres", turno: race.turno };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ufParam = url.searchParams.get("uf");
  if (!ufParam) {
    return NextResponse.json({ error: "missing_uf" }, { status: 400 });
  }
  const sigla = ufParam.toUpperCase();
  if (!UF_REGEX.test(sigla)) {
    return NextResponse.json({ error: "invalid_uf" }, { status: 400 });
  }

  const { cargo, turno } = resolveCargoETurno(url.searchParams.get("cargo"));

  const result = await readUfDetail(sigla, { cargo, turno });

  if (result.status === "ok") {
    return NextResponse.json(
      { status: "ok", municipios: result.detail.municipios, ts: result.detail.ts },
      { headers: CACHE_HEADERS },
    );
  }

  // Dev fallback — nunca em produção (constituição § 3 aplicada só a
  // dev/preview; ver docstring de `devMunicipiosFixtureFor`).
  if (process.env.NODE_ENV !== "production") {
    const fixture = devMunicipiosFixtureFor(sigla, cargo, turno);
    if (fixture) {
      return NextResponse.json(
        { status: "ok", municipios: fixture.municipios, ts: fixture.ts },
        { headers: CACHE_HEADERS },
      );
    }
  }

  return NextResponse.json(
    { status: "unavailable", reason: result.reason, municipios: [] },
    { headers: CACHE_HEADERS },
  );
}
