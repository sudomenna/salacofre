/**
 * scripts/verify-fatia-premise.ts
 *
 * **Passo 0 do protocolo do simulado** (`docs/testing/tse-simulados.md:46-105`),
 * automatizado. No dia 15/09 isto tem de ser UM comando, não improviso sob
 * pressão de janela — são quatro janelas de teste antes do dia D e nenhuma se
 * repete.
 *
 * ## A pergunta que ele responde
 *
 * Toda a arquitetura de ingestão pós-migration 0006 (ADR-0035 D1/D2,
 * `api/model/zona_merge.py`) repousa numa premissa **nunca verificada contra
 * dado real**: que o arquivo EA20 de zona
 * `<uf><mun5>-z<zona4>-c<cargo4>-e<n>-u.json` traz apenas a **fatia** da zona
 * que cai naquele município — não a zona inteira.
 *
 * Se a premissa for falsa, `merge_pairs_into_zonas` soma N cópias da mesma
 * zona (N = municípios que ela cobre, até 8 no país) e todo painel municipal
 * credita a zona inteira a cada município que ela toca. Invisível em qualquer
 * teste com fixture sintética — e `tests/unit/model/test_zona_merge_real.py`,
 * apesar de usar dado real de 2022, também não decide: ele parte de um CSV que
 * é fatiado por definição.
 *
 * ## O que ele NÃO faz
 *
 * **Nenhuma requisição HTTP.** A constituição § 1 proíbe sondar URL adivinhada,
 * e um 404 malformado pode bloquear nosso IP por 10 minutos. Este script opera
 * exclusivamente sobre arquivos JÁ baixados à mão para um diretório local
 * (`tests/fixtures/tse/2026-sim/` por padrão), com os `codEleicao` obtidos do
 * `ele-c.json` do ambiente de simulado ou de comunicado oficial.
 *
 * ## Uso
 *
 *   pnpm verify-fatia-premise                          # usa o diretório padrão
 *   pnpm verify-fatia-premise --fixtures <dir>
 *   pnpm verify-fatia-premise --uf MG --zona 4         # restringe a uma zona
 *
 * Exige `DATABASE_URL` (lê `eleitorado` e `zonas`), então:
 *   set -a; . ./.env.local; set +a
 *
 * ## Saída
 *
 * Exit code 0 = FATIA confirmada (a arquitetura está certa, siga o protocolo).
 * Exit code 2 = MULTIPLICAÇÃO (pare e reporte — o modelo inflaria o eleitorado
 *               apurado de ~62% das zonas do país).
 * Exit code 1 = INCONCLUSIVO (faltam arquivos, ou os números não decidem).
 *
 * Um resultado inconclusivo NÃO é sinal verde. É o estado esperado enquanto só
 * houver fixture sintética no diretório.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DEFAULT_DIR = "tests/fixtures/tse/2026-sim";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fixturesDir = arg("fixtures") ?? DEFAULT_DIR;
const filtroUf = arg("uf")?.toUpperCase();
const filtroZona = arg("zona") ? Number(arg("zona")) : undefined;

// ---------------------------------------------------------------------------
// Parsing dos nomes de arquivo — espelha lib/tse/targets.ts
// ---------------------------------------------------------------------------

/** `<uf><mun5>-z<zona4>-c<cargo4>-e<n>-u.json` — nível ZONA (um par). */
const RE_ZONA = /^([a-z]{2})(\d{5})-z(\d{4})-c(\d{4})-e(\d+)-u\.json$/i;
/** `<uf><mun5>-c<cargo4>-e<n>-u.json` — nível MUNICÍPIO. */
const RE_MUNICIPIO = /^([a-z]{2})(\d{5})-c(\d{4})-e(\d+)-u\.json$/i;

interface ArquivoZona {
  file: string;
  uf: string;
  codMunicipioTse: number;
  codZona: number;
  cargo: number;
  payload: Record<string, unknown>;
}
interface ArquivoMunicipio {
  file: string;
  uf: string;
  codMunicipioTse: number;
  cargo: number;
  payload: Record<string, unknown>;
}

