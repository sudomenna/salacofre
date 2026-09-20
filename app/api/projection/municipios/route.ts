/**
 * app/api/projection/municipios/route.ts
 *
 * GET /api/projection/municipios?uf=<sigla>&cargo=<pres|gov|sen>
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
 * `turno` não é parâmetro: as três páginas de UF que hoje leem
 * `readUfDetail` resolvem turno da mesma forma que este endpoint replica —
 * Presidente via `currentPresidentialRace()` (turno corrente), Governador fixo em 1
 * (`app/(gov)/uf/[sigla]/governador/page.tsx`, ainda sem alternância 2T
 * nesta rota), Senador fixo em 1 porque cargo 5 **não tem** 2º turno
 * (`temSegundoTurno: false`, `lib/config/cargos.ts`). Se um turno 2 de
 * Governador existir antes deste endpoint ganhar o parâmetro, ele devolverá o
 * turno errado — mesmo risco que as páginas já assumem hoje.
 *
 * ===== 2026-09-19 — `cargo=sen` passa a ser atendido =====
 *
 * 🔴 Até esta data `resolveCargoETurno` reconhecia só `"gov"`, e **qualquer
 * outro valor caía no presidencial em silêncio** — inclusive `"sen"` e
 * `"dep"`. Um coroplético municipal de Presidente pintado sob o rótulo
 * "Senado" é a terceira reincidência do mesmo defeito nesta base (conversor de
 * cargo com ramo `default`), e por isso a resolução virou tabela indexada pela
 * união literal: cargo novo sem entrada é erro de compilação, e cargo
 * explícito fora da tabela (`dep`, typo) responde **400 `invalid_cargo`**, não
 * o presidencial calado. Ausência de `cargo` continua valendo presidencial —
 * é o contrato de todo consumidor anterior a esta data.
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

/** Os cargos com detalhe municipal publicado no Blob (ADR-0032). */
type CargoMunicipal = "pres" | "gov" | "sen";

/**
 * Tabela, e não ternário encadeado nem `??`.
 *
 * `turno` é função, e não literal, porque o presidencial depende do calendário
 * — resolvê-lo na montagem da tabela congelaria o turno no módulo.
 *
 * `dep` está fora de propósito: Deputado Federal se decide em turno único e
 * tem drill-down próprio (`deputado/uf/<SIGLA>.json`, ADR-0026), sem cargo nem
 * turno no caminho. Pedir `cargo=dep` aqui é erro do chamador, e o 400 abaixo
 * diz isso — servir os municípios do Presidente seria a mentira silenciosa.
 */
const TURNO_POR_CARGO: Readonly<Record<CargoMunicipal, () => 1 | 2>> = {
  // Mesma resolução de turno que `app/(pres)/uf/[sigla]/page.tsx` usa.
  pres: () => currentPresidentialRace().turno,
  gov: () => 1,
  sen: () => 1,
};

/**
 * `?cargo=` → cargo + turno, ou `null` quando o valor não é atendido.
 *
 * Ausência ⇒ presidencial: é o contrato de todo consumidor anterior a
 * 2026-09-19 e o único default que este arquivo admite. Presença de valor
 * desconhecido ⇒ `null` ⇒ 400, nunca o presidencial em silêncio.
 */
function resolveCargoETurno(cargoParam: string | null): { cargo: Cargo; turno: 1 | 2 } | null {
  const token = cargoParam ?? "pres";
  if (!Object.hasOwn(TURNO_POR_CARGO, token)) return null;
  const cargo = token as CargoMunicipal;
  return { cargo, turno: TURNO_POR_CARGO[cargo]() };
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

  const cargoParam = url.searchParams.get("cargo");
  const resolvido = resolveCargoETurno(cargoParam);
  if (resolvido === null) {
    return NextResponse.json({ error: "invalid_cargo", cargo: cargoParam }, { status: 400 });
  }
  const { cargo, turno } = resolvido;

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
