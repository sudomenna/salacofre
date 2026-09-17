// data-pipeline/projection-seed.ts
//
// **O semeador do placar zerado** — spec 019, RF-164. Grava no Vercel Global
// Config, antes de 04/10/2026, um payload por cargo majoritário que diz, no
// próprio JSON, "este placar está zerado por não ter começado, não porque
// tudo empatou em zero".
//
//   set -a; . ./.env.local; set +a
//   pnpm projection:seed --dry-run      # não grava; imprime o que gravaria
//   pnpm projection:seed                # grava
//   pnpm projection:seed --force        # levanta A GUARDA DE REENTRÂNCIA
//
// ⚠️ Roda em `tsx`, como `candidatos-publish`, `edge-config:smoke` e
// `replay-2022` — importa de `@/lib/`, e o loader `--experimental-strip-types`
// do Node não resolve o alias `@/` do `tsconfig.json`.
//
// ════════════════════════════════════════════════════════════════════════════
// 1. O que grava, e por que só três cargos
// ════════════════════════════════════════════════════════════════════════════
//
// Presidente (1), Governador (3) e Senador (5). **Nunca Deputado Federal**
// (RF-163): aquela tela lista cadeiras por partido, não pessoas. Semeá-la
// produziria "0 cadeiras" para cada legenda — a mentira #1 desta spec em outra
// unidade — e nenhuma identidade ganharia, porque a tela não tem onde pôr
// rosto. Sobra só o custo. A asserção que o teste faz é **negativa**, sobre o
// conjunto de chaves efetivamente gravadas: `dep` não aparece.
//
// ════════════════════════════════════════════════════════════════════════════
// 2. 🔴 A ordem `gov → sen → pres` é load-bearing
// ════════════════════════════════════════════════════════════════════════════
//
// `writeProjection` grava, a cada chamada, DUAS coisas (`lib/edge-config/
// writer.ts`): a chave nomeada `projection-current-<cargo>-t<turno>` **e** o
// alias `projection-current`, com o mesmo valor. O alias fica, portanto, com
// **quem escreveu por último**.
//
// E o único leitor do alias é a corrida presidencial: `lib/edge-config/
// reader.ts` só o consulta quando `cargo === "pres" && turno === turno ativo`
// (a comparação é contra o literal `"pres"`, justamente para que o alias nunca
// seja lido em nome de outro cargo).
//
// Logo: **`pres` por último**. Inverter para `pres → gov → sen` faria a home
// presidencial ler o payload do **Senado** — com forma válida, sem erro em
// lugar nenhum, e conteúdo de outra eleição. É o mesmo modo de falha que em
// 2026-09-12 mandou payload de cargo 5 para a chave do Presidente.
//
// O teste que vale aqui afirma **qual cargo está no alias** depois da
// semeadura (tem de ser `cargo: 1`). "O alias existe" passa com qualquer
// ordem e não prova nada.
//
// ════════════════════════════════════════════════════════════════════════════
// 3. 🔴 A guarda de reentrância, e o que ela NÃO pergunta
// ════════════════════════════════════════════════════════════════════════════
//
//   chave de destino existe e NÃO tem `fase`   ⇒  RECUSA. Não grava NADA.
//   chave de destino existe e tem `fase`       ⇒  sobrescreve (re-semear é normal)
//   chave de destino não existe                ⇒  grava
//
// O modo de falha que ela previne é o pior da spec: **rodar o semeador por
// engano às 21h de 04/10 apagaria a apuração ao vivo** e poria o país inteiro
// de volta em zero.
//
// Três propriedades, cada uma deliberada:
//
// (a) **É tudo-ou-nada, não chave a chave.** Se qualquer um dos quatro nomes
//     de destino carregar dado real, o ciclo inteiro recusa antes de gravar a
//     primeira chave. Gravar "só o Governador, que estava livre" clobberia o
//     alias `projection-current` — que é lido pela home presidencial — com a
//     corrida do Governo. Uma recusa parcial seria destrutiva.
//
// (b) **O alias entra no conjunto vigiado.** `projection-current` é um dos
//     destinos que o semeador sobrescreve, então é um dos destinos que a
//     guarda tem de olhar. Vigiar só as três chaves nomeadas deixaria o alias
//     como o buraco por onde o dado real seria perdido.
//
// (c) **A pergunta é sobre o campo `fase` do valor armazenado, e sobre mais
//     nada.** Nunca sobre `pct_apurado_total`, nunca sobre `por_uf.length`,
//     nunca sobre `composition.pre_election`, nunca sobre a data de hoje.
//     Às 20h01 de 04/10 o payload real tem `pct_apurado_total: 0.01` e passa
//     por `0` nos minutos anteriores **com o orchestrator já rodando**: uma
//     guarda gateada no percentual autorizaria o semeador a apagar a apuração
//     exatamente no minuto em que ela começa (ADR-0043 D5).
//
// A comparação é feita aqui, sobre o JSON cru que voltou do store, e não
// através de uma função derivada. `lib/config/fase.ts` é o ponto único de
// leitura **das superfícies de UI**, que decidem como renderizar; esta é outra
// pergunta — "o que já está gravado nesta chave?" — e ela precisa ser
// respondida pelos bytes, sem intermediário que possa aprender a derivar a
// fase de outra coisa.
//
// `--force` levanta ESSA recusa e só essa, e o uso fica registrado no log.
//
// ════════════════════════════════════════════════════════════════════════════
// 4. `por_uf: []` é defesa em profundidade, não economia de bytes
// ════════════════════════════════════════════════════════════════════════════
//
// Linhas em `por_uf` são a matéria-prima de três das nove mentiras da spec
// ("Todas as unidades federativas estão com a apuração concluída", o rodapé de
// `RemainingPanel`, e "Líder projetado — Fulano (PT)" em UF sem um voto). Não
// produzi-las é mais barato e mais seguro que suprimir os painéis que as leem,
// e as duas defesas coexistem de propósito: a supressão (RF-154) protege
// contra um `por_uf` que volte a ser populado; o vazio protege contra um
// painel que escape da supressão.
//
// Efeito colateral bem-vindo: com `por_uf: []`, `writeProjection` grava
// exatamente 2 chaves por cargo (a nomeada e o alias) e zero objetos de
// detalhe no Blob.
//
// ════════════════════════════════════════════════════════════════════════════
// 5. Os zeros estruturais, e a única coisa que NÃO é zero
// ════════════════════════════════════════════════════════════════════════════
//
// ADR-0043 D4: os oito campos numéricos sem valor honesto (`rank`,
// `p_vitoria`, `p_passa_2t`, `p_fecha_1t`, `pct_projetado_lower/upper`,
// `lider`, `margem_*`) continuam `number` e valem `0`. Não viram anuláveis —
// isso criaria uma união de tipo exercitada só numa janela de três semanas — e
// a supressão de exibição é responsabilidade do consumidor (RF-154/RF-155).
//
// `ts` é a exceção e continua **honesto**: é genuinamente a hora em que o seed
// rodou, que é o que `ts` sempre prometeu ser (ADR-0038 — "hora do cálculo").
// `dado_ts` **não é emitido**: não houve boletim, logo não há hora de dado, e
// inventar uma seria a mentira que o ADR-0038 existe para impedir.
//
// ════════════════════════════════════════════════════════════════════════════
// 6. Identidade: Presidente tem grade de rostos; Governador e Senador, não
// ════════════════════════════════════════════════════════════════════════════
//
// `national.candidatos` é populado **só para cargo 1**. Para 3 e 5 vai `[]`, e
// a razão é a mesma do RF-145 da spec 018: naqueles cargos o bloco nacional é
// a união de 27 corridas sob o mesmo espaço de `id`, e qualquer nome atribuído
// ali é ambíguo **por construção** — 180 candidaturas a governador sem a UF ao
// lado não formam uma corrida. É por isso que `EdgeCandidate.sqcand` também só
// existe em cargo 1.
//
// RF-162 decide o mesmo pelo lado da tela: `/governador` e `/senador` em fase
// pré exibem 27 links e **nenhum nome de candidatura**. Não produzir os nomes é
// a mesma defesa em profundidade de `por_uf: []` — a supressão de UI protege
// contra um payload que volte a trazê-los; o vazio protege contra uma tela que
// escape da supressão.
//
// ⚠️ Isto **diverge do esboço** do design 019 § D7, que escreve
// `national: { candidatos: [ /* identidade, vinda da spec 018 */ ], … }` para
// os três cargos sem distinguir. O esboço é genérico; RF-145 e RF-162 são
// normativos e específicos. Divergência registrada para o dono confirmar.
//
// ════════════════════════════════════════════════════════════════════════════
// 7. A cor, e por que não é `var(--color-cand-1)`
// ════════════════════════════════════════════════════════════════════════════
//
// `EdgeCandidate.cor` é, em payload real, `var(--color-cand-{rank})` — paleta
// por RANK (ADR-0013). Em fase pré o rank é `0` (não há medição que o
// produza), e `--color-cand-1` é a tinta de destaque do líder: atribuí-la a
// quem tem o menor número na urna inventaria um favoritismo estável entre
// recarregamentos, que é precisamente o que a constituição § 2 proíbe.
//
// O seed emite `colorForRank(0)` = `var(--color-cand-other)` — o cinza neutro,
// que é o que "sem rank" significa. A identidade cromática não depende deste
// campo nos blocos editoriais: `components/blocks/_candidateColor.ts` resolve
// `partidoIsMapped(partido) ? colorForParty(partido) : colorForRank(rank)`, ou
// seja, a cor de partido do ADR-0024 vem da SIGLA, que o seed emite. O campo
// `cor` do payload NÃO deve ser lido direto por nenhum bloco editorial.
//
// ⚠️ Correção de 2026-09-14: a redação anterior deste comentário afirmava que
// "o campo `cor` só é lido direto onde há barra de votação, e a barra é o que
// o RF-155 suprime". Era **falso**, e o portão da constituição o pegou:
// `CandidaturaIdentidadeRow` (`components/blocks/ResultPanel.tsx`) é
// exatamente o bloco que SUBSTITUI a barra em fase pré, e ele lia `cor`
// direto — pintando os 12 chips de partido do mesmo cinza. Corrigido lá para
// `candidateColor(partido, rank)`. Um comentário que garante o que o código
// não garante é pior que nenhum: ele desliga a desconfiança de quem revisa.
//
// ════════════════════════════════════════════════════════════════════════════
// 8. A ordem da lista: número na urna
// ════════════════════════════════════════════════════════════════════════════
//
// RF-161. `EdgeCandidate.id` **é** o número na urna: o orchestrator monta o
// mapa de identidade com chave `(uf, numero)` e o consulta com `id`
// (`api/model/project.py`). Ordenar por `id` crescente é, portanto, ordenar
// pela urna — uma ordem que o leitor reconhece, que é estável entre
// recarregamentos e que não carrega juízo. Ordenar por `pct_projetado` zerado
// produziria a ordem do desempate, que o leitor lê como ranking.

