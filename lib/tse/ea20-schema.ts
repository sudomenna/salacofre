/**
 * lib/tse/ea20-schema.ts
 *
 * Zod schema for the TSE EA20 result file format.
 *
 * Design ref: docs/reference/tse-2026-leiautes.md (fonte de verdade — deriva
 * do PDF oficial `TSE-EA20-Arquivo-de-resultado-unificado.md`, versão
 * 2026-07-10, extraído em tse_docs/txt/tse-ea20-arquivo-de-resultado-unificado.txt).
 * Cobre: RF-001 (fail-fast validation pre-acceptance), ADR-0002 (CDN polling).
 *
 * ---------------------------------------------------------------------------
 * REESCRITA COMPLETA — 2026-09-05 (hardening pré-simulado, PDFs oficiais TSE)
 * ---------------------------------------------------------------------------
 *
 * O schema anterior (herdado de uma premissa de 2022 nunca confirmada contra
 * documento oficial) assumia um envelope com um array `abr[]` de abrangências
 * dentro de um único arquivo, e candidatos com campos `cc/pn/pnm/sg` direto
 * no elemento `cand`. NENHUMA dessas duas premissas se confirma no documento
 * oficial (grep por `"abr"` como array de abrangências no EA20 real: 0
 * ocorrências — o único uso de "abr" no texto é como sufixo de `cdabr`/`tpabr`).
 *
 * O leiaute real (confirmado em tse-ea20-arquivo-de-resultado-unificado.txt):
 *   - Cada arquivo JSON representa UMA ÚNICA abrangência (BR, UF, Município
 *     ou Zona) — a abrangência já está codificada no NOME do arquivo e nos
 *     campos de raiz `tpabr`/`cdabr`. Não há array de abrangências dentro do
 *     arquivo (isso é papel do EA14/EA15 — arquivos de acompanhamento — que
 *     SIM têm `abr[]`, um item por UF ou por município).
 *   - Os totais de seções/eleitorado/votos vivem em três objetos de raiz:
 *     `s` (seções), `e` (eleitores) e `v` (votos) — não em `abr[].psa` etc.
 *   - Os candidatos vivem numa hierarquia `carg[] → (fed[] | agr[].par[]) →
 *     agr[].par[].cand[]` — partido/coligação/federação são um nível ACIMA
 *     do candidato, não campos dentro dele.
 *
 * Key invariant (mantida): TODOS os valores numéricos do TSE chegam como
 * strings com notação decimal BR (vírgula como separador decimal, ponto
 * opcional como separador de milhar). O schema preserva como string; quem
 * precisa do valor numérico chama `parseEA20Numeric()` explicitamente — isso
 * mantém o payload bruto intacto para auditoria.
 *
 * `.passthrough()` em TODOS os níveis (envelope e cada elemento aninhado) —
 * o TSE historicamente adiciona campos sem aviso prévio (confirmado no
 * simulado de set/2026 com o campo `f` assumindo valores além de "o"). Um
 * campo desconhecido em qualquer nível NUNCA deve derrubar o parse inteiro;
 * só a ausência/tipo errado dos campos que o pipeline efetivamente consome
 * (`dg`, `hg`, `f`, `cdabr`, `tpabr`, `ele`, `t`, `s`, `e`, `v`) deve falhar
 * fail-fast.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Elemento: vs (vice / suplente) e subs (substituído)
// ---------------------------------------------------------------------------

const ViceSuplenteSchema = z
  .object({
    tp: z.string(), // 'v' (vice) | 's1' | 's2' (suplentes — só Senador)
    sqcand: z.string(),
    nm: z.string(),
    nmu: z.string(),
    sgp: z.string(),
  })
  .passthrough();

const SubstituidoSchema = z
  .object({
    nm: z.string(),
    nmu: z.string(),
    sgp: z.string(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: cand (candidato) — dentro de par[]
// ---------------------------------------------------------------------------

const CandidatoSchema = z
  .object({
    n: z.string(), // número do candidato na urna
    sqcand: z.string(), // sequencial único (usado para foto — ver instruções download)
    nm: z.string(), // nome completo
    nmu: z.string(), // nome na urna
    dt: z.string().optional(), // data de nascimento
    dvt: z.string().optional(), // destinação do voto (só após 1ª totalização parcial)
    seq: z.string().optional(), // sequencial de ordem na eleição
    e: z.string(), // eleito ou disputa 2º turno: 's'|'n'
    st: z.string().optional(), // situação (só após totalização final)
    vap: z.string(), // votos computados
    pvap: z.string(), // % (2 casas)
    pvapn: z.string().optional(), // % (9 casas)
    vs: z.array(ViceSuplenteSchema).optional(), // vice (maioritário) / suplente(s) (senador)
    subs: z.array(SubstituidoSchema).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: par (partido) — dentro de agr[]
// ---------------------------------------------------------------------------

const PartidoSchema = z
  .object({
    n: z.string(), // número do partido
    sg: z.string(), // sigla (partidos inaptos vêm com ** à direita)
    nm: z.string(), // nome do partido
    nfed: z.string().optional(), // nº da federação, se federado
    dvt: z.string().optional(), // destinação do voto do partido (legenda)
    tvtn: z.string().optional(), // votos válidos nominais do partido
    tvtl: z.string().optional(), // votos válidos de legenda (só proporcional)
    tvan: z.string().optional(), // votos computados nominais
    tval: z.string().optional(), // votos computados de legenda (só proporcional)
    cand: z.array(CandidatoSchema).optional(), // pode ser omitido se o partido não lançou candidato
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: agr (agremiação: coligação | federação | partido isolado)
// ---------------------------------------------------------------------------

const AgremiacaoSchema = z
  .object({
    n: z.string(), // número (coligação, partido isolado ou federação)
    nm: z.string(), // nome
    tp: z.string(), // 'c' coligação (só majoritário) | 'i' isolado | 'f' federação
    com: z.string().optional(), // composição — só se tp !== 'i'
    tvtn: z.string().optional(),
    tvtl: z.string().optional(), // só proporcional
    tvan: z.string().optional(),
    tval: z.string().optional(), // só proporcional
    vag: z.string().optional(), // vagas — só proporcional, partido isolado/federação
    par: z.array(PartidoSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: fed (federação) — dentro de carg[]
// ---------------------------------------------------------------------------

const FederacaoSchema = z
  .object({
    n: z.string(),
    nm: z.string(),
    sg: z.string(),
    com: z.string(), // sigla dos partidos que compõem, separados por '/'
    npar: z.array(z.string()), // lista de números de partido
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: carg (cargo)
// ---------------------------------------------------------------------------

const CargoSchema = z
  .object({
    cd: z.string(), // código do cargo (1=Presidente, 3=Governador, ...)
    nmn: z.string().optional(),
    nmm: z.string().optional(),
    nmf: z.string().optional(),
    nv: z.string().optional(), // vagas disponíveis na abrangência
    qe: z.string().optional(), // quociente eleitoral — só cargo proporcional
    fed: z.array(FederacaoSchema).optional(),
    agr: z.array(AgremiacaoSchema).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: perg / resp (consulta popular) — fora de escopo Presidente/Governador
// mas mantido tipado com passthrough para não quebrar caso apareça.
// ---------------------------------------------------------------------------

const RespostaSchema = z
  .object({
    n: z.string(),
    ds: z.string(),
    seq: z.string().optional(),
    e: z.string().optional(),
    st: z.string().optional(),
    vap: z.string().optional(),
    pvap: z.string().optional(),
    pvapn: z.string().optional(),
  })
  .passthrough();

const PerguntaSchema = z
  .object({
    cd: z.string(),
    ds: z.string(),
    resp: z.array(RespostaSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: s (seções) — totais de raiz, atualizados a cada totalização
// ---------------------------------------------------------------------------

const SecoesSchema = z
  .object({
    ts: z.string(), // total de seções
    st: z.string(), // totalizadas
    pst: z.string(), // % totalizadas
    pstn: z.string().optional(),
    snt: z.string().optional(), // não totalizadas
    psnt: z.string().optional(),
    psntn: z.string().optional(),
    si: z.string().optional(), // instaladas
    psi: z.string().optional(),
    psin: z.string().optional(),
    sni: z.string().optional(), // não instaladas
    psni: z.string().optional(),
    psnin: z.string().optional(),
    sa: z.string().optional(), // apuradas
    psa: z.string(), // % apuradas (RF-001 — usado no ingest para pctApurado)
    psan: z.string().optional(),
    sna: z.string().optional(), // marcadas como não apuradas
    psna: z.string().optional(),
    psnan: z.string().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: e (eleitores) — totais de raiz
// ---------------------------------------------------------------------------

const EleitoresSchema = z
  .object({
    te: z.string(), // eleitorado total (aptos)
    est: z.string().optional(),
    pest: z.string().optional(),
    pestn: z.string().optional(),
    esnt: z.string().optional(),
    pesnt: z.string().optional(),
    pesntn: z.string().optional(),
    esi: z.string().optional(),
    pesi: z.string().optional(),
    pesin: z.string().optional(),
    esni: z.string().optional(),
    pesni: z.string().optional(),
    pesnin: z.string().optional(),
    esa: z.string().optional(),
    pesa: z.string().optional(),
    pesan: z.string().optional(),
    esna: z.string().optional(),
    pesna: z.string().optional(),
    pesnan: z.string().optional(),
    c: z.string(), // comparecimento (RF-001 — usado no ingest para votosTotal)
    pc: z.string().optional(), // % comparecimento
    pcn: z.string().optional(),
    a: z.string().optional(), // abstenção
    pa: z.string().optional(), // % abstenção
    pan: z.string().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Elemento: v (votos) — totais de raiz
// ---------------------------------------------------------------------------

const VotosSchema = z
  .object({
    tv: z.string(), // total de votos (vb+vn+vnt+van+vansj+vv)
    vvc: z.string().optional(), // votos a votáveis concorrentes
    pvvc: z.string().optional(),
    pvvcn: z.string().optional(),
    vv: z.string().optional(), // votos válidos (nominais + legenda) — ausente em consulta popular
    pvv: z.string().optional(),
    pvvn: z.string().optional(),
    vnom: z.string().optional(), // votos nominais
    pvnom: z.string().optional(),
    pvnomn: z.string().optional(),
    vl: z.string().optional(), // votos de legenda — só proporcional
    pvl: z.string().optional(),
    pvln: z.string().optional(),
    van: z.string().optional(), // anulados
    pvan: z.string().optional(),
    pvann: z.string().optional(),
    vansj: z.string().optional(), // anulados sub judice
    pvansj: z.string().optional(),
    pvansjn: z.string().optional(),
    vb: z.string().optional(), // brancos
    pvb: z.string().optional(),
    pvbn: z.string().optional(),
    tvn: z.string().optional(), // total de votos nulos (vn + vnt)
    ptvn: z.string().optional(),
    ptvnn: z.string().optional(),
    vn: z.string().optional(), // nulos
    pvn: z.string().optional(),
    pvnn: z.string().optional(),
    vnt: z.string().optional(), // nulos técnicos
    pvnt: z.string().optional(),
    pvntn: z.string().optional(),
    vscv: z.string().optional(), // votos sem candidato para votar
    vsan: z.string().optional(), // votos de seções anuladas
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Top-level EA20 schema
// ---------------------------------------------------------------------------

/**
 * Ambientes conhecidos do campo `f` (fase de geração do EA20).
 * "o" = oficial (apuração real); "s" = simulado. Confirmado no dicionário
 * oficial (`f — s: se o arquivo foi gerado durante o simulado. o: oficial`).
 * Qualquer outro valor é aceito pelo schema (RF-001 não pode rejeitar o
 * pipeline inteiro por causa de um único campo de metadado), mas
 * lib/tse/client.ts emite um logWarn (uma vez por processo) quando `f` não
 * está nesta lista.
 */
