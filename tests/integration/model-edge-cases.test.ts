/**
 * tests/integration/model-edge-cases.test.ts
 *
 * T19 — Integration test: casos de borda do modelo estatístico (spec 002)
 * contra o pipeline de EXTRAPOLAÇÃO POR ZONA (plano `tem-um-erro-eu-
 * velvety-sprout.md`, decisões E1-E4 fechadas com o usuário em 2026-09-05
 * — 2022 SAIU da projeção de candidatos; `historical_results` não é mais
 * lido pelo caminho de cálculo).
 *
 * Cobre:
 *   - Cenário A — RF-017 (E3, 2º nível hierárquico): UF SEM NENHUMA zona
 *     apurada usa a proporção NACIONAL (não mais `p_2022`), CI ±10pp,
 *     `metodo.tipo = "imputado_nacional"`. Substitui o antigo teste
 *     "projeção ≈ p_2022" — a âncora agora é o nacional calculado a
 *     partir de outras UFs com dado, não 2022.
 *   - Cenário B — RF-018: UF com <5% apurado → CI ≥ 1.5× a largura de
 *     uma UF controle. Semântica INALTERADA pela extrapolação (só a
 *     fonte do share mudou de swing-vs-2022 para razão de somas
 *     zona-a-zona); reescrito só para semear o envelope EA20 real que
 *     `_extract_zone_candidatos` agora exige.
 *   - Cenário C — candidato SEM histórico 2022 (antigo "K-1") recebe
 *     projeção NORMALMENTE. K-1 foi REMOVIDO (ADR-0015 obsoleto — 2022
 *     não é mais insumo, não existe "candidato sem bloco 2022 mapeável").
 *     A corrida é de quem aparece no snapshot 2026, ponto.
 *
 * Por que os 3 cenários exigem envelope EA20 REAL (`e`/`v`/`s` de raiz +
 * `carg[].agr[].par[].cand[].vap`), não mais o payload achatado
 * `{cand:[{n,pvap}]}`:
 *   `_extract_zone_candidatos` (api/model/project.py) delega a
 *   `_extract_zone_participacao`, que exige o campo FATAL `e.te` — sem
 *   `e`/`v`/`s` de raiz a zona inteira é excluída (`None`), nunca entra
 *   em `estimate_uf_candidatos` (api/model/extrapolation.py). O payload
 *   achatado antigo não carrega esses campos — era suficiente para o
 *   pipeline de swing (só precisava de `pvap`), não é mais suficiente
 *   para a regra de três (precisa de contagens ABSOLUTAS para escalar
 *   por `k = te/esi`).
 *
 * Estratégia
 * ----------
 *   - Seeda `eleitorado` e `snapshots` no Neon real via Drizzle
 *     (sentinels uf='ZT'/'ZQ'/'ZC'/'ZL'/'ZK' + cod_zona ∈ 99041..99050 —
 *     distintos dos de T18: 99030..99039).
 *   - Invoca a função pura `_do_project(body_bytes)` do orquestrador
 *     Python via `child_process.execFileSync`, usando o interpretador
 *     do `.venv-model/` (psycopg + numpy + pydantic já instalados). O
 *     script Python intercepta `api.model.project.insert_projections`
 *     (chama a implementação REAL — grava no Neon de verdade — mas
 *     também guarda os `rows` recebidos) para expor campos que não são
 *     persistidos em `projections` (`metodo`, `comparecimento`,
 *     `votos_atuais`) sem precisar mockar nada em `api/model/**`.
 *   - Cada cenário usa um cargo sintético (CARGO_B=92, CARGO_C=93) OU o
 *     cargo real 1 (CARGO_A — RF-017 2º nível só existe para cargo=1,
 *     "presidente", que tem noção de "nacional"; cargo 3/governador não
 *     tem — a UF fica omitida, não há o que testar aqui).
 *   - Cleanup: DELETE só do que o teste inseriu (UF + faixa de cod_zona
 *     + faixa de cargo sintética/1). Production code permanece
 *     append-only.
 *
 * Skip condicional
 * ----------------
 *   Skipa graceful quando:
 *     - DATABASE_URL ausente no ambiente (CI sem secret de DB).
 *     - Binário Python 3.14 não encontrado em `.venv-model/bin/python3.14`
 *       nem em PATH.
 *
 * Padrão herdado de T18 (cf. comentários no top de model-cycle.test.ts):
 * mesma estrutura de beforeAll/afterAll com cleanup explícito, sem mocks
 * em produção.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Sentinels — isolamento entre cenários e contra T18 (99030..99040)
// ---------------------------------------------------------------------------

/**
 * Cargo do cenário A (RF-017, E3 2º nível). PRECISA ser 1 (presidente) —
 * `compute_uf_projections` só tenta `impute_uf_from_national` quando
 * `int(cargo) == 1` (cargo 3/governador não tem "nacional", a UF fica
 * omitida — nada a testar). Consequência medida: cargo=1 já tem dados
 * NACIONAIS reais neste Neon de dev (S07 — pipeline TSE simulado-ready,
 * ~2600 zonas em 27 UFs) — `_do_project` sempre busca esse universo
 * inteiro, não só as nossas 2 UFs sintéticas (ver timeout de
 * `callDoProject` abaixo).
 */