import { fileURLToPath } from "node:url";

import { type CargoTse, cargoInfo, cargoToken } from "@/lib/config/cargos";
import { FASE_PRE_ELEICAO } from "@/lib/config/fase";
import { currentProjectionKey, LEGACY_CURRENT_ALIAS_KEY } from "@/lib/edge-config/keys";
import type { EdgeCandidate, EdgePayload } from "@/lib/edge-config/types";
import { writeProjection } from "@/lib/edge-config/writer";
import { colorForRank } from "@/lib/utils/cand-color";
import { type GlobalConfigCreds, listarStore, resolveCreds } from "./_global-config-admin.ts";
import { getPool } from "./_tse-common.ts";
import { ANO_PLEITO } from "./candidatos-parse.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de desenho
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 **A ordem importa e `pres` é o último.** Ver o bloco 2 do cabeçalho.
 * Qualquer reordenação aqui muda qual corrida a home presidencial lê.
 */
export const ORDEM_SEMEADURA: readonly CargoTse[] = [3, 5, 1] as const;

/** O turno semeado. Turno 2 não é semeado — não existe 2º turno antes do 1º. */
export const TURNO_SEMEADO = 1 as const;

/**
 * Todos os nomes de chave que uma semeadura sobrescreve — as três nomeadas
 * **mais o alias**. É este conjunto que a guarda de reentrância inspeciona;
 * ver o item (b) do bloco 3 do cabeçalho.
 */
