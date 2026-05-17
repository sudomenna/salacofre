/**
 * lib/tse/targets.ts — Tabela de targets (UF × cargo × zona) para o pipeline de ingestão.
 *
 * Responsabilidades:
 *  - Construir URLs canônicas EA20 do CDN TSE.
 *  - Materializar a lista de targets conforme o env (preview vs production).
 *  - Cache leve em memória do processo com TTL ~5min por env.
 *
 * Cobre: RF-001 (descoberta de endpoints), decisão D-4 (whitelist preview).
 * ADRs: 0001 (Edge Config no read path — Postgres só no write path), 0002, 0011.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Target {
  uf: string;
  cargo: 1 | 3;
  codMunicipioTse: number;
  codZona: number;
  url: string;
  codEleicao: string;
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

/**
 * Constrói a URL canônica EA20 para uma zona × cargo × eleição.
 *
 * Formato confirmado no design.md (exemplo real 2022):
 *   https://resultados.tse.jus.br/oficial/ele2022/544/dados/sp/sp80055/sp80055-c0001-z0001-e000544.json
 *
 * Convenção:
 *   - `codEleicao` é o prefixo completo de path após `/oficial/`, ex.: "ele2026/619".
 *     O segmento numérico (parte após "/") é extraído para preencher o sufixo `-e` (pad 6 dígitos).
 *   - UF sempre em lowercase nas URLs do CDN TSE.
 *   - codMunicipioTse é usado sem padding (TSE usa o número direto, ex.: "80055").
 *   - Cargo paddado com 4 dígitos (c0001, c0003).
 *   - Zona paddada com 4 dígitos (z0001..z9999; para zonas ≥10.000 o pad é irrelevante).
 */
export function buildEA20Url(
  codEleicao: string,
  uf: string,
  codMunicipioTse: number,
  codZona: number,
  cargo: 1 | 3,
): string {
  // Extrai o ID numérico do codEleicao (ex.: "ele2026/619" → "619").
  const parts = codEleicao.split("/");
  const numericPart = parts[parts.length - 1] ?? codEleicao;

  const ufLower = uf.toLowerCase();
  const munStr = String(codMunicipioTse);
  const cargoStr = String(cargo).padStart(4, "0");
  const zonaStr = String(codZona).padStart(4, "0");
  const eleicaoStr = numericPart.padStart(6, "0");

  // ex.: sp80055
  const munKey = `${ufLower}${munStr}`;

  return (
    `https://resultados.tse.jus.br/oficial/${codEleicao}/dados/` +
    `${ufLower}/${munKey}/${munKey}-c${cargoStr}-z${zonaStr}-e${eleicaoStr}.json`
  );
}

// ---------------------------------------------------------------------------
// codEleicao loader
// ---------------------------------------------------------------------------

/**
 * Lê TSE_COD_ELEICAO do ambiente. Throw explícito se ausente — o pipeline não
 * pode operar sem saber qual eleição está sendo apurada.
 *
 * Formato esperado: "ele2026/619" (prefixo completo de path do CDN TSE).
 * Exemplo 2022: "ele2022/544".
 * A resolução TSE 2026 confirma o número exato quando publicada.
 */
function getCodEleicao(): string {
  const value = process.env["TSE_COD_ELEICAO"];
  if (!value || value.trim() === "") {
    throw new Error(
      "[targets] TSE_COD_ELEICAO não está definida. " +
        'Configure a variável com o prefixo de eleição (ex.: "ele2026/619"). ' +
        "O número exato será confirmado pela resolução TSE 2026 quando publicada.",
    );
  }
  return value.trim();
}

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

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ---------------------------------------------------------------------------
// listIngestTargets (função principal)
// ---------------------------------------------------------------------------

/**
 * Retorna a lista materializada de targets (UF × cargo × zona) para o ciclo de ingestão.
 *
 * @param env
 *   - 'preview'    → whitelist via TSE_TARGETS_WHITELIST (default: SP × Presidente, ~500 zonas).
 *   - 'production' → todas as zonas × cargos ativos (hardcoded [1,3]; spec 011 pode dinamizar).
 *
 * Cache por 5 minutos no estado do módulo — Fluid Compute reutiliza instâncias,
 * evitando N queries ao Neon por ciclo de 60s.
 *
 * Cobre: RF-001 (descoberta de endpoints), decisão D-4 (whitelist preview).
 */
export async function listIngestTargets(env: "preview" | "production"): Promise<Target[]> {
  const now = Date.now();
  const cached = cache.get(env);
  if (cached && cached.expiresAt > now) {
    return cached.targets;
  }

  const codEleicao = getCodEleicao();

  let targets: Target[];

  if (env === "preview") {
    targets = await buildPreviewTargets(codEleicao);
  } else {
    targets = await buildProductionTargets(codEleicao);
  }

  cache.set(env, { targets, expiresAt: now + CACHE_TTL_MS });
  return targets;
}

// ---------------------------------------------------------------------------
// Preview targets
// ---------------------------------------------------------------------------

async function buildPreviewTargets(codEleicao: string): Promise<Target[]> {
  const whitelist = parseWhitelist(process.env["TSE_TARGETS_WHITELIST"]);

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
        codMunicipioTse: zona.codMunicipioTse,
        codZona: zona.codZona,
        url: buildEA20Url(codEleicao, zona.uf, zona.codMunicipioTse, zona.codZona, cargo),
        codEleicao,
      });
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Production targets
// ---------------------------------------------------------------------------

/**
 * Em produção: todas as zonas × cargos ativos.
 * Cargos hardcoded: [1 (Presidente), 3 (Governador)].
 * TODO: spec 011 (Sobre o modelo) ou env var TSE_CARGOS pode dinamizar isso no futuro.
 */
async function buildProductionTargets(codEleicao: string): Promise<Target[]> {
  const CARGOS_ATIVOS: Array<1 | 3> = [1, 3];

  const zonas = await db
    .select({
      codZona: schema.zonas.codZona,
      codMunicipioTse: schema.zonas.codMunicipioTse,
      uf: schema.zonas.uf,
    })
    .from(schema.zonas);

  const targets: Target[] = [];

  for (const zona of zonas) {
    for (const cargo of CARGOS_ATIVOS) {
      targets.push({
        uf: zona.uf,
        cargo,
        codMunicipioTse: zona.codMunicipioTse,
        codZona: zona.codZona,
        url: buildEA20Url(codEleicao, zona.uf, zona.codMunicipioTse, zona.codZona, cargo),
        codEleicao,
      });
    }
  }

  return targets;
}