export const KNOWN_EA20_AMBIENTES = ["o", "s"] as const;
export type KnownEA20Ambiente = (typeof KNOWN_EA20_AMBIENTES)[number];

/** Tipos de abrangência confirmados no dicionário oficial do EA20. */
export const KNOWN_EA20_TPABR = ["br", "uf", "mu", "zona"] as const;
export type KnownEA20Tpabr = (typeof KNOWN_EA20_TPABR)[number];

/**
 * EA20Schema — passthrough no envelope e em todos os elementos aninhados
 * (ver nota de reescrita no cabeçalho do arquivo).
 *
 * Campos obrigatórios (`ele`, `t`, `f`, `tpabr`, `cdabr`, `dg`, `hg`, `s`,
 * `e`, `v`) são os que o pipeline de fato consome (lag, abrangência, seções
 * apuradas, comparecimento). `carg`/`perg` são opcionais porque um dos dois
 * está ausente dependendo do tipo de eleição (majoritário/proporcional vs.
 * consulta popular) — Presidente e Governador sempre trazem `carg`, nunca
 * `perg`. Demais campos do envelope (`sup`, `idg`, `dv`, `dt`, `ht`, `tf`,
 * `and`, `md`, `esae`, `mnae`) são condicionais por regra de negócio (ver
 * dicionário oficial) — marcados opcionais para não quebrar o parse quando
 * ausentes.
 */