/** Número BR (`"1.234,56"`) → float. O TSE publica tudo como string. */
function num(raw: unknown): number {
  if (raw == null) return Number.NaN;
  const s = String(raw).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Raiz do envelope — o EA20 embrulha em `abr[0]` em alguns níveis. */
function raiz(payload: Record<string, unknown>): Record<string, unknown> {
  const abr = payload.abr;
  if (Array.isArray(abr) && abr.length > 0 && typeof abr[0] === "object") {
    return abr[0] as Record<string, unknown>;
  }
  return payload;
}

function campo(payload: Record<string, unknown>, grupo: string, chave: string): number {
  const g = raiz(payload)[grupo];
  if (!g || typeof g !== "object") return Number.NaN;
  return num((g as Record<string, unknown>)[chave]);
}

/** `{numero: vap}` somado sobre toda a hierarquia carg → agr → par → cand. */
function candidatos(payload: Record<string, unknown>): Map<string, number> {
  const out = new Map<string, number>();
  const carg = raiz(payload).carg;
  if (!Array.isArray(carg)) return out;
  for (const c of carg) {
    for (const agrKey of ["agr", "fed"]) {
      const agrs = (c as Record<string, unknown>)[agrKey];
      if (!Array.isArray(agrs)) continue;
      for (const a of agrs) {
        const pars = (a as Record<string, unknown>).par ?? [a];
        if (!Array.isArray(pars)) continue;
        for (const p of pars) {
          const cands = (p as Record<string, unknown>).cand;
          if (!Array.isArray(cands)) continue;
          for (const cand of cands) {
            const n = String((cand as Record<string, unknown>).n ?? "");
            const vap = num((cand as Record<string, unknown>).vap);
            if (n && Number.isFinite(vap)) out.set(n, (out.get(n) ?? 0) + vap);
          }
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leitura do diretório
// ---------------------------------------------------------------------------

function carregar(dir: string): { zonas: ArquivoZona[]; municipios: ArquivoMunicipio[] } {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(`[fatia] diretório não encontrado: ${dir}`);
    console.error(
      "[fatia] no dia 15, baixe à mão os arquivos do Passo 0 para lá " +
        "(docs/testing/tse-simulados.md § Passo 0, item 2).",
    );
    process.exit(1);
  }

  const zonas: ArquivoZona[] = [];
  const municipios: ArquivoMunicipio[] = [];
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const full = join(dir, file);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(readFileSync(full, "utf-8"));
    } catch (err) {
      console.warn(`[fatia] ${file}: JSON inválido, pulando — ${String(err)}`);
      continue;
    }
    const mz = RE_ZONA.exec(file);
    if (mz) {
      zonas.push({
        file,
        uf: mz[1]!.toUpperCase(),
        codMunicipioTse: Number(mz[2]),
        codZona: Number(mz[3]),
        cargo: Number(mz[4]),
        payload,
      });
      continue;
    }
    const mm = RE_MUNICIPIO.exec(file);
    if (mm) {
      municipios.push({
        file,
        uf: mm[1]!.toUpperCase(),
        codMunicipioTse: Number(mm[2]),
        cargo: Number(mm[3]),
        payload,
      });
    }
  }
  return { zonas, municipios };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type Veredito = "fatia" | "multiplicacao" | "inconclusivo";

async function main(): Promise<void> {
  console.log(`[fatia] Passo 0 — premissa da fatia por município`);
  console.log(`[fatia] diretório: ${fixturesDir}`);

  const { zonas, municipios } = carregar(fixturesDir);
  console.log(
    `[fatia] arquivos: ${zonas.length} de zona (par), ${municipios.length} de município\n`,
  );

  if (zonas.length === 0) {
    console.log("VEREDITO: INCONCLUSIVO — nenhum arquivo de zona no diretório.");
    process.exit(1);
  }

  // Agrupa por (uf, zona, cargo). Só zona com ≥2 pares decide.
  const grupos = new Map<string, ArquivoZona[]>();
  for (const z of zonas) {
    if (filtroUf && z.uf !== filtroUf) continue;
    if (filtroZona !== undefined && z.codZona !== filtroZona) continue;
    const k = `${z.uf}|${z.codZona}|${z.cargo}`;
    const cur = grupos.get(k);
    if (cur) cur.push(z);
    else grupos.set(k, [z]);
  }

  const multiPar = [...grupos.entries()].filter(([, v]) => v.length >= 2);
  if (multiPar.length === 0) {
    console.log(
      "VEREDITO: INCONCLUSIVO — nenhuma zona com 2+ pares baixados.\n" +
        "  Uma zona de UM par não distingue fatia de zona inteira: os dois são o mesmo número.\n" +
        "  Baixe TODOS os pares de uma zona multi-município (Passo 0, item 2).",
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("[fatia] DATABASE_URL ausente — rode `set -a; . ./.env.local; set +a` antes.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  let veredito: Veredito = "inconclusivo";
  const vereditos: Veredito[] = [];

  // -------------------------------------------------------------------------
  // Aritmética 1 — Σ e.te dos pares vs. eleitorado conhecido da zona
  // -------------------------------------------------------------------------
  console.log("── Aritmética 1: Σ e.te dos pares vs. eleitorado da zona ──");
  for (const [k, pares] of multiPar) {
    const [uf, zonaStr] = k.split("|");
    const codZona = Number(zonaStr);
    const somaTe = pares.reduce((acc, p) => acc + campo(p.payload, "e", "te"), 0);

    const rows = await sql`
      SELECT SUM(eleitores_aptos)::bigint AS te
      FROM eleitorado
      WHERE ano = 2026 AND uf = ${uf} AND cod_zona = ${codZona}
    `;
    const teBanco = Number(rows[0]?.te ?? 0);
    if (!teBanco) {
      console.log(`  ${uf} z${codZona}: zona sem eleitorado no banco — inconclusivo`);
      vereditos.push("inconclusivo");
      continue;
    }
    const razao = somaTe / teBanco;
    const n = pares.length;
    // Razão ≈ 1 → fatia. Razão ≈ N → cada arquivo trouxe a zona inteira.
    const v: Veredito =
      razao >= 0.8 && razao <= 1.25 ? "fatia" : razao >= n - 0.5 ? "multiplicacao" : "inconclusivo";
    vereditos.push(v);
    console.log(
      `  ${uf} z${codZona}: ${n} pares · Σte=${somaTe.toLocaleString("pt-BR")} · ` +
        `banco=${teBanco.toLocaleString("pt-BR")} · razão=${razao.toFixed(3)} → ${v.toUpperCase()}`,
    );
  }

  // -------------------------------------------------------------------------
  // Aritmética 2 — Σ dos pares de um município vs. o arquivo de município
  // -------------------------------------------------------------------------
  console.log("\n── Aritmética 2: Σ pares do município vs. arquivo `mu` ──");
  if (municipios.length === 0) {
    console.log("  nenhum arquivo de município baixado — pulado (Passo 0, item 2).");
  }
  for (const mu of municipios) {
    const pares = zonas.filter(
      (z) => z.uf === mu.uf && z.codMunicipioTse === mu.codMunicipioTse && z.cargo === mu.cargo,
    );
    if (pares.length === 0) {
      console.log(`  ${mu.file}: nenhum par correspondente baixado — pulado`);
      continue;
    }
    const somaVvc = pares.reduce((a, p) => a + campo(p.payload, "v", "vvc"), 0);
    const vvcMu = campo(mu.payload, "v", "vvc");
    const somaCand = new Map<string, number>();
    for (const p of pares) {
      for (const [n, v] of candidatos(p.payload)) somaCand.set(n, (somaCand.get(n) ?? 0) + v);
    }
    const candMu = candidatos(mu.payload);
    const divergentes = [...candMu.entries()].filter(([n, v]) => (somaCand.get(n) ?? 0) !== v);

    const bate = somaVvc === vvcMu && divergentes.length === 0;
    console.log(
      `  ${mu.uf}/${mu.codMunicipioTse} c${mu.cargo}: ${pares.length} pares · ` +
        `Σvvc=${somaVvc} vs mu=${vvcMu} · candidatos divergentes=${divergentes.length} → ` +
        (bate ? "SOMA EXATA ✓" : "DIVERGE ✗"),
    );
    for (const [n, v] of divergentes.slice(0, 5)) {
      console.log(`      cand ${n}: pares=${somaCand.get(n) ?? 0} mu=${v}`);
    }
  }

  // -------------------------------------------------------------------------
  // Aritmética 3 — psa = Σsa/Σsi ou Σsa/Σts? (pendência P5 do handoff)
  // -------------------------------------------------------------------------
  console.log("\n── Aritmética 3: denominador de `psa` (Σsi ou Σts?) ──");
  for (const [k, pares] of multiPar) {
    const [uf, zonaStr] = k.split("|");
    const sa = pares.reduce((a, p) => a + campo(p.payload, "s", "sa"), 0);
    const si = pares.reduce((a, p) => a + campo(p.payload, "s", "si"), 0);
    const ts = pares.reduce((a, p) => a + campo(p.payload, "s", "ts"), 0);
    if (!Number.isFinite(sa) || (!si && !ts)) {
      console.log(`  ${uf} z${zonaStr}: campos de seção ausentes — inconclusivo`);
      continue;
    }
    const psaPorSi = si > 0 ? (100 * sa) / si : Number.NaN;
    const psaPorTs = ts > 0 ? (100 * sa) / ts : Number.NaN;
    // O `psa` publicado no par dominante é o árbitro.
    const dominante = pares.reduce((a, b) =>
      campo(a.payload, "e", "te") >= campo(b.payload, "e", "te") ? a : b,
    );
    const psaPublicado = campo(dominante.payload, "s", "psa");
    const dSi = Math.abs(psaPorSi - psaPublicado);
    const dTs = Math.abs(psaPorTs - psaPublicado);
    const escolha =
      !Number.isFinite(psaPublicado) || si === ts
        ? "INCONCLUSIVO (si == ts, ou psa ausente)"
        : dSi < dTs
          ? "Σsa/Σsi (o implementado hoje)"
          : "Σsa/Σts (TROCAR em _psa_merged)";
    console.log(
      `  ${uf} z${zonaStr}: sa=${sa} si=${si} ts=${ts} · ` +
        `psa/si=${psaPorSi.toFixed(2)} psa/ts=${psaPorTs.toFixed(2)} ` +
        `publicado=${psaPublicado.toFixed(2)} → ${escolha}`,
    );
  }

  // -------------------------------------------------------------------------
  // Veredito
  // -------------------------------------------------------------------------
  if (vereditos.includes("multiplicacao")) veredito = "multiplicacao";
  else if (vereditos.length > 0 && vereditos.every((v) => v === "fatia")) veredito = "fatia";

  console.log(`\n${"=".repeat(70)}`);
  if (veredito === "fatia") {
    console.log("VEREDITO: FATIA CONFIRMADA.");
    console.log("  A arquitetura do ADR-0035 está correta. Siga com o resto do protocolo.");
    process.exit(0);
  }
  if (veredito === "multiplicacao") {
    console.log("VEREDITO: MULTIPLICAÇÃO — PARE.");
    console.log(
      "  Os arquivos de par trazem a ZONA INTEIRA, não a fatia.\n" +
        "  `merge_pairs_into_zonas` estaria somando cópias e inflando o eleitorado\n" +
        "  apurado de ~62% das zonas do país. NÃO prossiga com o protocolo:\n" +
        "  reporte e reveja ADR-0035 D1/D2 antes de qualquer ciclo.",
    );
    process.exit(2);
  }
  console.log("VEREDITO: INCONCLUSIVO.");
  console.log(
    "  Não é sinal verde — é ausência de sinal. Confira se baixou TODOS os pares\n" +
      "  de uma zona multi-município e se os arquivos são do simulado, não fixtures.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[fatia] erro:", err);
  process.exit(1);
});
