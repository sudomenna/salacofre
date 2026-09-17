/**
 * scripts/edge-config-prune.ts
 *
 * **O fiscal de limpeza** — spec 019, RF-165. Lista (e, sob confirmação
 * explícita, remove) as chaves do Vercel Global Config que ainda carregam
 * `fase: "pre_eleicao"` — isto é, payload **semeado**, não medido.
 *
 *   set -a; . ./.env.local; set +a
 *   pnpm edge-config:prune                    # LISTA. Não apaga nada.
 *   pnpm edge-config:prune --apagar           # lista e diz que falta --confirmar
 *   pnpm edge-config:prune --apagar --confirmar
 *
 * ─── Para que ele existe ────────────────────────────────────────────────────
 *
 * No caminho feliz, ele não encontra nada. A saída da fase pré-eleição é por
 * **omissão** (ADR-0043 D3): às 20h01 de 04/10 o orchestrator grava o primeiro
 * payload real de cada cargo por cima da chave semeada, a gravação é
 * substituição integral do valor, e o campo `fase` simplesmente deixa de
 * existir. Ninguém "desliga" nada.
 *
 * Este script existe para o caso em que isso **não acontece para algum
 * cargo**. Se o cron de Senador falhar às 20h, a chave `projection-current-
 * sen-t1` fica com o payload de setembro no ar, com a faixa "a eleição ainda
 * não começou" por cima, enquanto o país vota. É a alavanca manual de 30
 * segundos que o runbook precisa ter às 20h05 — e é por isso que ele é um
 * script de operador, com saída legível, e não uma automação.
 *
 * ─── 🔴 A regra que ele nunca viola ─────────────────────────────────────────
 *
 * **Chave sem o campo `fase` não é tocada.** Nunca, em nenhum modo, com
 * nenhuma flag. Uma chave sem `fase` é dado real do orchestrator, e apagá-la
 * na noite da apuração é o oposto exato do que este script existe para
 * conseguir. A seleção é por igualdade exata com o literal — não por "tem
 * alguma coisa no campo `fase`" e muito menos por prefixo de nome de chave.
 *
 * A asserção que prova isso é sobre **o conjunto que sobrou**, não sobre o que
 * foi apagado: depois de rodar, toda chave que permanece no store ou não tinha
 * `fase`, ou o `--apagar` não foi pedido.
 *
 * ─── Saída e exit codes ─────────────────────────────────────────────────────
 *
 *   0 — rodou. (Inclusive quando não encontrou nada: "nada a remover" é o
 *       resultado ESPERADO no caminho feliz, não uma falha.)
 *   1 — rodou e algo deu errado (listagem recusada, delete recusado).
 *   2 — falta credencial. Código distinto de 1 porque "não rodou" e "rodou e
 *       reprovou" exigem ações diferentes de quem chamou — mesma convenção de
 *       `scripts/edge-config-smoke.ts`.
 *
 * O token nunca é impresso. Corpos de resposta são truncados.
 */

import { fileURLToPath } from "node:url";
import {
  apagarChave,
  type GlobalConfigCreds,
  listarStore,
  resolveCreds,
} from "@/data-pipeline/_global-config-admin";
import { FASE_PRE_ELEICAO } from "@/lib/config/fase";

// ─────────────────────────────────────────────────────────────────────────────
// Seleção
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `true` quando o valor armazenado é um objeto que carrega exatamente
 * `fase: "pre_eleicao"`.
 *
 * Igualdade estrita com o literal. Um valor `fase: "normal"`, `fase: null` ou
 * `fase: ""` **não** é semeado e **não** é apagado: a borda de escrita
 * (`app/api/internal/edge-write/route.ts`) recusa esses valores com 400
 * justamente porque o contrato inteiro da spec depende de "ausente = normal",
 * então um deles chegando ao store é sinal de gravação fora do contrato — e a
 * resposta certa a isso é deixar quieto e reportar, não apagar.
 *
 * ⚠️ A pergunta é feita sobre os BYTES armazenados, e não sobre uma fase
 * derivada. Nada aqui pode olhar `pct_apurado_total`, `por_uf.length`,
 * `composition.pre_election` nem a data de hoje: às 20h01 de 04/10 o payload
 * real tem `pct_apurado_total: 0.01` e passa por `0` nos minutos anteriores
 * com o orchestrator já rodando (ADR-0043 D5). Um fiscal gateado no percentual
 * apagaria a apuração ao vivo.
 */
export function carregaFaseSemeada(valor: unknown): boolean {
  if (typeof valor !== "object" || valor === null) return false;
  return (valor as { fase?: unknown }).fase === FASE_PRE_ELEICAO;
}

/** Uma chave semeada encontrada no store, com o que o operador precisa ver. */
export interface ChaveSemeadaEncontrada {
  chave: string;
  /** `cargo`/`turno` do payload, quando presentes — ajuda a reconhecer a corrida. */
  cargo: number | null;
  turno: number | null;
  bytes: number;
}

/**
 * As chaves do store que carregam `fase: "pre_eleicao"`, em ordem de nome.
 *
 * Varre o store INTEIRO, e não uma lista fixa de nomes esperados: se uma chave
 * semeada aparecer sob um nome que este script não previu — uma chave de UF,
 * um arquivo de turno —, o fiscal tem de encontrá-la. Uma lista fixa acharia
 * só o que já sabíamos.
 */
