/**
 * lib/tse/targets.ts — Tabela de targets (UF/BR × cargo [× zona]) para o pipeline de ingestão.
 *
 * Responsabilidades:
 *  - Construir URLs canônicas EA20 do CDN TSE (host configurável — RF-001).
 *  - Materializar a lista de targets conforme o env (preview vs production).
 *  - Cache leve em memória do processo com TTL ~5min por env.
 *
 * Cobre: RF-001 (descoberta de endpoints), decisão D-4 (whitelist preview).
 * ADRs: 0001 (Edge Config no read path — Postgres só no write path), 0002, 0011.
 *
 * ---------------------------------------------------------------------------
 * REESCRITA — 2026-09-05 (hardening pré-simulado, 9 PDFs oficiais TSE 2026)
 * ---------------------------------------------------------------------------
 *
 * O builder de URL anterior (`buildEA20Url`) montava:
 *   `${base}/${codEleicao}/dados/${uf}/${uf}${munic}/${uf}${munic}-c${cargo}-z${zona}-e${eleicao}.json`
 * contra o confirmado em `docs/reference/tse-2026-leiautes.md` (fonte:
 * tse_docs/txt/tse-instrucoes-para-download-2026.txt § 3 tabela "ID da Pasta 6"
 * + tse-ea20-arquivo-de-resultado-unificado.txt § 2):
 *   1. NÃO há subpasta de município — "dados/<uf|br|zz>" é pasta FOLHA
 *      ("não há subpastas abaixo dela e os arquivos estarão diretamente
 *      armazenados nessa pasta").
 *   2. A ordem dos tokens no nome é `-z<ZONA>-c<CARGO>`, não `-c-z`.
 *   3. Falta o sufixo `-u` (arquivo "unificado").
 *   4. Existem arquivos agregados de UF (`<uf>-c<cargo>-e<eleicao>-u.json`) e
 *      de Brasil (`br-c<cargo>-e<eleicao>-u.json>`) — granularidade de zona
 *      não é a única opção.
 *   5. O código do município é zero-padded a 5 dígitos (não usado sem padding
 *      como antes — coincidência de "80055" já ter 5 dígitos escondeu o bug).
 *
 * Toda URL malformada é um risco de bloqueio de IP por 404 seguido de rajada
 * (ver FAQ técnica do simulado, citada em lib/tse/client.ts) — daí a
 * reescrita completa em vez de patch incremental.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Nível de abrangência de um target.
 *   - "zona": arquivo de resultado unificado da zona eleitoral (mais granular;
 *     é a unidade da regra de três do modelo — `k = te/esi` por zona, spec 002
 *     RF-011/RF-012, ADR-0021).
 *   - "uf": arquivo agregado da UF inteira (1 GET cobre todos os municípios/
 *     zonas da UF).
 *   - "br": arquivo agregado nacional (só existe para cargo 1 — Presidente).
 */
export type TargetNivel = "zona" | "uf" | "br";

export interface Target {
  uf: string;
  cargo: 1 | 3;
  nivel: TargetNivel;
  /** Sentinel 0 quando `nivel !== "zona"` — ver comentário em `listIngestTargets`. */
  codMunicipioTse: number;
  /** Sentinel 0 quando `nivel !== "zona"` — ver comentário em `listIngestTargets`. */
  codZona: number;
  url: string;
  codEleicao: string;
}

// ---------------------------------------------------------------------------
// Base URL (host do CDN TSE — configurável)
// ---------------------------------------------------------------------------

/** Host de produção do CDN de resultados TSE. Sem barra final. */
const DEFAULT_TSE_BASE_URL = "https://resultados.tse.jus.br/oficial";

