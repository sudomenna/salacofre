// data-pipeline/candidatos-resolve.ts
//
// A função de desempate de `(cargo, uf, numero)` — ADR-0042 item 5, RF-143.
//
// ─── Por que existe ─────────────────────────────────────────────────────────
//
// `(cargo, uf, numero)` **não é única nem na fonte oficial**. Medido em
// 2026-09-13 contra o arquivo que o TSE gerou em 12/09: 52 colisões brutas nos
// quatro cargos do produto e **4** que sobrevivem ao filtro de publicabilidade,
// todas na Bahia, todas do DC, todas sob recurso — duas delas com o **mesmo
// nome** repetido no mesmo número (MARLI LIMA em `6|BA|2727`, BRUNO ELIAS em
// `6|BA|2717`). Um `UNIQUE INDEX` no banco quebraria a importação contra dado
// real; o desenho que sobrevive é índice não-único + esta função.
//
// ─── Quando NÃO é necessária — e isso é a maior parte do tempo ──────────────
//
// **Na noite da apuração o EA20 tem precedência absoluta** (ADR-0039), e o EA20
// carrega `cand[].sqcand` como campo obrigatório (`lib/tse/ea20-schema.ts:80`,
// "sequencial único (usado para foto)"). Por `sqcand` a colisão **não existe**:
// resolver identidade e foto por essa chave dispensa esta função inteira.
//
// A nota de correção do ADR-0039 registra que a primeira redação afirmava o
// contrário — que o EA20 não carregava o sequencial — e que o erro forçava todo
// o caminho ao vivo pela chave que colide. Esta função é o **fallback** para
// quando só existe o número: o caso de `projections.candidato_id`, que é
// `integer` com semântica de número de urna, e o do grid pré-eleição.
//
// ─── E por que não é gêmea de `extract_partido_by_cand` ─────────────────────
//
// `extract_partido_by_cand` (`api/model/project.py:1712`) é um dicionário
// **plano**, chaveado só pelo número, e está **certo**: em cargo majoritário o
// número na urna É o número do partido — 13 é PT em qualquer UF. Escrever a
// função de NOME com a mesma assinatura faria o candidato a governador do PT de
// São Paulo aparecer nos outros 26 estados. As duas assinaturas são diferentes
// de propósito; não "uniformizar".

/**
 * O mínimo que uma candidatura precisa expor para ser resolvível. O genérico
 * preserva o tipo concreto do chamador — quem passa `CandidatoRow` recebe
 * `CandidatoRow` de volta, não uma projeção empobrecida.
 */
export interface CandidaturaResolvivel {
  sq_candidato: string;
  cargo: number;
  uf: string;
  numero: number;
  publicavel: boolean;
  /** `DS_SITUACAO_JULGAMENTO` cru, como o TSE publica. */
  situacao_julgamento: string;
}

/**
 * Compara dois `SQ_CANDIDATO` como número, não como texto.
 *
 * Medido: o sequencial tem **11 ou 12 dígitos** no arquivo de 2026. Comparação
 * lexicográfica entre larguras diferentes ordena errado (`"9…"` de 11 dígitos
 * viria depois de `"10…"` de 12), e o erro só apareceria como o candidato
 * errado escolhido num desempate — silencioso e raro, o pior par possível.
 */
function maiorSq(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}

/**
 * Resolve quem concorre com `numero` na corrida `(cargo, uf)`, de forma
 * determinística (constituição § 6) e auditável.
 *
 * Degraus, em ordem:
 *   1. só candidatura **publicável** (ADR-0040 — fail-closed);
 *   2. entre elas, prefere `DS_SITUACAO_JULGAMENTO` começando em `"DEFERIDO"`
 *      (`"INDEFERIDO EM PRAZO RECURSAL…"` **não** começa em DEFERIDO, e é essa
 *      distinção que separa ARIEL CAPISTRANO de ESTÊVÃO em `3|BA|27`);
 *   3. desempate final pelo **maior `sq_candidato`** — o registro mais recente;
 *   4. na noite da apuração, o EA20 vence 1–3, sempre (ver cabeçalho).
 *
 * Devolve `null` quando ninguém publicável casa — nunca um palpite. A ordem de
 * leitura do banco não influencia o resultado: o vencedor é escolhido por
 * comparação total, não por posição na lista.
 */
export function resolverCandidato<T extends CandidaturaResolvivel>(
  cargo: number,
  uf: string,
  numero: number,
  candidatos: readonly T[],
): T | null {
  let melhor: T | null = null;
  let melhorDeferido = false;

  for (const c of candidatos) {
    // Degrau 1.
    if (!c.publicavel) continue;
    if (c.cargo !== cargo || c.uf !== uf || c.numero !== numero) continue;

    const deferido = c.situacao_julgamento.trimStart().startsWith("DEFERIDO");
    if (melhor === null) {
      melhor = c;
      melhorDeferido = deferido;
      continue;
    }
    // Degrau 2 — DEFERIDO ganha de não-DEFERIDO, qualquer que seja o sequencial.
    if (deferido !== melhorDeferido) {
      if (deferido) {
        melhor = c;
        melhorDeferido = true;
      }
      continue;
    }
    // Degrau 3 — empatados no degrau 2, vence o maior sequencial.
    if (maiorSq(c.sq_candidato, melhor.sq_candidato)) {
      melhor = c;
      melhorDeferido = deferido;
    }
  }

  return melhor;
}

/**
 * Todas as colisões de `(cargo, uf, numero)` na base, para o relatório do
 * ciclo. `apenasPublicaveis` reproduz o recorte do RF-143: 52 brutas → 4
 * publicáveis, no arquivo de 12/09/2026.
 */
export function colisoes<T extends CandidaturaResolvivel>(
  candidatos: readonly T[],
  apenasPublicaveis: boolean,
): Map<string, T[]> {
  const porChave = new Map<string, T[]>();
  for (const c of candidatos) {
    if (apenasPublicaveis && !c.publicavel) continue;
    const k = `${c.cargo}|${c.uf}|${c.numero}`;
    const cur = porChave.get(k);
    if (cur) cur.push(c);
    else porChave.set(k, [c]);
  }
  for (const [k, v] of porChave) {
    if (v.length < 2) porChave.delete(k);
  }
  return porChave;
}