export const EA20Schema = z
  .object({
    ele: z.string(), // código da eleição
    t: z.string(), // turno: '1' | '2'
    f: z.string().min(1), // fase: 'o' oficial | 's' simulado
    sup: z.string().optional(), // suplementar: 's'|'n'
    tpabr: z.string(), // 'br' | 'uf' | 'mu' | 'zona'
    cdabr: z.string(), // código da abrangência (br | sigla UF | município | zona)
    dg: z.string(), // data de geração — formato dd/mm/aaaa (EA20 dicionário)
    hg: z.string(), // hora de geração — formato hh:mm:ss
    idg: z.string().optional(), // id de geração
    dv: z.string().optional(), // divulga votação: 's'|'n' (só aplicável a Presidente)
    dt: z.string().optional(), // data da totalização
    ht: z.string().optional(), // hora da totalização
    tf: z.string().optional(), // totalização final: 's'|'n'
    and: z.string().optional(), // andamento: 'n'|'p'|'f'
    md: z.string().optional(), // matematicamente definido: 'e'|'s'|'n'
    esae: z.string().optional(), // sem atribuição de eleito: 's'|'n'
    mnae: z.array(z.string()).optional(), // motivos de não atribuição de eleito
    carg: z.array(CargoSchema).optional(), // ausente em consulta popular
    perg: z.array(PerguntaSchema).optional(), // presente só em consulta popular
    s: SecoesSchema,
    e: EleitoresSchema,
    v: VotosSchema,
  })
  .passthrough();