export function chavesDeDestino(): string[] {
  return [
    ...ORDEM_SEMEADURA.map((c) => currentProjectionKey(cargoToken(c), TURNO_SEMEADO)),
    LEGACY_CURRENT_ALIAS_KEY,
  ];
}

/** A UF sob a qual as candidaturas presidenciais vivem na tabela `candidatos`. */
const UF_NACIONAL = "BR";

// ─────────────────────────────────────────────────────────────────────────────
// Erros nomeados
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A recusa da guarda de reentrância. **Erro nomeado**, e não um `Error`
 * genérico, porque é o único que `--force` levanta: um `catch` que não
 * consegue distinguir esta recusa das outras acabaria levantando todas.
 */
export class SeedReentranciaError extends Error {
  readonly name = "SeedReentranciaError";
  /** As chaves que carregam dado real — as que impedem a semeadura. */
  readonly chavesOcupadas: readonly string[];

  constructor(chavesOcupadas: readonly string[]) {
    super(
      `RECUSADO: ${chavesOcupadas.length} chave(s) de destino já contêm payload SEM o campo ` +
        `"fase" — ou seja, dado REAL do orchestrator: ${chavesOcupadas.join(", ")}. ` +
        `Nada foi gravado. Semear por cima apagaria a apuração. ` +
        `Se você tem certeza de que este dado é descartável, repita com --force.`,
    );
    this.chavesOcupadas = chavesOcupadas;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do payload
// ─────────────────────────────────────────────────────────────────────────────

/** Uma linha de `candidatos` — exatamente as colunas que a identidade usa. */
export interface CandidatoSeedRow {
  numero: number;
  nome_urna: string;
  partido_sigla: string;
  sq_candidato: string;
}

/**
 * Converte uma candidatura do banco no `EdgeCandidate` zerado.
 *
 * Todo campo de medição é `0` — inclusive `rank` (ADR-0043 D4). O que sobrevive
 * é identidade: número na urna (`id`), nome, sigla e `sqcand`, que é o que
 * endereça a foto (ADR-0041/0042).
 */
export function montarCandidatoSeed(row: CandidatoSeedRow): EdgeCandidate {
  return {
    // O número na urna É o `id` do payload — ver o bloco 8 do cabeçalho.
    id: row.numero,
    nome: row.nome_urna,
    partido: row.partido_sigla,
    // Ver o bloco 7: cinza neutro, nunca a tinta do líder.
    cor: colorForRank(0),
    votos_atuais: 0,
    votos_projetados: 0,
    pct_atual: 0,
    pct_projetado: 0,
    pct_projetado_lower: 0,
    pct_projetado_upper: 0,
    p_vitoria: 0,
    rank: 0,
    p_passa_2t: 0,
    p_fecha_1t: 0,
    sqcand: row.sq_candidato,
  };
}

/**
 * O payload semeado de UM cargo.
 *
 * `dado_ts` e `pares_atrasados` ficam **ausentes** de propósito (bloco 5).
 * `composition` reproduz o que `emptyPayload()` já grava hoje em
 * `/governador` e `/senador` — e continua sem significar fase nenhuma
 * (ADR-0043 D2): quem diz a fase é o campo `fase`, e nada mais.
 */
export function montarPayloadSeed(
  cargo: CargoTse,
  candidatos: readonly EdgeCandidate[],
  ts: string,
): EdgePayload {
  return {
    ts,
    cargo,
    turno: TURNO_SEMEADO,
    pct_apurado_total: 0,
    ufs_apuradas: 0,
    national: {
      candidatos: [...candidatos],
      needle_position: 0,
      needle_band: "tossup",
      candidato_a_id: null,
      candidato_b_id: null,
      p_segundo_turno_overall: null,
      cenarios_2t: [],
      chamadas_recentes: [],
    },
    // Ver o bloco 4 do cabeçalho. NÃO inventar 27 linhas zeradas.
    por_uf: [],
    insights: [],
    composition: { pre_election: 1, model: 0, actual_results: 0 },
    fase: FASE_PRE_ELEICAO,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A guarda de reentrância
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `true` quando o valor armazenado é um objeto que carrega
 * `fase: "pre_eleicao"` — isto é, quando ele foi SEMEADO e não medido.
 *
 * Igualdade exata com o literal, nunca "tem alguma coisa no campo": um valor
 * `fase: "normal"` ou `fase: ""` (que a borda de escrita já recusa com 400, e
 * que portanto só chegaria aqui por gravação fora do contrato) **não** libera
 * a sobrescrita. A dúvida resolve para "não escreve".
 */
export function ehSemeado(valor: unknown): boolean {
  if (typeof valor !== "object" || valor === null) return false;
  return (valor as { fase?: unknown }).fase === FASE_PRE_ELEICAO;
}

/**
 * As chaves de destino que já carregam dado REAL — as que a guarda protege.
 *
 * Uma chave **ausente** do store não entra na lista (não há o que perder); uma
 * chave presente e semeada não entra (re-semear é normal); toda chave presente
 * que não é semeada entra.
 */
export function chavesOcupadasPorDadoReal(store: ReadonlyMap<string, unknown>): string[] {
  return chavesDeDestino().filter((k) => store.has(k) && !ehSemeado(store.get(k)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependências injetáveis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As três bordas do semeador — store, banco e relógio —, injetáveis.
 *
 * Existe para que a guarda de reentrância e a ordem do alias possam ser
 * exercitadas contra um store **de verdade** (ainda que em memória), e não
 * contra a intenção do script. Um teste que espia `writeProjection` prova que o
 * script pretendia gravar; o que a spec exige é a asserção sobre o conjunto de
 * chaves que de fato ficou no store.
 */
export interface SeedDeps {
  /** Snapshot do store, lido da origem antes de qualquer gravação. */
  lerStore: () => Promise<ReadonlyMap<string, unknown>>;
  /** Grava uma projeção (chave nomeada + alias). Default: `writeProjection`. */
  gravar: (payload: EdgePayload) => Promise<void>;
  /** Identidade das candidaturas de um cargo. `[]` para 3 e 5 (bloco 6). */
  carregarCandidatos: (cargo: CargoTse) => Promise<EdgeCandidate[]>;
  /** Relógio. Injetável para que o payload seja reprodutível em teste. */
  agora: () => string;
}

export interface SeedOpcoes {
  /** Levanta — e só — a recusa da guarda de reentrância. */
  force: boolean;
  /** Monta e mede tudo, não grava nada. */
  dryRun: boolean;
}

/** O que uma chave semeada pesa. `bytes` é UTF-8 real, não `length`. */
export interface ChaveSemeada {
  cargo: CargoTse;
  chave: string;
  bytes: number;
  candidatos: number;
}

export interface SeedResultado {
  /** Na ordem em que foram gravadas. */
  semeadas: ChaveSemeada[];
  /** Σ do que ocupa no store: as 3 nomeadas + a cópia no alias. */
  bytesTotais: number;
  /** Chaves de destino que já tinham dado real, quando `--force` foi usado. */
  forcadasSobre: string[];
  dryRun: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// O ciclo
// ─────────────────────────────────────────────────────────────────────────────

/** Bytes UTF-8 reais — o número que se compara com um `content-length`. */
export function tamanhoBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/**
 * Semeia os três cargos, na ordem `gov → sen → pres`.
 *
 * Sequência, e a ordem dela é parte do contrato:
 *   1. lê o store INTEIRO, uma vez, da origem;
 *   2. avalia a guarda de reentrância sobre os QUATRO nomes de destino;
 *   3. se alguma chave carrega dado real e não há `--force`, **lança sem
 *      gravar nada**;
 *   4. só então monta e grava, cargo a cargo, na ordem.
 *
 * O passo 3 acontecer antes do passo 4 é o que torna a recusa tudo-ou-nada.
 */
export async function semear(opcoes: SeedOpcoes, deps: SeedDeps): Promise<SeedResultado> {
  const store = await deps.lerStore();

  const ocupadas = chavesOcupadasPorDadoReal(store);
  if (ocupadas.length > 0 && !opcoes.force) {
    throw new SeedReentranciaError(ocupadas);
  }
  if (ocupadas.length > 0) {
    // O uso de --force fica registrado. Uma linha, no nível de erro, porque é
    // o que alguém vai procurar no log depois de perguntar "onde foi parar a
    // apuração do Senado".
    console.error(
      `[projection-seed] ⚠️  --force: sobrescrevendo ${ocupadas.length} chave(s) que ` +
        `continham payload REAL (sem "fase"): ${ocupadas.join(", ")}`,
    );
  }

  const ts = deps.agora();
  const semeadas: ChaveSemeada[] = [];

  for (const cargo of ORDEM_SEMEADURA) {
    const candidatos = await deps.carregarCandidatos(cargo);
    const payload = montarPayloadSeed(cargo, candidatos, ts);
    const chave = currentProjectionKey(cargoToken(cargo), TURNO_SEMEADO);
    const bytes = tamanhoBytes(payload);

    if (!opcoes.dryRun) {
      await deps.gravar(payload);
    }

    semeadas.push({ cargo, chave, bytes, candidatos: candidatos.length });
  }

  // O alias carrega uma CÓPIA do último payload gravado (o presidencial), e
  // essa cópia ocupa espaço no store como qualquer outra chave. Contá-la é o
  // que faz o total ser comparável ao `sizeInBytes` que a Vercel reporta.
  const bytesAlias = semeadas.at(-1)?.bytes ?? 0;
  const bytesTotais = semeadas.reduce((s, k) => s + k.bytes, 0) + bytesAlias;

  return {
    semeadas,
    bytesTotais,
    forcadasSobre: ocupadas,
    dryRun: opcoes.dryRun,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Banco — a identidade da spec 018
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recorte explícito de colunas — nunca `SELECT *` (mesma regra de
 * `candidatos-publish.ts`: a tabela não tem PII, e um `*` convidaria a próxima
 * coluna a viajar até o CDN sem ninguém decidir que devia).
 *
 * `WHERE publicavel` é o filtro fail-closed do ADR-0040: as candidaturas que
 * não estão na urna não chegam à tela.
 *
 * `ORDER BY numero` é a ordem do RF-161 — número na urna, crescente. Ela sai
 * decidida do banco e chega decidida ao payload; não há segundo ponto onde
 * alguém possa reordenar por `pct_projetado` zerado sem que se veja.
 */
const SELECT_SEED_SQL = `
  SELECT numero,
         nome_urna,
         partido_sigla,
         sq_candidato::text AS sq_candidato
    FROM candidatos
   WHERE ano = $1
     AND cargo = $2
     AND uf = $3
     AND publicavel
   ORDER BY numero, sq_candidato
`;

/**
 * Identidade das candidaturas presidenciais, do Postgres (spec 018).
 *
 * Governador e Senador devolvem `[]` — ver o bloco 6 do cabeçalho. A decisão
 * é tomada aqui, num lugar só, e não no call site: um `if (cargo === 1)`
 * espalhado é como o bloco nacional de cargo 3 ganharia nomes ambíguos numa
 * refatoração futura.
 */
export async function carregarCandidatosDoBanco(cargo: CargoTse): Promise<EdgeCandidate[]> {
  if (cargo !== 1) return [];

  const pool = getPool();
  try {
    const { rows } = await pool.query<CandidatoSeedRow>(SELECT_SEED_SQL, [
      ANO_PLEITO,
      cargo,
      UF_NACIONAL,
    ]);
    if (rows.length === 0) {
      throw new Error(
        `Nenhuma candidatura publicável a Presidente (ano ${ANO_PLEITO}, uf ${UF_NACIONAL}). ` +
          `Rode \`pnpm candidatos:import\` antes — semear o placar presidencial sem nomes ` +
          `produziria exatamente a tela vazia que esta spec existe para evitar.`,
      );
    }
    return rows.map(montarCandidatoSeed);
  } finally {
    await pool.end();
  }
}

/** As dependências reais — store pela API REST, banco pelo pool, relógio do SO. */
export function depsDeProducao(creds: GlobalConfigCreds): SeedDeps {
  return {
    lerStore: () => listarStore(creds),
    gravar: (payload) => writeProjection(payload),
    carregarCandidatos: carregarCandidatosDoBanco,
    agora: () => new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export function parseCli(argv: readonly string[]): SeedOpcoes {
  const opcoes: SeedOpcoes = { force: false, dryRun: false };
  for (const a of argv) {
    if (a === "--force") opcoes.force = true;
    else if (a === "--dry-run") opcoes.dryRun = true;
    else if (a.startsWith("--")) throw new Error(`Flag desconhecida: ${a}`);
  }
  return opcoes;
}

async function main(): Promise<number> {
  let opcoes: SeedOpcoes;
  try {
    opcoes = parseCli(process.argv.slice(2));
  } catch (err) {
    // Flag digitada errada vira mensagem, não stack trace. `--frce` num
    // terminal às 20h não pode parecer um bug do script.
    console.error(`[projection-seed] ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const creds = resolveCreds();
  if (!creds) {
    console.error(
      "[projection-seed] EDGE_CONFIG_TOKEN e/ou o id do store ausentes. " +
        "Rode `set -a; . ./.env.local; set +a` antes.",
    );
    // Exit 2 distingue "não rodou" de "rodou e reprovou" — mesma convenção de
    // `scripts/edge-config-smoke.ts`.
    return 2;
  }

  console.log(`[projection-seed] iniciando${opcoes.dryRun ? " — DRY RUN (nada é gravado)" : ""}`);
  console.log(
    `  ordem                 : ${ORDEM_SEMEADURA.map((c) => `${c} (${cargoToken(c)})`).join(" → ")}` +
      "   ← pres por último: o alias `projection-current` fica com quem escreve por último",
  );

  let resultado: SeedResultado;
  try {
    resultado = await semear(opcoes, depsDeProducao(creds));
  } catch (err) {
    if (err instanceof SeedReentranciaError) {
      console.error(`[projection-seed] ${err.message}`);
      return 1;
    }
    console.error(`[projection-seed] falhou: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  console.log("");
  for (const k of resultado.semeadas) {
    console.log(
      `  ${cargoInfo(k.cargo).label.padEnd(16)} ${k.chave.padEnd(30)} ` +
        `${String(k.bytes).padStart(7)} B   ${k.candidatos} candidatura(s)`,
    );
  }
  console.log(
    `  ${"alias".padEnd(16)} ${LEGACY_CURRENT_ALIAS_KEY.padEnd(30)} ` +
      `${String(resultado.semeadas.at(-1)?.bytes ?? 0).padStart(7)} B   ` +
      `cópia do payload de ${cargoInfo(ORDEM_SEMEADURA.at(-1) ?? 1).label}`,
  );
  console.log("");
  console.log(
    `  total no store        : ${resultado.bytesTotais.toLocaleString("pt-BR")} B ` +
      `(${(resultado.bytesTotais / 1000).toFixed(1)} KB) em 4 chaves / 6 upserts`,
  );
  if (resultado.dryRun) {
    console.log("  ⚠️  DRY RUN — nada foi gravado.");
  }

  return 0;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error(`[projection-seed] erro não tratado: ${String(err)}`);
      process.exitCode = 1;
    });
}