const CARGO_A = 1;
/** Cargo sintético do cenário B (RF-018) — duas UFs no mesmo run. */
const CARGO_B = 92;
/** Cargo sintético do cenário C (candidato sem histórico 2022). */
const CARGO_C = 93;

const TURNO = 1;

/** UF sentinela do cenário A — 0 zonas apuradas. */
const UF_A = "ZT";
/**
 * UF que ANCORA a proporção nacional para o cenário A — a única UF com
 * os candidatos 101/102 apurados neste run. Só 1 zona ⇒ bootstrap com
 * `k_a=1` ⇒ zero variância de amostragem ⇒ share exato (65%/35%,
 * `vap/vvc`) reproduzido bit-a-bit no nacional — determinístico o
 * bastante para `toBeCloseTo` com tolerância apertada.
 */
const UF_A_NAT = "ZQ";
/** UF controle do cenário B (50% apurado). */
const UF_B_CTRL = "ZC";
/** UF low-apurado do cenário B (4% apurado). */
const UF_B_LOW = "ZL";
/** UF do cenário C. */
const UF_C = "ZK";

const ZONE_BASE = 99041;
const ZONE_MAX = 99050;
const COD_MUNICIPIO_TSE = 99997;

/** Faixa de cargos usada por este teste — alvo do cleanup. */
const TEST_CARGOS = [CARGO_A, CARGO_B, CARGO_C] as const;
/** Faixa de UFs sentinela usada por este teste — alvo do cleanup. */
const TEST_UFS = [UF_A, UF_A_NAT, UF_B_CTRL, UF_B_LOW, UF_C] as const;
const TEST_UF_LIST = sql.join(
  TEST_UFS.map((uf) => sql`${uf}`),
  sql`, `,
);

// ---------------------------------------------------------------------------
// Python runner
// ---------------------------------------------------------------------------

const VENV_PY = resolve(process.cwd(), ".venv-model/bin/python3.14");

/** O que `api/model/project.py` precisa para sequer subir: `numpy` e
 *  `pydantic` no import do módulo (`:72-73`), `psycopg` dentro de
 *  `_open_conn` (`:226`). Faltando qualquer um, o runner morre no import e a
 *  falha chega como erro de produto, não como skip. */
const MODULOS_EXIGIDOS = ["numpy", "pydantic", "psycopg"] as const;

/**
 * `true` se este interpretador consegue importar o que o modelo precisa.
 *
 * ⚠️ **Por que não basta existir (2026-09-13).** A versão anterior perguntava
 * só "existe algum `python3.14`?" — `existsSync` no venv, senão `which`. Num
 * git worktree o `.venv-model` **não existe** (ele fica só no repositório
 * principal), o fallback pegava o `python3.14` do PATH, e esse não tem
 * `pydantic`: **5 testes falhavam com `ModuleNotFoundError`** em vez de
 * pularem. Custou tempo real de duas sessões, e o sintoma era o pior
 * possível — falha que parece bug de produto e é de ambiente.
 *
 * Mesma classe de defeito que atravessou aquela madrugada: **a verificação
 * confirmava a forma e não o conteúdo.** A guarda respondia "existe um
 * interpretador" quando a pergunta era "existe um interpretador que roda o
 * nosso código".
 */
