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
 * Presidente via `currentPresidentialRace()` (turno corrente), Governador fixo em 1
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
import { currentPresidentialRace } from "@/lib/config/calendar";
import { simulacaoLigada, simulacaoMunicipiosUf } from "@/lib/dev/simulacao";

const UF_REGEX = /^[A-Z]{2}$/;
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

function resolveCargoETurno(cargoParam: string | null): { cargo: Cargo; turno: 1 | 2 } {
  if (cargoParam === "gov") return { cargo: "gov", turno: 1 };
  // Default e único outro valor aceito: presidencial, mesma resolução de
  // turno que `app/(pres)/uf/[sigla]/page.tsx` usa.
  const race = currentPresidentialRace();
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

  // 🔴 **Simulação ligada ⇒ a simulação é a fonte de verdade, e a leitura
  // remota NÃO RODA.** Este bloco vem antes de `readUfDetail` de propósito, e a
  // ordem é o conserto inteiro do defeito de 2026-09-15.
  //
  // O que acontecia: `readUfDetail` rodava primeiro e, com
  // `BLOB_READ_WRITE_TOKEN` no `.env.local`, falava com o Blob de PRODUÇÃO. Ele
  // respondia `status: "ok"` com `municipios: []` — o estado normal do store
  // antes de 04/10 —, a rota retornava ali mesmo, e o caminho da simulação
  // abaixo era código morto sempre que o Blob respondesse. O dono via o mapa
  // vazio ao lado de um placar com 25% apurado.
  //
  // Não basta ignorar a resposta remota: adiar a LEITURA é o ponto, porque ela
  // custa rede e, nas páginas irmãs, entra num `Promise.all` que segura a tela.
  //
  // Sem arquivo municipal de simulação a resposta é "indisponível", nunca o
  // Blob e nunca a fixture antiga: mapa mudo é revisável, mapa discordando do
  // placar ao lado custa horas de caça a um bug de UI que não existe.
  if (simulacaoLigada()) {
    const daSimulacao = simulacaoMunicipiosUf(sigla, cargo, turno);
    if (daSimulacao) {
      return NextResponse.json(
        { status: "ok", municipios: daSimulacao.municipios, ts: daSimulacao.ts },
        { headers: CACHE_HEADERS },
      );
    }
    return NextResponse.json(
      { status: "unavailable", reason: "not_found", municipios: [] },
      { headers: CACHE_HEADERS },
    );
  }

  const result = await readUfDetail(sigla, { cargo, turno });

  if (result.status === "ok") {
    return NextResponse.json(
      { status: "ok", municipios: result.detail.municipios, ts: result.detail.ts },
      { headers: CACHE_HEADERS },
    );
  }

  // Dev fallback — nunca em produção (constituição § 3 aplicada só a
  // dev/preview; ver docstring de `devMunicipiosFixtureFor`).
  //
  // O portão virou `=== "development"` em 2026-09-14, e não é troca cosmética:
  // a forma negada deixava passar `test`, `preview` e qualquer valor novo de
  // `NODE_ENV`, e este endpoint tem `Cache-Control` público de 30 s — uma
  // preview servindo municípios de fixture é um mapa colorido com apuração
  // inventada, do lado de fora. É o mesmo aperto que as cinco rotas de cargo
  // receberam em 13/09 e que `isDevWithoutEdgeConfig` recebeu no arquivo irmão:
  // ambiente seguro passa a ser afirmado, nunca inferido da ausência de um nome.
  //
  // A simulação já saiu acima; daqui para baixo é o caminho de sempre.
  if (process.env.NODE_ENV === "development") {
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