export type EA20 = z.infer<typeof EA20Schema>;

// Re-export inner types for consumers that need to reference sub-shapes
export type EA20Cargo = z.infer<typeof CargoSchema>;
export type EA20Agremiacao = z.infer<typeof AgremiacaoSchema>;
export type EA20Partido = z.infer<typeof PartidoSchema>;
export type EA20Candidato = z.infer<typeof CandidatoSchema>;
export type EA20Secoes = z.infer<typeof SecoesSchema>;
export type EA20Eleitores = z.infer<typeof EleitoresSchema>;
export type EA20Votos = z.infer<typeof VotosSchema>;

// ---------------------------------------------------------------------------
// Numeric helper
// ---------------------------------------------------------------------------

/**
 * parseEA20Numeric — converts a TSE BR-formatted numeric string to a JS number.
 *
 * TSE format: optional dot as thousands separator, comma as decimal separator.
 * Examples:
 *   "1.234,56"  → 1234.56
 *   "100,00"    → 100
 *   "42"        → 42
 *   "0"         → 0
 *
 * Throws on:
 *   - Empty string (RF-001: fail-fast; never return NaN masked as 0)
 *   - Non-numeric content (letters, double commas, etc.)
 *
 * Usage pattern: call this at point-of-use, not in the Zod schema itself,
 * so the raw string is preserved in the snapshot payload for audit.
 */
export function parseEA20Numeric(s: string): number {
  if (s === "") {
    throw new Error(`parseEA20Numeric: received empty string — TSE field must not be blank`);
  }

  // Remove thousands separator (dot) then swap decimal separator (comma → dot)
  const normalised = s.replace(/\./g, "").replace(",", ".");

  const value = Number(normalised);

  if (Number.isNaN(value)) {
    throw new Error(`parseEA20Numeric: cannot convert "${s}" to number — unexpected format`);
  }

  return value;
}