function podeImportar(bin: string): boolean {
  try {
    execFileSync(bin, ["-c", `import ${MODULOS_EXIGIDOS.join(", ")}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function pythonBinary(): string | null {
  if (existsSync(VENV_PY) && podeImportar(VENV_PY)) return VENV_PY;
  // Fallback: `python3.14` do PATH — só serve se tiver as dependências.
  try {
    const out = execFileSync("which", ["python3.14"], { encoding: "utf8" }).trim();
    return out && podeImportar(out) ? out : null;
  } catch {
    return null;
  }
}

/** Linha capturada de `insert_projections` — espelha `_uf_projection_row`
 * (api/model/project.py) e as linhas nacionais de `compute_national`, depois
 * de passarem por `linhas_para_projections`.
 * `metodo`/`comparecimento` NÃO são persistidos em `projections` (colunas não
 * existem) — só chegam até aqui via a interceptação feita pelo script inline
 * abaixo. `pct_atual`/`votos_atuais`/`dado_ts` passaram a ser colunas de
 * verdade na migration 0009 (spec 020). */
interface CapturedRow {
  cargo: number;
  turno: number;
  uf: string | null;
  candidato_id: number;
  votos_projetados: number;
  votos_atuais?: number;
  pct_atual: number | null;
  pct_projetado: number;
  pct_projetado_lower: number;
  pct_projetado_upper: number;
  p_vitoria: number | null;
  pct_apurado: number;
  comparecimento?: {
    pct_atual: number | null;
    pct_projetado: number;
    lower: number;
    upper: number;
  };
  metodo?: {
    tipo: string;
    n_zonas: number;
    n_zonas_imputadas: number;
  };
}

/**
 * Invoca `api.model.project._do_project` num subprocess Python 3.14.
 *
 * Por que subprocess (e não FFI/PyNode/etc.)?
 *   - `_do_project` é o entrypoint puro do handler Vercel Python; rodar
 *     dele in-process exigiria interpretador Python embarcado, fora do
 *     escopo desta spec.
 *   - O subprocess espelha exatamente o que o Vercel runtime faz: import
 *     do módulo + chamada com bytes de body, sem mocks no caminho real.
 *
 * `insert_projections` é interceptado DENTRO deste subprocess efêmero
 * (não em `api/model/**`) só para CAPTURAR os `rows` que ele recebe —
 * a implementação real ainda roda por baixo (grava no Neon de verdade,
 * mesmo caminho de produção). Isso expõe `metodo`/`comparecimento`, que
 * `projections` não persiste, sem precisar mockar nada em código de produção.
 *
 * ⚠️ Como a escrita é real, este teste exige o banco apontado por
 * `DATABASE_URL` já com a **migration 0009** aplicada (`pnpm db:migrate:0009`).
 * Sem ela o INSERT referencia `pct_atual`/`votos_atuais`/`dado_ts`, que não
 * existem, e o subprocess falha.
 *
 * Retorna `{status, payload, rows}` — `payload` é o JSON de resposta do
 * endpoint; `rows` é `uf_rows + national_rows` (uf=null nas nacionais).
 */
function callDoProject(
  py: string,
  body: { cargo: number; turno: number; trigger_ts: string },
  timeoutMs = 60_000,
): { status: number; payload: Record<string, unknown>; rows: CapturedRow[] } {
  const bodyJson = JSON.stringify(body);
  const script = `
import json, sys, os
sys.path.insert(0, os.environ['REPO_ROOT'])
import api.model.project as _proj

_captured = []
_orig_insert = _proj.insert_projections
def _capture_insert(conn, rows):
    _captured.extend(rows)
    return _orig_insert(conn, rows)
_proj.insert_projections = _capture_insert

status, payload = _proj._do_project(os.environ['BODY_JSON'].encode('utf-8'))
sys.stdout.write('---RESULT---\\n')
sys.stdout.write(json.dumps({'status': status, 'payload': payload, 'rows': _captured}, default=str))
sys.stdout.write('\\n')
`;
  const stdout = execFileSync(py, ["-c", script], {
    env: {
      ...process.env,
      REPO_ROOT: process.cwd(),
      BODY_JSON: bodyJson,
      // Sentinela negativa — não queremos edge-write nesta integração.
      MODEL_SECRET: "",
    },
    encoding: "utf8",
    timeout: timeoutMs,
  });

  // Extrai a última linha após `---RESULT---` para evitar conflito com logs
  // JSON-line emitidos por `_log` durante a execução.
  const marker = stdout.lastIndexOf("---RESULT---");
  if (marker === -1) {
    throw new Error(`Subprocess não emitiu marcador ---RESULT---. STDOUT:\n${stdout}`);
  }
  const tail = stdout.slice(marker + "---RESULT---".length).trim();
  return JSON.parse(tail) as {
    status: number;
    payload: Record<string, unknown>;
    rows: CapturedRow[];
  };
}

// ---------------------------------------------------------------------------
// Seed helpers — INSERT direto via Drizzle raw sql
// ---------------------------------------------------------------------------

/**
 * Insere em `eleitorado 2026`. `aptos` é absoluto (não fração).
 * NOTA: desde a migration 0006 a PK é (ano, uf, cod_municipio_tse, cod_zona).
 * Estes casos seedam sempre o mesmo `COD_MUNICIPIO_TSE`, então continuam com
 * uma linha por zona/UF — o que o eleitorado da zona vale aqui não muda.
 * Zona espalhada por vários municípios é cenário da Fase 3 (soma dos pares).
 */
async function seedEleitorado(args: { uf: string; codZona: number; aptos: number }): Promise<void> {
  await db.execute(sql`
    INSERT INTO eleitorado
      (ano, uf, cod_municipio_tse, cod_zona, eleitores_aptos)
    VALUES
      (2026, ${args.uf}, ${COD_MUNICIPIO_TSE}, ${args.codZona}, ${args.aptos})
    ON CONFLICT (ano, uf, cod_municipio_tse, cod_zona) DO UPDATE
      SET eleitores_aptos = EXCLUDED.eleitores_aptos
  `);
}

/**
 * Constrói o envelope EA20 REAL (`e`/`v`/`s` de raiz +
 * `carg[].agr[].par[].cand[].vap`) exigido por `_extract_zone_candidatos`
 * (api/model/project.py) desde a Fase 1 do plano `tem-um-erro-eu-
 * velvety-sprout.md`. Substitui o payload achatado `{cand:[{n,pvap}]}`
 * usado antes desta tarefa — insuficiente porque não carrega `e.te`
 * (campo fatal) nem contagens absolutas (`vap`) para escalar por
 * `k = te/esi`.
 *
 * Zona "apurada" ⇔ `esi > 0 ∧ vvc > 0 ∧ weight(eleitorado) > 0`
 * (`extrapolation._is_apurada`) — para forçar uma zona "instalada mas
 * sem apuração ainda" (Cenário A), chame com `esi: 0, vvc: 0`.
 */
function buildEa20Envelope(args: {
  te: number;
  esi: number;
  c: number;
  a: number;
  vvc: number;
  vaps: Record<number, number>;
}): Record<string, unknown> {
  const vv = Object.values(args.vaps).reduce((sum, v) => sum + v, 0);
  return {
    e: { te: args.te, esi: args.esi, c: args.c, a: args.a },
    v: { vvc: args.vvc, vv, vb: 0, tvn: 0, van: 0, vansj: 0 },
    s: { psa: args.te > 0 ? Number(((args.esi / args.te) * 100).toFixed(2)) : 0 },
    carg: [
      {
        cd: "1",
        agr: [
          {
            par: [
              {
                cand: Object.entries(args.vaps).map(([n, vap]) => ({ n, vap })),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Insere um snapshot com envelope EA20 real. `pctApurado` em escala
 * 0..100 (coluna `snapshots.pct_apurado`, alimenta `uf_pct_apurado` —
 * INDEPENDENTE de `esi`/`te` do envelope, que decidem só se a ZONA
 * individual está "apurada" — RF-018 opera sobre a média ponderada da
 * coluna, não sobre `esi/te`).
 */
async function seedSnapshot(args: {
  cargo: number;
  uf: string;
  codZona: number;
  pctApurado: number;
  te: number;
  esi: number;
  c: number;
  a: number;
  vvc: number;
  vaps: Record<number, number>;
}): Promise<void> {
  const payload = buildEa20Envelope(args);
  const payloadStr = JSON.stringify(payload);
  // hash_payload é NOT NULL char(64) — SHA-256 do payload é a convenção real,
  // mas para o teste qualquer hex de 64 chars determinístico serve.
  const hash = `t19-${args.uf}-${args.codZona}-${args.cargo}`.padEnd(64, "0").slice(0, 64);
  await db.execute(sql`
    INSERT INTO snapshots
      (cargo, turno, uf, cod_zona, etag, pct_apurado, votos_total,
       payload, hash_payload)
    VALUES
      (${args.cargo}, ${TURNO}, ${args.uf}, ${args.codZona},
       ${`etag-${hash.slice(0, 8)}`}, ${args.pctApurado.toString()}, ${args.vvc},
       ${payloadStr}::jsonb, ${hash})
  `);
}

// ---------------------------------------------------------------------------
// Read helpers — filtra projections pela UF/cargo de cada cenário
// ---------------------------------------------------------------------------

interface ProjectionRow {
  uf: string | null;
  candidato_id: number;
  pct_projetado: number;
  pct_projetado_lower: number;
  pct_projetado_upper: number;
}

async function readProjections(args: { cargo: number; uf: string }): Promise<ProjectionRow[]> {
  const result = await db.execute<{
    uf: string | null;
    candidato_id: number;
    pct_projetado: string;
    pct_projetado_lower: string;
    pct_projetado_upper: string;
  }>(sql`
    SELECT uf, candidato_id, pct_projetado, pct_projetado_lower, pct_projetado_upper
    FROM projections
    WHERE cargo = ${args.cargo}
      AND turno = ${TURNO}
      AND uf = ${args.uf}
  `);
  return result.rows.map((r) => ({
    uf: r.uf,
    candidato_id: Number(r.candidato_id),
    pct_projetado: Number(r.pct_projetado),
    pct_projetado_lower: Number(r.pct_projetado_lower),
    pct_projetado_upper: Number(r.pct_projetado_upper),
  }));
}

// ---------------------------------------------------------------------------
// Cleanup helpers — DELETE só do que o teste injetou
// ---------------------------------------------------------------------------

async function cleanupAll(): Promise<void> {
  // Append-only só vale em production code; em test harness limpar é OK
  // (mesma postura de tests/integration/ingest-cycle.test.ts).
  for (const cargo of TEST_CARGOS) {
    await db.execute(sql`
      DELETE FROM projections
      WHERE cargo = ${cargo}
        AND turno = ${TURNO}
        AND uf IN (${TEST_UF_LIST})
    `);
    await db.execute(sql`
      DELETE FROM snapshots
      WHERE cargo = ${cargo}
        AND turno = ${TURNO}
        AND uf IN (${TEST_UF_LIST})
        AND cod_zona BETWEEN ${ZONE_BASE} AND ${ZONE_MAX}
    `);
  }
  await db.execute(sql`
    DELETE FROM eleitorado
    WHERE ano = 2026
      AND uf IN (${TEST_UF_LIST})
      AND cod_zona BETWEEN ${ZONE_BASE} AND ${ZONE_MAX}
  `);
  // Nenhum cenário desta suíte semeia `historical_results` mais (E1 — 2022
  // saiu da projeção de candidatos); DELETE mantido apenas como rede de
  // segurança contra resíduo de versões anteriores deste arquivo.
  for (const cargo of TEST_CARGOS) {
    await db.execute(sql`
      DELETE FROM historical_results
      WHERE cargo = ${cargo}
        AND turno = ${TURNO}
        AND ano = 2022
        AND uf IN (${TEST_UF_LIST})
        AND cod_zona BETWEEN ${ZONE_BASE} AND ${ZONE_MAX}
    `);
  }
}

// ---------------------------------------------------------------------------
// Skip detection
// ---------------------------------------------------------------------------

const HAS_DB = Boolean(process.env.DATABASE_URL);
const PY_BIN = HAS_DB ? pythonBinary() : null;
const SKIP = !HAS_DB || !PY_BIN;
const SKIP_REASON = !HAS_DB
  ? "DATABASE_URL ausente"
  : !PY_BIN
    ? `python3.14 indisponível ou sem as dependências do modelo (${MODULOS_EXIGIDOS.join(", ")}) — ` +
      "num git worktree o .venv-model não existe; rode a suíte no repositório principal"
    : "";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)("T19 — model edge cases (integration, real Neon + Python)", () => {
  beforeAll(async () => {
    await cleanupAll();
  }, 30_000);

  afterAll(async () => {
    await cleanupAll();
  }, 30_000);

  // -------------------------------------------------------------------------
  // CENÁRIO A — RF-017 (E3, 2º nível hierárquico): UF sem NENHUMA zona
  // apurada usa a proporção NACIONAL calculada a partir de outras UFs.
  // -------------------------------------------------------------------------
  //
  // Setup:
  //   - UF_A=ZT: eleitorado seedado + 1 snapshot com `e.esi=0, v.vvc=0`
  //     ("seção instalada mas sem totalização ainda", EA20 real) — a
  //     zona entra no balde "não apurada" (`extrapolation._is_apurada`);
  //     como é a ÚNICA zona da UF, `estimate_uf_candidatos` devolve
  //     `None` → RF-017 2º nível (só `cargo == 1`).
  //   - UF_A_NAT=ZQ: 1 zona TOTALMENTE apurada com candidatos 101 (65%)
  //     e 102 (35%) — a ÚNICA UF que reporta esses candidatos, então
  //     ela sozinha define a "proporção nacional" que ZT vai herdar.
  //
  // Esperado:
  //   - Linhas para 101 e 102 em UF=ZT (`impute_uf_from_national` imputa
  //     TODOS os candidatos vistos no `national_point` — que, neste Neon
  //     de dev, também inclui os candidatos NACIONAIS reais de cargo=1
  //     (S07 — dados do pipeline TSE simulado-ready). ZT acaba com uma
  //     linha por candidato nacional, não só 101/102 — por isso os reads
  //     abaixo FILTRAM por `candidato_id`, em vez de contar `.length` cru).
  //   - `metodo.tipo === "imputado_nacional"` (RF-017 2º nível) nas linhas
  //     de 101/102.
  //   - `pct_projetado` ≈ share nacional (65%/35%, exato — 1 zona só na
  //     UF ancoradora ⇒ bootstrap sem variância de amostragem).
  //   - CI ±10pp ⇒ largura ≈ 20pp (RF-017), sem clipping (55–75/25–45).
  //   - Persistência real em `projections` confirmada via `readProjections`.
  // -------------------------------------------------------------------------

  it("Cenário A (RF-017/E3) — UF sem zona apurada usa a proporção nacional (imputado_nacional)", {
    timeout: 100_000,
  }, async () => {
    if (!PY_BIN) throw new Error(`unreachable (skip): ${SKIP_REASON}`);

    const zoneA = 99041;
    const zoneNat = 99042;

    await seedEleitorado({ uf: UF_A, codZona: zoneA, aptos: 10_000 });
    await seedSnapshot({
      cargo: CARGO_A,
      uf: UF_A,
      codZona: zoneA,
      pctApurado: 0,
      te: 10_000,
      esi: 0,
      c: 0,
      a: 0,
      vvc: 0,
      vaps: {},
    });

    await seedEleitorado({ uf: UF_A_NAT, codZona: zoneNat, aptos: 10_000 });
    await seedSnapshot({
      cargo: CARGO_A,
      uf: UF_A_NAT,
      codZona: zoneNat,
      pctApurado: 100,
      te: 10_000,
      esi: 10_000,
      c: 10_000,
      a: 0,
      vvc: 10_000,
      vaps: { 101: 6_500, 102: 3_500 },
    });

    // Timeout generoso (90s) — ver justificativa medida em
    // `tests/integration/model-cycle.test.ts` (mesmo `cargo=1`, mesmo
    // universo nacional real neste Neon de dev — `_do_project` não
    // filtra por UF na leitura, então esta chamada paga o mesmo custo
    // de rede que T18, ~42s numa execução limpa).
    const result = callDoProject(
      PY_BIN,
      { cargo: CARGO_A, turno: TURNO, trigger_ts: "2026-10-04T20:00:00Z" },
      90_000,
    );
    expect(result.status).toBe(200);
    expect(result.payload.computed).toBe(true);

    const ztRows = result.rows.filter(
      (r) => r.uf === UF_A && (r.candidato_id === 101 || r.candidato_id === 102),
    );
    expect(ztRows.length).toBe(2);

    const c101 = ztRows.find((r) => r.candidato_id === 101);
    const c102 = ztRows.find((r) => r.candidato_id === 102);
    expect(c101).toBeDefined();
    expect(c102).toBeDefined();

    // Marcador do método — RF-017 2º nível (E3 hierárquico).
    expect(c101!.metodo?.tipo).toBe("imputado_nacional");
    expect(c102!.metodo?.tipo).toBe("imputado_nacional");

    // `_uf_projection_row` recebe `pct_apurado_uf=0.0` explicitamente no
    // branch de imputação (api/model/project.py) — não é a média
    // ponderada da UF (que nem tem zona apurada para calcular).
    expect(c101!.pct_apurado).toBe(0);
    expect(c102!.pct_apurado).toBe(0);

    // point ≈ share nacional (única UF com 101/102 é ZQ: 65%/35% exatos
    // — 1 zona, bootstrap sem variância de amostragem).
    expect(c101!.pct_projetado).toBeCloseTo(65, 1);
    expect(c102!.pct_projetado).toBeCloseTo(35, 1);

    // Largura do CI ≈ 20pp (±10pp, RF-017). Nem 55–75 nem 25–45 tocam
    // as bordas [0,100] — clipping não atua.
    const width101 = c101!.pct_projetado_upper - c101!.pct_projetado_lower;
    const width102 = c102!.pct_projetado_upper - c102!.pct_projetado_lower;
    expect(width101).toBeCloseTo(20, 1);
    expect(width102).toBeCloseTo(20, 1);

    // Persistência real em `projections` (não só o array capturado).
    // ZT também recebe uma linha imputada por candidato NACIONAL real
    // (ver comentário "Esperado" acima) — filtramos por 101/102 em vez
    // de contar `.length` cru, que inclui os demais candidatos da
    // corrida nacional deste Neon de dev.
    const dbRows = await readProjections({ cargo: CARGO_A, uf: UF_A });
    const dbRows101e102 = dbRows.filter((r) => r.candidato_id === 101 || r.candidato_id === 102);
    expect(dbRows101e102.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // CENÁRIO B — RF-018: UF com <5% apurado vs UF controle 50% apurado
  // -------------------------------------------------------------------------
  //
  // Setup (mesmo run de _do_project):
  //   - UF_B_CTRL=ZC: 10 zonas com envelope EA20 real (vvc=10000, `k=1`)
  //     e pct_apurado=50, `vap` variando por zona (50%→62% para o
  //     candidato A) para gerar variância de amostragem no bootstrap de
  //     zonas.
  //   - UF_B_LOW=ZL: MESMAS 10 zonas (mesma distribuição de `vap`), só
  //     `pct_apurado=4` muda — RF-018 ativa (`uf_pct_apurado` é a média
  //     ponderada da coluna `snapshots.pct_apurado`, independente do
  //     `esi/te` do envelope, que continua "totalmente apurado" nas duas
  //     UFs — RF-018 e "zona apurada" são conceitos independentes).
  //
  // Esperado:
  //   - width(ZL) ≥ 1.5 × width(ZC) para o candidato A (201).
  // -------------------------------------------------------------------------

  it("Cenário B (RF-018) — UF <5% apurada: largura CI ≥ 1.5× UF controle", {
    timeout: 90_000,
  }, async () => {
    if (!PY_BIN) throw new Error(`unreachable (skip): ${SKIP_REASON}`);

    // Estratégia: dois `_do_project` independentes (cargos sintéticos
    // distintos), USANDO A MESMA UF e zonas idênticas. A única diferença
    // é o `pct_apurado` dos snapshots (50 vs 4). Como o seed do bootstrap
    // é `seed_base XOR hash("uf:candidatos")`, e seed_base depende de
    // (cargo, turno, trigger_ts)…
    //
    // PROBLEMA: cargos diferentes ⇒ seed_base diferente ⇒ bootstrap
    // diferente. Solução: usar o MESMO cargo e trigger_ts em ambas as
    // chamadas, e isolar via UF distinta (ZC vs ZL). O bootstrap fica
    // semeado com `hash(ZC:candidatos)` ≠ `hash(ZL:candidatos)`, mas
    // como os resamples de 1000 são amostras grandes da MESMA
    // distribuição empírica (mesmas 10 zonas), as larguras pré-inflate
    // são muito próximas — diferença pequena segundo runs locais. A
    // regra 1.5× ainda passa com folga.
    //
    // `vap` variável por zona é obrigatório: zonas idênticas → razão
    // idêntica em toda zona → bootstrap variance=0 → CI degenera para 0.
    // Aqui distribuímos o share do candidato A em 50pp-62pp por zona
    // para gerar variância mensurável.
    const zones = [99041, 99042, 99043, 99044, 99045, 99046, 99047, 99048, 99049, 99050];
    const pctByZone: number[] = [50, 52, 54, 56, 58, 54, 56, 58, 60, 62];
    const VVC = 10_000;

    const seedUf = async (uf: string, pctApurado: number) => {
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i] as number;
        const pctA = pctByZone[i] as number;
        const vapA = Math.round((pctA / 100) * VVC);
        const vapB = VVC - vapA;
        await seedEleitorado({ uf, codZona: z, aptos: VVC });
        await seedSnapshot({
          cargo: CARGO_B,
          uf,
          codZona: z,
          pctApurado,
          te: VVC,
          esi: VVC,
          c: VVC,
          a: 0,
          vvc: VVC,
          vaps: { 201: vapA, 202: vapB },
        });
      }
    };
    await seedUf(UF_B_CTRL, 50);
    await seedUf(UF_B_LOW, 4);

    // Single _do_project run — projeta as 2 UFs simultaneamente.
    const result = callDoProject(PY_BIN, {
      cargo: CARGO_B,
      turno: TURNO,
      trigger_ts: "2026-10-04T20:30:00Z",
    });
    expect(result.status).toBe(200);
    expect(result.payload.computed).toBe(true);

    const ctrlRows = await readProjections({ cargo: CARGO_B, uf: UF_B_CTRL });
    const lowRows = await readProjections({ cargo: CARGO_B, uf: UF_B_LOW });
    expect(ctrlRows.length).toBe(2);
    expect(lowRows.length).toBe(2);

    // Compara o candidato 201 (líder).
    const ctrl201 = ctrlRows.find((r) => r.candidato_id === 201);
    const low201 = lowRows.find((r) => r.candidato_id === 201);
    expect(ctrl201).toBeDefined();
    expect(low201).toBeDefined();

    const widthCtrl = ctrl201!.pct_projetado_upper - ctrl201!.pct_projetado_lower;
    const widthLow = low201!.pct_projetado_upper - low201!.pct_projetado_lower;

    // Sanity: ambos positivos (bootstrap não colapsou).
    expect(widthCtrl).toBeGreaterThan(0);
    expect(widthLow).toBeGreaterThan(0);

    // Threshold do RF-018: widthLow ≥ 1.5× widthCtrl. Tolerância pequena
    // (5%) absorve flutuação de seeds distintos entre as duas UFs
    // (bootstraps independentes, mesma distribuição empírica).
    const ratio = widthLow / widthCtrl;
    expect(ratio).toBeGreaterThanOrEqual(1.5 * 0.95);
  });

  // -------------------------------------------------------------------------
  // CENÁRIO C — candidato SEM histórico 2022 recebe projeção NORMALMENTE
  // -------------------------------------------------------------------------
  //
  // Antigo "K-1" (ADR-0015): REMOVIDO. 2022 saiu inteiramente da projeção
  // de candidatos (decisão E1) — não existe mais "candidato sem bloco
  // 2022 mapeável" porque 2022 não é insumo do cálculo. A corrida de
  // `estimate_uf_candidatos` é a união dos candidatos VISTOS nas zonas
  // apuradas 2026 (`extrapolation.py`, docstring) — quem aparece no
  // snapshot recebe projeção, ponto. Candidato 9999 (inexistente em
  // qualquer 2022 fictício) é usado só para deixar claro que o número do
  // candidato é irrelevante para o pipeline.
  //
  // Setup:
  //   - UF_C=ZK, 5 zonas IDÊNTICAS (mesmo `vap`/`vvc` em toda zona) com
  //     candidato 301 (72%) e 9999 (28%) — zonas idênticas ⇒ bootstrap
  //     sem variância de amostragem ⇒ share exato, reproduzindo o
  //     percentual de entrada bit-a-bit.
  //
  // Esperado:
  //   - Ambos os candidatos (301 E 9999) recebem linha em `projections`.
  //   - `pct_projetado` coerente com o `vap` semeado (72%/28% exatos).
  //   - `votos_atuais`/`votos_projetados` coerentes com Σvap das 5 zonas
  //     (sem zona não-apurada para escalar — `scale == 1`).
  //   - `metodo.tipo === "extrapolacao_apurado"` (caminho normal, não
  //     imputado).
  // -------------------------------------------------------------------------

  it("Cenário C — candidato sem histórico 2022 recebe projeção normalmente", {
    timeout: 60_000,
  }, async () => {
    if (!PY_BIN) throw new Error(`unreachable (skip): ${SKIP_REASON}`);

    const zones = [99041, 99042, 99043, 99044, 99045];
    const VVC = 100;
    const VAP_301 = 72;
    const VAP_9999 = 28;

    for (const z of zones) {
      await seedEleitorado({ uf: UF_C, codZona: z, aptos: 10_000 });
      await seedSnapshot({
        cargo: CARGO_C,
        uf: UF_C,
        codZona: z,
        pctApurado: 50,
        te: VVC,
        esi: VVC,
        c: VVC,
        a: 0,
        vvc: VVC,
        vaps: { 301: VAP_301, 9999: VAP_9999 },
      });
    }

    const result = callDoProject(PY_BIN, {
      cargo: CARGO_C,
      turno: TURNO,
      trigger_ts: "2026-10-04T21:00:00Z",
    });
    expect(result.status).toBe(200);
    expect(result.payload.computed).toBe(true);

    const rows = result.rows.filter((r) => r.uf === UF_C);
    const c301 = rows.find((r) => r.candidato_id === 301);
    const c9999 = rows.find((r) => r.candidato_id === 9999);

    // Ambos recebem projeção — nenhum "K-1" a excluir candidatos.
    expect(c301).toBeDefined();
    expect(c9999).toBeDefined();

    // Share exato — 5 zonas idênticas, sem variância de amostragem.
    expect(c301!.pct_projetado).toBeCloseTo(72, 1);
    expect(c9999!.pct_projetado).toBeCloseTo(28, 1);

    // Caminho normal (não RF-017) — método é extrapolação do apurado.
    expect(c301!.metodo?.tipo).toBe("extrapolacao_apurado");
    expect(c9999!.metodo?.tipo).toBe("extrapolacao_apurado");

    // Votos coerentes: 5 zonas × vap, sem zona não-apurada a escalar
    // (`n_zonas_imputadas === 0` ⇒ `scale === 1` em `extrapolation.py`).
    expect(c301!.metodo?.n_zonas_imputadas).toBe(0);
    expect(c301!.votos_atuais).toBe(zones.length * VAP_301);
    expect(c301!.votos_projetados).toBe(zones.length * VAP_301);
    expect(c9999!.votos_atuais).toBe(zones.length * VAP_9999);
    expect(c9999!.votos_projetados).toBe(zones.length * VAP_9999);

    // Persistência real em `projections`.
    const dbRows = await readProjections({ cargo: CARGO_C, uf: UF_C });
    expect(dbRows.length).toBe(2);
  });
});

// Em ambiente CI sem DB/Python, ainda queremos uma evidência audível de
// que o teste foi pulado (a flag `describe.skipIf` já reporta, mas
// adicionamos uma it() informativa para deixar o motivo no terminal).
describe.skipIf(!SKIP)("T19 — skipped", () => {
  it("integration test skipped", () => {
    expect(SKIP_REASON).toBeTruthy();
  });
});