export function selecionarSemeadas(store: ReadonlyMap<string, unknown>): ChaveSemeadaEncontrada[] {
  const achadas: ChaveSemeadaEncontrada[] = [];
  for (const [chave, valor] of store) {
    if (!carregaFaseSemeada(valor)) continue;
    const v = valor as { cargo?: unknown; turno?: unknown };
    achadas.push({
      chave,
      cargo: typeof v.cargo === "number" ? v.cargo : null,
      turno: typeof v.turno === "number" ? v.turno : null,
      bytes: Buffer.byteLength(JSON.stringify(valor), "utf8"),
    });
  }
  return achadas.sort((a, b) => a.chave.localeCompare(b.chave));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export interface PruneOpcoes {
  /** Pedir a remoção. Sozinho ainda NÃO apaga — exige `--confirmar`. */
  apagar: boolean;
  /** A confirmação explícita que o RF-165 exige. */
  confirmar: boolean;
}

/**
 * Duas flags, e não uma, de propósito.
 *
 * O RF-165 diz que apagar "exige confirmação explícita". Um prompt interativo
 * não serve: este script é rodado sob pressão, possivelmente por `pnpm` dentro
 * de um pipe, e um prompt que não aparece vira um comando que trava. Duas
 * flags na mesma linha são explícitas, auditáveis no histórico do shell, e
 * impossíveis de digitar por engano — e a primeira sozinha imprime exatamente
 * o que a segunda vai apagar.
 */
export function parseCli(argv: readonly string[]): PruneOpcoes {
  const opcoes: PruneOpcoes = { apagar: false, confirmar: false };
  for (const a of argv) {
    if (a === "--apagar") opcoes.apagar = true;
    else if (a === "--confirmar") opcoes.confirmar = true;
    else if (a.startsWith("--")) throw new Error(`Flag desconhecida: ${a}`);
  }
  return opcoes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo
// ─────────────────────────────────────────────────────────────────────────────

export interface PruneResultado {
  encontradas: ChaveSemeadaEncontrada[];
  removidas: string[];
  falhas: Array<{ chave: string; motivo: string }>;
  /** As chaves que permaneceram no store — a asserção que de fato importa. */
  sobreviventes: string[];
}

export interface PruneDeps {
  lerStore: () => Promise<ReadonlyMap<string, unknown>>;
  apagar: (chave: string) => Promise<void>;
}

export async function podar(opcoes: PruneOpcoes, deps: PruneDeps): Promise<PruneResultado> {
  const store = await deps.lerStore();
  const encontradas = selecionarSemeadas(store);

  const removidas: string[] = [];
  const falhas: Array<{ chave: string; motivo: string }> = [];

  if (opcoes.apagar && opcoes.confirmar) {
    for (const a of encontradas) {
      try {
        await deps.apagar(a.chave);
        removidas.push(a.chave);
      } catch (err) {
        falhas.push({
          chave: a.chave,
          motivo: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const removidasSet = new Set(removidas);
  const sobreviventes = [...store.keys()].filter((k) => !removidasSet.has(k)).sort();

  return { encontradas, removidas, falhas, sobreviventes };
}

/** As dependências reais. */
export function depsDeProducao(creds: GlobalConfigCreds): PruneDeps {
  return {
    lerStore: () => listarStore(creds),
    apagar: (chave) => apagarChave(creds, chave),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  let opcoes: PruneOpcoes;
  try {
    opcoes = parseCli(process.argv.slice(2));
  } catch (err) {
    console.error(`[edge-config-prune] ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const creds = resolveCreds();
  if (!creds) {
    console.error(
      "[edge-config-prune] EDGE_CONFIG_TOKEN e/ou o id do store ausentes. " +
        "Rode `set -a; . ./.env.local; set +a` antes.",
    );
    return 2;
  }

  let resultado: PruneResultado;
  try {
    resultado = await podar(opcoes, depsDeProducao(creds));
  } catch (err) {
    console.error(
      `[edge-config-prune] falhou: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  if (resultado.encontradas.length === 0) {
    console.log(
      '[edge-config-prune] nenhuma chave carrega `fase: "pre_eleicao"`. ' +
        "Nada a remover — este é o resultado esperado depois da transição.",
    );
    return 0;
  }

  console.log(`[edge-config-prune] ${resultado.encontradas.length} chave(s) ainda semeada(s):`);
  for (const a of resultado.encontradas) {
    const corrida =
      a.cargo !== null ? `cargo ${a.cargo}${a.turno !== null ? ` t${a.turno}` : ""}` : "—";
    console.log(`  ${a.chave.padEnd(32)} ${corrida.padEnd(14)} ${a.bytes} B`);
  }

  if (!opcoes.apagar) {
    console.log("");
    console.log(
      "  Modo LISTA (default) — nada foi apagado. " +
        "Para remover: `pnpm edge-config:prune -- --apagar --confirmar`.",
    );
    return 0;
  }

  if (!opcoes.confirmar) {
    console.log("");
    console.log(
      "  --apagar recebido SEM --confirmar. Nada foi apagado. " +
        "As chaves acima são exatamente as que `--apagar --confirmar` removeria.",
    );
    return 0;
  }

  console.log("");
  console.log(`  removidas : ${resultado.removidas.length}`);
  for (const k of resultado.removidas) console.log(`    ✓ ${k}`);
  for (const f of resultado.falhas) console.log(`    ✗ ${f.chave} — ${f.motivo}`);
  console.log(`  sobraram no store : ${resultado.sobreviventes.length} chave(s)`);

  return resultado.falhas.length > 0 ? 1 : 0;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error(`[edge-config-prune] erro não tratado: ${String(err)}`);
      process.exitCode = 1;
    });
}