/**
 * getTseBaseUrl — resolve o host base do CDN TSE a partir de `TSE_BASE_URL`.
 *
 * Aceita:
 *   - Ausente → default de produção (`DEFAULT_TSE_BASE_URL`).
 *   - Qualquer URL `https:` (produção `resultados.tse.jus.br` ou o ambiente
 *     de simulado `resultados-sim.tse.jus.br`).
 *   - `http://localhost` ou `http://127.0.0.1` (qualquer porta) — exclusivo
 *     para apontar ao mock local (`scripts/tse-mock-server.ts`) em dev/testes.
 *   - Qualquer outro valor (ex.: `http://` para um host de produção real,
 *     ou um scheme desconhecido) → throw. Nunca aceitar `http://` puro para
 *     um host de produção evita downgrade silencioso de TLS.
 *
 * Barra final é removida (normaliza para o mesmo formato de
 * DEFAULT_TSE_BASE_URL) para que os builders de URL sempre concatenem com um
 * único `/` explícito.
 */
export function getTseBaseUrl(): string {
  const raw = process.env.TSE_BASE_URL;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TSE_BASE_URL;
  }

  const trimmed = raw.trim().replace(/\/$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `[targets] TSE_BASE_URL inválida: "${raw}" — não é uma URL válida. ` +
        `Use o default (produção), a URL do ambiente de simulado, ou http://localhost:<porta> para o mock.`,
    );
  }

  const isHttps = parsed.protocol === "https:";
  const isLocalHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

  if (!isHttps && !isLocalHttp) {
    throw new Error(
      `[targets] TSE_BASE_URL inválida: "${raw}" — apenas https:// (produção/simulado) ou ` +
        `http://localhost|127.0.0.1 (mock local) são aceitos.`,
    );
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Helpers de formatação — compartilhados por todos os builders de URL
// ---------------------------------------------------------------------------

/** Extrai o segmento numérico de `codEleicao` (ex.: "ele2026/619" → "619") e
 *  zero-pad a 6 dígitos, conforme `e<ELEICA>` do dicionário de nomes
 *  (Instruções para download § 5). */
function formatEleicaoSuffix(codEleicao: string): string {
  const parts = codEleicao.split("/");
  const numericPart = parts[parts.length - 1] ?? codEleicao;
  return numericPart.padStart(6, "0");
}

function formatCargo(cargo: 1 | 3): string {
  return String(cargo).padStart(4, "0");
}

function formatZona(codZona: number): string {
  return String(codZona).padStart(4, "0");
}

/** <código município> = 5 posições, zero-padded (Instruções § 5). */
function formatMunicipio(codMunicipioTse: number): string {
  return String(codMunicipioTse).padStart(5, "0");
}

// ---------------------------------------------------------------------------
// URL builders — um por tipo de arquivo (Instruções § 3 tabela "ID da Pasta 6"
// + EA20 § 2 + EA14/EA15 § 2)
// ---------------------------------------------------------------------------

/**
 * Arquivo de resultado unificado de ZONA ELEITORAL.
 * Formato confirmado: `<uf><município>-z<zona>-c<cargo>-e<eleição>-u.json`
 * Exemplo (EA20 § 2): `sp71072-z0001-c0003-e999999-u.json`
 */
export function buildEA20UrlZona(args: {
  codEleicao: string;
  uf: string;
  codMunicipioTse: number;
  codZona: number;
  cargo: 1 | 3;
  baseUrl?: string;
}): string {
  const baseUrl = args.baseUrl ?? getTseBaseUrl();
  const ufLower = args.uf.toLowerCase();
  const munStr = formatMunicipio(args.codMunicipioTse);
  const fileName =
    `${ufLower}${munStr}-z${formatZona(args.codZona)}-c${formatCargo(args.cargo)}` +
    `-e${formatEleicaoSuffix(args.codEleicao)}-u.json`;

  return `${baseUrl}/${args.codEleicao}/dados/${ufLower}/${fileName}`;
}

/**
 * Arquivo de resultado unificado de MUNICÍPIO.
 * Formato confirmado: `<uf><município>-c<cargo>-e<eleição>-u.json`
 * Exemplo (EA20 § 2): `sp71072-c0003-e999999-u.json`
 */
export function buildEA20UrlMunicipio(args: {
  codEleicao: string;
  uf: string;
  codMunicipioTse: number;
  cargo: 1 | 3;
  baseUrl?: string;
}): string {
  const baseUrl = args.baseUrl ?? getTseBaseUrl();
  const ufLower = args.uf.toLowerCase();
  const munStr = formatMunicipio(args.codMunicipioTse);
  const fileName = `${ufLower}${munStr}-c${formatCargo(args.cargo)}-e${formatEleicaoSuffix(args.codEleicao)}-u.json`;

  return `${baseUrl}/${args.codEleicao}/dados/${ufLower}/${fileName}`;
}

/**
 * Arquivo de resultado unificado de UF (agregado — todos os municípios/zonas
 * da UF em 1 arquivo).
 * Formato confirmado: `<uf>-c<cargo>-e<eleição>-u.json`
 * Exemplo (EA20 § 2): `sp-c0003-e999999-u.json`
 */
export function buildEA20UrlUf(args: {
  codEleicao: string;
  uf: string;
  cargo: 1 | 3;
  baseUrl?: string;
}): string {
  const baseUrl = args.baseUrl ?? getTseBaseUrl();
  const ufLower = args.uf.toLowerCase();
  const fileName = `${ufLower}-c${formatCargo(args.cargo)}-e${formatEleicaoSuffix(args.codEleicao)}-u.json`;

  return `${baseUrl}/${args.codEleicao}/dados/${ufLower}/${fileName}`;
}

/**
 * Arquivo de resultado unificado do BRASIL (agregado nacional — só existe
 * para cargo Presidente, código 0001; EA20 § 2 tabela de cargos).
 * Formato confirmado: `br-c<cargo>-e<eleição>-u.json`
 * Exemplo (EA20 § 2): `br-c0003-e999999-u.json` (tabela usa 0003 como
 * exemplo genérico de formatação; na prática só 0001/Presidente existe em BR).
 */
export function buildEA20UrlBr(args: {
  codEleicao: string;
  cargo: 1 | 3;
  baseUrl?: string;
}): string {
  const baseUrl = args.baseUrl ?? getTseBaseUrl();
  const fileName = `br-c${formatCargo(args.cargo)}-e${formatEleicaoSuffix(args.codEleicao)}-u.json`;

  return `${baseUrl}/${args.codEleicao}/dados/br/${fileName}`;
}

/**
 * Arquivo de acompanhamento BRASIL (EA14) — sem cargo no nome.
 * Formato confirmado: `br-e<eleição>-ab.json`
 */
export function buildEA14Url(args: { codEleicao: string; baseUrl?: string }): string {
  const baseUrl = args.baseUrl ?? getTseBaseUrl();
  const fileName = `br-e${formatEleicaoSuffix(args.codEleicao)}-ab.json`;

  return `${baseUrl}/${args.codEleicao}/dados/br/${fileName}`;
}

/**
 * Arquivo de acompanhamento por UF (EA15) — sem cargo no nome.
 * Formato confirmado: `<uf>-e<eleição>-ab.json`
 */
export function buildEA15Url(args: { codEleicao: string; uf: string; baseUrl?: string }): string {
  const baseUrl = args.baseUrl ?? getTseBaseUrl();
  const ufLower = args.uf.toLowerCase();
  const fileName = `${ufLower}-e${formatEleicaoSuffix(args.codEleicao)}-ab.json`;

  return `${baseUrl}/${args.codEleicao}/dados/${ufLower}/${fileName}`;
}

/**
 * buildEA20Url — mantido por compatibilidade com chamadores/testes
 * existentes. Delega para `buildEA20UrlZona` (mesma granularidade do
 * comportamento antigo), mas agora com o nome/ordem/sufixo CORRETOS.
 *
 * @deprecated Prefira os builders nomeados (`buildEA20UrlZona`,
 * `buildEA20UrlMunicipio`, `buildEA20UrlUf`, `buildEA20UrlBr`) em código novo
 * — a assinatura posicional aqui existe só para não quebrar call sites
 * antigos durante a migração.
 */
export function buildEA20Url(
  codEleicao: string,
  uf: string,
  codMunicipioTse: number,
  codZona: number,
  cargo: 1 | 3,
  baseUrl: string = getTseBaseUrl(),
): string {
  return buildEA20UrlZona({ codEleicao, uf, codMunicipioTse, codZona, cargo, baseUrl });
}

// ---------------------------------------------------------------------------
// codEleicao loader
// ---------------------------------------------------------------------------

/**
 * Lê TSE_COD_ELEICAO do ambiente. Throw explícito se ausente ou com formato
 * inválido — o pipeline não pode operar sem saber, com certeza, qual eleição
 * está sendo apurada (uma URL malformada apontando para o TSE real pode
 * disparar o bloqueio de IP por 10min descrito na FAQ técnica do simulado).
 *
 * Formato exigido: `ele<AAAA>/<dígitos>` — ex.: "ele2026/619", "ele2022/544".
 * Confirmado contra o `ele-c.json` real (Instruções § 3 + EA11 § 3): o path
 * é `<ciclo>/<eleição>` — `ciclo` é literalmente a pasta "ele<AAAA>" e
 * `eleição` é o `pl[].e[].cd` numérico do EA11. `TSE_COD_ELEICAO` codifica os
 * dois segmentos concatenados por "/", que é exatamente como aparecem no path
 * do CDN (Instruções § 3, IDs de pasta 2 e 3).
 */
export function getCodEleicao(): string {
  const value = process.env.TSE_COD_ELEICAO;
  if (!value || value.trim() === "") {
    throw new Error(
      "[targets] TSE_COD_ELEICAO não está definida. " +
        'Configure a variável com o prefixo de eleição (ex.: "ele2026/619"). ' +
        "O número exato será confirmado pela resolução TSE 2026 quando publicada.",
    );
  }

  const trimmed = value.trim();
  if (!/^ele\d{4}\/\d+$/.test(trimmed)) {
    throw new Error(
      `[targets] TSE_COD_ELEICAO inválida: "${trimmed}" — formato esperado "ele<AAAA>/<dígitos>" ` +
        '(ex.: "ele2026/619"). Uma URL malformada pode disparar bloqueio de IP no TSE — corrija antes de retomar.',
    );
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Cargos ativos (env-configurável)
// ---------------------------------------------------------------------------

const VALID_CARGOS = [1, 3] as const;

/**
 * getActiveCargos — lê `TSE_CARGOS` do ambiente (default: "1,3").
 *
 * Formato: lista separada por vírgula de cargos suportados (1=Presidente,
 * 3=Governador). Tokens inválidos são ignorados com um warn (mesmo padrão
 * de tolerância de `parseWhitelist`); se nenhum token válido sobrar, cai no
 * default `[1, 3]`.
 *
 * Substitui o antigo array hardcoded `CARGOS_ATIVOS`/`ACTIVE_CARGOS` — usado
 * tanto por `buildProductionTargets` quanto pelo model-trigger em
 * `app/api/ingest/route.ts`.
 */
export function getActiveCargos(): Array<1 | 3> {
  const DEFAULT_CARGOS = "1,3";
  const raw = (process.env.TSE_CARGOS ?? DEFAULT_CARGOS).trim() || DEFAULT_CARGOS;

  const result: Array<1 | 3> = [];
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    const num = Number(trimmed);
    if (!VALID_CARGOS.includes(num as 1 | 3)) {
      console.warn(
        `[targets] Cargo inválido "${trimmed}" em TSE_CARGOS — apenas 1 (Presidente) e 3 (Governador) são suportados. Token ignorado.`,
      );
      continue;
    }
    if (!result.includes(num as 1 | 3)) {
      result.push(num as 1 | 3);
    }
  }

  if (result.length === 0) {
    console.warn("[targets] TSE_CARGOS não produziu nenhum cargo válido. Usando default [1, 3].");
    return [1, 3];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Granularidade (env-configurável)
// ---------------------------------------------------------------------------

const VALID_GRANULARIDADES = ["uf", "zona"] as const;
export type TseGranularidade = (typeof VALID_GRANULARIDADES)[number];

/**
 * getGranularidade — lê `TSE_GRANULARIDADE` do ambiente (default: "zona" desde 2026-09-05, E4).
 *
 * Decisão (2026-09-05, hardening pré-simulado): agora que se confirma a
 * existência de arquivos agregados de UF e Brasil (Divergência 3 do
 * diagnóstico pré-simulado — ver docs/reference/tse-2026-leiautes.md § fan-out),
 * o ciclo de ingestão NÃO precisa mais fazer ~2.600 zonas × cargo GETs por
 * ciclo para ter visão nacional/UF — 27 UFs × cargo (+ 1 BR para Presidente)
 * cobrem o mesmo dado agregado com ~28 GETs por cargo.
 *
 *   - "uf" (opt-in): 27 UFs × cargos ativos + 1 BR (só cargo 1). Cabe
 *     folgadamente no maxDuration/rate-limit. É o suficiente para as telas
 *     nacional/UF (specs 003/004).
 *   - "zona": granularidade completa (~2.600 zonas × cargos ativos). É a
 *     granularidade do modelo: a extrapolação do apurado projeta zona a zona
 *     (spec 002 RF-011/RF-012, ADR-0021) — ver recomendação de fan-out no
 *     relatório desta tarefa. NÃO usar como default em produção sem EA14/EA15 gating (Fase
 *     1b) ou o ciclo estoura o rate limit de 100 req/s.
 *
 * IMPORTANTE (limitação conhecida, não resolvida aqui): a tabela `snapshots`
 * (lib/db/schema.ts) tem `cod_zona: integer NOT NULL` como parte da chave de
 * dedup (`cargo, turno, uf, cod_zona`). Targets de nível "uf"/"br" usam os
 * sentinels `codZona=0` (e `uf="BR"` para o nacional) para caber no schema
 * atual SEM migração — `uf` sempre diferencia UFs reais entre si e de "BR",
 * e nenhuma zona real usa o código 0 (zonas começam em 0001), então não há
 * colisão. Essa é uma decisão pragmática de curto prazo — recomenda-se ADR
 * formal (coluna `nivel` dedicada) no hardening pós-simulado; ver relatório.
 */
export function getGranularidade(): TseGranularidade {
  // Default `zona` desde 2026-09-05 (decisão E4 do plano de projeção por regra
  // de três): o modelo precisa de dado por zona, e o modo `uf` está quebrado no
  // modelo (`eleitorado` não tem linha `(uf, 0)` → peso 0). `uf` segue aceito
  // como opt-in explícito para ciclos leves de diagnóstico.
  const raw = (process.env.TSE_GRANULARIDADE ?? "zona").trim().toLowerCase();
  if ((VALID_GRANULARIDADES as readonly string[]).includes(raw)) {
    return raw as TseGranularidade;
  }
  console.warn(
    `[targets] TSE_GRANULARIDADE inválida: "${raw}" — valores aceitos: "uf" | "zona". Usando default "zona".`,
  );
  return "zona";
}

/** Sentinel de zona/município para targets de nível "uf"/"br" — ver nota em `getGranularidade`. */
const SENTINEL_ZONA_OU_MUNICIPIO = 0;

/** Lista estática das 27 UFs (26 estados + DF) — usada em granularidade "uf"
 *  para não depender de uma consulta a `zonas` (a tabela `zonas` é
 *  populada por zona real e não tem uma linha "resumo" por UF). */
const TODAS_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

// ---------------------------------------------------------------------------
// Whitelist parser (env preview)
// ---------------------------------------------------------------------------

/**
 * Formatos aceitos em TSE_TARGETS_WHITELIST:
 *   "SP:1"          → SP × cargo Presidente
 *   "SP:1,SP:3"     → SP × Presidente + SP × Governador
 *   "SP:1,RJ:1"     → SP e RJ × Presidente
 *   "SP:1,RJ:3,MG:1,MG:3" → múltiplas combinações
 *
 * Se a variável estiver ausente ou inválida, usa o default "SP:1".
 */
function parseWhitelist(raw: string | undefined): Array<{ uf: string; cargo: 1 | 3 }> {
  const DEFAULT_WHITELIST = "SP:1";
  const input = (raw ?? DEFAULT_WHITELIST).trim() || DEFAULT_WHITELIST;

  const result: Array<{ uf: string; cargo: 1 | 3 }> = [];

  for (const token of input.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    const [rawUf, rawCargo] = trimmed.split(":");
    if (!rawUf || !rawCargo) {
      console.warn(`[targets] Token inválido em TSE_TARGETS_WHITELIST: "${trimmed}" — ignorado.`);
      continue;
    }

    const uf = rawUf.trim().toUpperCase();
    const cargoNum = Number(rawCargo.trim());

    if (cargoNum !== 1 && cargoNum !== 3) {
      console.warn(
        `[targets] Cargo inválido "${rawCargo}" em token "${trimmed}" — apenas 1 (Presidente) e 3 (Governador) são suportados. Token ignorado.`,
      );
      continue;
    }

    result.push({ uf, cargo: cargoNum });
  }

  if (result.length === 0) {
    console.warn(
      "[targets] TSE_TARGETS_WHITELIST não produziu nenhum token válido. Usando default SP:1.",
    );
    result.push({ uf: "SP", cargo: 1 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cache em memória (módulo-level, TTL 5min)
// ---------------------------------------------------------------------------

interface CacheEntry {
  targets: Target[];
  expiresAt: number;
}

/**
 * Chave do cache inclui `codEleicao`, `baseUrl` e `granularidade` além de
 * `env` — sem isso, trocar `TSE_BASE_URL`/`TSE_GRANULARIDADE` (ex.: para
 * apontar ao mock local em dev, ou para alternar uf↔zona) reaproveitaria
 * targets construídos com a config antiga até o TTL expirar, silenciosamente.
 */
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function cacheKey(
  env: "preview" | "production",
  codEleicao: string,
  baseUrl: string,
  granularidade: TseGranularidade,
  cargoFiltro: 1 | 3 | undefined,
): string {
  return `${env}|${codEleicao}|${baseUrl}|${granularidade}|${cargoFiltro ?? "all"}`;
}

/**
 * clearTargetsCache — limpa o cache em memória do módulo.
 *
 * Uso: testes que trocam `TSE_BASE_URL`/`TSE_COD_ELEICAO`/`TSE_TARGETS_WHITELIST`/
 * `TSE_GRANULARIDADE` entre casos e precisam de uma lista de targets
 * recém-materializada, e scripts de longa duração (ex.: `tse-watch.ts`) que
 * trocam de ambiente em runtime sem reiniciar o processo.
 */
export function clearTargetsCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// listIngestTargets (função principal)
// ---------------------------------------------------------------------------

export interface ListIngestTargetsOptions {
  /**
   * Restringe os alvos a um único cargo. `undefined` (default) mantém o
   * comportamento anterior: todos os cargos ativos (`getActiveCargos()` /
   * `TSE_CARGOS`).
   *
   * Usado pelo cron por cargo (ADR-0035 D3, `app/api/ingest/[cargo]/route.ts`):
   * cada invocação do cron cobre só um cargo, então nunca precisa enumerar
   * o outro. Quando `cargo` não está entre os cargos ativos (`TSE_CARGOS`),
   * o resultado é uma lista vazia — não há fallback silencioso para "todos".
   */
  cargo?: 1 | 3;
}

/**
 * Retorna a lista materializada de targets para o ciclo de ingestão.
 *
 * @param env
 *   - 'preview'    → whitelist via TSE_TARGETS_WHITELIST (default: SP × Presidente).
 *   - 'production' → todas as UFs (ou zonas, conforme `TSE_GRANULARIDADE`) × cargos ativos.
 * @param opts.cargo — restringe a um único cargo (ver `ListIngestTargetsOptions`).
 *
 * Cache por 5 minutos no estado do módulo — Fluid Compute reutiliza instâncias,
 * evitando N queries ao Neon por ciclo de 60s. Chave do cache inclui
 * `codEleicao`, o host base (`TSE_BASE_URL`), a granularidade e o cargo —
 * ver `cacheKey`.
 *
 * Cobre: RF-001 (descoberta de endpoints), decisão D-4 (whitelist preview).
 */
export async function listIngestTargets(
  env: "preview" | "production",
  opts: ListIngestTargetsOptions = {},
): Promise<Target[]> {
  const codEleicao = getCodEleicao();
  const baseUrl = getTseBaseUrl();
  const granularidade = getGranularidade();
  const cargoFiltro = opts.cargo;
  const key = cacheKey(env, codEleicao, baseUrl, granularidade, cargoFiltro);

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.targets;
  }

  let targets: Target[];

  if (env === "preview") {
    targets =
      granularidade === "zona"
        ? await buildPreviewTargetsZona(codEleicao, baseUrl, cargoFiltro)
        : buildPreviewTargetsUf(codEleicao, baseUrl, cargoFiltro);
  } else {
    targets =
      granularidade === "zona"
        ? await buildProductionTargetsZona(codEleicao, baseUrl, cargoFiltro)
        : buildProductionTargetsUf(codEleicao, baseUrl, cargoFiltro);
  }

  cache.set(key, { targets, expiresAt: now + CACHE_TTL_MS });
  return targets;
}

// ---------------------------------------------------------------------------
// Targets — granularidade "uf" (opt-in; default é "zona")
// ---------------------------------------------------------------------------

function buildUfTarget(uf: string, cargo: 1 | 3, codEleicao: string, baseUrl: string): Target {
  return {
    uf,
    cargo,
    nivel: "uf",
    codMunicipioTse: SENTINEL_ZONA_OU_MUNICIPIO,
    codZona: SENTINEL_ZONA_OU_MUNICIPIO,
    url: buildEA20UrlUf({ codEleicao, uf, cargo, baseUrl }),
    codEleicao,
  };
}

function buildBrTarget(cargo: 1 | 3, codEleicao: string, baseUrl: string): Target {
  return {
    uf: "BR",
    cargo,
    nivel: "br",
    codMunicipioTse: SENTINEL_ZONA_OU_MUNICIPIO,
    codZona: SENTINEL_ZONA_OU_MUNICIPIO,
    url: buildEA20UrlBr({ codEleicao, cargo, baseUrl }),
    codEleicao,
  };
}

/**
 * filterCargos — aplica o filtro opcional de cargo a uma lista de cargos
 * ativos. `cargoFiltro === undefined` devolve a lista inalterada (ciclo de
 * todos); caso contrário, restringe a esse único cargo (lista vazia se o
 * cargo pedido não está entre os ativos — sem fallback silencioso).
 */
function filterCargos(
  cargosAtivos: ReadonlyArray<1 | 3>,
  cargoFiltro: 1 | 3 | undefined,
): Array<1 | 3> {
  if (cargoFiltro === undefined) return [...cargosAtivos];
  return cargosAtivos.filter((c) => c === cargoFiltro);
}

/**
 * Preview, granularidade "uf": 1 target por (uf, cargo) da whitelist — sem
 * tocar o DB (a lista de UFs vem literalmente da whitelist, não de `zonas`).
 */
function buildPreviewTargetsUf(codEleicao: string, baseUrl: string, cargoFiltro?: 1 | 3): Target[] {
  const whitelist = parseWhitelist(process.env.TSE_TARGETS_WHITELIST).filter(
    ({ cargo }) => cargoFiltro === undefined || cargo === cargoFiltro,
  );
  return whitelist.map(({ uf, cargo }) => buildUfTarget(uf, cargo, codEleicao, baseUrl));
}

/**
 * Produção, granularidade "uf" (opt-in): 27 UFs × cargos ativos + 1 BR (só
 * cargo 1 — Presidente é o único cargo com arquivo de abrangência Brasil,
 * EA20 § 2 tabela de cargos).
 */
function buildProductionTargetsUf(
  codEleicao: string,
  baseUrl: string,
  cargoFiltro?: 1 | 3,
): Target[] {
  const cargosAtivos = filterCargos(getActiveCargos(), cargoFiltro);
  const targets: Target[] = [];

  for (const uf of TODAS_UFS) {
    for (const cargo of cargosAtivos) {
      targets.push(buildUfTarget(uf, cargo, codEleicao, baseUrl));
    }
  }

  if (cargosAtivos.includes(1)) {
    targets.push(buildBrTarget(1, codEleicao, baseUrl));
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Targets — granularidade "zona" (unidade da regra de três do modelo)
// ---------------------------------------------------------------------------

async function buildPreviewTargetsZona(
  codEleicao: string,
  baseUrl: string,
  cargoFiltro?: 1 | 3,
): Promise<Target[]> {
  const whitelist = parseWhitelist(process.env.TSE_TARGETS_WHITELIST).filter(
    ({ cargo }) => cargoFiltro === undefined || cargo === cargoFiltro,
  );

  const targets: Target[] = [];

  for (const { uf, cargo } of whitelist) {
    const zonas = await db
      .select({
        codZona: schema.zonas.codZona,
        codMunicipioTse: schema.zonas.codMunicipioTse,
        uf: schema.zonas.uf,
      })
      .from(schema.zonas)
      .where(eq(schema.zonas.uf, uf));

    for (const zona of zonas) {
      targets.push({
        uf: zona.uf,
        cargo,
        nivel: "zona",
        codMunicipioTse: zona.codMunicipioTse,
        codZona: zona.codZona,
        url: buildEA20UrlZona({
          codEleicao,
          uf: zona.uf,
          codMunicipioTse: zona.codMunicipioTse,
          codZona: zona.codZona,
          cargo,
          baseUrl,
        }),
        codEleicao,
      });
    }
  }

  return targets;
}

/**
 * Em produção: todos os pares (uf, cod_municipio_tse, cod_zona) de `zonas` ×
 * cargos ativos (`getActiveCargos()` / `TSE_CARGOS`, default `[1, 3]`),
 * restrito a `cargoFiltro` quando informado (ADR-0035 D3, cron por cargo).
 */
async function buildProductionTargetsZona(
  codEleicao: string,
  baseUrl: string,
  cargoFiltro?: 1 | 3,
): Promise<Target[]> {
  const cargosAtivos = filterCargos(getActiveCargos(), cargoFiltro);

  const zonas = await db
    .select({
      codZona: schema.zonas.codZona,
      codMunicipioTse: schema.zonas.codMunicipioTse,
      uf: schema.zonas.uf,
    })
    .from(schema.zonas);

  const targets: Target[] = [];

  for (const zona of zonas) {
    for (const cargo of cargosAtivos) {
      targets.push({
        uf: zona.uf,
        cargo,
        nivel: "zona",
        codMunicipioTse: zona.codMunicipioTse,
        codZona: zona.codZona,
        url: buildEA20UrlZona({
          codEleicao,
          uf: zona.uf,
          codMunicipioTse: zona.codMunicipioTse,
          codZona: zona.codZona,
          cargo,
          baseUrl,
        }),
        codEleicao,
      });
    }
  }

  return targets;
}
